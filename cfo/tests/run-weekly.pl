#!/usr/bin/env perl
# run-weekly.pl — weekly.pl: which week a run reports, each holding's weekly
# move and the totals per currency, and SaveWeekly's checks (figures in the
# quote, the quote on its page, a rate's direction, ties to held symbols).
#
#   perl tests/run-weekly.pl
#
# No network: closes and source pages are written out below; save runs
# against a temporary data dir.
use strict;
use warnings;
use utf8;
use File::Basename qw(dirname);
use File::Spec;
use File::Temp qw(tempdir);
use JSON::PP;

binmode STDOUT, ':encoding(UTF-8)';
my $SCRIPT = File::Spec->rel2abs(dirname(__FILE__) . '/../scripts/weekly.pl');
require $SCRIPT;

my ($pass, $fail) = (0, 0);
sub t {
    my ($name, $ok, $detail) = @_;
    $ok ? $pass++ : $fail++;
    print(($ok ? '✅' : '❌') . " $name" . (!$ok && defined $detail ? " — $detail" : '') . "\n");
}
my $J = JSON::PP->new->canonical;

# ── The week ───────────────────────────────────────────────────────────────
{
    my $w = week_of('2026-10-04');   # Sunday
    t('a Sunday run reports the Monday–Friday just gone',
      $w->{from} eq '2026-09-28' && $w->{to} eq '2026-10-02' && $w->{id} eq '2026-W40', $J->encode($w));
    t('last week\'s close is the Friday before; next week is the one after',
      $w->{prev_to} eq '2026-09-25' && $w->{next_from} eq '2026-10-05' && $w->{next_to} eq '2026-10-11');
    t('a Monday run still reports the full week before', week_of('2026-10-05')->{to} eq '2026-10-02');
    t('a Friday run reports the week before — this one is not closed yet', week_of('2026-10-02')->{to} eq '2026-09-25');
    t('a Saturday run reports yesterday\'s Friday', week_of('2026-10-03')->{to} eq '2026-10-02');
    t('the week id crosses the year by ISO weeks', week_of('2027-01-03')->{id} eq '2026-W53');
}

# ── Closes ─────────────────────────────────────────────────────────────────
my @rows = (
    { t => '2026-10-02', c => 141.98 }, { t => '2026-10-01', c => 140.5 },
    { t => '2026-09-25', c => 139.98 }, { t => '2026-09-24', c => 138 },
);
t('the close on a day', close_on_or_before(\@rows, '2026-09-25')->{close} == 139.98);
t('a holiday falls back to the session before',
  close_on_or_before(\@rows, '2026-09-27')->{on} eq '2026-09-25');
t('no session on or before the day → none', !defined close_on_or_before(\@rows, '2026-09-01'));
t('rows in any order', close_on_or_before([reverse @rows], '2026-10-02')->{close} == 141.98);
{
    my @lagging = @rows[1 .. 3];  # the history stops Thursday
    my $closed = { price => 142.2, price_time => 'Oct 2, 2026, 4:00 PM EDT' };
    my $intraday = { price => 142.2, price_time => 'Oct 2, 2026, 11:00 AM EDT' };
    t('a lagging history takes Friday\'s close from the quote',
      week_close(\@lagging, $closed, 'ZNQ.TO', '2026-10-02')->{close} == 142.2);
    t('an intraday quote is not a close', week_close(\@lagging, $intraday, 'ZNQ.TO', '2026-10-02')->{on} eq '2026-10-01');
    t('a quote from after the week is not its close',
      week_close(\@lagging, { price => 150, price_time => 'Oct 5, 2026, 4:00 PM EDT' }, 'ZNQ.TO', '2026-10-02')->{close} == 140.5);
}

# ── Weekly change math ─────────────────────────────────────────────────────
{
    my $m = weekly_change(20, { on => '2026-09-25', close => 285.63 }, { on => '2026-10-02', close => 278.91 });
    t('per share, per position, in percent', $m->{change} == -6.72 && $m->{value_change} == -134.4
      && $m->{change_pct} == -2.35 && $m->{value} == 5578.2, $J->encode($m));
    t('no last-week close → no move', !defined weekly_change(20, undef, { close => 1 }));
    my $totals = totals_by_currency([
        { symbol => 'RY.TO', currency => 'CAD', value => 5578.2, value_change => -134.4 },
        { symbol => 'ZNQ.TO', currency => 'CAD', value => 4259.4, value_change => 60 },
        { symbol => 'VGRO.TO', currency => 'CAD', value => 3831.2, value_change => -19.2 },
        { symbol => 'NVDA', currency => 'USD', value => 4679, value_change => 177.6 },
    ]);
    my ($cad, $usd) = @$totals;
    t('a currency\'s total sums its holdings; its percent is against last week\'s value',
      $cad->{value} == 13668.8 && $cad->{value_change} == -93.6 && $cad->{change_pct} == -0.68, $J->encode($cad));
    t('US and Canadian dollars never add', @$totals == 2 && $usd->{value} == 4679 && $usd->{change_pct} == 3.95);
    my ($short) = @{ totals_by_currency([
        { symbol => 'A', currency => 'USD', value => 100, value_change => 5 },
        { symbol => 'B', currency => 'USD', missing => 'no closes' },
    ]) };
    t('a holding with no week leaves its currency with no total, named',
      !defined $short->{value} && !defined $short->{change_pct} && "@{ $short->{missing} }" eq 'B');
}
{
    my %closes = (
        'RY.TO' => [ { t => '2026-10-02', c => 278.91 }, { t => '2026-09-25', c => 285.63 } ],
        NVDA    => [ { t => '2026-10-02', c => 233.95 }, { t => '2026-09-25', c => 225.07 } ],
    );
    my $p = portfolio_week(
        { 'RY.TO' => { shares => 20 }, NVDA => { shares => 20 }, AAPL => { watch => 1 }, TSLA => { shares => 5 } },
        { NVDA => { name => 'NVIDIA Corporation', currency => 'USD' } },
        week_of('2026-10-04'),
        sub { $closes{ $_[0]{symbol} } },
    );
    my %h = map { $_->{symbol} => $_ } @{ $p->{holdings} };
    t('held symbols only; a watched one has no week', !$h{AAPL} && keys %h == 3);
    t('each holding\'s move in money and percent', $h{NVDA}{value_change} == 177.6 && $h{NVDA}{change_pct} == 3.95);
    t('a TSX holding is in CAD by its listing', $h{'RY.TO'}{currency} eq 'CAD');
    t('a holding with no closes says so', ($h{TSLA}{missing} // '') ne '' && !defined $h{TSLA}{value_change});
    my ($usd) = grep { $_->{currency} eq 'USD' } @{ $p->{totals} };
    t('…and its currency has no total', !defined $usd->{value} && "@{ $usd->{missing} }" eq 'TSLA');
}

# ── Reported this week, next week ──────────────────────────────────────────
{
    my $reports = { symbols => {
        TSLA => { name => 'Tesla, Inc.', reports => [
            { period => '2026-09-30', form => '8-K', filed => '2026-10-02', url => 'https://x/r', summary => '**Q3** · deliveries' },
            { period => '2026-06-30', form => '10-Q', filed => '2026-07-22', summary => 'old one' } ] },
        AAPL => { reports => [ { period => '2026-09-27', filed => '2026-09-30', summary => 'watched only' } ] },
    } };
    my $got = reported_in($reports, { TSLA => 1 }, '2026-09-28', '2026-10-04');
    t('held companies whose summary was filed in the week, summary kept',
      @$got == 1 && $got->[0]{symbol} eq 'TSLA' && $got->[0]{summary} =~ /deliveries/ && $got->[0]{name} eq 'Tesla, Inc.');
    my $events = next_week_events(
        [ { on => '2026-10-07', kind => 'boc', label => 'Bank of Canada rate decision' },
          { on => '2026-10-14', kind => 'cpi', label => 'Consumer Price Index' } ],
        { TSLA => { earnings_on => '2026-10-09', name => 'Tesla, Inc.' }, AAPL => { earnings_on => '2026-10-08' } },
        { TSLA => 1 }, '2026-10-05', '2026-10-11');
    t('next week: releases inside it and held companies\' earnings, by date',
      join(',', map { $_->{symbol} // $_->{kind} } @$events) eq 'boc,TSLA', $J->encode($events));
}
t('language: the config\'s, else the Mac\'s, else English',
  report_language({ language => 'zh-Hans' }, 'en-CA') eq 'zh-Hans' && report_language({}, 'en-CA') eq 'en-CA'
  && report_language({ language => '{{x}}' }, undef) eq 'en');

# ── Figures and directions ─────────────────────────────────────────────────
t('figures normalize commas and trailing zeros', join(',', figures_in('payrolls 150,000; rate 4.20%')) eq '150000,4.2');
t('a date\'s parts are not figures', join(',', figures_in('9月非农新增150,000，Q3，2026年，10月29日', 1)) eq '150000');
t('a decimal is one figure, not two', join(',', figures_in('PMI 49.1', 1)) eq '49.1');
{
    my $ok = { text => '美国9月非农就业新增 150,000，失业率 4.1%', source => 'https://bls.gov/news',
               quote => 'Total nonfarm payroll employment rose by 150,000 in September, and the unemployment rate was 4.1 percent' };
    t('a bullet whose figures are all quoted stands', !defined bullet_problem($ok));
    t('a figure not in the quote is named',
      (bullet_problem({ %$ok, text => '失业率 4.3%' }) // '') =~ /4\.3/);
    t('a bullet needs an https source', (bullet_problem({ %$ok, source => 'memory' }) // '') =~ /source/);
    t('a bullet needs a quote', (bullet_problem({ %$ok, quote => '' }) // '') =~ /quote/);
    my $cut = { text => '美联储加息 25 个基点', source => 'https://fed.gov/x',
                quote => 'the Committee decided to lower the target range by 25 basis points' };
    t('加息 against a quote that says lower is dropped (the sample\'s trap)', (bullet_problem($cut) // '') =~ /direction 'up'/);
    t('降息 with the same quote stands', !defined bullet_problem({ %$cut, text => '美联储降息 25 个基点' }));
    t('hike vs cut in English too',
      (bullet_problem({ text => 'Futures price a hike of 25 bp', source => 'https://x/y', quote => 'traders price a 25 bp cut' }) // '') =~ /direction/);
}
t('a quote whose figures are on the page', on_page('rose 0.3% in August', '<td>0.3</td> August') == 1);
t('…and one whose figures are not', on_page('rose 0.4% in August', '<td>0.3</td>') == 0);
t('a page out of reach checks nothing', !defined on_page('rose 0.4%', undef));
{
    my %held = (RY => 1, 'RY.TO' => 1);
    t('a tie names held symbols', !defined tie_problem({ text => '降息预期利好银行股', holdings => ['RY.TO'] }, \%held, {}));
    t('a tie naming a symbol not held is dropped', (tie_problem({ text => 'x', holdings => ['TD.TO'] }, \%held, {}) // '') =~ /holdings/);
    t('a tie brings no new figure', (tie_problem({ text => '利好 3%', holdings => ['RY.TO'] }, \%held, { 25 => 1 }) // '') =~ /3/);
}

# ── SaveWeekly ─────────────────────────────────────────────────────────────
{
    local $ENV{SKILL_DIR} = tempdir(CLEANUP => 1);
    my $dir = data_dir();
    my $scan = {
        week => '2026-W40', from => '2026-09-28', to => '2026-10-02', language => 'zh-Hans',
        portfolio => { holdings => [
            { symbol => 'RY.TO', currency => 'CAD', shares => 20, value => 5578.2, value_change => -134.4, change_pct => -2.35 },
            { symbol => 'NVDA', currency => 'USD', shares => 20, value => 4679, value_change => 177.6, change_pct => 3.95 } ],
            totals => [ { currency => 'CAD', value => 5578.2, value_change => -134.4, change_pct => -2.35, missing => [] } ] },
        reported => [ { symbol => 'NVDA', summary => '**Q3**' } ],
        next_week => { from => '2026-10-05', to => '2026-10-11', events => [ { on => '2026-10-07', kind => 'boc', label => 'Bank of Canada rate decision' } ] },
    };
    write_json("$dir/weekly-candidates.json", $scan);
    my %pages = (
        'https://statcan.gc.ca/lfs' => 'The unemployment rate rose 0.2 percentage points to 7.1% in September.',
        'https://cmegroup.com/fw'   => '{"probability": 0.82}',
    );
    no warnings qw(redefine once);
    local *main::fetch_pages = sub { +{ map { exists $pages{$_} ? ($_ => $pages{$_}) : () } @_ } };
    my $sections = [
        { id => 'canada', title => '加拿大', bullets => [
            { text => '9月失业率升至 7.1%', source => 'https://statcan.gc.ca/lfs', quote => 'The unemployment rate rose 0.2 percentage points to 7.1% in September.' },
            { text => '9月失业率升至 7.3%', source => 'https://statcan.gc.ca/lfs', quote => 'rose to 7.3%' } ] },
        { id => 'rates', title => '利率及债券市场', bullets => [
            { text => '期货定价降息概率 0.82', source => 'https://cmegroup.com/fw', quote => 'probability 0.82 of a cut' },
            { text => '十年期收益率 4.05%', source => 'https://blocked.example/y', quote => 'the 10-year yield ended at 4.05%' } ] },
        { id => 'gossip', title => 'x', bullets => [] },
    ];
    my $ties = [ { text => '降息预期对银行股有利', holdings => ['RY.TO'] }, { text => 'x', holdings => ['TD.TO'] } ];
    my $out = '';
    {
        open(my $fh, '>', \$out) or die;
        my $old = select $fh;
        cmd_save('sections=' . encode_json($sections), 'ties=' . encode_json($ties), 'next_week={{next_week}}');
        select $old;
    }
    my $res = decode_json($out);
    my $doc = read_json("$dir/weekly.json");
    my $week = $doc->{weeks}{'2026-W40'};
    t('saved under its week id, the newest', $doc->{latest} eq '2026-W40' && $res->{saved} eq '2026-W40');
    t('standing bullets kept, in section order', $res->{points} == 3
      && join(',', map { $_->{id} } @{ $week->{sections} }) eq 'canada,rates', $out);
    my %why = map { ($_->{section} // "tie$_->{tie}") . ($_->{bullet} // '') => $_->{why} } @{ $res->{dropped} };
    t('a quote not on its page is dropped and named', ($why{canada2} // '') =~ /not on its source page/, $J->encode($res->{dropped}));
    t('an unknown section is dropped', ($why{gossip} // '') =~ /section id/);
    t('a tie to a symbol not held is dropped', ($why{tie2} // '') =~ /holdings/);
    my ($blocked) = grep { $_->{source} =~ /blocked/ } map { @{ $_->{bullets} } } @{ $week->{sections} };
    t('a page out of reach keeps its bullet, marked unchecked', $blocked && !$blocked->{checked});
    t('every kept bullet carries its source', !grep { $_->{source} !~ m{^https://} } map { @{ $_->{bullets} } } @{ $week->{sections} });
    t('the portfolio table is code\'s, from the scan', $week->{portfolio}{totals}[0]{value_change} == -134.4
      && $week->{reported}[0]{symbol} eq 'NVDA');
    t('an omitted next-week line is empty, the events stay', $week->{next_week}{line} eq '' && @{ $week->{next_week}{events} } == 1);
    my $n = $res->{notice};
    t('the notice is facts for Yinyue: totals, biggest move, reported, next week',
      $n->{totals}[0]{value_change} == -134.4 && $n->{biggest_move}{symbol} eq 'NVDA'
      && "@{ $n->{reported} }" eq 'NVDA' && $n->{next_week}[0]{kind} eq 'boc' && $n->{market_points} == 3, $J->encode($n));

    local *main::fail = sub { die "$_[0]\n" };
    my $bad = eval { cmd_save('sections=not json'); 1 };
    t('sections that are not JSON are refused', !$bad);
}
{
    my $doc = {};
    record_week($doc, { week => sprintf('2026-W%02d', $_) }) for 30 .. 40;
    t('eight weeks kept, the newest latest', keys(%{ $doc->{weeks} }) == 8 && $doc->{latest} eq '2026-W40' && !$doc->{weeks}{'2026-W32'});
}

print "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
