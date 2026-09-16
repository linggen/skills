#!/usr/bin/env perl
# run-market.pl — market.pl's report logic: which quarter a release reports
# on, EDGAR filings folded into reports, filing HTML as text, and save-report.
#
#   perl tests/run-market.pl
#
# No network: EDGAR's columns are written out below, and save-report runs
# against a temporary data dir.
use strict;
use warnings;
use File::Basename qw(dirname);
use File::Spec;
use File::Temp qw(tempdir);
use JSON::PP;
use Time::Local qw(timegm);

sub timegm_of { my ($y, $mo, $d, $h, $mi, $se) = @_; return timegm($se, $mi, $h, $d, $mo - 1, $y) }

my $SCRIPT = File::Spec->rel2abs(dirname(__FILE__) . '/../scripts/market.pl');
require $SCRIPT;

my ($pass, $fail) = (0, 0);
sub t {
    my ($name, $ok, $detail) = @_;
    $ok ? $pass++ : $fail++;
    print(($ok ? '✅' : '❌') . " $name" . (!$ok && defined $detail ? " — $detail" : '') . "\n");
}

# ── Symbols ────────────────────────────────────────────────────────────────
t('one arg can carry several symbols', join(',', symbols_of('aapl, TSX:RY', 'AAPL', '{{symbols}}')) eq 'AAPL,RY.TO');

# ── Quarters ───────────────────────────────────────────────────────────────
t('calendar quarter steps to the month end', next_quarter_end('2026-06-30') eq '2026-09-30');
t('calendar quarter crosses the year', next_quarter_end('2026-12-31') eq '2027-03-31');
t('13-week quarter steps 91 days', next_quarter_end('2026-03-28') eq '2026-06-27');
t('a release and its 10-Q days apart are one period', same_period('2026-06-27', '2026-06-30'));
t('consecutive quarters are not', !same_period('2026-03-28', '2026-06-27'));
t('a missing period matches nothing', !same_period(undef, '2026-06-27') && !same_period('', ''));

my @periodic = (
    { form => '10-Q', period => '2026-03-28', filed => '2026-05-01' },
    { form => '10-Q', period => '2026-06-27', filed => '2026-07-31' },
);
t('the 10-Q filed after a release names its quarter', release_period('2026-07-30', \@periodic) eq '2026-06-27');
t('before its 10-Q lands, the quarter is stepped from the last one',
  release_period('2026-07-30', [$periodic[0]]) eq '2026-06-27');
t('a release with no earlier report has no period', !defined release_period('2026-07-30', []));

# ── EDGAR filings → reports ────────────────────────────────────────────────
my $recent = {
    form            => ['8-K', '10-Q', '8-K', '4', '8-K', '10-Q', '10-K/A'],
    filingDate      => ['2026-10-30', '2026-07-31', '2026-07-30', '2026-07-15', '2026-06-01', '2026-05-01', '2026-02-01'],
    reportDate      => ['2026-10-30', '2026-06-27', '2026-07-30', '', '2026-06-01', '2026-03-28', '2025-09-27'],
    items           => ['2.02,9.01', '', '2.02,9.01', '', '5.07', '', ''],
    accessionNumber => ['0000320193-26-000030', '0000320193-26-000020', '0000320193-26-000018', 'x', 'y', '0000320193-26-000013', 'z'],
    primaryDocument => ['r3.htm', 'q2.htm', 'r2.htm', 'f4.xml', 'v.htm', 'q1.htm', 'k.htm'],
};
my $reports = sec_filings('AAPL', 'Apple Inc.', 320193, $recent, '2025-09-01');
my @keys = map { "$_->{form} $_->{period} $_->{filed}" } @$reports;
t('releases, 10-Qs and nothing else, newest first',
  join('; ', @keys) eq '8-K 2026-09-26 2026-10-30; 8-K 2026-06-27 2026-07-30; 10-Q 2026-03-28 2026-05-01',
  join('; ', @keys));
t('a release folds into its 10-Q and keeps the earlier filing date',
  $reports->[1]{acc} eq '0000320193-26-000018' && $reports->[1]{doc} eq 'r2.htm');
t('filings older than the window are skipped',
  @{ sec_filings('AAPL', 'Apple Inc.', 320193, $recent, '2026-07-01') } == 2);

# Tesla: a deliveries update and the results, both 8-K item 2.02, one quarter.
my $tsla = {
    form            => ['10-Q', '8-K', '8-K', '10-Q'],
    filingDate      => ['2026-07-23', '2026-07-22', '2026-07-02', '2026-04-23'],
    reportDate      => ['2026-06-30', '2026-07-22', '2026-07-02', '2026-03-31'],
    items           => ['', '2.02,9.01', '2.02,9.01', ''],
    accessionNumber => ['q2', 'results', 'deliveries', 'q1'],
    primaryDocument => ['q2.htm', 'r.htm', 'd.htm', 'q1.htm'],
};
my $tr = sec_filings('TSLA', 'Tesla, Inc.', 1318605, $tsla, '2026-01-01');
t('two releases in one quarter: the results, not the deliveries update',
  @$tr == 2 && $tr->[0]{acc} eq 'results' && $tr->[0]{filed} eq '2026-07-22' && $tr->[0]{period} eq '2026-06-30',
  join('; ', map { "$_->{acc} $_->{period} $_->{filed}" } @$tr));
my $before = sec_filings('TSLA', 'Tesla, Inc.', 1318605, {
    map { my $k = $_; ($k => [ @{ $tsla->{$k} }[1 .. 3] ]) } keys %$tsla
}, '2026-01-01');
t('before the 10-Q, the two releases are still one report',
  (grep { $_->{period} eq '2026-06-30' } @$before) == 1 && $before->[0]{acc} eq 'results',
  join('; ', map { "$_->{acc} $_->{period}" } @$before));

my $saved = { symbols => { TSLA => { reports => [{ period => '2026-06-30', filed => '2026-07-02' }] } } };
t('a summary of the deliveries update leaves the results to read',
  !saved_for($saved, 'TSLA', { form => '8-K', period => '2026-06-30', filed => '2026-07-22' }));
t('a summary covers the filing it was read from',
  saved_for($saved, 'TSLA', { form => '8-K', period => '2026-06-30', filed => '2026-07-02' }));
t('a TSX report is covered by its quarter alone',
  saved_for({ symbols => { 'RY.TO' => { reports => [{ period => '2026-08-27', filed => '2026-08-26' }] } } },
            'RY.TO', { form => 'earnings', period => '2026-08-27', filed => '2026-08-27' }));

t('the press release is found under each exhibit naming',
  (release_exhibit('tsla-20260722.htm', 'exhibit991.htm', 'exhibit991001.jpg') // '') eq 'exhibit991.htm'
  && (release_exhibit('a10-q.htm', 'aapl-ex991.htm') // '') eq 'aapl-ex991.htm'
  && (release_exhibit('x.htm', 'ex99-2.htm', 'ex99-1.htm') // '') eq 'ex99-1.htm'
  && !defined release_exhibit('tsla-20260722.htm', 'R1.htm'));

# ── Filing HTML → text ─────────────────────────────────────────────────────
my $html = qq{<DOCUMENT>\n<TYPE>EX-99.1\n<html><head><title>x</title><style>p{}</style></head><body>}
         . qq{<p>Apple&#8217;s revenue&nbsp;rose</p><table><tr><td>Net sales</td><td>\$</td><td>109,417</td><td></td><td>(1,234</td><td>)</td></tr></table>}
         . qq{<div style="display:none"><ix:header>hidden facts</ix:header></div></body></html>};
my $text = html_text($html);
t('wrapper, head and XBRL header are dropped', $text !~ /DOCUMENT|EX-99|hidden facts|p\{\}/, $text);
t('entities decode', $text =~ /Apple\x{2019}s revenue rose/, $text);
t('table rows keep their cells', $text =~ /^Net sales \| \$109,417 \| \(1,234\)$/m, $text);

# ── save-report ────────────────────────────────────────────────────────────
{
    local $ENV{SKILL_DIR} = tempdir(CLEANUP => 1);
    mkdir "$ENV{SKILL_DIR}/data";
    open(my $q, '>', "$ENV{SKILL_DIR}/data/quotes.json") or die;
    print $q '{"symbols":{"AAPL":{"symbol":"AAPL","name":"Apple Inc."}}}';
    close $q;
    my $save = sub {
        my @args = map { my $a = $_; $a =~ s/'/'\\''/g; "'$a'" } @_;
        my $out = `perl $SCRIPT save-report @args 2>&1`;
        return ($? >> 8, $out);
    };
    my ($code) = $save->('symbol=aapl', 'period=2026-06-27', 'form=8-K', 'filed=2026-07-30',
                         'url={{url}}', 'summary=Revenue $109.4B, up 16%; EPS $2.02, up 29% — a record June quarter.');
    t('a report saves with an omitted arg left as its placeholder', $code == 0);
    $save->('symbol=AAPL', 'period=2026-03-28', 'filed=2026-04-30', 'summary=Revenue $95.4B — up 8%; the March quarter.');
    $save->('symbol=AAPL', 'period=2026-06-30', 'form=10-Q', 'filed=2026-07-31', 'summary=The 10-Q for the same June quarter, read again.');
    my $doc = JSON::PP->new->utf8->decode(do { local (@ARGV, $/) = "$ENV{SKILL_DIR}/data/reports.json"; <> });
    my $list = $doc->{symbols}{AAPL}{reports};
    t('the same period replaces, newest first',
      @$list == 2 && $list->[0]{form} eq '10-Q' && $list->[1]{period} eq '2026-03-28',
      JSON::PP->new->canonical->encode($list));
    t('an omitted url is null, not the placeholder', !defined $list->[1]{url});
    t('the company name comes along from the quotes cache', ($doc->{symbols}{AAPL}{name} // '') eq 'Apple Inc.');
    t('non-ASCII in a summary survives', $list->[1]{summary} =~ /\x{2014} up 8%/, $list->[1]{summary});
    $save->('symbol=AAPL', 'period=2026-09-26', 'form=8-K', 'filed=2026-10-30',
            "summary=**Q4 FY26** \x{b7} revenue \$102.5B (+8%)\n- **iPhone** \$49.0B (+6%)\n**Take:** steady.\n");
    my $md = JSON::PP->new->utf8->decode(do { local (@ARGV, $/) = "$ENV{SKILL_DIR}/data/reports.json"; <> })->{symbols}{AAPL}{reports}[0]{summary};
    t('a markdown summary keeps its lines', ($md // '') =~ /^\*\*Q4 FY26\*\* .+\n- \*\*iPhone\*\* .+\n\*\*Take:\*\* steady\.$/, $md);
    my ($bad, $msg) = $save->('symbol=AAPL', 'period={{period}}', 'summary=Something long enough to pass.');
    t('a missing period is refused with the reason', $bad == 1 && $msg =~ /^period:/, $msg);
    ($bad, $msg) = $save->('symbol=AAPL', 'period=2026-06-27', 'summary=ok');
    t('an empty summary is refused', $bad == 1 && $msg =~ /^summary:/, $msg);
}

# ── Watch: finders ─────────────────────────────────────────────────────────
t('an ISO time parses', time_of('2026-09-16T12:46:38.000Z') == timegm_of(2026, 9, 16, 12, 46, 38));
t('a New York time parses', time_of('Sep 16, 2026, 8:40 AM EDT') == timegm_of(2026, 9, 16, 12, 40, 0)
  && time_of('Sep 15, 2026, 2:24 PM EDT') == timegm_of(2026, 9, 15, 18, 24, 0)
  && time_of('Jan 5, 2026, 12:05 AM EST') == timegm_of(2026, 1, 5, 5, 5, 0));
t('a mail-style time parses', time_of('Wed, 09 Sep 2026 11:05:00 -0400') == timegm_of(2026, 9, 9, 15, 5, 0));
t('anything else is no time', !defined time_of('51 minutes ago') && !defined time_of('') && !defined time_of(undef));

# A year of sessions, newest first: a day's move alternates ±1%, price 100.
sub sessions {
    my ($n, %at) = @_;
    my @rows;
    for my $i (0 .. $n - 1) {
        my $day = shift_date('2026-09-15', -$i);
        push @rows, { t => $day, c => 100, ch => $i % 2 ? 1 : -1, %{ $at{$i} || {} } };
    }
    return \@rows;
}
my $since = session_end('2026-09-14') - 3600;  # the window holds the last two sessions
my @moves = move_events('NVDA', sessions(260, 0 => { ch => -3.4, c => 96.6 }, 1 => { ch => 2.2 }), $since, 20);
t('a move past 2.5 usual days is an event; a smaller one is not',
  @moves == 1 && $moves[0]{id} eq 'move:NVDA:2026-09-15' && $moves[0]{usual_pct} > 1 && $moves[0]{usual_pct} < 1.1,
  JSON::PP->new->canonical->encode(\@moves));
t('the position\'s real dollar change rides along', $moves[0]{position_change} == -68);
t('a move before the window is not looked at',
  !move_events('NVDA', sessions(260, 5 => { ch => -9 }), $since, 20));
t('a watched stock\'s move has no position change',
  !defined((move_events('NVDA', sessions(260, 0 => { ch => -5, c => 95 }), $since, 0))[0]{position_change}));
t('a quiet ETF\'s move still needs 2%', !move_events('VOO', sessions(260, 0 => { ch => -1.9 }), $since, 0));

my @high = break_events('NVDA', sessions(260, 0 => { c => 120 }), $since);
t('a close past the year\'s range is a fresh 52-week high',
  @high == 1 && $high[0]{kind} eq 'high_52w' && $high[0]{session} eq '2026-09-15');
t('a break days after the last one is not fresh',
  !break_events('NVDA', sessions(260, 0 => { c => 121 }, 6 => { c => 120 }), $since));
t('a low counts too', (break_events('NVDA', sessions(260, 1 => { c => 80 }), $since))[0]{kind} eq 'low_52w');

t('results today or tomorrow are events, later ones not',
  (earnings_events('TSLA', '2026-10-21', '2026-10-21'))[0]{when} eq 'today'
  && (earnings_events('TSLA', '2026-10-21', '2026-10-20'))[0]{when} eq 'tomorrow'
  && !earnings_events('TSLA', '2026-10-21', '2026-10-19') && !earnings_events('TSLA', undef, '2026-10-19'));

my $snaps = [{ at => 100, analysts => 'Buy', target => '396.94 (+9.72%)' }, { at => 900, analysts => 'Hold', target => '1.00' }];
t('a rating change against the snapshot before the window is an event',
  (analyst_events('TSLA', { analysts => 'Strong Buy', target => '400.00 (+10%)' }, $snaps, 500, '2026-09-16'))[0]{rating_was} eq 'Buy');
t('a target moved 5%+ is an event; 3% is not',
  (analyst_events('TSLA', { analysts => 'Buy', target => '420.00' }, $snaps, 500, '2026-09-16'))[0]{target} == 420
  && !analyst_events('TSLA', { analysts => 'Buy', target => '408.00' }, $snaps, 500, '2026-09-16'));
t('no snapshot before the window: nothing to compare',
  !analyst_events('TSLA', { analysts => 'Sell', target => '1' }, $snaps, 50, '2026-09-16'));

my $news = { data => [
    { type => 'Article', title => 'Fresh', url => 'https://x.com/a', time => '2026-09-16T12:46:38.000Z', source => 'X' },
    { type => 'Video', title => 'Clip', url => 'https://x.com/v', time => '2026-09-16T12:00:00.000Z' },
    { type => 'Article', title => 'Old', url => 'https://x.com/o', time => 'Sep 1, 2026, 8:40 AM EDT' },
    { type => 'Article', title => 'Undated', url => 'https://x.com/u', time => '3 hours ago' },
] };
my @heads = news_events('NVDA', $news, $since);
t('headlines since the window, articles only, with a stable id',
  @heads == 1 && $heads[0]{title} eq 'Fresh' && $heads[0]{id} =~ /^news:[0-9a-f]{16}$/,
  JSON::PP->new->canonical->encode(\@heads));

my $nvda_filings = {
    form               => ['4', '8-K', '8-K', 'SCHEDULE 13D', '8-K', '4'],
    acceptanceDateTime => ['2026-09-15T21:04:47.000Z', '2026-09-15T12:03:56.000Z', '2026-09-15T11:00:00.000Z',
                           '2026-09-15T10:00:00.000Z', '2026-09-01T20:21:19.000Z', '2026-08-24T21:32:04.000Z'],
    filingDate         => ['2026-09-15', '2026-09-15', '2026-09-15', '2026-09-15', '2026-09-01', '2026-08-24'],
    items              => ['', '5.02,9.01', '9.01', '', '2.02,9.01', ''],
    accessionNumber    => ['0002152188-26-000005', '0001045810-26-000078', '0001045810-26-000079',
                           '0000000000-26-000001', '0001045810-26-000073', '0001347842-26-000015'],
    primaryDocument    => ['xslF345X06/wk-form4_1.xml', 'nvda-8k.htm', 'nvda-ex.htm', 'sc13d.htm', 'nvda-r.htm', 'xslF345X06/wk-form4_2.xml'],
};
my ($filed, $form4s) = filing_events('NVDA', 1045810, $nvda_filings, $since);
t('8-Ks by item and 13Ds since the window; exhibit-only 8-Ks skipped',
  join('; ', map { "$_->{id} $_->{what}" } @$filed) eq 'filing:0001045810-26-000078 officer or director change; filing:0000000000-26-000001 an investor holds 5%+ and may act on it',
  join('; ', map { "$_->{id} $_->{what}" } @$filed));
t('a Form 4 since the window is read from its raw XML',
  @$form4s == 1 && $form4s->[0]{xml} eq 'https://www.sec.gov/Archives/edgar/data/1045810/000215218826000005/wk-form4_1.xml');

my $form4 = sub {
    my ($planned, @rows) = @_;
    my $tx = join '', map { "<nonDerivativeTransaction><transactionCoding><transactionCode>$_->[0]</transactionCode></transactionCoding>"
        . "<transactionAmounts><transactionShares><value>$_->[1]</value><footnoteId id=\"F1\"/></transactionShares>"
        . "<transactionPricePerShare><value>$_->[2]</value></transactionPricePerShare></transactionAmounts></nonDerivativeTransaction>" } @rows;
    return "<ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerName>Huang Jen Hsun</rptOwnerName></reportingOwnerId>"
         . "<reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>1</isOfficer><officerTitle>President and CEO</officerTitle>"
         . "</reportingOwnerRelationship></reportingOwner><aff10b5One>$planned</aff10b5One><nonDerivativeTable>$tx</nonDerivativeTable></ownershipDocument>";
};
my $sale = form4_trades($form4->(1, ['S', 5000, 210.5], ['S', 1000, 211], ['A', 172507, 0], ['M', 4000, 10]));
t('open-market sales sum; grants and exercises don\'t count',
  $sale->{sold} == 5000 * 210.5 + 1000 * 211 && $sale->{sold_shares} == 6000 && $sale->{bought} == 0
  && $sale->{who} eq 'Huang Jen Hsun' && $sale->{role} eq 'President and CEO' && $sale->{planned});
my $f = { acc => 'x', at => $since, url => 'u' };
t('a $1M+ sale is an insider event; a small one or a grant is not',
  insider_event('NVDA', $f, $sale)->{value} == 1263500
  && !insider_event('NVDA', $f, form4_trades($form4->(0, ['S', 100, 210])))
  && !insider_event('NVDA', $f, form4_trades($form4->(0, ['A', 172507, 0]))));
t('a $100K+ purchase is an insider event, not a planned sale',
  do { my $buy = insider_event('NVDA', $f, form4_trades($form4->(0, ['P', 500, 210]))); $buy->{side} eq 'bought' && !$buy->{planned} });

my $fresh = fresh_events([
    { id => 'news:1', symbol => 'NVDA', at => '2026-09-15T10:00:00Z' },
    { id => 'move:TSLA:2026-09-15', symbol => 'TSLA', at => '2026-09-15T20:00:00Z' },
    { id => 'news:1', symbol => 'META', at => '2026-09-15T10:00:00Z' },
    { id => 'news:2', symbol => 'NVDA', at => '2026-09-15T11:00:00Z' },
], { 'news:2' => '2026-09-15' });
t('events newest first, one per id naming every holding, judged ones gone',
  join(',', map { $_->{id} } @$fresh) eq 'move:TSLA:2026-09-15,news:1' && $fresh->[1]{also}[0] eq 'META');
my $weighed = weigh_positions({ NVDA => { currency => 'USD', value => 4319 }, TSLA => { currency => 'USD', value => 14484 },
                                'RY.TO' => { currency => 'CAD', value => 2842 }, VOO => { currency => 'USD', value => 0 } });
t('weights are per currency', $weighed->{NVDA}{weight_pct} == 23 && $weighed->{'RY.TO'}{weight_pct} == 100 && $weighed->{VOO}{weight_pct} == 0);

# ── Holdings from the edit register ───────────────────────────────────────
{
    local $ENV{SKILL_DIR} = tempdir(CLEANUP => 1);
    mkdir "$ENV{SKILL_DIR}/data";
    my $write = sub {
        my ($name, $doc) = @_;
        open(my $f, '>', "$ENV{SKILL_DIR}/data/$name") or die;
        print $f JSON::PP->new->encode($doc);
        close $f;
    };
    my $cell = sub { { v => $_[0], ts => 1, d => 'phone' } };
    $write->('edits.json', { device => 'mac', lastTs => 1, reg => {
        'inv:RY.TO|watch'    => $cell->(JSON::PP::true),
        'inv:RY.TO|shares'   => $cell->(20),
        'inv:RY.TO|avg_cost' => $cell->(140),
        'inv:VOO|watch'      => $cell->(JSON::PP::true),
        'inv:AAPL|watch'     => $cell->(undef),     # removed: a tombstone
        'bud:dining'         => $cell->(400),
    } });
    $write->('quotes.json', { symbols => {
        'RY.TO' => { name => 'Royal Bank of Canada', price => 150, currency => 'CAD' },
        'AAPL'  => { name => 'Apple Inc.', price => 330 },
    } });
    t('watched symbols come from the register, tombstones gone', join(',', watched_symbols()) eq 'RY.TO,VOO',
      join(',', watched_symbols()));
    my $out = JSON::PP->new->utf8->decode(scalar `perl $SCRIPT portfolio`);
    my $ry = $out->{investments}{holdings}[0];
    t('a holding added on the phone is in the agent\'s portfolio with its numbers',
      $ry->{symbol} eq 'RY.TO' && $ry->{value} == 3000 && $ry->{gain} == 200,
      JSON::PP->new->canonical->encode($out->{investments}));
    t('the watchlist and quotes cover only listed symbols',
      join(',', @{ $out->{investments}{watchlist} }) eq 'VOO' && !exists $out->{quotes}{AAPL});
}

print "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
