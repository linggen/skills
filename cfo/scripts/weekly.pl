#!/usr/bin/env perl
# weekly.pl — the weekly market + portfolio report (missions/weekly). Code
# finds the facts and checks every figure; Ling writes the words.
#
#   perl weekly.pl scan              the week's facts: each holding's weekly
#                                    move, totals per currency, holdings that
#                                    reported, next week's releases and
#                                    earnings, the report's language
#   perl weekly.pl save sections=JSON ties=JSON next_week=TEXT
#                                    Ling's report → data/weekly.json; every
#                                    bullet's figures checked against its quote
#                                    and its source page
#   perl weekly.pl last              the newest saved report
#
# The week is the last full Monday–Friday before today (a Sunday run reports
# the Friday just gone). Moves are at today's share count, from daily closes
# (market.pl history_of); US and Canadian dollars never add up. Perl core +
# curl, like market.pl, whose subs it borrows.
use strict;
use warnings;
use utf8;
use JSON::PP;
use Encode qw(decode encode);
use File::Basename qw(dirname);
use File::Spec;
use File::Temp qw(tempdir);
use POSIX qw(strftime);

require File::Spec->rel2abs(dirname(__FILE__) . '/market.pl');

my $WEEKS_KEPT = 8;
my @SECTION_IDS = qw(canada us rates stocks);
my %SECTION_ID = map { $_ => 1 } @SECTION_IDS;
my $BULLET_MAX = 280;              # characters: one fact
my $QUOTE_MAX = 600;
my $TIES_MAX = 8;
my $NEXT_MAX = 300;
my $PAGE_WAIT = 15;                # seconds for all source pages, fetched at once
my $WEB_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
my $SEC_AGENT = 'Linggen CFO https://linggen.dev';
my $JSON_OUT = JSON::PP->new->utf8->canonical->pretty;

sub weekly_main {
    my ($verb, @args) = @_;
    my %commands = (scan => \&cmd_scan, save => \&cmd_save, last => \&cmd_last);
    my $run = $commands{ $verb // '' }
        or do { print STDERR "usage: weekly.pl scan | save sections=JSON ties=JSON next_week=TEXT | last\n"; exit 2 };
    $run->(@args);
}

sub out_json { print $JSON_OUT->encode($_[0]) }

# ── The week ───────────────────────────────────────────────────────────────

# The last full trading week before `today`: Monday `from` to Friday `to`,
# the Friday before it (`prev_to`, last week's close) and the week after
# (`next_from`–`next_to`, what's coming). Id = the ISO week of its Friday.
sub week_of {
    my ($today) = @_;
    my $dow = (gmtime(epoch_of($today)))[6];          # 0 Sunday … 6 Saturday
    my $back = $dow == 6 ? 1 : $dow == 0 ? 2 : $dow + 2;
    my $to = shift_date($today, -$back);
    return {
        id        => strftime('%G-W%V', gmtime(epoch_of($to))),
        from      => shift_date($to, -4),
        to        => $to,
        prev_to   => shift_date($to, -7),
        next_from => shift_date($to, 3),
        next_to   => shift_date($to, 9),
    };
}

# The newest close on or before `day` from daily rows [{t, c}], any order.
sub close_on_or_before {
    my ($rows, $day) = @_;
    my ($row) = sort { $b->{t} cmp $a->{t} } grep { ($_->{t} // '') le $day && defined $_->{c} } @{ $rows || [] };
    return $row ? { on => $row->{t}, close => $row->{c} + 0 } : undef;
}

# The week's last close: the history's, unless the cached quote is a later
# session's close inside the week (the history can lag a day).
sub week_close {
    my ($rows, $quote, $sym, $day) = @_;
    my $close = close_on_or_before($rows, $day);
    my $qday = quote_trading_day($quote || {});
    return $close unless $qday && $qday le $day && (!$close || $qday gt $close->{on}) && defined $quote->{price};
    my $at = time_of($quote->{price_time});
    return $close unless defined $at && $at >= session_end($qday, $sym);
    return { on => $qday, close => $quote->{price} + 0 };
}

# One holding's week, at today's share count: per share and for the position.
sub weekly_change {
    my ($shares, $prev, $now) = @_;
    return undef unless $prev && $now && $prev->{close} > 0;
    my $per = $now->{close} - $prev->{close};
    return {
        prev_close   => $prev->{close}, prev_on => $prev->{on},
        close        => $now->{close},  close_on => $now->{on},
        change       => round_to($per, 4),
        change_pct   => round_to($per / $prev->{close} * 100, 2),
        value        => round_to($shares * $now->{close}, 2),
        value_change => round_to($shares * $per, 2),
    };
}

# Totals per currency — never across. A currency with a holding that has no
# week has no total (`missing` names it): a total that silently shrank would
# read as a real move.
sub totals_by_currency {
    my ($rows) = @_;
    my %by;
    for my $r (@$rows) {
        my $t = $by{ $r->{currency} } //= { currency => $r->{currency}, value => 0, value_change => 0, missing => [] };
        if (defined $r->{value_change}) {
            $t->{value} += $r->{value};
            $t->{value_change} += $r->{value_change};
        } else {
            push @{ $t->{missing} }, $r->{symbol};
        }
    }
    return [ map { total_of($by{$_}) } sort keys %by ];
}

sub total_of {
    my ($t) = @_;
    return { currency => $t->{currency}, value => undef, value_change => undef, change_pct => undef, missing => $t->{missing} }
        if @{ $t->{missing} };
    my $before = $t->{value} - $t->{value_change};
    return {
        currency     => $t->{currency},
        value        => round_to($t->{value}, 2),
        value_change => round_to($t->{value_change}, 2),
        change_pct   => $before > 0 ? round_to($t->{value_change} / $before * 100, 2) : undef,
        missing      => [],
    };
}

# Each held symbol's week. `history` fetches a symbol's daily rows (market.pl
# history_of in a run; a stub in tests).
sub portfolio_week {
    my ($cells, $quotes, $week, $history) = @_;
    my @rows;
    for my $sym (sort keys %$cells) {
        my $shares = $cells->{$sym}{shares} // 0;
        next unless $shares > 0;
        my $q = $quotes->{$sym} || {};
        my $rows = $history->({ %{ base_entry($sym) }, %$q, symbol => $sym });
        my $prev = close_on_or_before($rows, $week->{prev_to});
        my $now = week_close($rows, $q, $sym, $week->{to});
        my $move = weekly_change($shares, $prev, $now);
        push @rows, {
            symbol => $sym, name => $q->{name}, shares => $shares + 0,
            currency => $q->{currency} // base_entry($sym)->{currency},
            ($move ? %$move : (missing => 'no closes for the week')),
        };
    }
    @rows = sort { $a->{currency} cmp $b->{currency} || ($b->{value} // 0) <=> ($a->{value} // 0) } @rows;
    return { holdings => \@rows, totals => totals_by_currency(\@rows) };
}

# Held companies whose report was saved (by the Watch, or by hand) with a
# filing date inside the week — their summaries, not a second read.
sub reported_in {
    my ($reports, $held, $from, $to) = @_;
    my @out;
    for my $sym (sort keys %{ $reports->{symbols} || {} }) {
        next unless $held->{$sym};
        my $s = $reports->{symbols}{$sym};
        for my $r (@{ $s->{reports} || [] }) {
            my $filed = $r->{filed} // '';
            next unless $filed ge $from && $filed le $to && length($r->{summary} // '');
            push @out, { symbol => $sym, name => $s->{name}, map { $_ => $r->{$_} } qw(period form filed url summary) };
        }
    }
    return [ sort { $a->{filed} cmp $b->{filed} || $a->{symbol} cmp $b->{symbol} } @out ];
}

# What's coming: rate decisions, CPI and jobs (market.pl's release calendar)
# and the held companies' earnings dates, inside the week after.
sub next_week_events {
    my ($calendar, $quotes, $held, $from, $to) = @_;
    my $inside = sub { my $on = $_[0] // ''; $on ge $from && $on le $to };
    my @events = map { { on => $_->{on}, kind => $_->{kind}, label => $_->{label} } } grep { $inside->($_->{on}) } @$calendar;
    for my $sym (sort keys %$held) {
        my $on = ($quotes->{$sym} || {})->{earnings_on};
        push @events, { on => $on, kind => 'earnings', symbol => $sym, label => ($quotes->{$sym}{name} // $sym) } if $inside->($on);
    }
    return [ sort { $a->{on} cmp $b->{on} || ($a->{symbol} // '') cmp ($b->{symbol} // '') } @events ];
}

# The language the report is written in: CFO's config.json `language`, else
# the Mac's first preferred language, else English.
sub report_language {
    my ($cfg, $mac) = @_;
    for my $lang ($cfg->{language}, $mac) {
        return $lang if defined $lang && $lang =~ /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*$/;
    }
    return 'en';
}

sub mac_language {
    open(my $fh, '-|', 'defaults', 'read', '-g', 'AppleLanguages') or return undef;
    local $/;
    my $out = <$fh> // '';
    close $fh;
    return $out =~ /"?([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)"?/ ? $1 : undef;
}

# Today's quote and the daily stats (earnings dates) for the held symbols,
# merged into quotes.json like the tab's refresh. A source that doesn't
# answer leaves the cached numbers.
sub fresh_quotes {
    my ($symbols) = @_;
    return {} unless @$symbols;
    return eval { update_quotes($symbols, sub { quote_of($_[0]) // stats_of($_[0], 0) }) } || {};
}

sub cmd_scan {
    my $dir = data_dir();
    my $week = week_of(today());
    my $cells = register_investments();
    my %held = map { $_ => 1 } grep { ($cells->{$_}{shares} // 0) > 0 } keys %$cells;
    my $quotes = { %{ (read_json("$dir/quotes.json") || {})->{symbols} || {} }, %{ fresh_quotes([ sort keys %held ]) } };
    my $calendar = eval { watch_calendar(time) } || [];
    my $scan = {
        week      => $week->{id},
        from      => $week->{from},
        to        => $week->{to},
        scanned_at => iso_time(time),
        language  => report_language(read_json(dirname($dir) . '/config.json') || {}, mac_language()),
        portfolio => portfolio_week($cells, $quotes, $week, \&history_of),
        reported  => reported_in(read_json("$dir/reports.json") || {}, \%held, $week->{from}, shift_date($week->{to}, 2)),
        next_week => { from => $week->{next_from}, to => $week->{next_to},
                       events => next_week_events($calendar, $quotes, \%held, $week->{next_from}, $week->{next_to}) },
        sections  => \@SECTION_IDS,
    };
    write_json("$dir/weekly-candidates.json", $scan);
    out_json($scan);
}

# ── Checking Ling's report ─────────────────────────────────────────────────

# The figures in a piece of text, normalized ("150,000" → 150000, "4.20" →
# 4.2). With `dates`, a date's parts don't count — a month, a day, a year, a
# quarter: "9月", "29日", "2026", "Q3" are when, not what.
# An index's name is not a figure: S&P 500, Nasdaq 100, Russell 2000,
# S&P/TSX 60 — "纳斯达克100" in a tie names ZNQ's index, it says no number.
my $INDEX_NAME = qr/(?:S&P|标普)\s*500|(?:Nasdaq|纳斯达克|纳指)[\s-]*100|(?:Russell|罗素)\s*2000|TSX\s*60/i;

sub figures_in {
    my ($text, $dates) = @_;
    my @out;
    ($text = $text // '') =~ s/$INDEX_NAME/ /g if $dates;
    while (($text // '') =~ /(Q|第)?(?<![0-9.,])([0-9][0-9,]*(?:\.[0-9]+)?)(?![0-9])(\s*(?:月|日|年|号|季度))?/g) {
        my ($pre, $n, $unit) = ($1, $2, $3);
        $n =~ s/,//g;
        $n =~ s/\.$//;
        next if $dates && ($pre || $unit || ($n =~ /^(?:19|20)\d\d$/));
        push @out, figure_key($n);
    }
    return @out;
}

sub figure_key { my ($n) = @_; return sprintf('%.10g', $n + 0) }

# A rate's direction, by the words for it: a bullet that says hike must
# quote a source that says hike (Hanli's sample once said 加息 for a cut).
my %DIRECTION = (
    up   => qr/\b(?:hik(?:e|es|ed|ing)|rais(?:e|es|ed|ing)|tighten\w*)\b|加息|升息|上调|收紧/i,
    down => qr/\b(?:cut(?:s|ting)?|lower(?:s|ed|ing)?|reduc\w*|eas(?:e|es|ed|ing))\b|降息|减息|下调|宽松/i,
);

sub directions { my ($text) = @_; return grep { ($text // '') =~ $DIRECTION{$_} } sort keys %DIRECTION }

# Why a bullet can't stand on its quote, or undef when it can: every figure
# in the words is in the quote, and every rate direction too.
sub bullet_problem {
    my ($b) = @_;
    return 'text: one fact, in a sentence' unless length($b->{text} // '') && length($b->{text}) <= $BULLET_MAX;
    return 'source: the https page this run fetched' unless ($b->{source} // '') =~ m{^https://\S+$};
    return 'quote: the source\'s own words holding the figure' unless length($b->{quote} // '') && length($b->{quote}) <= $QUOTE_MAX;
    my %quoted = map { $_ => 1 } figures_in($b->{quote});
    my @unquoted = grep { !$quoted{$_} } figures_in($b->{text}, 1);
    return "figures not in the quote: @unquoted — use the source's own figures" if @unquoted;
    my %said = map { $_ => 1 } directions($b->{quote});
    my @against = grep { !$said{$_} } directions($b->{text});
    return "rate direction '$against[0]' is not what the quote says" if @against;
    return undef;
}

# A tie's figures must be ones a bullet quoted: a tie says what a point
# means for a holding, it brings no new numbers.
sub tie_problem {
    my ($t, $held, $quoted) = @_;
    return 'text: one line' unless length($t->{text} // '') && length($t->{text}) <= $BULLET_MAX;
    my @syms = symbols_of(ref $t->{holdings} eq 'ARRAY' ? @{ $t->{holdings} } : ());
    my @not = grep { !$held->{$_} } @syms;
    return 'holdings: the held symbols it touches' if !@syms || @not;
    my @new = grep { !$quoted->{$_} } figures_in($t->{text}, 1);
    return "figures no bullet quoted: @new" if @new;
    return undef;
}

# Each source page, fetched once and all at once: its raw text (scripts
# kept — a page's numbers often live in its data; a PDF as its text), or
# undef when it didn't answer. sec.gov answers only a named agent.
# `fetch_pages` is swapped out in tests.
sub fetch_pages {
    my (@urls) = @_;
    return {} unless @urls;
    my $tmp = tempdir(CLEANUP => 1);
    my %file = map { $urls[$_] => "$tmp/$_" } 0 .. $#urls;
    my @sec = grep { m{^https://www\.sec\.gov/} } @urls;
    my @web = grep { !m{^https://www\.sec\.gov/} } @urls;
    fetch_all($SEC_AGENT, map { ($_, $file{$_}) } @sec) if @sec;
    fetch_all($WEB_AGENT, map { ($_, $file{$_}) } @web) if @web;
    my %pages;
    for my $url (@urls) {
        my $text = page_text($file{$url});
        $pages{$url} = $text if defined $text && length $text;
    }
    return \%pages;
}

sub fetch_all {
    my ($agent, %to) = @_;
    my @args = ('curl', '-s', '-L', '-f', '--compressed', '-Z', '--max-time', $PAGE_WAIT, '-A', $agent);
    push @args, '-o', $to{$_}, $_ for sort keys %to;
    system(@args);
}

sub page_text {
    my ($file) = @_;
    open(my $in, '<:raw', $file) or return undef;
    local $/;
    my $body = <$in>;
    return undef unless defined $body && length $body;
    return pdf_text($body) if substr($body, 0, 5) eq '%PDF-';
    return eval { decode('UTF-8', $body, Encode::FB_CROAK) } // decode('cp1252', $body);
}

# A quote whose figures are on its page: 1. Not on it: 0. Page out of
# reach (blocked, a PDF): undef — the quote stands on its own.
sub on_page {
    my ($quote, $page) = @_;
    return undef unless defined $page;
    my %there = map { $_ => 1 } figures_in($page);
    return (grep { !$there{$_} } figures_in($quote)) ? 0 : 1;
}

# Ling's report checked into what is stored. Bullets and ties that don't
# stand are dropped and named, so the run can mend them and save again.
sub checked_report {
    my ($input, $scan, $pages) = @_;
    my (@sections, @dropped, %quoted);
    for my $s (@{ $input->{sections} }) {
        my $id = ref $s eq 'HASH' ? $s->{id} // '' : '';
        if (!$SECTION_ID{$id} || grep { $_->{id} eq $id } @sections) {
            push @dropped, { section => $id, why => "section id: one of @SECTION_IDS, once each" };
            next;
        }
        my @bullets;
        my $i = 0;
        for my $b (ref $s->{bullets} eq 'ARRAY' ? @{ $s->{bullets} } : ()) {
            $i++;
            my $why = ref $b eq 'HASH' ? bullet_problem($b) : 'a bullet is {text, source, quote}';
            my $seen = $why ? undef : on_page($b->{quote}, $pages->{ $b->{source} });
            $why //= 'the quote\'s figures are not on its source page — quote the page as fetched' if defined $seen && !$seen;
            if ($why) { push @dropped, { section => $id, bullet => $i, why => $why }; next }
            $quoted{$_} = 1 for figures_in($b->{quote});
            push @bullets, { text => clean($b->{text}), source => $b->{source}, quote => clean($b->{quote}),
                             checked => defined $seen ? JSON::PP::true : JSON::PP::false };
        }
        push @sections, { id => $id, title => clean($s->{title} // $id), bullets => \@bullets } if @bullets;
    }
    my %held = map { $_->{symbol} => 1 } @{ $scan->{portfolio}{holdings} || [] };
    my (@ties, $n);
    for my $t (@{ $input->{ties} || [] }) {
        $n++;
        my $why = ref $t eq 'HASH' ? tie_problem($t, \%held, \%quoted) : 'a tie is {text, holdings}';
        $why = "at most $TIES_MAX ties" if !$why && @ties >= $TIES_MAX;
        if ($why) { push @dropped, { tie => $n, why => $why }; next }
        push @ties, { text => clean($t->{text}), holdings => [ symbols_of(@{ $t->{holdings} }) ] };
    }
    my $order = do { my $k = 0; +{ map { $_ => $k++ } @SECTION_IDS } };
    return {
        sections => [ sort { $order->{ $a->{id} } <=> $order->{ $b->{id} } } @sections ],
        ties     => \@ties,
        dropped  => \@dropped,
    };
}

sub clean { my ($s) = @_; $s =~ s/\s+/ /g; $s =~ s/^\s+|\s+$//g; return $s }

# The args as Ling sent them: JSON arrays, the next-week line as text. An
# omitted arg arrives as its own placeholder.
sub save_input {
    my %a = map { /^(\w+)=(.*)$/s ? ($1 => $2) : () } @_;
    for (values %a) { $_ = '' if /^\s*\{\{\w+\}\}\s*$/ }
    my $sections = eval { JSON::PP->new->utf8->decode($a{sections} // '') };
    $sections = $sections->{sections} if ref $sections eq 'HASH';
    fail('sections: a JSON array of {id, title, bullets: [{text, source, quote}]}') unless ref $sections eq 'ARRAY';
    my $ties = length($a{ties} // '') ? eval { JSON::PP->new->utf8->decode($a{ties}) } : [];
    fail('ties: a JSON array of {text, holdings}, or leave it out') unless ref $ties eq 'ARRAY';
    my $next = decode('UTF-8', $a{next_week} // '');
    fail("next_week: one line, at most $NEXT_MAX characters") if length($next) > $NEXT_MAX;
    return { sections => $sections, ties => $ties, next_week => clean($next) };
}

# The week as stored: code's figures (portfolio, reported, next week's
# events) beside Ling's checked words.
sub week_report {
    my ($scan, $checked, $next_line, $now) = @_;
    return {
        week      => $scan->{week},
        from      => $scan->{from},
        to        => $scan->{to},
        made_at   => iso_time($now),
        language  => $scan->{language},
        portfolio => $scan->{portfolio},
        reported  => $scan->{reported},
        sections  => $checked->{sections},
        ties      => $checked->{ties},
        next_week => { %{ $scan->{next_week} }, line => $next_line },
    };
}

# The facts Yinyue words her one line from — figures only, no sentences.
sub notice_of {
    my ($report) = @_;
    my @moved = sort { abs($b->{change_pct}) <=> abs($a->{change_pct}) } grep { defined $_->{change_pct} } @{ $report->{portfolio}{holdings} };
    return {
        what      => 'CFO weekly report saved',
        week      => "$report->{from}..$report->{to}",
        totals    => [ map { { currency => $_->{currency}, value_change => $_->{value_change}, change_pct => $_->{change_pct} } } @{ $report->{portfolio}{totals} } ],
        biggest_move => @moved ? { symbol => $moved[0]{symbol}, change_pct => $moved[0]{change_pct} } : undef,
        reported  => [ map { $_->{symbol} } @{ $report->{reported} } ],
        market_points => scalar(map { @{ $_->{bullets} } } @{ $report->{sections} }),
        next_week => [ @{ $report->{next_week}{events} }[0 .. min(2, $#{ $report->{next_week}{events} })] ],
        language  => $report->{language},
        where     => 'CFO › Investments › Weekly',
    };
}

sub record_week {
    my ($doc, $report) = @_;
    my $weeks = $doc->{weeks} = ref $doc->{weeks} eq 'HASH' ? $doc->{weeks} : {};
    $weeks->{ $report->{week} } = $report;
    my @ids = sort { $b cmp $a } keys %$weeks;
    delete @$weeks{ @ids[$WEEKS_KEPT .. $#ids] } if @ids > $WEEKS_KEPT;
    $doc->{latest} = $ids[0];
    return $report;
}

sub cmd_save {
    my $input = save_input(@_);
    my $scan = read_json(data_dir() . '/weekly-candidates.json') or fail('no scan — call WeeklyScan first');
    my %urls = map { ref $_ eq 'HASH' && ($_->{source} // '') =~ m{^https://\S+$} ? ($_->{source} => 1) : () }
               map { ref $_ eq 'HASH' && ref $_->{bullets} eq 'ARRAY' ? @{ $_->{bullets} } : () } @{ $input->{sections} };
    my $checked = checked_report($input, $scan, fetch_pages(sort keys %urls));
    my $report = week_report($scan, $checked, $input->{next_week}, time);
    update_json('weekly.json', sub { record_week($_[0], $report) });
    out_json({
        saved   => $report->{week},
        points  => scalar(map { @{ $_->{bullets} } } @{ $report->{sections} }),
        ties    => scalar @{ $report->{ties} },
        dropped => $checked->{dropped},
        notice  => notice_of($report),
    });
}

sub cmd_last {
    my $doc = read_json(data_dir() . '/weekly.json') || {};
    out_json($doc->{latest} ? $doc->{weeks}{ $doc->{latest} } : {});
}

weekly_main(@ARGV) unless caller;
1;
