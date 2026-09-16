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
#   perl market.pl portfolio             holdings, watchlist, numbers, reports
#                                        (holdings from the edit register)
#   perl market.pl reports-check [SYM…]  reports out since we started watching
#                                        and not summarized yet (default: all
#                                        held and watched symbols)
#   perl market.pl reports-latest SYM    the newest report, summarized or not
#   perl market.pl read URL              a report (filing, release page, PDF) as text
#   perl market.pl save-report symbol=… period=… form=… filed=… url=… summary=…
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

my $UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
       . '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
# SEC refuses browser-looking and anonymous agents; it asks for a named one.
my $SEC_UA = 'Linggen CFO https://linggen.dev';
my $BASE = 'https://stockanalysis.com';
my $STATS_TTL = 20 * 3600;
my $TICKERS_TTL = 7 * 86400;
my $READ_LIMIT = 60_000;   # characters of a filing handed to the agent
my $SAME_PERIOD_DAYS = 10; # a release and its 10-Q name slightly different days
my $JSON = JSON::PP->new->utf8->canonical->pretty;

sub main {
    my ($verb, @args) = @_;
    my %commands = (
        quotes           => sub { cmd_market(['quotes'], @_) },
        stats            => sub { cmd_market(['stats'], @_) },
        market           => sub { cmd_market(['quotes', 'stats'], @_) },
        portfolio        => \&cmd_portfolio,
        'reports-check'  => \&cmd_reports_check,
        'reports-latest' => \&cmd_reports_latest,
        read             => \&cmd_read,
        'save-report'    => \&cmd_save_report,
    );
    my $run = $commands{ $verb // '' }
        or usage();
    $run->(@args);
}

sub usage {
    print STDERR "usage: market.pl quotes|stats|market [--fresh] SYMBOL...\n"
               . "       market.pl portfolio | reports-check [SYMBOL...] | reports-latest SYMBOL\n"
               . "       market.pl read URL | save-report symbol=… period=… form=… filed=… url=… summary=…\n";
    exit 2;
}

sub fail {
    my ($msg) = @_;
    print STDERR "$msg\n";
    exit 1;
}

sub say_json { print $JSON->encode($_[0]) }

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

# symbol -> {watch, shares, avg_cost, account}: the live `inv:` cells of the
# edit register (data/edits.json) — what the Mac page and a paired phone both
# write, so a symbol added on the phone counts before the page is opened.
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

# Price and today's move. A US symbol is tried as a stock, then as an ETF (the
# stats page, not this, says which it is).
sub quote_of {
    my ($e) = @_;
    my $t = lc ticker($e);
    my @paths = $e->{exchange} eq 'TSX' ? ("a/tsx-$t")
              : $e->{kind} && $e->{kind} eq 'etf' ? ("e/$t")
              : ("s/$t", "e/$t");
    for my $path (@paths) {
        my $body = fetch_json("$BASE/api/quotes/$path") or return 'no answer from stockanalysis.com';
        my $q = $body->{data};
        next unless ($body->{status} // 0) == 200 && ref $q eq 'HASH' && defined $q->{p};
        $e->{price} = $q->{p};
        $e->{change} = $q->{c};
        $e->{change_pct} = $q->{cp};
        $e->{prev_close} = $q->{cl};
        $e->{high_52w} = $q->{h52};
        $e->{low_52w} = $q->{l52};
        $e->{market} = $q->{ms};
        $e->{price_time} = $q->{u};
        $e->{quote_at} = time;
        return undef;
    }
    return 'not found';
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
            next if $r->{filed} lt $since || saved_for($before, $sym, $r->{period});
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
    say_json({ %{ finish_report($latest) }, saved => saved_for($doc, $sym, $latest->{period}) });
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
# into the 10-Q/10-K of its period.
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
    for my $r (@releases) {
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
    my @names = map { $_->{name} } @{ $index->{directory}{item} || [] };
    my ($exhibit) = ((grep { /ex-?99[._-]?0?1(?!\d)/i && /\.html?$/i } @names), (grep { /ex-?99/i && /\.html?$/i } @names));
    $out{url} = "$folder/$exhibit" if $exhibit;
    return \%out;
}

sub saved_for {
    my ($doc, $sym, $period) = @_;
    my ($hit) = grep { same_period($_->{period}, $period) } @{ $doc->{symbols}{$sym}{reports} || [] };
    return $hit;
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

# ── Dates ──────────────────────────────────────────────────────────────────

my %MONTH = (Jan => 1, Feb => 2, Mar => 3, Apr => 4, May => 5, Jun => 6,
             Jul => 7, Aug => 8, Sep => 9, Oct => 10, Nov => 11, Dec => 12);

# "Oct 29, 2026" → "2026-10-29"
sub iso_date {
    my ($s) = @_;
    return undef unless defined $s && $s =~ /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/ && $MONTH{$1};
    return sprintf '%04d-%02d-%02d', $3, $MONTH{$1}, $2;
}

sub today { strftime('%Y-%m-%d', localtime) }

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
        }
        return \%result;
    });
}

main(@ARGV) unless caller; # tests/run-market.pl loads the subs without running
1;
