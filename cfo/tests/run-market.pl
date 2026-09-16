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
    my ($bad, $msg) = $save->('symbol=AAPL', 'period={{period}}', 'summary=Something long enough to pass.');
    t('a missing period is refused with the reason', $bad == 1 && $msg =~ /^period:/, $msg);
    ($bad, $msg) = $save->('symbol=AAPL', 'period=2026-06-27', 'summary=ok');
    t('an empty summary is refused', $bad == 1 && $msg =~ /^summary:/, $msg);
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
