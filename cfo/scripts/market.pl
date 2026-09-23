#!/usr/bin/env perl
# market.pl — prices, valuation numbers and company reports for stocks and
# ETFs listed in the US or on the TSX. Zero LLM: backs the Investments tab and
# the agent's Investments tools.
#
#   perl market.pl quotes AAPL RY.TO     price and today's move
#   perl market.pl stats AAPL RY.TO      name, P/E, forward P/E, market cap,
#                                        next earnings date (cached a day)
#   perl market.pl stats --fresh AAPL    fetch again even when cached
#   perl market.pl market AAPL           quotes + stats together
#   perl market.pl search royal bank     tickers matching a ticker or a company
#                                        name (US stocks and ETFs, the TSX)
#   perl market.pl portfolio             holdings, watchlist, numbers, reports
#                                        (holdings from the edit register)
#   perl market.pl reports-check [SYM…]  reports out since we started watching
#                                        and not summarized yet (default: all
#                                        held and watched symbols)
#   perl market.pl reports-latest SYM    the newest report, summarized or not
#   perl market.pl read URL              a report (filing, release page, PDF) as text
#   perl market.pl save-report symbol=… period=… form=… filed=… url=… summary=…
#   perl market.pl watch-scan [--since=TIME] [SYM…]
#                                        what happened since the last Watch run:
#                                        moves, 52-week breaks, earnings, analysts,
#                                        filings, insider trades, news; rates, FOMC,
#                                        CPI, jobs, USD/CAD, US policy (zero LLM)
#   perl market.pl save-watch judgments=[…]
#                                        Ling's judgment on the last scan → ranked
#                                        into the morning brief (data/watch.json)
#   perl market.pl watch-level quiet|normal|everything
#                                        how much the brief says; remakes the latest
#   perl market.pl watch-alerts          what can't wait for the morning: rate
#                                        decisions, CPI, jobs, a holding's 5% day;
#                                        and the releases of the next two weeks
#
# Symbols: AAPL (US) or RY.TO (TSX; TSX:RY is accepted too). Prices and stats
# come from stockanalysis.com's public pages and merge into data/quotes.json.
# US reports come from SEC EDGAR; a TSX company's report is its passed earnings
# date, read by the agent from the web. Summaries live in data/reports.json,
# written only by save-report. Only ticker symbols leave the machine. Perl core
# + curl, nothing else.
use strict;
use warnings;
use JSON::PP;
use Encode qw(decode encode);
use Fcntl qw(:flock);
use File::Basename qw(dirname);
use File::Temp qw(tempfile);
use POSIX qw(strftime);
use Time::Local qw(timegm);
use List::Util qw(min max sum);
use Digest::MD5 qw(md5_hex);

my $UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
       . '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
# SEC refuses browser-looking and anonymous agents; it asks for a named one.
my $SEC_UA = 'Linggen CFO https://linggen.dev';
my $BASE = 'https://stockanalysis.com';
my $STATS_TTL = 20 * 3600;
my $TICKERS_TTL = 7 * 86400;
my $READ_LIMIT = 60_000;   # characters of a filing handed to the agent
my $SAME_PERIOD_DAYS = 10; # a release and its 10-Q name slightly different days
my $STALE_DAYS = 5;        # a price no refresh has renewed this long is stale
my $JSON = JSON::PP->new->utf8->canonical->pretty;

sub main {
    my ($verb, @args) = @_;
    my %commands = (
        quotes           => sub { cmd_market(['quotes'], @_) },
        stats            => sub { cmd_market(['stats'], @_) },
        market           => sub { cmd_market(['quotes', 'stats'], @_) },
        search           => \&cmd_search,
        portfolio        => \&cmd_portfolio,
        'reports-check'  => \&cmd_reports_check,
        'reports-latest' => \&cmd_reports_latest,
        read             => \&cmd_read,
        'save-report'    => \&cmd_save_report,
        'watch-scan'     => \&cmd_watch_scan,
        'save-watch'     => \&cmd_save_watch,
        'watch-level'    => \&cmd_watch_level,
        'watch-alerts'   => \&cmd_watch_alerts,
    );
    my $run = $commands{ $verb // '' }
        or usage();
    $run->(@args);
}

sub usage {
    print STDERR "usage: market.pl quotes|stats|market [--fresh] SYMBOL... | search TEXT\n"
               . "       market.pl portfolio | reports-check [SYMBOL...] | reports-latest SYMBOL\n"
               . "       market.pl read URL | save-report symbol=… period=… form=… filed=… url=… summary=…\n"
               . "       market.pl watch-scan [--since=TIME] [SYMBOL...] | save-watch judgments=JSON\n"
               . "       market.pl watch-level quiet|normal|everything\n"
               . "       market.pl watch-alerts [--force] [--now=TIME]\n";
    exit 2;
}

sub fail {
    my ($msg) = @_;
    print STDERR "$msg\n";
    exit 1;
}

sub say_json { print $JSON->encode($_[0]) }

sub round_to {
    my ($n, $places) = @_;
    my $f = 10 ** $places;
    return int($n * $f + ($n < 0 ? -0.5 : 0.5)) / $f;
}

# ── Symbols ────────────────────────────────────────────────────────────────

# "aapl" → AAPL, "ry.to" / "TSX:RY" / "RY:TSX" → RY.TO. Placeholder-shaped
# args ("{{symbols}}", sent literally when the agent omits one) are dropped.
sub canonical {
    my ($raw) = @_;
    return undef if !defined $raw || $raw =~ /^\{\{.*\}\}$/;
    my $s = uc $raw;
    $s =~ s/^\s+|\s+$//g;
    $s = "$1.TO" if $s =~ /^TSX:([A-Z0-9.\-]+)$/ || $s =~ /^([A-Z0-9.\-]+):TSX$/;
    return $s =~ /^[A-Z][A-Z0-9.\-]{0,11}$/ ? $s : undef;
}

# Args to symbols. One arg may hold several ("AAPL, RY.TO" from the agent).
sub symbols_of {
    my %seen;
    return grep { !$seen{$_}++ } grep { defined } map { canonical($_) } map { split /[\s,]+/ } @_;
}

sub base_entry {
    my ($sym) = @_;
    my $tsx = $sym =~ /\.TO$/;
    return {
        symbol   => $sym,
        exchange => $tsx ? 'TSX' : 'US',
        currency => $tsx ? 'CAD' : 'USD',
    };
}

sub ticker { my ($e) = @_; (my $t = $e->{symbol}) =~ s/\.TO$//; return $t }

# symbol -> {watch, shares, avg_cost, account, rank}: the live `inv:` cells of
# the edit register (data/edits.json) — what the Mac page and a paired phone
# both write, so a symbol added on the phone counts before the page is opened.
# A symbol left with only its `rank` (its place in the list) isn't listed.
# Mirrors investmentsOf() in lww.js.
sub register_investments {
    my $reg = (read_json(data_dir() . '/edits.json') || {})->{reg};
    my %out;
    return \%out unless ref $reg eq 'HASH';
    for my $key (keys %$reg) {
        next unless $key =~ /^inv:([^|]+)\|(.+)$/;
        my $cell = $reg->{$key};
        next unless ref $cell eq 'HASH' && defined $cell->{v};
        $out{$1}{$2} = $cell->{v};
    }
    for my $sym (keys %out) {
        delete $out{$sym} unless grep { $_ ne 'rank' } keys %{ $out{$sym} };
    }
    return \%out;
}

# Everything the user holds or watches.
sub watched_symbols {
    return symbols_of(sort keys %{ register_investments() });
}

# ── Quotes and stats ───────────────────────────────────────────────────────

sub cmd_market {
    my ($verbs, @args) = @_;
    my $fresh = grep { $_ eq '--fresh' } @args;
    my @symbols = symbols_of(grep { $_ ne '--fresh' } @args);
    usage() unless @symbols;
    my %step = (quotes => \&quote_of, stats => sub { stats_of($_[0], $fresh) });
    say_json(update_quotes(\@symbols, sub {
        my ($e) = @_;
        for my $verb (@$verbs) {
            my $err = $step{$verb}->($e);
            return $err if $err;
        }
        return undef;
    }));
}

# ── Search ─────────────────────────────────────────────────────────────────

my $SEARCH_MAX = 6;

# What the user typed on the Add row — a ticker or part of a company name —
# to the listings the quotes can price. "ry.to" asks as TSX:RY: the search
# reads a bare "RY.TO" as text and finds other companies.
sub cmd_search {
    my $text = join ' ', grep { !/^\{\{.*\}\}$/ } @_;
    $text =~ s/^\s+|\s+$//g;
    return say_json({ query => $text, results => [] }) if $text eq '';
    my $sym = canonical($text);
    my $q = defined $sym && $sym =~ /^(.+)\.TO$/ ? "TSX:$1" : $text;
    my $body = fetch_json("$BASE/api/search?q=" . url_escape($q));
    return say_json({ query => $text, error => 'no answer from stockanalysis.com' })
        unless $body && ref $body->{data} eq 'ARRAY';
    say_json({ query => $text, results => search_results($body->{data}) });
}

# stockanalysis search rows {s, t, n, st} → [{symbol, name, kind, exchange}],
# in its order: t "s" / "e" are US stocks / ETFs; t "sy" is another exchange,
# kept only for the TSX ("tsx/RY") and only stocks and ETFs (st "s" / "e").
# Mirrors CfoMarket.search in linggen-mobile.
sub search_results {
    my ($rows) = @_;
    my (@out, %seen);
    for my $r (@$rows) {
        next unless ref $r eq 'HASH' && defined $r->{s} && defined $r->{t};
        my ($symbol, $kind, $exchange);
        if ($r->{t} eq 's' || $r->{t} eq 'e') {
            ($symbol, $kind, $exchange) = (uc $r->{s}, $r->{t} eq 'e' ? 'etf' : 'stock', 'US');
        } elsif ($r->{t} eq 'sy' && (my ($tsx) = $r->{s} =~ m{^tsx/(.+)$}) && ($r->{st} // '') =~ /^[se]$/) {
            ($symbol, $kind, $exchange) = (uc($tsx) . '.TO', $r->{st} eq 'e' ? 'etf' : 'stock', 'TSX');
        } else {
            next;
        }
        next unless (canonical($symbol) // '') eq $symbol && !$seen{$symbol}++;
        push @out, { symbol => $symbol, name => $r->{n} // '', kind => $kind, exchange => $exchange };
        last if @out == $SEARCH_MAX;
    }
    return \@out;
}

sub url_escape {
    my ($s) = @_;
    $s =~ s/([^A-Za-z0-9\-._~])/sprintf('%%%02X', ord $1)/ge;
    return $s;
}

# Price and today's move. A US symbol is tried as a stock, then as an ETF (the
# stats page, not this, says which it is).
sub quote_of {
    my ($e) = @_;
    my $t = lc ticker($e);
    my @paths = $e->{exchange} eq 'TSX' ? ("a/tsx-$t")
              : $e->{kind} && $e->{kind} eq 'etf' ? ("e/$t")
              : ("s/$t", "e/$t");
    for my $path (@paths) {
        my $body = fetch_json("$BASE/api/quotes/$path") or return quote_failed($e, 'no answer from stockanalysis.com');
        my $q = $body->{data};
        next unless ($body->{status} // 0) == 200 && ref $q eq 'HASH' && defined $q->{p};
        delete $e->{stale};
        $e->{price} = $q->{p};
        $e->{change} = $q->{c};
        $e->{change_pct} = $q->{cp};
        $e->{prev_close} = $q->{cl};
        $e->{high_52w} = $q->{h52};
        $e->{low_52w} = $q->{l52};
        $e->{market} = $q->{ms};
        $e->{price_time} = $q->{u};
        $e->{quote_at} = time;
        $e->{stale} = JSON::PP::true if quote_stale($e, time);
        return undef;
    }
    return quote_failed($e, 'not found');
}

sub quote_failed {
    my ($e, $err) = @_;
    $e->{stale} = JSON::PP::true if defined $e->{price} && quote_stale($e, time);
    return $err;
}

# A price nothing has renewed in 5 days — a delisted ticker, a source gone
# quiet — is the last known price, never a live one: the source priced it
# (price_time) or we last fetched it (quote_at) too long ago.
sub quote_stale {
    my ($e, $now) = @_;
    my $at = $e->{quote_at} // 0;
    my $priced = time_of($e->{price_time} // '');
    $at = $priced if defined $priced && $priced < $at;
    return $now - $at > $STALE_DAYS * 86400;
}

# Map from our field to the overview page's.
my %STAT_FIELDS = (
    market_cap     => 'marketCap',
    pe             => 'peRatio',
    forward_pe     => 'forwardPE',
    eps            => 'eps',
    earnings_date  => 'earningsDate',
    dividend       => 'dividend',
    dividend_yield => 'dividendYield',
    beta           => 'beta',
    analysts       => 'analysts',
    target         => 'target',
    aum            => 'aum',
    expense_ratio  => 'expenseRatio',
);

sub stats_of {
    my ($e, $fresh) = @_;
    return undef if !$fresh && $e->{stats_at} && time - $e->{stats_at} < $STATS_TTL;
    my $page = overview($e) or return 'not found';
    my ($info, $data) = @$page;
    $e->{name} = $info->{nameFull} // $info->{name} // $e->{name};
    $e->{kind} = $info->{subtype} eq 'etf' ? 'etf' : 'stock' if $info->{subtype};
    $e->{cik} = $info->{cik} if $info->{cik};
    for my $ours (keys %STAT_FIELDS) {
        my $v = $data->{ $STAT_FIELDS{$ours} };
        $e->{$ours} = defined $v && $v ne 'n/a' && $v ne '' ? $v : undef;
    }
    $e->{earnings_on} = iso_date($e->{earnings_date});
    $e->{stats_at} = time;
    return undef;
}

# The overview page's data: [info, the flat stats object]. US symbols of
# unknown kind try the stock page, then the ETF page.
sub overview {
    my ($e) = @_;
    my $t = ticker($e);
    my @paths = $e->{exchange} eq 'TSX' ? ("quote/tsx/$t")
              : $e->{kind} && $e->{kind} eq 'etf' ? ('etf/' . lc $t)
              : ('stocks/' . lc $t, 'etf/' . lc $t);
    for my $path (@paths) {
        my $doc = fetch_json("$BASE/$path/__data.json") or next;
        my ($info, $data);
        for my $node (@{ $doc->{nodes} || [] }) {
            next unless ref $node eq 'HASH' && ($node->{type} // '') eq 'data';
            my $obj = devalue($node->{data});
            next unless ref $obj eq 'HASH';
            $info = $obj->{info} if ref $obj->{info} eq 'HASH';
            $data = $obj if exists $obj->{peRatio} || exists $obj->{marketCap} || exists $obj->{aum};
        }
        return [$info, $data] if $info && $data;
    }
    return undef;
}

# SvelteKit's devalue encoding: a flat array whose first item is the root and
# whose objects and arrays hold indexes into the same array. Negative indexes
# are undefined/NaN/±Infinity; tagged forms (Date, Map…) aren't needed here.
sub devalue {
    my ($flat) = @_;
    return undef unless ref $flat eq 'ARRAY' && @$flat;
    my $resolve;
    $resolve = sub {
        my ($i, $depth) = @_;
        return undef if !defined $i || $i !~ /^\d+$/ || $i > $#$flat || $depth > 64;
        my $v = $flat->[$i];
        if (ref $v eq 'HASH') {
            return { map { $_ => $resolve->($v->{$_}, $depth + 1) } keys %$v };
        }
        if (ref $v eq 'ARRAY') {
            return undef if @$v && !ref $v->[0] && $v->[0] !~ /^-?\d+$/;
            return [ map { $resolve->($_, $depth + 1) } @$v ];
        }
        return $v;
    };
    return $resolve->(0, 0);
}

# ── Portfolio (the agent's one read of the tab) ────────────────────────────

sub cmd_portfolio {
    my $dir = data_dir();
    my $cells = register_investments();
    my $quotes = (read_json("$dir/quotes.json") || {})->{symbols} || {};
    say_json({
        investments => holdings_of($cells, $quotes),
        quotes      => { map { $_ => $quotes->{$_} } grep { $cells->{$_} } keys %$quotes },
        reports     => read_json("$dir/reports.json") || {},
    });
}

# The register's holdings joined with the cached numbers — the shape the
# page's investments.json has always had: held first by value, then the
# watchlist A→Z.
sub holdings_of {
    my ($cells, $quotes) = @_;
    my (@held, @watch);
    for my $sym (sort keys %$cells) {
        my $c = $cells->{$sym};
        my $q = $quotes->{$sym} || {};
        my $shares = $c->{shares} // 0;
        unless ($shares > 0) { push @watch, $sym; next }
        my $price = $q->{price};
        my $value = defined $price ? $shares * $price : undef;
        my $cost = defined $c->{avg_cost} ? $shares * $c->{avg_cost} : undef;
        my $gain = defined $value && defined $cost ? $value - $cost : undef;
        push @held, {
            symbol   => $sym,
            name     => $q->{name},
            shares   => $shares + 0,
            avg_cost => $c->{avg_cost},
            account  => $c->{account},
            currency => $q->{currency} // ($sym =~ /\.TO$/ ? 'CAD' : 'USD'),
            price    => $price,
            ($q->{stale} ? (stale => JSON::PP::true, price_time => $q->{price_time}) : ()),
            value    => $value,
            gain     => $gain,
            gain_pct => defined $gain && $cost ? $gain / $cost * 100 : undef,
        };
    }
    return {
        holdings  => [ sort { ($b->{value} // 0) <=> ($a->{value} // 0) } @held ],
        watchlist => \@watch,
    };
}

# ── Reports ────────────────────────────────────────────────────────────────
#
# A report is one period's results: {symbol, name, form, period, filed, url}.
#   US  — from EDGAR: 10-Q / 10-K (20-F / 40-F for foreign filers), and the
#         8-K with item 2.02 (the earnings release) that usually comes first.
#         A release and its 10-Q are one report; the release's text wins
#         because it is the one written to be read.
#   TSX — the earnings date from stats, once it has passed: form "earnings",
#         period = that date, no url (the agent finds the release on the web).
# `period` is the key save-report stores under; pass it back as given.

my %PERIODIC = map { $_ => 1 } qw(10-Q 10-K 20-F 40-F);

sub cmd_reports_check {
    my @symbols = symbols_of(@_);
    @symbols = watched_symbols() unless @symbols;
    my $dir = data_dir();
    my $before = read_json("$dir/reports.json") || {};
    my (@new, @failed);
    for my $sym (@symbols) {
        my $since = $before->{symbols}{$sym}{since} or next; # first sight: watch from today
        my ($reports, $err) = reports_of($sym);
        if ($err) { push @failed, { symbol => $sym, error => $err }; next }
        for my $r (@$reports) {
            next if $r->{filed} lt $since || saved_for($before, $sym, $r);
            push @new, finish_report($r);
        }
    }
    my $today = today();
    update_json('reports.json', sub {
        my ($doc) = @_;
        $doc->{symbols}{$_}{since} //= $today for @symbols;
        $doc->{last_checked} = strftime('%Y-%m-%dT%H:%M:%SZ', gmtime);
        return undef;
    });
    say_json({
        new          => [ sort { $b->{filed} cmp $a->{filed} } @new ],
        failed       => \@failed,
        checked      => \@symbols,
        last_checked => $before->{last_checked},
    });
}

sub cmd_reports_latest {
    my ($sym) = symbols_of(@_);
    usage() unless $sym;
    my ($reports, $err) = reports_of($sym);
    fail("$sym: $err") if $err;
    my ($latest) = @$reports;
    my $e = quote_entry($sym);
    fail("$sym is an ETF — ETFs publish no earnings reports") if ($e->{kind} // '') eq 'etf';
    unless ($latest) {
        say_json({ symbol => $sym, name => $e->{name}, form => 'earnings', period => undef,
                   filed => undef, url => undef, next_earnings => $e->{earnings_on}, saved => undef });
        return;
    }
    my $doc = read_json(data_dir() . '/reports.json') || {};
    say_json({ %{ finish_report($latest) }, saved => saved_for($doc, $sym, $latest) });
}

# Newest first. Error text instead when the source can't answer.
sub reports_of {
    my ($sym) = @_;
    my $e = quote_entry($sym);
    return ([], undef) if ($e->{kind} // '') eq 'etf';
    return tsx_reports($e) if $e->{exchange} eq 'TSX';
    return sec_reports($e);
}

# The symbol's quotes.json entry with fresh-enough stats (kind, cik, name,
# earnings date).
sub quote_entry {
    my ($sym) = @_;
    return update_quotes([$sym], sub { stats_of($_[0], 0) })->{$sym};
}

sub tsx_reports {
    my ($e) = @_;
    return ([], $e->{error}) if $e->{error} && !$e->{kind};
    my $on = $e->{earnings_on};
    return ([], undef) unless $on && $on le today();
    return ([{ symbol => $e->{symbol}, name => $e->{name}, form => 'earnings',
               period => $on, filed => $on, url => undef }], undef);
}

sub sec_reports {
    my ($e) = @_;
    my $cik = sec_cik($e) or return ([], 'not found on SEC EDGAR');
    my $sub = fetch_json(sprintf('https://data.sec.gov/submissions/CIK%010d.json', $cik), $SEC_UA)
        or return ([], 'no answer from SEC EDGAR');
    return (sec_filings($e->{symbol}, $e->{name} // $sub->{name}, $cik, $sub->{filings}{recent} || {},
                        shift_date(today(), -400)), undef);
}

# EDGAR's `filings.recent` columns → reports newest first, a release merged
# into the 10-Q/10-K of its period. Two releases for one quarter (Tesla's
# deliveries update weeks before its results, both item 2.02) → the later.
sub sec_filings {
    my ($symbol, $name, $cik, $recent, $oldest) = @_;
    my (@periodic, @releases);
    for my $i (0 .. $#{ $recent->{form} || [] }) {
        my %f = (
            form   => $recent->{form}[$i],
            filed  => $recent->{filingDate}[$i] // '',
            period => $recent->{reportDate}[$i] // '',
            acc    => $recent->{accessionNumber}[$i],
            doc    => $recent->{primaryDocument}[$i],
            cik    => $cik,
        );
        next if $f{filed} lt $oldest;
        if ($PERIODIC{ $f{form} } && $f{period}) { push @periodic, \%f }
        elsif ($f{form} eq '8-K' && ($recent->{items}[$i] // '') =~ /(^|,)2\.02(,|$)/) { push @releases, \%f }
    }
    my @reports = map { +{ symbol => $symbol, name => $name, %$_ } } @periodic;
    for my $r (sort { $a->{filed} cmp $b->{filed} } @releases) { # oldest first: the later one wins
        my $period = release_period($r->{filed}, \@periodic) or next;
        my ($same) = grep { same_period($_->{period}, $period) } @reports;
        my %release = (symbol => $symbol, name => $name, %$r, period => $period);
        if ($same) { %$same = (%release, period => $same->{period}) } # the 10-Q's exact date
        else { push @reports, \%release }
    }
    return [ sort { $b->{filed} cmp $a->{filed} } @reports ];
}

# The quarter an earnings release reports on. A 10-Q/10-K filed on or after
# the release for a period that ended before it names it exactly; before that
# one lands, step quarters on from the last period ended.
sub release_period {
    my ($filed, $periodic) = @_;
    for my $p (sort { $a->{filed} cmp $b->{filed} } @$periodic) {
        return $p->{period}
            if $p->{filed} ge $filed && $p->{period} lt $filed && days_between($p->{period}, $filed) <= 100;
    }
    my ($last) = sort { $b->{period} cmp $a->{period} } grep { $_->{period} lt $filed } @$periodic;
    return undef unless $last;
    my $period = $last->{period};
    while ((my $next = next_quarter_end($period)) lt $filed) { $period = $next }
    return $period;
}

# A calendar quarter ends on a month's last day; a 52/53-week one 13 weeks on.
sub next_quarter_end {
    my ($date) = @_;
    my ($y, $m, $d) = split /-/, $date;
    return shift_date($date, 91) unless $d == month_days($y, $m);
    $m += 3;
    if ($m > 12) { $m -= 12; $y++ }
    return sprintf '%04d-%02d-%02d', $y, $m, month_days($y, $m);
}

# The document worth reading: the release's press-release exhibit (99.1),
# else the filing itself. Resolved only for reports we hand out.
sub finish_report {
    my ($r) = @_;
    my %out = map { $_ => $r->{$_} } qw(symbol name form period filed url);
    return \%out unless $r->{acc};
    (my $acc = $r->{acc}) =~ s/-//g;
    my $folder = sprintf 'https://www.sec.gov/Archives/edgar/data/%d/%s', $r->{cik}, $acc;
    $out{url} = "$folder/$r->{doc}";
    return \%out unless $r->{form} eq '8-K';
    my $index = fetch_json("$folder/index.json", $SEC_UA) or return \%out;
    my $exhibit = release_exhibit(map { $_->{name} } @{ $index->{directory}{item} || [] });
    $out{url} = "$folder/$exhibit" if $exhibit;
    return \%out;
}

# The press release among a filing's documents: exhibit 99.1 as a web page
# (aapl-ex991.htm, ex99-1.htm, exhibit991.htm), else any exhibit 99.
sub release_exhibit {
    my @pages = grep { /\.html?$/i } @_;
    my ($exhibit) = ((grep { /ex(?:hibit)?-?99[._-]?0?1(?!\d)/i } @pages), (grep { /ex(?:hibit)?-?99/i } @pages));
    return $exhibit;
}

# The summary saved for a report's quarter, when it covers that report. One
# saved from an earlier filing for the quarter (a deliveries update) doesn't:
# the results filed after it are still to read. A TSX report has no filing.
sub saved_for {
    my ($doc, $sym, $r) = @_;
    my ($hit) = grep { same_period($_->{period}, $r->{period}) } @{ $doc->{symbols}{$sym}{reports} || [] };
    return undef unless $hit;
    return $hit if ($r->{form} // '') eq 'earnings' || ($hit->{filed} // '') ge ($r->{filed} // '');
    return undef;
}

sub same_period {
    my ($a, $b) = @_;
    return 0 unless defined $a && defined $b && $a =~ /^\d{4}-\d\d-\d\d$/ && $b =~ /^\d{4}-\d\d-\d\d$/;
    return abs(days_between($a, $b)) <= $SAME_PERIOD_DAYS;
}

# Ticker → CIK: stockanalysis gives it with the stats; else SEC's own list,
# kept a week.
sub sec_cik {
    my ($e) = @_;
    return $e->{cik} + 0 if $e->{cik} && $e->{cik} =~ /^\d+$/;
    my $file = data_dir() . '/sec-tickers.json';
    my $map = read_json($file);
    if (!$map || time - ((stat $file)[9] // 0) > $TICKERS_TTL) {
        my $all = fetch_json('https://www.sec.gov/files/company_tickers.json', $SEC_UA);
        if ($all) {
            $map = { map { uc($_->{ticker}) => $_->{cik_str} } grep { ref eq 'HASH' } values %$all };
            write_json($file, $map);
        }
    }
    (my $t = ticker($e)) =~ s/\./-/g; # BRK.B is BRK-B at the SEC
    return $map && $map->{$t};
}

sub cmd_read {
    my ($url) = @_;
    fail('read takes a report URL — from CheckReports or LatestReport, or a release you found')
        unless defined $url && $url =~ m{^https?://[^\s'"]+$};
    my $sec = $url =~ m{^https://www\.sec\.gov/};
    my $body = fetch($url, $sec ? $SEC_UA : $UA) // fail("no answer from $url");
    my $text = substr($body, 0, 5) eq '%PDF-' ? pdf_text($body)
             : $body =~ /<(?:html|body|div|p)\b/i ? html_text($body)
             : eval { decode('UTF-8', $body, Encode::FB_CROAK | Encode::LEAVE_SRC) } // decode('cp1252', $body);
    fail("no text in $url") unless length $text;
    my $total = length $text;
    $text = substr($text, 0, $READ_LIMIT) . "\n\n[first $READ_LIMIT of $total characters]" if $total > $READ_LIMIT;
    print encode('UTF-8', "Source: $url\n\n$text\n");
}

# A PDF's text through macOS PDFKit (osascript ships with every Mac), so a
# bank's results PDF reads like any page.
sub pdf_text {
    my ($bytes) = @_;
    fail('reading a PDF needs macOS') unless -x '/usr/bin/osascript';
    my ($fh, $path) = tempfile(SUFFIX => '.pdf', UNLINK => 1);
    binmode $fh;
    print $fh $bytes;
    close $fh;
    my $js = 'ObjC.import("PDFKit"); function run(argv) { const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0])); return d ? ObjC.unwrap(d.string) || "" : ""; }';
    open(my $out, '-|', '/usr/bin/osascript', '-l', 'JavaScript', '-e', $js, $path) or return '';
    local $/;
    my $text = decode('UTF-8', <$out> // '');
    close $out;
    $text =~ s{[ \t]+\n}{\n}g;
    $text =~ s{\n{3,}}{\n\n}g;
    $text =~ s{^\s+|\s+$}{}g;
    return $text;
}

my %ENTITY = (nbsp => ' ', amp => '&', lt => '<', gt => '>', quot => '"', apos => "'",
              rsquo => "\x{2019}", lsquo => "\x{2018}", rdquo => "\x{201d}", ldquo => "\x{201c}",
              mdash => "\x{2014}", ndash => "\x{2013}", hellip => "\x{2026}", bull => "\x{2022}",
              middot => "\x{b7}", reg => "\x{ae}", trade => "\x{2122}", copy => "\x{a9}");

# Filing HTML → text a model can read: tables keep their rows and cells
# (" | "), the inline-XBRL header and styling go.
sub html_text {
    my ($raw) = @_;
    my $h = eval { decode('UTF-8', $raw, Encode::FB_CROAK | Encode::LEAVE_SRC) } // decode('cp1252', $raw);
    $h =~ s{\A.*?(?=<html\b)}{}is;                       # EDGAR's SGML wrapper lines
    $h =~ s{<(script|style|ix:header|head)\b.*?</\1\s*>}{}gis;
    $h =~ s{<!--.*?-->}{}gs;
    $h =~ s{</t[dh]\s*>}{ | }gi;
    $h =~ s{<(?:br|/p|/div|/tr|/h\d|/li|/table)\b[^>]*>}{\n}gi;
    $h =~ s{<[^>]*>}{}g;
    $h =~ s{&#(\d+);}{chr $1}ge;
    $h =~ s{&#x([0-9a-f]+);}{chr hex $1}gie;
    $h =~ s{&([a-z]+);}{$ENTITY{lc $1} // "&$1;"}gie;
    $h =~ s{[ \t\x{a0}\x{200b}]+}{ }g;
    my @lines;
    for my $line (split /\n/, $h) {
        $line =~ s{(?:\s*\|\s*){2,}}{ | }g;  # empty cells
        $line =~ s{([\$(])\s*\|\s*}{$1}g;     # "$ | 94,036" → "$94,036"
        $line =~ s{\s*\|\s*([)%])}{$1}g;      # "(1,234 | )" → "(1,234)"
        $line =~ s{^[\s|]+|[\s|]+$}{}g;
        push @lines, $line;
    }
    my $text = join "\n", @lines;
    $text =~ s{\n{3,}}{\n\n}g;
    $text =~ s{^\s+|\s+$}{}g;
    return $text;
}

# The one writer of data/reports.json. key=value args, so an argument the
# agent leaves out arrives empty rather than shifting the others.
sub cmd_save_report {
    my %a = map { /^(\w+)=(.*)$/s ? ($1 => $2) : () } @_;
    for (values %a) { s/^\s+|\s+$//g; $_ = '' if /^\{\{\w+\}\}$/ } # an omitted arg can arrive as its placeholder
    my $sym = canonical($a{symbol}) or fail('symbol: a ticker like AAPL or RY.TO');
    fail('period: the date given by CheckReports or LatestReport (YYYY-MM-DD)')
        unless ($a{period} // '') =~ /^\d{4}-\d\d-\d\d$/;
    fail('filed: YYYY-MM-DD, or leave it out')
        if length($a{filed} // '') && $a{filed} !~ /^\d{4}-\d\d-\d\d$/;
    fail('url: an http(s) link, or leave it out')
        if length($a{url} // '') && $a{url} !~ m{^https?://\S+$};
    fail('summary: the report in a few sentences') unless length($a{summary} // '') >= 20;
    my $entry = {
        period   => $a{period},
        form     => $a{form} || undef,
        filed    => $a{filed} || $a{period},
        url      => $a{url} || undef,
        summary  => decode('UTF-8', $a{summary}),
        saved_at => strftime('%Y-%m-%dT%H:%M:%SZ', gmtime),
    };
    # The company's name rides along for readers without the quotes cache —
    # the phone tells the user "Apple reported", not "AAPL reported".
    my $name = ((read_json(data_dir() . '/quotes.json') || {})->{symbols}{$sym} || {})->{name};
    update_json('reports.json', sub {
        my ($doc) = @_;
        my $s = $doc->{symbols}{$sym} //= {};
        $s->{name} = $name if $name;
        my @kept = grep { !same_period($_->{period}, $entry->{period}) } @{ $s->{reports} || [] };
        $s->{reports} = [ sort { ($b->{filed} // '') cmp ($a->{filed} // '') } @kept, $entry ];
        return undef;
    });
    say_json({ symbol => $sym, %$entry });
}

# ── Watch: what happened to the user's money since the last run ────────────
#
# `watch-scan` finds the morning brief's candidates (doc/investments.md, "The
# Watch"): zero LLM, each event with a stable `id`, so an event Ling has
# judged (data/watch.json `seen`) is never handed over twice. Ling judges
# them; code ranks them.

my $WATCH_LOOKBACK = 36 * 3600;   # no --since and no last run
my $MOVE_TYPICAL_DAYS = 60;       # the sessions a stock's usual day is taken from
my $MOVE_SPREAD = 2.5;            # a move this many usual days wide…
my $MOVE_MIN_PCT = 2;             # …and at least this many percent
my $BREAK_GAP = 20;               # sessions since the last 52-week break that way
my $TARGET_MOVE_PCT = 5;          # the analysts' price target, moved this much
my $INSIDER_SELL = 1_000_000;     # dollars sold on the open market
my $INSIDER_BUY = 100_000;        # dollars bought on the open market
my $FORM4_MAX = 20;               # insider filings read per symbol per scan
my $NEWS_MAX = 8;                 # headlines per symbol
my $SNAPSHOTS_KEPT = 10;

my %ITEM = (
    '1.01' => 'material agreement', '1.02' => 'material agreement ended', '1.03' => 'bankruptcy',
    '1.05' => 'cybersecurity incident', '2.01' => 'acquisition or sale completed', '2.02' => 'results',
    '2.03' => 'new debt', '2.04' => 'debt accelerated', '2.05' => 'restructuring costs',
    '2.06' => 'impairment', '3.01' => 'delisting notice', '3.02' => 'unregistered share sale',
    '3.03' => 'shareholder rights changed', '4.01' => 'auditor changed',
    '4.02' => 'past results no longer reliable', '5.01' => 'change in control',
    '5.02' => 'officer or director change', '5.03' => 'bylaws changed', '5.07' => 'shareholder vote',
    '7.01' => 'investor disclosure', '8.01' => 'other event',
);

sub cmd_watch_scan {
    my ($since_arg) = map { /^--since=(.+)$/ ? $1 : () } @_;
    my @symbols = symbols_of(grep { !/^--/ } @_);
    @symbols = watched_symbols() unless @symbols;
    my $dir = data_dir();
    my $watch = read_json("$dir/watch.json") || {};
    my $now = time;
    my $since = defined $since_arg ? time_of($since_arg) : time_of($watch->{last_run} // '');
    fail('--since: a time like 2026-09-15T05:00:00Z') if defined $since_arg && !defined $since;
    $since //= $now - $WATCH_LOOKBACK;
    my $state = read_json("$dir/watch-scan.json") || {};
    my $cells = register_investments();
    my (@events, @failed, %positions, %snapshots);
    for my $sym (@symbols) {
        my $scan = scan_symbol($sym, $since, $state->{symbols}{$sym}{analysts}, $cells->{$sym} || {});
        push @events, @{ $scan->{events} };
        push @failed, map { { symbol => $sym, error => $_ } } @{ $scan->{errors} };
        $positions{$sym} = $scan->{position} if $scan->{position};
        $snapshots{$sym} = $scan->{snapshot} if $scan->{snapshot};
    }
    my $economy = economy_scan($since, $state->{economy}, today());
    push @events, @{ $economy->{events} };
    push @failed, map { { scope => 'economy', error => $_ } } @{ $economy->{errors} };
    update_json('watch-scan.json', sub {
        my ($doc) = @_;
        if ($economy->{snapshot}) {
            my $list = $doc->{economy} ||= [];
            push @$list, { at => $now, %{ $economy->{snapshot} } };
            splice @$list, 0, @$list - $SNAPSHOTS_KEPT if @$list > $SNAPSHOTS_KEPT;
        }
        for my $sym (keys %snapshots) {
            my $list = $doc->{symbols}{$sym}{analysts} ||= [];
            push @$list, { at => $now, %{ $snapshots{$sym} } };
            splice @$list, 0, @$list - $SNAPSHOTS_KEPT if @$list > $SNAPSHOTS_KEPT;
        }
        return undef;
    });
    my $scan = {
        since      => iso_time($since),
        scanned_at => iso_time($now),
        home       => home_currency(),
        positions  => weigh_positions(\%positions),
        events     => fresh_events(\@events, $watch->{seen} || {}, $cells),
        failed     => \@failed,
        checked    => \@symbols,
    };
    write_json("$dir/watch-candidates.json", $scan); # what save-watch judges against
    say_json($scan);
}

# One symbol's candidates, its position, and today's analyst snapshot. What a
# source couldn't answer is an error beside what the others found.
sub scan_symbol {
    my ($sym, $since, $snapshots, $cell) = @_;
    my %out = (events => [], errors => []);
    my $e = quote_entry($sym);
    my $shares = $cell->{shares} // 0;
    if ($e->{error} && !$e->{kind}) {
        push @{ $out{errors} }, $e->{error};
        $out{position} = position_of($e, $shares, undef, time) if $shares > 0; # held: never dropped
        return \%out;
    }
    my $rows = history_of($e);
    my $page = overview($e);
    my $data = $page ? $page->[1] : {};
    push @{ $out{errors} }, 'no price history from stockanalysis.com' unless $rows;
    push @{ $out{errors} }, 'no news from stockanalysis.com' unless $page;
    $out{position} = position_of($e, $shares, $rows, time);
    my @found;
    push @found, move_events($sym, $rows, $since, $shares), break_events($sym, $rows, $since) if $rows;
    push @found, news_events($sym, $data->{news}, $since);
    unless (($e->{kind} // '') eq 'etf') {
        push @found, earnings_events($sym, $e->{earnings_on}, today());
        if ($page) {
            my $now = { analysts => clean_stat($data->{analysts}), target => clean_stat($data->{target}) };
            push @found, analyst_events($sym, $now, $snapshots, $since, today());
            $out{snapshot} = $now;
        }
        if ($e->{exchange} eq 'US') {
            my ($filed, $err) = sec_events($e, $since);
            push @found, @$filed;
            push @{ $out{errors} }, $err if $err;
        }
    }
    $out{events} = \@found;
    return \%out;
}

# A symbol's position: the newest close, else the cached price. `stale` = the
# price is the last known one (no session or quote in 5 days); a holding
# with no price at all has `value` null — weigh_positions won't guess.
sub position_of {
    my ($e, $shares, $rows, $now) = @_;
    my $close = $rows && @$rows ? $rows->[0] : undef;
    my $price = $close ? $close->{c} : $e->{price};
    my $stale = $close ? $now - session_end($close->{t}) > $STALE_DAYS * 86400
              : defined $price && ($e->{stale} || quote_stale($e, $now));
    return {
        name => $e->{name}, kind => $e->{kind}, currency => $e->{currency} // ($e->{symbol} =~ /\.TO$/ ? 'CAD' : 'USD'),
        shares => $shares + 0, price => $price,
        value => !($shares > 0) ? 0 : defined $price ? round_to($shares * $price, 2) : undef,
        ($stale ? (stale => JSON::PP::true, price_on => $close ? $close->{t} : quote_day($e)) : ()),
    };
}

# The day a cached price is from: the source's own time, else when we fetched it.
sub quote_day {
    my ($e) = @_;
    my ($at) = sort { $a <=> $b } grep { $_ } time_of($e->{price_time} // ''), $e->{quote_at};
    return $at ? strftime('%Y-%m-%d', gmtime($at)) : undef;
}

# The currency CFO reports in (config.json), for weighing a currency move.
sub home_currency {
    my $cfg = read_json(dirname(data_dir()) . '/config.json') || {};
    return uc($cfg->{currency} || 'USD');
}

sub clean_stat { my ($v) = @_; return defined $v && $v ne '' && $v ne 'n/a' ? $v : undef }

# Newest first, one per id (a headline tagged with two holdings comes once,
# naming both), minus those Ling has already judged. `also` names only the
# user's own symbols (`listed`: held or watched) — a ticker scanned on
# request never rides along on theirs.
sub fresh_events {
    my ($events, $seen, $listed) = @_;
    my (%by_id, @out);
    for my $ev (@$events) {
        next if $seen->{ $ev->{id} };
        if (my $had = $by_id{ $ev->{id} }) {
            push @{ $had->{also} ||= [] }, $ev->{symbol}
                if $ev->{symbol} && ($had->{symbol} // '') ne $ev->{symbol} && $listed->{ $ev->{symbol} };
            next;
        }
        $by_id{ $ev->{id} } = $ev;
        push @out, $ev;
    }
    return [ sort { $b->{at} cmp $a->{at} || $a->{id} cmp $b->{id} } @out ];
}

# Each position's share of its currency's holdings — US and Canadian dollars
# never add up. A stale price counts at its last known value (flagged on the
# position). A holding with no price at all leaves its currency's weights
# null: a total that silently shrank would push the others past the 10% bar.
sub weigh_positions {
    my ($positions) = @_;
    my (%total, %unknown);
    for my $p (values %$positions) {
        my $cur = $p->{currency} // 'USD';
        if (($p->{shares} // 0) > 0 && !defined $p->{value}) { $unknown{$cur} = 1; next }
        $total{$cur} += $p->{value} // 0;
    }
    for my $p (values %$positions) {
        my $cur = $p->{currency} // 'USD';
        my $t = $total{$cur};
        $p->{weight_pct} = $unknown{$cur} ? undef : $t && $p->{value} ? round_to($p->{value} / $t * 100, 1) : 0;
    }
    return $positions;
}

# A year of daily closes, newest first: [{t, c, ch}] (ch = the day's % change).
sub history_of {
    my ($e) = @_;
    my $t = lc ticker($e);
    my @paths = $e->{exchange} eq 'TSX' ? ("a/tsx-$t")
              : ($e->{kind} // '') eq 'etf' ? ("e/$t")
              : ("s/$t", "e/$t");
    for my $path (@paths) {
        my $body = fetch_json("$BASE/api/symbol/$path/history?range=1Y&period=Daily") or next;
        my $rows = $body->{data};
        return [ grep { ref eq 'HASH' && defined $_->{t} && defined $_->{c} } @$rows ]
            if ($body->{status} // 0) == 200 && ref $rows eq 'ARRAY' && @$rows;
    }
    return undef;
}

# A session closes 16:00 New York (and Toronto) time: 20:00 UTC under daylight
# time, 21:00 UTC in winter. US/Canada daylight time runs from the second
# Sunday of March to the first Sunday of November; no session falls on
# either Sunday, so the date alone decides.
sub session_end {
    my ($y, $m, $d) = split /-/, $_[0];
    return timegm(0, 0, 16 + (daylight_time($y, $m, $d) ? 4 : 5), $d, $m - 1, $y);
}

sub daylight_time {
    my ($y, $m, $d) = @_;
    my $sunday = sub { my ($month, $nth) = @_; my $dow = (gmtime(timegm(0, 0, 12, 1, $month - 1, $y)))[6]; 1 + (7 - $dow) % 7 + 7 * ($nth - 1) };
    return 0 if $m < 3 || $m > 11;
    return $d >= $sunday->(3, 2) if $m == 3;
    return $d < $sunday->(11, 1) if $m == 11;
    return 1;
}

# A session still open at `now` is left for the next window: the next scan's
# window starts at this one, before the close, so it looks at it then.
sub session_closed { my ($day, $now) = @_; return session_end($day) <= ($now // time) }

# Sessions since the window whose move was far past the stock's usual day: at
# least 2.5 times the standard deviation of the 60 sessions before it, and 2%.
# The position's real dollar change rides along.
sub move_events {
    my ($sym, $rows, $since, $shares, $now) = @_;
    my @out;
    for my $i (0 .. $#$rows) {
        my $r = $rows->[$i];
        last if session_end($r->{t}) < $since;
        next unless defined $r->{ch} && $i < $#$rows && session_closed($r->{t}, $now);
        my @usual = grep { defined } map { $_->{ch} } @$rows[$i + 1 .. min($i + $MOVE_TYPICAL_DAYS, $#$rows)];
        next unless @usual >= 20;
        my $spread = spread(@usual);
        next unless abs($r->{ch}) >= $MOVE_MIN_PCT && abs($r->{ch}) >= $MOVE_SPREAD * $spread;
        my $prev = $rows->[$i + 1]{c};
        push @out, {
            id => "move:$sym:$r->{t}", symbol => $sym, kind => 'move',
            at => iso_time(session_end($r->{t})), session => $r->{t},
            change_pct => $r->{ch} + 0, usual_pct => round_to($spread, 2), close => $r->{c} + 0,
            position_change => $shares > 0 ? round_to($shares * ($r->{c} - $prev), 2) : undef,
        };
    }
    return @out;
}

# Standard deviation.
sub spread {
    my $mean = sum(@_) / @_;
    return sqrt(sum(map { ($_ - $mean) ** 2 } @_) / @_);
}

# A close past the 52-week range since the window, when the last close past
# it that way was 20+ sessions back: a fresh high or low, not every day of a run.
sub break_events {
    my ($sym, $rows, $since, $now) = @_;
    my @out;
    for my $i (0 .. $#$rows) {
        my $r = $rows->[$i];
        last if session_end($r->{t}) < $since;
        next unless session_closed($r->{t}, $now);
        for my $way (['high_52w', 1], ['low_52w', -1]) {
            my ($kind, $dir) = @$way;
            next unless breaks_year($rows, $i, $dir);
            next if grep { breaks_year($rows, $_, $dir) } $i + 1 .. min($i + $BREAK_GAP, $#$rows);
            push @out, { id => "$kind:$sym:$r->{t}", symbol => $sym, kind => $kind,
                         at => iso_time(session_end($r->{t})), session => $r->{t}, close => $r->{c} + 0 };
        }
    }
    return @out;
}

# Session i closed above (dir 1) or below (-1) every close of the year before.
sub breaks_year {
    my ($rows, $i, $dir) = @_;
    my @year = map { $_->{c} } @$rows[$i + 1 .. min($i + 250, $#$rows)];
    return 0 unless @year >= 200;
    return $dir > 0 ? $rows->[$i]{c} > max(@year) : $rows->[$i]{c} < min(@year);
}

sub earnings_events {
    my ($sym, $on, $today) = @_;
    return () unless $on;
    my $when = $on eq $today ? 'today' : $on eq shift_date($today, 1) ? 'tomorrow' : return ();
    return { id => "earnings:$sym:$on", symbol => $sym, kind => 'earnings',
             at => iso_time(epoch_of($on)), on => $on, when => $when };
}

# The consensus rating changed, or its price target moved 5%+, against the
# latest snapshot taken before the window. No snapshot yet: nothing to compare.
sub analyst_events {
    my ($sym, $now, $snapshots, $since, $today) = @_;
    my ($before) = sort { $b->{at} <=> $a->{at} } grep { ($_->{at} // 0) <= $since } @{ $snapshots || [] };
    return () unless $before;
    my ($was, $is) = (target_price($before->{target}), target_price($now->{target}));
    my $rated = defined $now->{analysts} && ($before->{analysts} // '') ne $now->{analysts};
    my $moved = $was && $is && abs($is / $was - 1) * 100 >= $TARGET_MOVE_PCT;
    return () unless $rated || $moved;
    return { id => "analyst:$sym:$today", symbol => $sym, kind => 'analyst', at => iso_time(time),
             rating_was => $before->{analysts}, rating => $now->{analysts},
             target_was => $was, target => $is };
}

# "396.94 (+9.72%)" → 396.94
sub target_price {
    my ($s) = @_;
    return undef unless defined $s && $s =~ /^\s*\$?([\d,]+(?:\.\d+)?)/;
    (my $n = $1) =~ tr/,//d;
    return $n + 0;
}

# Headlines from the stock's page since the window (articles, not videos).
sub news_events {
    my ($sym, $news, $since) = @_;
    my $list = ref $news eq 'HASH' ? $news->{data} : $news;
    my @out;
    for my $n (ref $list eq 'ARRAY' ? @$list : ()) {
        next unless ref $n eq 'HASH' && ($n->{url} // '') =~ m{^https?://\S+$} && ($n->{type} // 'Article') eq 'Article';
        my $at = time_of($n->{time} // '');
        next unless defined $at && $at >= $since;
        push @out, { id => 'news:' . substr(md5_hex(encode('UTF-8', $n->{url})), 0, 16), symbol => $sym,
                     kind => 'news', at => iso_time($at), title => $n->{title}, text => $n->{text},
                     source => $n->{source}, url => $n->{url} };
        last if @out >= $NEWS_MAX;
    }
    return @out;
}

# SEC filings since the window: 8-Ks by item and 13D stakes as events; Form 4s
# read for open-market trades big enough to mean something.
sub sec_events {
    my ($e, $since) = @_;
    my $cik = sec_cik($e) or return ([], 'not found on SEC EDGAR');
    my $sub = fetch_json(sprintf('https://data.sec.gov/submissions/CIK%010d.json', $cik), $SEC_UA)
        or return ([], 'no answer from SEC EDGAR');
    my ($events, $form4s) = filing_events($e->{symbol}, $cik, $sub->{filings}{recent} || {}, $since);
    for my $f (@$form4s[0 .. min($FORM4_MAX, scalar @$form4s) - 1]) {
        my $xml = fetch($f->{xml}, $SEC_UA) // next;
        my $ev = insider_event($e->{symbol}, $f, form4_trades($xml)) or next;
        push @$events, $ev;
    }
    return ($events, undef);
}

# EDGAR's `filings.recent` columns → [events], [Form 4s to read].
sub filing_events {
    my ($sym, $cik, $recent, $since) = @_;
    my (@events, @form4s);
    for my $i (0 .. $#{ $recent->{form} || [] }) {
        my $at = time_of($recent->{acceptanceDateTime}[$i] // '')
              // (($recent->{filingDate}[$i] // '') =~ /^\d{4}-\d\d-\d\d$/ ? epoch_of($recent->{filingDate}[$i]) : undef);
        next unless defined $at && $at >= $since;
        my ($form, $acc, $doc) = ($recent->{form}[$i], $recent->{accessionNumber}[$i], $recent->{primaryDocument}[$i] // '');
        (my $folder = $acc) =~ s/-//g;
        my $url = "https://www.sec.gov/Archives/edgar/data/$cik/$folder/$doc";
        my %base = (id => "filing:$acc", symbol => $sym, kind => 'filing', at => iso_time($at), form => $form, url => $url);
        if ($form =~ m{^8-K(?:/A)?$}) {
            my @items = grep { $_ ne '9.01' } split /\s*,\s*/, $recent->{items}[$i] // '';
            push @events, { %base, items => \@items, what => join('; ', map { $ITEM{$_} // "item $_" } @items) } if @items;
        }
        elsif ($form =~ /^(?:SC|SCHEDULE) 13D/) {
            push @events, { %base, what => 'an investor holds 5%+ and may act on it' };
        }
        elsif ($form eq '4') {
            (my $xml = $doc) =~ s{^xsl[^/]*/}{};
            push @form4s, { acc => $acc, at => $at, url => $url, xml => "https://www.sec.gov/Archives/edgar/data/$cik/$folder/$xml" };
        }
    }
    return (\@events, \@form4s);
}

# A Form 4's open-market trades — code P (bought) or S (sold) — summed; grants,
# option exercises and gifts aren't signals.
sub form4_trades {
    my ($xml) = @_;
    my %t = (bought => 0, bought_shares => 0, sold => 0, sold_shares => 0);
    while ($xml =~ m{<nonDerivativeTransaction>(.*?)</nonDerivativeTransaction>}gs) {
        my $row = $1;
        my $side = { P => 'bought', S => 'sold' }->{ xml_text('transactionCode', $row) // '' } or next;
        my $shares = xml_value('transactionShares', $row) // 0;
        $t{$side} += $shares * (xml_value('transactionPricePerShare', $row) // 0);
        $t{"${side}_shares"} += $shares;
    }
    $t{who} = xml_text('rptOwnerName', $xml);
    $t{role} = xml_text('officerTitle', $xml)
            || ((xml_text('isDirector', $xml) // '') =~ /^(?:1|true)$/i ? 'director' : undef)
            || ((xml_text('isTenPercentOwner', $xml) // '') =~ /^(?:1|true)$/i ? '10% owner' : undef);
    $t{planned} = (xml_text('aff10b5One', $xml) // '') =~ /^(?:1|true)$/i ? JSON::PP::true : JSON::PP::false;
    return \%t;
}

sub xml_text { my ($tag, $in) = @_; return $in =~ m{<$tag>\s*([^<]*?)\s*</$tag>}s ? decode_xml($1) : undef }

sub xml_value { my ($tag, $in) = @_; return $in =~ m{<$tag>\s*<value>\s*([^<]*?)\s*</value>}s ? decode_xml($1) : undef }

sub decode_xml {
    my ($s) = @_;
    $s =~ s/&amp;/&/g; $s =~ s/&lt;/</g; $s =~ s/&gt;/>/g; $s =~ s/&quot;/"/g; $s =~ s/&apos;/'/g;
    return $s;
}

# An insider's trades as an event when they're big enough: a sale of $1M+ or
# a purchase of $100K+ on the open market.
sub insider_event {
    my ($sym, $filing, $t) = @_;
    my $side = $t->{sold} >= $INSIDER_SELL ? 'sold' : $t->{bought} >= $INSIDER_BUY ? 'bought' : return undef;
    return { id => "insider:$filing->{acc}", symbol => $sym, kind => 'insider', at => iso_time($filing->{at}),
             who => $t->{who}, role => $t->{role}, side => $side, value => round_to($t->{$side}, 0),
             shares => $t->{"${side}_shares"} + 0, planned => $t->{planned}, url => $filing->{url} };
}

# ── Watch: the economy and US policy ───────────────────────────────────────
#
# Events with no symbol (`scope: economy`): rate decisions, FOMC statements
# and meetings, CPI and jobs, big USD/CAD days, and US policy from the Federal
# Register. Ling decides which holdings they touch. Public sources, no keys.

my $FX_MIN_PCT = 0.5;             # a currency day this big, and 2.5 usual days wide
my $POLICY_MAX = 25;              # Federal Register documents per scan
my @POLICY_AGENCIES = qw(industry-and-security-bureau trade-representative-office-of-united-states);
# Presidential documents that never move money: observances and routine renewals.
my $CEREMONIAL = qr/\b(?:Day|Week|Month)(?:,? \d{4})?$|Anniversary|Honoring|Memory of|^Continuation of the National Emergency/i;
my %BLS = (cpi_sa => 'CUSR0000SA0', cpi => 'CUUR0000SA0', payrolls => 'CES0000000001', unemployment => 'LNS14000000');

# The snapshot (data/watch-scan.json `economy`) carries what each daily
# series had published at the last scan — `effr`, `boc_rate`, `fx`: the newest
# observation's date — and the BLS months. A rate is published the day after
# the one it's for, after the nightly run, so a window on the observation's
# own date would never see it; "newer than what the last scan saw" does.
sub economy_scan {
    my ($since, $snapshots, $today) = @_;
    my %out = (events => [], errors => []);
    my $add = sub {
        my ($source, @events) = @_;
        return push @{ $out{errors} }, "no answer from $source" unless defined $events[0];
        push @{ $out{events} }, grep { ref } @events;
    };
    my @by_time = sort { ($b->{at} // 0) <=> ($a->{at} // 0) } @{ $snapshots || [] };
    my ($before) = grep { ($_->{at} // 0) <= $since } @by_time;
    my %snap = %{ $by_time[0] || {} };   # a source that doesn't answer keeps what it had
    delete $snap{at};
    my $effr = fetch_json('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/10.json', $SEC_UA);
    $add->('the New York Fed', $effr ? ('ok', fed_rate_events($effr->{refRates}, $since, $before->{effr})) : undef);
    $snap{effr} = newest_day([ map { $_->{effectiveDate} } grep { ref eq 'HASH' } @{ $effr->{refRates} || [] } ]) // $snap{effr} if $effr;
    my $feed = fetch('https://www.federalreserve.gov/feeds/press_monetary.xml');
    $add->('the Federal Reserve', $feed ? ('ok', fed_release_events(decode('UTF-8', $feed), $since)) : undef);
    my $calendar = fetch('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm');
    $add->('the FOMC calendar', $calendar ? ('ok', fomc_meeting_events($calendar, $today)) : undef);
    my $boc = fetch_json('https://www.bankofcanada.ca/valet/observations/V39079,FXUSDCAD/json?recent=80', $SEC_UA);
    $add->('the Bank of Canada', $boc ? ('ok', boc_events($boc->{observations}, $since, $before)) : undef);
    if ($boc) {
        for my $series (['boc_rate', 'V39079'], ['fx', 'FXUSDCAD']) {
            my ($key, $id) = @$series;
            my @days = map { $_->{d} } grep { ref eq 'HASH' && $_->{d} && ref $_->{$id} eq 'HASH' && ($_->{$id}{v} // '') ne '' } @{ $boc->{observations} || [] };
            $snap{$key} = newest_day(\@days) // $snap{$key};
        }
    }
    my $bls = bls_series();
    if ($bls) {
        $add->('the BLS', 'ok', bls_events($bls, $before));
        %snap = (%snap, %{ bls_periods($bls) });
    } else {
        $add->('the BLS', undef);
    }
    my $docs = policy_documents($since);
    $add->('the Federal Register', $docs ? ('ok', policy_events($docs, $since)) : undef);
    $_->{scope} = 'economy' for @{ $out{events} };
    $out{snapshot} = \%snap if grep { defined } values %snap;
    return \%out;
}

sub newest_day { my ($days) = @_; my ($d) = sort { $b cmp $a } grep { defined && /^\d{4}-\d\d-\d\d$/ } @$days; return $d }

# A daily observation the last scan hadn't seen: newer than the newest one it
# saw (`through`). With no earlier scan, one published inside the window —
# the next weekday, 13:00 UTC, at the earliest.
sub unseen_day {
    my ($day, $since, $through) = @_;
    return $day gt $through if defined $through;
    return published_at($day) >= $since;
}

sub published_at {
    my ($day) = @_;
    my $next = shift_date($day, 1);
    $next = shift_date($next, 1) while (gmtime(epoch_of($next)))[6] =~ /^[06]$/;
    return epoch_of($next) + 3600;
}

# The Fed's target range changed on a day the last scan hadn't seen (the New
# York Fed's daily effective rate carries the range in force).
sub fed_rate_events {
    my ($rates, $since, $through) = @_;
    my @days = sort { $b->{effectiveDate} cmp $a->{effectiveDate} } grep { ref eq 'HASH' && $_->{effectiveDate} } @{ $rates || [] };
    my @out;
    for my $i (0 .. $#days - 1) {
        my ($day, $prev) = @days[$i, $i + 1];
        last unless unseen_day($day->{effectiveDate}, $since, $through);
        next if $day->{targetRateFrom} == $prev->{targetRateFrom} && $day->{targetRateTo} == $prev->{targetRateTo};
        push @out, rate_event('Fed', $day->{effectiveDate}, range_of($prev), range_of($day),
                              ($day->{targetRateTo} - $prev->{targetRateTo}) * 100);
    }
    return @out;
}

sub range_of { sprintf "%.2f\x{2013}%.2f%%", $_[0]{targetRateFrom}, $_[0]{targetRateTo} }

sub rate_event {
    my ($bank, $on, $from, $to, $bp) = @_;
    return { id => "rate:$bank:$on", kind => 'rate', bank => $bank, at => iso_time(epoch_of($on)),
             on => $on, from => $from, to => $to, change_bp => round_to($bp, 0) };
}

# FOMC statements and minutes released inside the window.
sub fed_release_events {
    my ($xml, $since) = @_;
    my @out;
    while ($xml =~ m{<item\b[^>]*>(.*?)</item>}gs) {
        my $item = $1;
        my ($title) = map { decode_html_entities(strip_cdata($_)) } $item =~ m{<title>(.*?)</title>}s;
        my ($link) = map { strip_cdata($_) } $item =~ m{<link>(.*?)</link>}s;
        my ($date) = map { strip_cdata($_) } $item =~ m{<pubDate>(.*?)</pubDate>}s;
        next unless $title && $link && $title =~ /FOMC statement|Minutes of the Federal Open Market Committee/i;
        my $at = time_of($date // '');
        next unless defined $at && $at >= $since;
        (my $key = $link) =~ s{^.*/}{};
        push @out, { id => "fed:$key", kind => 'fed', title => $title, url => $link, at => iso_time($at) };
    }
    return @out;
}

sub strip_cdata { my ($s) = @_; $s =~ s/^\s*<!\[CDATA\[|\]\]>\s*$//g; $s =~ s/^\s+|\s+$//g; return $s }

sub decode_html_entities { my ($s) = @_; $s =~ s/&#(\d+);/chr($1)/ge; return decode_xml($s) }

# An FOMC decision today or tomorrow, from the Fed's calendar.
sub fomc_meeting_events {
    my ($html, $today) = @_;
    my $tomorrow = shift_date($today, 1);
    return map {
        { id => "fomc:$_->{on}", kind => 'fomc', at => iso_time(epoch_of($_->{on})), on => $_->{on},
          when => $_->{on} eq $today ? 'today' : 'tomorrow', projections => $_->{projections} }
    } grep { $_->{on} eq $today || $_->{on} eq $tomorrow } fomc_decisions($html);
}

# Every decision day on the Fed's calendar page ("September 15-16*": the
# decision comes on the last day; * = new economic projections).
sub fomc_decisions {
    my ($html) = @_;
    my @out;
    while ($html =~ m{>(\d{4}) FOMC Meetings<(.*?)(?=>\d{4} FOMC Meetings<|\z)}gs) {
        my ($year, $block) = ($1, $2);
        while ($block =~ m{fomc-meeting__month[^>]*><strong>([^<]+)</strong>.*?fomc-meeting__date[^>]*>([^<]+)<}gs) {
            my ($months, $days) = ($1, $2);
            my ($last_month) = ($months =~ m{([A-Za-z]+)\s*$});
            my ($last_day) = ($days =~ m{(\d+)\D*$});
            my $m = month_number($last_month) or next;
            next unless defined $last_day;
            push @out, { on => sprintf('%04d-%02d-%02d', $year, $m, $last_day),
                         projections => $days =~ /\*/ ? JSON::PP::true : JSON::PP::false };
        }
    }
    return @out;
}

# The Bank of Canada's rate changed, or USD/CAD had a day far past its usual
# one (2.5 usual days wide and 0.5%), on a day the last scan hadn't seen
# (`before`: its snapshot's `boc_rate` and `fx`).
sub boc_events {
    my ($observations, $since, $before) = @_;
    my @days = sort { $b->{d} cmp $a->{d} } grep { ref eq 'HASH' && $_->{d} } @{ $observations || [] };
    my $value = sub { my ($day, $series) = @_; my $v = ($day->{$series} || {})->{v}; defined $v && $v ne '' ? $v : undef };
    my @out;
    my @rates = grep { defined $value->($_, 'V39079') } @days;   # holidays carry no value
    for my $i (0 .. $#rates - 1) {
        my ($rate, $was) = map { $value->($_, 'V39079') } @rates[$i, $i + 1];
        last unless unseen_day($rates[$i]{d}, $since, $before->{boc_rate});
        next if $rate == $was;
        push @out, rate_event('Bank of Canada', $rates[$i]{d}, sprintf('%.2f%%', $was), sprintf('%.2f%%', $rate), ($rate - $was) * 100);
    }
    my @fx = grep { defined $value->($_, 'FXUSDCAD') } @days;
    for my $i (0 .. $#fx - 1) {
        last unless unseen_day($fx[$i]{d}, $since, $before->{fx});
        my @v = map { $value->($_, 'FXUSDCAD') } @fx[$i .. min($i + 61, $#fx)];
        my @usual = map { ($v[$_] / $v[$_ + 1] - 1) * 100 } 1 .. $#v - 1;
        next unless @usual >= 20;
        my ($change, $spread) = (($v[0] / $v[1] - 1) * 100, spread(@usual));
        next unless abs($change) >= $FX_MIN_PCT && abs($change) >= $MOVE_SPREAD * $spread;
        push @out, { id => "fx:USDCAD:$fx[$i]{d}", kind => 'fx', pair => 'USD/CAD', at => iso_time(session_end($fx[$i]{d})),
                     on => $fx[$i]{d}, rate => $v[0] + 0, change_pct => round_to($change, 2), usual_pct => round_to($spread, 2) };
    }
    return @out;
}

# CPI and the jobs report from the BLS: {series id => [{year, period, value}]}
# newest first. One request a scan (the keyless API allows 25 a day).
sub bls_series {
    my $body = post_json('https://api.bls.gov/publicAPI/v1/timeseries/data/', { seriesid => [ values %BLS ] }, $SEC_UA) or return undef;
    return undef unless ($body->{status} // '') eq 'REQUEST_SUCCEEDED';
    return { map { $_->{seriesID} => [ grep { $_->{period} =~ /^M(?:0[1-9]|1[0-2])$/ } @{ $_->{data} || [] } ] }
             @{ $body->{Results}{series} || [] } };
}

# The latest month each release covers: {cpi, jobs} → "YYYY-MM".
sub bls_periods {
    my ($series) = @_;
    my $month = sub { my $row = ($series->{ $_[0] } || [])->[0] or return undef; sprintf '%s-%s', $row->{year}, substr($row->{period}, 1) };
    return { cpi => $month->($BLS{cpi_sa}), jobs => $month->($BLS{payrolls}) };
}

# A release whose month is newer than the snapshot from before the window.
# No snapshot yet: nothing to compare.
sub bls_events {
    my ($series, $before) = @_;
    return () unless $before;
    my $now = bls_periods($series);
    my @out;
    if ($now->{cpi} && ($before->{cpi} // '') lt $now->{cpi}) {
        my ($sa, $nsa) = map { $series->{$_} || [] } @BLS{qw(cpi_sa cpi)};
        my ($year_ago) = grep { $_->{year} == $nsa->[0]{year} - 1 && $_->{period} eq $nsa->[0]{period} } @$nsa;
        push @out, { id => "data:cpi:$now->{cpi}", kind => 'data', release => 'CPI', month => $now->{cpi},
                     at => iso_time(time),
                     mom_pct => @$sa > 1 ? round_to(($sa->[0]{value} / $sa->[1]{value} - 1) * 100, 1) : undef,
                     yoy_pct => $year_ago ? round_to(($nsa->[0]{value} / $year_ago->{value} - 1) * 100, 1) : undef };
    }
    if ($now->{jobs} && ($before->{jobs} // '') lt $now->{jobs}) {
        my ($pay, $unemp) = map { $series->{$_} || [] } @BLS{qw(payrolls unemployment)};
        push @out, { id => "data:jobs:$now->{jobs}", kind => 'data', release => 'jobs report', month => $now->{jobs},
                     at => iso_time(time),
                     payrolls_change_k => @$pay > 1 ? $pay->[0]{value} - $pay->[1]{value} : undef,
                     unemployment_pct => @$unemp ? $unemp->[0]{value} + 0 : undef,
                     unemployment_was => @$unemp > 1 ? $unemp->[1]{value} + 0 : undef };
    }
    return @out;
}

# Federal Register documents published inside the window that can move
# markets: presidential documents, significant rules, and export-control and
# trade-representative actions. undef when the Register doesn't answer.
sub policy_documents {
    my ($since) = @_;
    my $from = strftime('%Y-%m-%d', gmtime($since));
    my $base = 'https://www.federalregister.gov/api/v1/documents.json?per_page=100'
             . "&conditions%5Bpublication_date%5D%5Bgte%5D=$from"
             . join('', map { "&fields%5B%5D=$_" } qw(document_number title abstract type subtype agencies html_url publication_date));
    my @queries = (
        '&conditions%5Btype%5D%5B%5D=PRESDOCU',
        '&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE&conditions%5Bsignificant%5D=1',
        join('', map { "&conditions%5Bagencies%5D%5B%5D=$_" } @POLICY_AGENCIES)
            . '&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE&conditions%5Btype%5D%5B%5D=NOTICE',
    );
    my (%seen, @docs);
    for my $q (@queries) {
        my $page = fetch_json("$base$q", $SEC_UA) or return undef;
        push @docs, grep { !$seen{ $_->{document_number} // '' }++ } @{ $page->{results} || [] };
    }
    return \@docs;
}

sub policy_events {
    my ($docs, $since) = @_;
    my @out;
    for my $d (sort { ($b->{publication_date} // '') cmp ($a->{publication_date} // '') } @{ $docs || [] }) {
        next unless $d->{document_number} && $d->{title} && ($d->{publication_date} // '') =~ /^\d{4}-\d\d-\d\d$/;
        next if epoch_of($d->{publication_date}) < $since;
        next if ($d->{type} // '') eq 'Presidential Document' && $d->{title} =~ $CEREMONIAL;
        push @out, { id => "policy:$d->{document_number}", kind => 'policy', at => iso_time(epoch_of($d->{publication_date})),
                     type => $d->{subtype} || $d->{type}, title => $d->{title}, abstract => $d->{abstract},
                     agencies => [ grep { defined } map { $_->{name} // $_->{raw_name} } @{ $d->{agencies} || [] } ],
                     url => $d->{html_url} };
        last if @out >= $POLICY_MAX;
    }
    return @out;
}

# ── Watch: Ling's judgment, ranked into the morning brief ──────────────────
#
# `save-watch judgments=[{id, materiality, holdings, line}]` takes Ling's word
# on each candidate of the last scan (data/watch-candidates.json) and nothing
# else: ids, facts, positions and stakes come from the scan. Code decides what
# speaks. data/watch.json:
#   {last_run, level, seen{id: day}, items[judged, 7 days], briefs{day:
#    {made_at, level, lines[id], quiet}}}
# `level` (quiet / normal / everything) is the user's, set by watch-level.

my %MATERIALITY = (high => 3, medium => 2, low => 1, none => 0);
my %STAKE_SHARE = (high => 0.10, medium => 0.03, low => 0.01);  # of a position's value
my $BRIEF_LINES = 3;
my $BIG_WEIGHT_PCT = 10;          # a holding this big speaks at medium
my $ITEMS_DAYS = 7;
my $SEEN_DAYS = 30;
my $BRIEFS_DAYS = 14;
my @LEVELS = qw(quiet normal everything);
# A watched-only ticker's own big events.
my %WATCHLIST_KINDS = map { $_ => 1 } qw(move high_52w low_52w earnings filing);

sub cmd_save_watch {
    my %a = map { /^(\w+)=(.*)$/s ? ($1 => $2) : () } @_;
    my $raw = $a{judgments} // '';
    $raw = '[]' if $raw =~ /^\s*(?:\{\{\w+\}\})?\s*$/;
    my $judged = eval { JSON::PP->new->utf8->decode($raw) };
    $judged = $judged->{judgments} if ref $judged eq 'HASH';
    fail('judgments: a JSON array of {id, materiality, holdings, line}') unless ref $judged eq 'ARRAY';
    my $scan = read_json(data_dir() . '/watch-candidates.json') or fail('no scan to judge — call WatchScan first');
    say_json(update_json('watch.json', sub { record_watch($_[0], $scan, $judged, today(), watch_level($_[0]), time) }));
}

sub watch_level { my ($doc) = @_; return grep({ $_ eq ($doc->{level} // '') } @LEVELS) ? $doc->{level} : 'normal' }

# The user picks how much the brief says; the latest brief is made again at
# that level, so the change shows at once.
sub cmd_watch_level {
    my ($level) = map { /^(?:level=)?(\w+)$/ ? lc $1 : () } @_;
    fail('level: quiet, normal or everything') unless $level && grep { $_ eq $level } @LEVELS;
    say_json(update_json('watch.json', sub {
        my ($doc) = @_;
        $doc->{level} = $level;
        my ($day) = sort { $b cmp $a } keys %{ $doc->{briefs} || {} };
        return { level => $level } unless $day;
        my @lines = brief_lines([ grep { ($_->{saved_on} // '') eq $day } @{ $doc->{items} || [] } ], $level);
        $doc->{briefs}{$day} = { %{ $doc->{briefs}{$day} }, level => $level, lines => [ map { $_->{id} } @lines ],
                                 quiet => @lines ? JSON::PP::false : JSON::PP::true };
        return { level => $level, day => $day, lines => $doc->{briefs}{$day}{lines} };
    }));
}

# Fold one run into watch.json and make the day's brief. Every candidate of
# the scan is seen from now on, judged or not — a skipped one would otherwise
# come back every night.
sub record_watch {
    my ($doc, $scan, $judged, $today, $level, $now) = @_;
    my %judgment = map { ref eq 'HASH' && defined $_->{id} ? ($_->{id} => $_) : () } @$judged;
    my $positions = $scan->{positions} || {};
    my @fresh;
    for my $ev (@{ $scan->{events} || [] }) {
        my $item = judged_item($ev, $judgment{ $ev->{id} } || {}, $positions, $scan->{home} // 'USD') or next;
        push @fresh, { %$item, saved_on => $today };
    }
    my %fresh_id = map { $_->{id} => 1 } @fresh;
    my $oldest = shift_date($today, -$ITEMS_DAYS);
    $doc->{items} = [ (grep { !$fresh_id{ $_->{id} } && ($_->{saved_on} // '') gt $oldest } @{ $doc->{items} || [] }), @fresh ];
    my $seen = $doc->{seen} ||= {};
    $seen->{ $_->{id} } //= $today for @{ $scan->{events} || [] };
    my $forget = shift_date($today, -$SEEN_DAYS);
    delete @$seen{ grep { $seen->{$_} lt $forget } keys %$seen };
    $doc->{last_run} = $scan->{scanned_at} if ($scan->{scanned_at} // '') gt ($doc->{last_run} // '');
    my @lines = brief_lines([ grep { $_->{saved_on} eq $today } @{ $doc->{items} } ], $level);
    my $briefs = $doc->{briefs} ||= {};
    $briefs->{$today} = { made_at => iso_time($now), level => $level, lines => [ map { $_->{id} } @lines ],
                          quiet => @lines ? JSON::PP::false : JSON::PP::true };
    my $keep = shift_date($today, -$BRIEFS_DAYS);
    delete @$briefs{ grep { $_ le $keep } keys %$briefs };
    return { judged => scalar @fresh, candidates => scalar @{ $scan->{events} || [] }, level => $level,
             brief => [ map { { id => $_->{id}, line => $_->{line}, stake => $_->{stake}, currency => $_->{currency} } } @lines ] };
}

# A candidate with Ling's judgment, or undef when she judged it nothing. The
# holdings it touches: a company event always its own symbol; an economy
# event the ones Ling named, if the user holds them.
sub judged_item {
    my ($ev, $j, $positions, $home) = @_;
    my $materiality = lc($j->{materiality} // 'none');
    return undef unless $MATERIALITY{$materiality};
    my $line = $j->{line} // '';
    $line =~ s/\s+/ /g;
    $line =~ s/^\s+|\s+$//g;
    return undef unless length $line;
    my @named = grep { $positions->{$_} } symbols_of(ref $j->{holdings} eq 'ARRAY' ? @{ $j->{holdings} } : ());
    my @touched = $ev->{symbol} ? grep({ $positions->{$_} } $ev->{symbol}, @{ $ev->{also} || [] }) : @named;
    my %uniq;
    @touched = grep { !$uniq{$_}++ } @touched;
    return {
        %$ev,
        materiality => $materiality,
        line        => substr($line, 0, 300),
        holdings    => \@touched,
        %{ stake_of($ev, [ grep { ($positions->{$_}{shares} // 0) > 0 } @touched ], $positions, $home, $materiality) },
    };
}

# What the event puts at stake in the user's money, in the currency most of it
# is in: a move's real change; a currency day's real change on the holdings
# priced in the other currency; otherwise a share of the positions' value by
# materiality. `weight_pct` = the touched holdings' share of that currency's
# total (null when a holding there couldn't be priced), `stake_pct` = the
# stake's.
sub stake_of {
    my ($ev, $held, $positions, $home, $materiality) = @_;
    return { stake => 0, stake_pct => 0, weight_pct => 0, currency => undef, held => JSON::PP::false } unless @$held;
    my %by;
    for my $sym (@$held) {
        my $p = $positions->{$sym};
        next if $ev->{kind} eq 'fx' && ($p->{currency} // 'USD') eq $home;
        my $stake = $ev->{kind} eq 'move' && ($ev->{symbol} // '') eq $sym ? abs($ev->{position_change} // 0)
                  : $ev->{kind} eq 'fx' ? ($p->{value} // 0) * abs($ev->{change_pct} // 0) / 100
                  : ($p->{value} // 0) * ($STAKE_SHARE{$materiality} // 0);
        my $g = $by{ $p->{currency} // 'USD' } ||= { value => 0, stake => 0, weight_pct => 0 };
        $g->{value} += $p->{value} // 0;
        $g->{stake} += $stake;
        $g->{weight_pct} = defined $p->{weight_pct} && defined $g->{weight_pct} ? $g->{weight_pct} + $p->{weight_pct} : undef;
    }
    my ($currency) = sort { $by{$b}{value} <=> $by{$a}{value} || $a cmp $b } keys %by;
    return { stake => 0, stake_pct => 0, weight_pct => 0, currency => undef, held => JSON::PP::false } unless $currency;
    my $total = sum(0, map { $_->{value} // 0 } grep { ($_->{currency} // 'USD') eq $currency } values %$positions);
    return {
        held       => JSON::PP::true,
        currency   => $currency,
        stake      => round_to($by{$currency}{stake}, 0),
        stake_pct  => $total ? round_to($by{$currency}{stake} / $total * 100, 2) : 0,
        weight_pct => defined $by{$currency}{weight_pct} ? round_to($by{$currency}{weight_pct}, 1) : undef, # a holding unpriced: no weight bar
    };
}

# Whether an item earns a line at the user's level. Holdings: high on any,
# medium on one 10%+ of its currency, results today or tomorrow (quiet: high
# on a 10%+ holding, results today). Everything: any judged holding item.
sub speaks {
    my ($item, $level) = @_;
    return 0 unless $item->{held};
    my $rank = $MATERIALITY{ $item->{materiality} } // 0;
    my $big = ($item->{weight_pct} // 0) >= $BIG_WEIGHT_PCT;
    my $results = $item->{kind} eq 'earnings' || ($item->{kind} eq 'filing' && grep { $_ eq '2.02' } @{ $item->{items} || [] });
    return $rank >= 1 if $level eq 'everything';
    return ($rank >= 3 && $big) || ($item->{kind} eq 'earnings' && ($item->{when} // '') eq 'today') if $level eq 'quiet';
    return $rank >= 3 || ($rank >= 2 && $big) || $results;
}

# A watched-only ticker's own big event, for a slot the holdings left free.
sub watchlist_speaks {
    my ($item, $level) = @_;
    return 0 if $item->{held} || !$item->{symbol} || !$WATCHLIST_KINDS{ $item->{kind} } || $level eq 'quiet';
    return ($MATERIALITY{ $item->{materiality} } // 0) >= ($level eq 'everything' ? 2 : 3);
}

# The brief: up to three lines — holdings by the share of their money at
# stake, then watched tickers' big events in what's left.
sub brief_lines {
    my ($items, $level) = @_;
    my $order = sub { ($b->{stake_pct} // 0) <=> ($a->{stake_pct} // 0)
                      || ($MATERIALITY{ $b->{materiality} } // 0) <=> ($MATERIALITY{ $a->{materiality} } // 0)
                      || ($b->{at} // '') cmp ($a->{at} // '') };
    my @held = sort $order grep { speaks($_, $level) } @$items;
    my @watched = sort { ($MATERIALITY{ $b->{materiality} } // 0) <=> ($MATERIALITY{ $a->{materiality} } // 0)
                         || ($b->{at} // '') cmp ($a->{at} // '') } grep { watchlist_speaks($_, $level) } @$items;
    my @lines = (@held, @watched);
    splice @lines, $BRIEF_LINES if @lines > $BRIEF_LINES;
    return @lines;
}

# ── Watch alerts: what can't wait for the morning ──────────────────────────
#
# `watch-alerts` runs on every phone sync, zero LLM, at most every ten
# minutes. It keeps a calendar of the releases that move markets — FOMC
# decisions (the Fed's calendar page), CPI and the jobs report (the BLS
# release calendar), Bank of Canada rate announcements (its upcoming-events
# page) — and asks a source only once its release time has passed: the Fed's
# statement, the BLS numbers, the Bank's press release. While the market is
# open, a holding 5% or more up or down on the day. What it finds goes to
# watch.json `alerts` (7 days), beside `upcoming` — the releases in the next
# two weeks. The phone says both. Nothing runs while the Watch is off.

my $ALERT_EVERY = 10 * 60;
my $ALERT_BUDGET = 15;             # seconds; the phone's short wake has about thirty
my $CALENDAR_TTL = 20 * 3600;
my $UPCOMING_DAYS = 14;
my $ALERT_MOVE_PCT = 5;
my $ALERTS_DAYS = 7;
my $RETRY_AFTER = 20 * 60;         # the same release, asked again
# A release not out this long after its time is let go. The BLS answers 25
# questions a day, so its numbers are asked for a shorter while.
my %RESULT_WAIT = (fomc => 36 * 3600, boc => 36 * 3600, cpi => 6 * 3600, jobs => 6 * 3600);
my %BLS_RELEASES = ('Consumer Price Index' => 'cpi', 'Employment Situation' => 'jobs');
my @RESULT_FINDERS = ([ ['fomc'], \&fed_decision_alerts ], [ ['cpi', 'jobs'], \&bls_alerts ], [ ['boc'], \&boc_decision_alerts ]);

sub cmd_watch_alerts {
    my ($now_arg) = map { /^--now=(.+)$/ ? $1 : () } @_;
    my $force = grep { $_ eq '--force' } @_;
    my $now = defined $now_arg ? time_of($now_arg) : time;
    fail('--now: a time like 2026-09-16T18:30:00Z') unless defined $now;
    return say_json({ off => JSON::PP::true }) unless watch_on();
    my $watch = read_json(data_dir() . '/watch.json') || {};
    my $last = time_of($watch->{alerts_checked_at} // '');
    return say_json(alerts_view($watch, [], $now))
        if !$force && defined $last && $now >= $last && $now - $last < $ALERT_EVERY;
    my ($calendar, $found, $tried) = ([], [], []);
    eval {
        local $SIG{ALRM} = sub { die "budget\n" };
        alarm $ALERT_BUDGET;
        $calendar = watch_calendar($now);
        my $releases = release_alerts($calendar, $watch, $now);
        ($found, $tried) = ([ @{ $releases->{found} }, move_alerts($now) ], $releases->{tried});
        alarm 0;
        1;
    } or alarm 0;
    my $new = update_json('watch.json', sub { record_alerts($_[0], $found, $tried, $calendar, $now) });
    say_json(alerts_view(read_json(data_dir() . '/watch.json') || {}, $new, $now));
}

# The Watch's switch is the engine's: its mission's user state.
sub watch_on {
    my $state = read_json("$ENV{HOME}/.linggen/missions/cfo:watch/user.json") || {};
    return $state->{enabled} ? 1 : 0;
}

sub alerts_view {
    my ($doc, $new, $now) = @_;
    my $recent = iso_time($now - 2 * 86400);
    return {
        checked_at => $doc->{alerts_checked_at},
        new        => $new,
        alerts     => [ grep { ($_->{at} // '') gt $recent } @{ $doc->{alerts} || [] } ],
        upcoming   => $doc->{upcoming} || [],
    };
}

# Fold one check into watch.json: new alerts once each, the releases asked
# about and not out yet, and the next two weeks.
sub record_alerts {
    my ($doc, $found, $tried, $calendar, $now) = @_;
    my %have = map { $_->{id} => 1 } @{ $doc->{alerts} || [] };
    my @new = grep { !$have{ $_->{id} }++ } @$found;
    my $keep = iso_time($now - $ALERTS_DAYS * 86400);
    $doc->{alerts} = [ (grep { ($_->{at} // '') gt $keep } @{ $doc->{alerts} || [] }), @new ];
    my $tries = $doc->{alert_tries} ||= {};
    $tries->{$_} = iso_time($now) for @$tried;
    delete @$tries{ grep { $tries->{$_} lt $keep } keys %$tries };
    if (@$calendar) {
        $doc->{upcoming} = [ grep { my $at = time_of($_->{at}) // 0; $at > $now && $at - $now <= $UPCOMING_DAYS * 86400 } @$calendar ];
    }
    $doc->{alerts_checked_at} = iso_time($now);
    return \@new;
}

# The release calendar (data/watch-calendar.json), fetched again once a day.
# A source that doesn't answer keeps what it had — and when none does, it
# is asked again on the next check; a release that has passed
# stays three days, for its result to be found — the Bank's page drops it.
sub watch_calendar {
    my ($now) = @_;
    my $file = data_dir() . '/watch-calendar.json';
    my $cal = read_json($file) || {};
    my $fetched = time_of($cal->{fetched_at} // '');
    return $cal->{events} || [] if defined $fetched && $now >= $fetched && $now - $fetched < $CALENDAR_TTL;
    my $window = sub { my $at = time_of($_[0]{at}) // 0; $at > $now - 3 * 86400 && $at < $now + 60 * 86400 };
    my %by_id = map { $_->{id} => $_ } grep { $window->($_) } @{ $cal->{events} || [] };
    my $answered = 0;
    for my $read (\&fomc_calendar, \&bls_calendar, \&boc_calendar) {
        my $got = $read->() or next;
        $answered++;
        $by_id{ $_->{id} } = $_ for grep { $window->($_) } @$got;
    }
    my @events = sort { $a->{at} cmp $b->{at} } values %by_id;
    # No source answered (offline, a wake too short): keep the file unstamped
    # so the next check asks again, rather than an empty calendar for a day.
    return \@events unless $answered;
    write_json($file, { fetched_at => iso_time($now), events => \@events });
    return \@events;
}

sub fomc_calendar {
    my $html = fetch('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm') or return undef;
    return [ map {
        my ($y, $m, $d) = split /-/, $_->{on};
        { id => "cal:fomc:$_->{on}", kind => 'fomc', on => $_->{on}, label => 'FOMC rate decision',
          at => iso_time(eastern_epoch($y, $m, $d, 14, 0)), projections => $_->{projections} }
    } fomc_decisions($html) ];
}

sub bls_calendar {
    my $ics = fetch('https://www.bls.gov/schedule/news_release/bls.ics', $SEC_UA) or return undef;
    return bls_releases($ics);
}

# CPI and Employment Situation releases in the BLS calendar (iCalendar).
sub bls_releases {
    my ($ics) = @_;
    my @out;
    while ($ics =~ m{BEGIN:VEVENT(.*?)END:VEVENT}gs) {
        my $ev = $1;
        my ($summary) = $ev =~ m{^SUMMARY:([^\r\n]*)}m;
        my $kind = $BLS_RELEASES{ $summary // '' } or next;
        my ($y, $m, $d, $h, $mi) = $ev =~ m{^DTSTART;TZID=US-Eastern:(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)}m or next;
        my $on = "$y-$m-$d";
        push @out, { id => "cal:$kind:$on", kind => $kind, on => $on, label => $summary,
                     at => iso_time(eastern_epoch($y, $m, $d, $h, $mi)) };
    }
    return \@out;
}

sub boc_calendar {
    my $html = fetch('https://www.bankofcanada.ca/press/upcoming-events/', $SEC_UA) or return undef;
    return boc_announcements($html);
}

# Rate announcements on the Bank of Canada's upcoming-events page: a date,
# a title, and "09:45 (ET)".
sub boc_announcements {
    my ($html) = @_;
    my @out;
    for my $article (split /<article\b/, $html) {
        my ($date) = $article =~ m{media-date[^>]*>\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*<};
        my ($title) = $article =~ m{media-heading"[^>]*>\s*<a[^>]*>([^<]+)</a>};
        next unless $date && $title && $title =~ /^Interest Rate Announcement/;
        my ($month, $d, $y) = $date =~ /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/;
        my $m = month_number($month) or next;
        my ($h, $mi) = $article =~ m{(\d\d):(\d\d) \(ET\)};
        my $on = sprintf '%04d-%02d-%02d', $y, $m, $d;
        push @out, { id => "cal:boc:$on", kind => 'boc', on => $on, label => 'Bank of Canada rate decision',
                     at => iso_time(eastern_epoch($y, $m, $d, $h // 9, $mi // 45)) };
    }
    return \@out;
}

# New York time → epoch seconds.
sub eastern_epoch {
    my ($y, $m, $d, $h, $mi) = @_;
    return timegm(0, $mi, $h + (daylight_time($y, $m, $d) ? 4 : 5), $d, $m - 1, $y);
}

# Releases whose time has passed and whose result isn't known yet, asked of
# their source — each source once per check, a release at most every twenty
# minutes. {found: alerts, tried: calendar ids asked and not out yet}.
sub release_alerts {
    my ($calendar, $watch, $now) = @_;
    my %done = map { ($_->{release} // '') => 1 } @{ $watch->{alerts} || [] };
    my $tries = $watch->{alert_tries} || {};
    my @due = grep {
        my $at = time_of($_->{at});
        my $tried = time_of($tries->{ $_->{id} } // '');
        defined $at && $at <= $now && $now - $at < ($RESULT_WAIT{ $_->{kind} } // 0)
            && !$done{ $_->{id} } && !(defined $tried && $now - $tried < $RETRY_AFTER)
    } @$calendar;
    my @found;
    for my $finder (@RESULT_FINDERS) {
        my ($kinds, $find) = @$finder;
        my %mine = map { $_ => 1 } @$kinds;
        my @asked = grep { $mine{ $_->{kind} } } @due or next;
        push @found, $find->(\@asked);
    }
    my %out = map { $_->{release} => 1 } @found;
    return { found => \@found, tried => [ map { $_->{id} } grep { !$out{ $_->{id} } } @due ] };
}

sub alert_of {
    my ($cal, %fields) = @_;
    return { at => $cal->{at}, %fields, id => "alert:$cal->{id}", release => $cal->{id}, label => $cal->{label} };
}

# The FOMC statement issued at the decision, and what it decided.
sub fed_decision_alerts {
    my ($due) = @_;
    my $feed = fetch('https://www.federalreserve.gov/feeds/press_monetary.xml') or return;
    my @releases = grep { $_->{title} =~ /FOMC statement/i } fed_release_events(decode('UTF-8', $feed), 0);
    my @out;
    for my $cal (@$due) {
        my $from = (time_of($cal->{at}) // next) - 3600;
        my ($release) = grep { (time_of($_->{at}) // 0) >= $from } @releases or next;
        # A statement page that doesn't answer is no result yet: the release
        # is asked again on a later check, until its wait runs out.
        my $page = fetch($release->{url}) or next;
        push @out, alert_of($cal, kind => 'rate', bank => 'Fed', at => $release->{at}, url => $release->{url},
                            %{ fed_decision($page) || { decision => 'statement' } });
    }
    return @out;
}

# "decided to raise the target range for the federal funds rate by 1/4
# percentage point to 3-3/4 to 4 percent" → {decision, to, change_bp}.
sub fed_decision {
    my ($html) = @_;
    (my $text = $html) =~ s/<[^>]+>/ /g;
    $text =~ s/\s+/ /g;
    return undef unless $text =~ m{decided to (raise|lower|maintain) the target range for the federal funds rate(?: by ([\d/-]+) percentage points?)? (?:at|to) ([\d/-]+) to ([\d/-]+) percent};
    my ($verb, $by, $lo, $hi) = ($1, $2, $3, $4);
    my %sign = (raise => 1, lower => -1, maintain => 0);
    my %word = (raise => 'raised', lower => 'cut', maintain => 'held');
    return undef unless defined fraction($lo) && defined fraction($hi);
    return { decision => $word{$verb}, to => sprintf("%.2f\x{2013}%.2f%%", fraction($lo), fraction($hi)),
             change_bp => round_to($sign{$verb} * (fraction($by // '0') // 0) * 100, 0) };
}

# "3-3/4" → 3.75, "1/4" → 0.25, "4" → 4.
sub fraction {
    my ($s) = @_;
    return undef unless defined $s && $s =~ m{^(?:(\d+)(?:-|$))?(?:(\d+)/(\d+))?$} && length $s;
    return ($1 // 0) + ($3 ? $2 / $3 : 0);
}

# CPI or the jobs report: the month the numbers now cover, newer than what
# the Watch's scan knew before the release.
sub bls_alerts {
    my ($due) = @_;
    my $series = bls_series() or return;
    my $snaps = (read_json(data_dir() . '/watch-scan.json') || {})->{economy} || [];
    my %release = (cpi => 'CPI', jobs => 'jobs report');
    my @out;
    for my $cal (@$due) {
        my $at = time_of($cal->{at}) // next;
        my ($before) = sort { ($b->{at} // 0) <=> ($a->{at} // 0) } grep { ($_->{at} // 0) < $at } @$snaps;
        my ($ev) = grep { $_->{release} eq $release{ $cal->{kind} } } bls_events($series, $before) or next;
        my %fields = %$ev;
        delete @fields{qw(id at)};
        push @out, alert_of($cal, %fields);
    }
    return @out;
}

# The Bank of Canada's press release on the day of the decision.
sub boc_decision_alerts {
    my ($due) = @_;
    my $feed = fetch('https://www.bankofcanada.ca/content_type/press-releases/feed/', $SEC_UA) or return;
    my @items = boc_rate_releases(decode('UTF-8', $feed));
    my @out;
    for my $cal (@$due) {
        my ($item) = grep { $_->{on} eq $cal->{on} } @items or next;
        push @out, alert_of($cal, kind => 'rate', bank => 'Bank of Canada', url => $item->{url},
                            title => $item->{title}, %{ $item->{decision} || {} });
    }
    return @out;
}

# Rate releases in the Bank's press feed (RSS 1.0: `<item rdf:about="…">`):
# {on, title, url, decision}. The
# description says it plainly: "held its target for the overnight rate at
# 2.25%", "reduced its target … by 25 basis points to 2.50%".
sub boc_rate_releases {
    my ($xml) = @_;
    my %word = (held => 'held', maintained => 'held', reduced => 'cut', lowered => 'cut', raised => 'raised', increased => 'raised');
    my @out;
    while ($xml =~ m{<item\b[^>]*>(.*?)</item>}gs) {
        my $item = $1;
        my ($title) = map { decode_html_entities(strip_cdata($_)) } $item =~ m{<title>(.*?)</title>}s;
        my ($link) = map { strip_cdata($_) } $item =~ m{<link>(.*?)</link>}s;
        my ($desc) = map { decode_html_entities(strip_cdata($_)) } $item =~ m{<description>(.*?)</description>}s;
        my ($on) = $item =~ m{<dc:date>\s*(\d{4}-\d\d-\d\d)};
        next unless $title && $link && $on && "$title $desc" =~ /policy rate|overnight rate/i;
        my %decision;
        if (($desc // '') =~ m{(held|maintained|reduced|lowered|raised|increased) its target for the overnight rate(?: by (\d+) basis points?)? (?:at|to) ([\d.]+)%}) {
            my $sign = { held => 0, cut => -1, raised => 1 }->{ $word{$1} };
            %decision = (decision => $word{$1}, to => sprintf('%.2f%%', $3), change_bp => $sign * ($2 // 0));
        }
        push @out, { on => $on, title => $title, url => $link, (%decision ? (decision => \%decision) : ()) };
    }
    return @out;
}

# While the market is open: holdings 5% or more up or down on the day, once
# a day each. The day is the quote's own trading day, and only today's
# counts: on a holiday (Good Friday; a Canada-only one for .TO) the quote
# still carries the last session's move, which was said then.
sub move_alerts {
    my ($now) = @_;
    my $day = market_day($now) or return;
    my $cells = register_investments();
    my @held = grep { ($cells->{$_}{shares} // 0) > 0 } symbols_of(sort keys %$cells) or return;
    my $quotes = update_quotes(\@held, \&quote_of);
    my @out;
    for my $sym (@held) {
        my $q = $quotes->{$sym};
        next if $q->{error} || !defined $q->{change_pct} || abs($q->{change_pct}) < $ALERT_MOVE_PCT;
        next unless (quote_trading_day($q) // '') eq $day;
        my $shares = $cells->{$sym}{shares} + 0;
        push @out, { id => "alert:move:$sym:$day", kind => 'move', symbol => $sym, name => $q->{name},
                     at => iso_time($now), change_pct => round_to($q->{change_pct}, 1), price => $q->{price},
                     currency => $q->{currency} // ($sym =~ /\.TO$/ ? 'CAD' : 'USD'), shares => $shares,
                     stake => round_to($shares * ($q->{change} // 0), 0) };
    }
    return @out;
}

# The exchange's date on the source's price time ("Sep 23, 2026, 11:00 AM
# EDT" → "2026-09-23"), else undef.
sub quote_trading_day {
    my ($q) = @_;
    my ($date) = ($q->{price_time} // '') =~ /^([A-Z][a-z]{2} \d{1,2}, \d{4})/ or return undef;
    return iso_date($date);
}

# New York's date while its market is open (weekdays 9:30–16:00), else undef.
sub market_day {
    my ($now) = @_;
    my @utc = gmtime($now);
    my @ny = gmtime($now - (daylight_time($utc[5] + 1900, $utc[4] + 1, $utc[3]) ? 4 : 5) * 3600);
    return undef if $ny[6] == 0 || $ny[6] == 6;
    my $minute = $ny[2] * 60 + $ny[1];
    return undef if $minute < 9 * 60 + 30 || $minute > 16 * 60;
    return strftime('%Y-%m-%d', @ny);
}

# ── Dates ──────────────────────────────────────────────────────────────────

my %MONTH = (Jan => 1, Feb => 2, Mar => 3, Apr => 4, May => 5, Jun => 6,
             Jul => 7, Aug => 8, Sep => 9, Oct => 10, Nov => 11, Dec => 12);

# "September" / "Sep" → 9
sub month_number { my ($name) = @_; return defined $name ? $MONTH{ ucfirst lc substr($name, 0, 3) } : undef }

# "Oct 29, 2026" → "2026-10-29"
sub iso_date {
    my ($s) = @_;
    return undef unless defined $s && $s =~ /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/ && $MONTH{$1};
    return sprintf '%04d-%02d-%02d', $3, $MONTH{$1}, $2;
}

sub today { strftime('%Y-%m-%d', localtime) }

sub iso_time { strftime('%Y-%m-%dT%H:%M:%SZ', gmtime($_[0])) }

my %ZONE = (Z => 0, UTC => 0, GMT => 0, EDT => -4, EST => -5, CDT => -5, CST => -6, PDT => -7, PST => -8);

# "2026-09-16T12:46:38.000Z", "Sep 16, 2026, 8:40 AM EDT" or "Wed, 09 Sep
# 2026 11:05:00 -0400" → epoch seconds; anything else → undef.
sub time_of {
    my ($s) = @_;
    return undef unless defined $s;
    if ($s =~ /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?(Z|[+-]\d\d:?\d\d)$/) {
        return timegm($6 // 0, $5, $4, $3, $2 - 1, $1) - zone_seconds($7);
    }
    if ($s =~ /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}),? (\d{1,2}):(\d\d) ([AP]M) ([A-Z]{3})$/
        && $MONTH{$1} && defined zone_seconds($7)) {
        return timegm(0, $5, $4 % 12 + ($6 eq 'PM' ? 12 : 0), $2, $MONTH{$1} - 1, $3) - zone_seconds($7);
    }
    if ($s =~ /^(?:[A-Z][a-z]{2}, )?(\d{1,2}) ([A-Z][a-z]{2}) (\d{4}) (\d\d):(\d\d)(?::(\d\d))? ([+-]\d{4}|[A-Z]{3})$/
        && $MONTH{$2} && defined zone_seconds($7)) {
        return timegm($6 // 0, $5, $4, $1, $MONTH{$2} - 1, $3) - zone_seconds($7);
    }
    return undef;
}

# A zone name or offset → seconds east of UTC.
sub zone_seconds {
    my ($z) = @_;
    return $ZONE{$z} * 3600 if exists $ZONE{$z};
    return undef unless $z =~ /^([+-])(\d\d):?(\d\d)$/;
    return ($1 eq '-' ? -1 : 1) * ($2 * 3600 + $3 * 60);
}

sub epoch_of { my ($y, $m, $d) = split /-/, $_[0]; return timegm(0, 0, 12, $d, $m - 1, $y) }

sub shift_date { strftime('%Y-%m-%d', gmtime(epoch_of($_[0]) + $_[1] * 86400)) }

sub days_between { int((epoch_of($_[1]) - epoch_of($_[0])) / 86400) }

sub month_days {
    my ($y, $m) = @_;
    return (31, ($y % 4 == 0 && $y % 100 != 0) || $y % 400 == 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)[$m - 1];
}

# ── IO ─────────────────────────────────────────────────────────────────────

sub fetch {
    my ($url, $ua) = @_;
    open(my $fh, '-|', 'curl', '-s', '-f', '-L', '--compressed', '--max-time', '20', '-A', $ua // $UA, $url)
        or return undef;
    local $/;
    my $body = <$fh>;
    close $fh;
    return $? == 0 && defined $body && $body ne '' ? $body : undef;
}

sub fetch_json {
    my ($url, $ua) = @_;
    open(my $fh, '-|', 'curl', '-s', '--compressed', '--max-time', '12', '-A', $ua // $UA,
         '-H', 'Accept: application/json', $url) or return undef;
    local $/;
    my $body = <$fh>;
    close $fh;
    return undef if $? != 0 || !defined $body || $body eq '';
    my $doc = eval { JSON::PP->new->utf8->decode($body) };
    return ref $doc eq 'HASH' ? $doc : undef;
}

sub post_json {
    my ($url, $doc, $ua) = @_;
    my ($fh, $path) = tempfile(UNLINK => 1);
    print $fh JSON::PP->new->utf8->encode($doc);
    close $fh;
    open(my $out, '-|', 'curl', '-s', '--compressed', '--max-time', '20', '-A', $ua // $UA,
         '-H', 'Content-Type: application/json', '--data-binary', "\@$path", $url) or return undef;
    local $/;
    my $body = <$out>;
    close $out;
    return undef if $? != 0 || !defined $body || $body eq '';
    my $parsed = eval { JSON::PP->new->utf8->decode($body) };
    return ref $parsed eq 'HASH' ? $parsed : undef;
}

sub data_dir {
    my $skill = $ENV{SKILL_DIR} || dirname(dirname(__FILE__));
    my $dir = "$skill/data";
    mkdir $dir unless -d $dir;
    return $dir;
}

sub read_json {
    my ($file) = @_;
    open(my $in, '<', $file) or return undef;
    local $/;
    my $text = <$in>;
    my $doc = eval { JSON::PP->new->utf8->decode($text) };
    return ref $doc eq 'HASH' ? $doc : undef;
}

# Whole-file write: temp file + rename, so a reader sees the old file or the
# new one, never half of either.
sub write_json {
    my ($file, $doc) = @_;
    open(my $out, '>', "$file.tmp") or die "cannot write $file: $!";
    print $out $JSON->encode($doc);
    close $out;
    rename "$file.tmp", $file or die "cannot write $file: $!";
}

# Read-modify-write a data file under a lock, so the tab and an agent's call
# can't drop each other's changes.
sub update_json {
    my ($name, $change) = @_;
    my $file = data_dir() . "/$name";
    open(my $lock, '>', "$file.lock") or die "cannot lock $file: $!";
    flock($lock, LOCK_EX) or die "cannot lock $file: $!";
    my $doc = read_json($file) || {};
    my $result = $change->($doc);
    write_json($file, $doc);
    close $lock;
    return $result;
}

# Run `step` on each symbol's data/quotes.json entry; returns the entries,
# each with `error` when its step failed (never stored).
sub update_quotes {
    my ($symbols, $step) = @_;
    return update_json('quotes.json', sub {
        my ($doc) = @_;
        my $cache = $doc->{symbols} = ref $doc->{symbols} eq 'HASH' ? $doc->{symbols} : {};
        my %result;
        for my $sym (@$symbols) {
            my $entry = $cache->{$sym} //= base_entry($sym);
            delete $entry->{error};
            my $err = $step->($entry);
            $result{$sym} = $err ? { %$entry, error => $err } : $entry;
            # A ticker that never existed (a typo checked on Add) leaves nothing behind.
            delete $cache->{$sym} if $err && $err eq 'not found' && !defined $entry->{price};
        }
        return \%result;
    });
}

main(@ARGV) unless caller; # tests/run-market.pl loads the subs without running
1;
