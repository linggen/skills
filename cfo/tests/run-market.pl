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

# ── Watch: economy and policy ─────────────────────────────────────────────
{
    my $window = session_end('2026-09-16') - 3600;
    my @rates = map { { effectiveDate => $_->[0], targetRateFrom => $_->[1], targetRateTo => $_->[2] } }
        ['2026-09-17', 3.25, 3.50], ['2026-09-16', 3.50, 3.75], ['2026-09-15', 3.50, 3.75], ['2026-07-30', 3.75, 4.00];
    my @cut = fed_rate_events(\@rates, $window);
    t('a Fed range change inside the window is a rate event',
      @cut == 1 && $cut[0]{id} eq 'rate:Fed:2026-09-17' && $cut[0]{change_bp} == -25 && $cut[0]{from} eq '3.50–3.75%',
      JSON::PP->new->canonical->encode(\@cut));

    my $item = sub { "<item><title>$_[0]</title><link><![CDATA[$_[1]]]></link><pubDate><![CDATA[$_[2]]]></pubDate></item>" };
    my $feed = '<rss><channel>'
        . $item->('Federal Reserve issues FOMC statement', 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm', 'Thu, 17 Sep 2026 18:00:00 GMT')
        . $item->('Minutes of the Board&#39;s discount rate meetings', 'https://x/monetary20260916b.htm', 'Wed, 16 Sep 2026 18:00:00 GMT')
        . $item->('Minutes of the Federal Open Market Committee, July 28–29, 2026', 'https://x/monetary20260819a.htm', 'Wed, 19 Aug 2026 18:00:00 GMT')
        . '</channel></rss>';
    my @fed = fed_release_events($feed, $window);
    t('an FOMC statement in the window is an event; board minutes and old releases are not',
      @fed == 1 && $fed[0]{id} eq 'fed:monetary20260916a.htm', JSON::PP->new->canonical->encode(\@fed));

    my $meeting = sub { qq{<div class="row fomc-meeting"><div class="fomc-meeting__month col"><strong>$_[0]</strong></div><div class="fomc-meeting__date col">$_[1]</div></div>} };
    my $calendar = '<h4><a id="1">2026 FOMC Meetings</a></h4>' . $meeting->('September', '15-16*') . $meeting->('Apr/May', '30-1')
                 . '<h4><a id="2">2027 FOMC Meetings</a></h4>' . $meeting->('January', '26-27');
    t('an FOMC decision tomorrow is an event, with projections flagged',
      (fomc_meeting_events($calendar, '2026-09-15'))[0]{when} eq 'tomorrow'
      && (fomc_meeting_events($calendar, '2026-09-15'))[0]{projections});
    t('a meeting across two months decides in the second',
      (fomc_meeting_events($calendar, '2026-05-01'))[0]{on} eq '2026-05-01' && !fomc_meeting_events($calendar, '2026-09-18'));

    my @obs;
    for my $i (0 .. 79) {
        my $d = shift_date('2026-09-17', -$i);
        push @obs, { d => $d, V39079 => { v => $i == 0 ? '2.00' : '2.25' }, FXUSDCAD => { v => $i % 2 ? '1.3800' : '1.3828' } };
    }
    $obs[0]{FXUSDCAD}{v} = '1.3950'; # +1.09% on the 17th
    splice @obs, 5, 0, { d => '2026-09-12', V39079 => { v => '' }, FXUSDCAD => {} }; # a holiday: no values
    my @boc = boc_events(\@obs, $window);
    t('a Bank of Canada cut and a big USD/CAD day are events',
      join(',', map { $_->{id} } @boc) eq 'rate:Bank of Canada:2026-09-17,fx:USDCAD:2026-09-17'
      && $boc[0]{change_bp} == -25 && $boc[1]{change_pct} == 1.09, JSON::PP->new->canonical->encode(\@boc));

    my $row = sub { my ($y, $m, $v) = @_; { year => $y, period => sprintf('M%02d', $m), value => $v } };
    my $series = {
        CUSR0000SA0   => [ $row->(2026, 8, 334.131), $row->(2026, 7, 332.813) ],
        CUUR0000SA0   => [ $row->(2026, 8, 334.980), $row->(2026, 7, 333.918), $row->(2025, 8, 325.000) ],
        CES0000000001 => [ $row->(2026, 8, 159075), $row->(2026, 7, 158913) ],
        LNS14000000   => [ $row->(2026, 8, 4.1), $row->(2026, 7, 4.2) ],
    };
    my @data = bls_events($series, { at => 1, cpi => '2026-07', jobs => '2026-08' });
    t('a CPI month newer than the snapshot is an event with its monthly and yearly change',
      @data == 1 && $data[0]{id} eq 'data:cpi:2026-08' && $data[0]{mom_pct} == 0.4 && $data[0]{yoy_pct} == 3.1,
      JSON::PP->new->canonical->encode(\@data));
    my ($jobs) = bls_events($series, { at => 1, cpi => '2026-08', jobs => '2026-07' });
    t('a new jobs report carries payrolls and unemployment',
      $jobs->{payrolls_change_k} == 162 && $jobs->{unemployment_pct} == 4.1 && $jobs->{unemployment_was} == 4.2);
    t('no BLS snapshot yet: nothing to compare', !bls_events($series, undef));

    my @docs = (
        { document_number => '2026-19001', type => 'Presidential Document', subtype => 'Proclamation', publication_date => '2026-09-17',
          title => 'Modifying the Scope of Products of Canada Subject to the Additional Duties', agencies => [{ name => 'Executive Office of the President' }], html_url => 'https://fr/1' },
        { document_number => '2026-19002', type => 'Presidential Document', subtype => 'Proclamation', publication_date => '2026-09-17', title => 'Patriot Day, 2026' },
        { document_number => '2026-19003', type => 'Presidential Document', subtype => 'Notice', publication_date => '2026-09-17', title => 'Continuation of the National Emergency With Respect to Terrorism' },
        { document_number => '2026-18800', type => 'Rule', publication_date => '2026-09-01', title => 'Revisions to the Entity List' },
        { document_number => '2026-19004', type => 'Rule', publication_date => '2026-09-17', title => 'Revisions to the Entity List', agencies => [{ raw_name => 'COMMERCE DEPARTMENT' }] },
    );
    my @policy = policy_events(\@docs, $window);
    t('policy in the window, observances and routine renewals left out',
      join(',', map { $_->{id} } @policy) eq 'policy:2026-19001,policy:2026-19004'
      && $policy[0]{type} eq 'Proclamation' && $policy[1]{agencies}[0] eq 'COMMERCE DEPARTMENT',
      JSON::PP->new->canonical->encode(\@policy));
}

# ── Watch: judged and ranked ──────────────────────────────────────────────
{
    my $positions = {
        TSLA    => { currency => 'USD', shares => 40, value => 14263.2, weight_pct => 77.1 },
        NVDA    => { currency => 'USD', shares => 20, value => 4243.4, weight_pct => 22.9 },
        'RY.TO' => { currency => 'CAD', shares => 0, value => 0, weight_pct => 0 },
    };
    my @events = (
        { id => 'move:TSLA:2026-09-16', symbol => 'TSLA', kind => 'move', at => '2026-09-16T20:00:00Z', position_change => -2172.8 },
        { id => 'news:a', symbol => 'NVDA', also => ['TSLA'], kind => 'news', at => '2026-09-16T12:00:00Z' },
        { id => 'policy:1', scope => 'economy', kind => 'policy', at => '2026-09-16T12:00:00Z' },
        { id => 'earnings:NVDA:2026-09-18', symbol => 'NVDA', kind => 'earnings', when => 'tomorrow', at => '2026-09-18T12:00:00Z' },
        { id => 'news:b', symbol => 'TSLA', kind => 'news', at => '2026-09-16T11:00:00Z' },
        { id => 'fx:USDCAD:2026-09-16', scope => 'economy', kind => 'fx', change_pct => 1.2, at => '2026-09-16T20:00:00Z' },
        { id => 'move:RY.TO:2026-09-16', symbol => 'RY.TO', kind => 'move', at => '2026-09-16T20:00:00Z', position_change => undef },
        { id => 'news:c', symbol => 'NVDA', kind => 'news', at => '2026-09-16T10:00:00Z' },
        { id => 'news:d', symbol => 'NVDA', kind => 'news', at => '2026-09-16T09:00:00Z' },
    );
    my $scan = { scanned_at => '2026-09-17T05:00:00Z', home => 'USD', positions => $positions, events => \@events };
    my @judged = (
        { id => 'move:TSLA:2026-09-16', materiality => 'high', line => 'Tesla fell 14.5% after results.' },
        { id => 'news:a', materiality => 'medium', line => "NVIDIA   and\nTesla named in a chip deal." },
        { id => 'policy:1', materiality => 'MEDIUM', holdings => ['tsla', 'AAPL'], line => 'New tariffs on Canadian vehicles.' },
        { id => 'earnings:NVDA:2026-09-18', materiality => 'low', line => 'NVIDIA reports tomorrow.' },
        { id => 'news:b', materiality => 'low', line => 'A Tesla opinion piece.' },
        { id => 'fx:USDCAD:2026-09-16', materiality => 'high', holdings => ['TSLA', 'NVDA'], line => 'The US dollar rose 1.2% against the Canadian.' },
        { id => 'move:RY.TO:2026-09-16', materiality => 'high', line => 'Royal Bank fell 6%.' },
        { id => 'news:c', materiality => 'none', line => 'Nothing to do with the stock.' },
        { id => 'invented', materiality => 'high', line => 'Made up.' },
    );
    my $brief = sub { my ($doc) = @_; join ',', @{ $doc->{briefs}{'2026-09-17'}{lines} } };

    my $doc = {};
    my $out = record_watch($doc, $scan, \@judged, '2026-09-17', 'normal', 0);
    t('the brief is holdings by the share of their money at stake, three at most',
      $brief->($doc) eq 'move:TSLA:2026-09-16,news:a,policy:1', $brief->($doc));
    my %item = map { $_->{id} => $_ } @{ $doc->{items} };
    t('a move\'s stake is the position\'s real change; a policy\'s a share of what it touches',
      $item{'move:TSLA:2026-09-16'}{stake} == 2173 && $item{'move:TSLA:2026-09-16'}{stake_pct} == 11.74
      && $item{'policy:1'}{stake} == 428 && join(',', @{ $item{'policy:1'}{holdings} }) eq 'TSLA');
    t('a headline tagged with two holdings weighs both', $item{'news:a'}{weight_pct} == 100 && $item{'news:a'}{line} eq 'NVIDIA and Tesla named in a chip deal.');
    t('a currency day touches only holdings priced in the other currency', !$item{'fx:USDCAD:2026-09-16'}{held});
    t('judged nothing, or not in the scan: no item; every candidate is seen',
      !$item{'news:c'} && !$item{'invented'} && !$item{'news:d'} && $doc->{seen}{'news:c'} && $doc->{seen}{'news:d'} && !$doc->{seen}{'invented'}
      && $out->{judged} == 7 && $out->{candidates} == 9);
    t('the last run is the scan\'s time', $doc->{last_run} eq '2026-09-17T05:00:00Z');

    my $quiet = {};
    record_watch($quiet, $scan, \@judged, '2026-09-17', 'quiet', 0);
    t('quiet: only high on a big holding', $brief->($quiet) eq 'move:TSLA:2026-09-16', $brief->($quiet));

    my $watch_only = {};
    record_watch($watch_only, $scan, [ grep { $_->{id} =~ /RY|news:b/ } @judged ], '2026-09-17', 'normal', 0);
    t('a watched ticker\'s big event fills a free slot', $brief->($watch_only) eq 'move:RY.TO:2026-09-16', $brief->($watch_only));

    my $results = {};
    record_watch($results, $scan, [ grep { $_->{id} =~ /earnings/ } @judged ], '2026-09-17', 'normal', 0);
    t('results tomorrow speak even when judged low', $brief->($results) eq 'earnings:NVDA:2026-09-18');

    my $none = {};
    record_watch($none, $scan, [], '2026-09-17', 'normal', 0);
    t('nothing judged: a quiet brief, and the night still counts', $none->{briefs}{'2026-09-17'}{quiet} && keys %{ $none->{seen} } == 9);

    my $later = { items => [ { id => 'old', saved_on => '2026-09-01' }, { id => 'week', saved_on => '2026-09-12' } ],
                  seen => { gone => '2026-08-01', kept => '2026-09-01' }, briefs => { '2026-09-01' => {}, '2026-09-10' => {} } };
    record_watch($later, { %$scan, events => [] }, [], '2026-09-17', 'normal', 0);
    t('items keep a week, seen a month, briefs two weeks',
      join(',', map { $_->{id} } @{ $later->{items} }) eq 'week' && !$later->{seen}{gone} && $later->{seen}{kept}
      && !$later->{briefs}{'2026-09-01'} && $later->{briefs}{'2026-09-10'});

    local $ENV{SKILL_DIR} = tempdir(CLEANUP => 1);
    mkdir "$ENV{SKILL_DIR}/data";
    open(my $c, '>', "$ENV{SKILL_DIR}/data/watch-candidates.json") or die;
    print $c JSON::PP->new->encode($scan);
    close $c;
    open(my $w, '>', "$ENV{SKILL_DIR}/data/watch.json") or die;
    print $w '{"level":"quiet"}';
    close $w;
    my $arg = 'judgments=' . JSON::PP->new->utf8->encode([ { id => 'move:TSLA:2026-09-16', materiality => 'high', line => "Tesla's 14.5% drop \x{2014} after results" } ]);
    $arg =~ s/'/'\\''/g;
    my $said = `perl $SCRIPT save-watch '$arg' 2>&1`;
    my $saved = JSON::PP->new->utf8->decode(do { local (@ARGV, $/) = "$ENV{SKILL_DIR}/data/watch.json"; <> });
    t('save-watch judges the last scan at the user\'s level and keeps the words',
      $? == 0 && (values %{ $saved->{briefs} })[0]{level} eq 'quiet' && $saved->{items}[0]{line} eq "Tesla's 14.5% drop \x{2014} after results", $said);
    `perl $SCRIPT save-watch 'judgments={{judgments}}' 2>&1`;
    t('an omitted judgments arg still ends the night', $? == 0);
    my $bad = `perl $SCRIPT save-watch 'judgments=not json' 2>&1`;
    t('judgments that aren\'t JSON are refused with the reason', $? >> 8 == 1 && $bad =~ /^judgments:/, $bad);

    my $tsla_move = JSON::PP->new->utf8->encode([
        { id => 'move:TSLA:2026-09-16', materiality => 'high', line => 'Tesla fell.' },
        { id => 'news:b', materiality => 'low', line => 'A Tesla opinion piece.' },
    ]);
    open($w, '>', "$ENV{SKILL_DIR}/data/watch.json") or die;
    print $w '{}';
    close $w;
    `perl $SCRIPT save-watch 'judgments=$tsla_move' 2>&1`;
    my $level = JSON::PP->new->utf8->decode(scalar `perl $SCRIPT watch-level everything 2>&1`);
    my $after = JSON::PP->new->utf8->decode(do { local (@ARGV, $/) = "$ENV{SKILL_DIR}/data/watch.json"; <> });
    t('a new level remakes the latest brief at once',
      join(',', @{ $level->{lines} }) eq 'move:TSLA:2026-09-16,news:b' && $after->{level} eq 'everything'
      && (values %{ $after->{briefs} })[0]{level} eq 'everything', JSON::PP->new->canonical->encode($level));
    `perl $SCRIPT watch-level loud 2>&1`;
    t('an unknown level is refused', $? >> 8 == 1);
}

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
        'inv:AAPL|rank'      => $cell->(2),         # …its place in the list left behind
        'inv:VOO|rank'       => $cell->(1),
        'bud:dining'         => $cell->(400),
    } });
    $write->('quotes.json', { symbols => {
        'RY.TO' => { name => 'Royal Bank of Canada', price => 150, currency => 'CAD' },
        'AAPL'  => { name => 'Apple Inc.', price => 330 },
    } });
    t('watched symbols come from the register, tombstones gone, a leftover rank lists nothing',
      join(',', watched_symbols()) eq 'RY.TO,VOO',
      join(',', watched_symbols()));
    my $out = JSON::PP->new->utf8->decode(scalar `perl $SCRIPT portfolio`);
    my $ry = $out->{investments}{holdings}[0];
    t('a holding added on the phone is in the agent\'s portfolio with its numbers',
      $ry->{symbol} eq 'RY.TO' && $ry->{value} == 3000 && $ry->{gain} == 200,
      JSON::PP->new->canonical->encode($out->{investments}));
    t('the watchlist and quotes cover only listed symbols',
      join(',', @{ $out->{investments}{watchlist} }) eq 'VOO' && !exists $out->{quotes}{AAPL});
}

# ── Search ─────────────────────────────────────────────────────────────────
{
    my $found = search_results([
        { id => 'TSX-RY', s => 'tsx/RY', t => 'sy', n => 'Royal Bank of Canada', st => 's' },
        { id => 'TSX-RYHI', s => 'tsx/RYHI', t => 'sy', n => 'Ninepoint Royal Bank HighShares ETF', st => 'e' },
        { id => 'TSX-RY.PRS', s => 'tsx/RY.PRS', t => 'sy', n => 'Royal Bank of Canada', st => 'p' },
        { id => 'RY', s => 'RY', t => 's', n => 'Royal Bank of Canada' },
        { id => 'FRA-RYC', s => 'fra/RYC', t => 'sy', n => 'Royal Bank of Canada', st => 's' },
        { id => 'OTC-GAPJ', s => 'otc/GAPJ', t => 'sy', n => 'Golden Apple Oil & Gas Inc.', st => 's' },
        { id => 'AAPY', s => 'AAPY', t => 'e', n => 'Kurv Yield Premium Strategy Apple (AAPL) ETF' },
        { id => 'RY', s => 'RY', t => 's', n => 'Royal Bank of Canada' },
        { id => 'MUTF-X', s => 'mutf/RYDHX', t => 'sy', n => 'A fund', st => 'm' },
    ]);
    t('search keeps US stocks and ETFs and TSX stocks and ETFs, in order, once each',
      join(',', map { "$_->{symbol}:$_->{exchange}:$_->{kind}" } @$found)
        eq 'RY.TO:TSX:stock,RYHI.TO:TSX:etf,RY:US:stock,AAPY:US:etf',
      join(',', map { $_->{symbol} } @$found));
    t('a search row carries the company name', $found->[0]{name} eq 'Royal Bank of Canada');
    my @many = map { { s => "A$_", t => 's', n => "Co $_" } } 'A' .. 'J';
    t('search answers at most six', scalar @{ search_results(\@many) } == 6);
    t('the search query escapes what the user typed', url_escape('AT&T bank/x') eq 'AT%26T%20bank%2Fx');
}

print "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
