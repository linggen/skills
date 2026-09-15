#!/usr/bin/env perl
# market.pl — prices and valuation numbers for stocks and ETFs listed in the
# US or on the TSX, read from stockanalysis.com's public pages. Zero LLM: backs
# the Investments tab and the agent's Market tool.
#
#   perl market.pl quotes AAPL RY.TO     price and today's move
#   perl market.pl stats AAPL RY.TO      name, P/E, forward P/E, market cap,
#                                        next earnings date (cached a day)
#   perl market.pl stats --fresh AAPL    fetch again even when cached
#
# Symbols: AAPL (US) or RY.TO (TSX; TSX:RY is accepted too). Results merge into
# data/quotes.json and print as JSON keyed by symbol. Only ticker symbols leave
# the machine. Perl core + curl, nothing else.
use strict;
use warnings;
use JSON::PP;
use Fcntl qw(:flock);
use File::Basename qw(dirname);

my $UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
       . '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
my $BASE = 'https://stockanalysis.com';
my $STATS_TTL = 20 * 3600;
my $JSON = JSON::PP->new->utf8->canonical->pretty;

sub main {
    my ($verb, @args) = @_;
    $verb //= '';
    my $fresh = grep { $_ eq '--fresh' } @args;
    my @symbols = grep { defined } map { canonical($_) } grep { $_ ne '--fresh' } @args;
    my %run = (quotes => \&quote_of, stats => sub { stats_of($_[0], $fresh) });
    unless ($run{$verb} && @symbols) {
        print STDERR "usage: market.pl quotes|stats [--fresh] SYMBOL...\n";
        exit 2;
    }
    my $out = update_cache(sub {
        my ($cache) = @_;
        my %result;
        for my $sym (@symbols) {
            my $entry = $cache->{$sym} //= base_entry($sym);
            my $err = $run{$verb}->($entry);
            $result{$sym} = $err ? { %$entry, error => $err } : $entry;
        }
        return \%result;
    });
    print $JSON->encode($out);
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

# ── Quotes ─────────────────────────────────────────────────────────────────

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

# ── Stats ──────────────────────────────────────────────────────────────────

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

my %MONTH = (Jan => 1, Feb => 2, Mar => 3, Apr => 4, May => 5, Jun => 6,
             Jul => 7, Aug => 8, Sep => 9, Oct => 10, Nov => 11, Dec => 12);

# "Oct 29, 2026" → "2026-10-29"
sub iso_date {
    my ($s) = @_;
    return undef unless defined $s && $s =~ /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/ && $MONTH{$1};
    return sprintf '%04d-%02d-%02d', $3, $MONTH{$1}, $2;
}

# ── IO ─────────────────────────────────────────────────────────────────────

sub fetch_json {
    my ($url) = @_;
    open(my $fh, '-|', 'curl', '-s', '--max-time', '12', '-A', $UA,
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

# Read-modify-write data/quotes.json under a lock, so the tab's refresh and an
# agent's call can't drop each other's numbers. The write lands whole
# (temp file + rename).
sub update_cache {
    my ($change) = @_;
    my $file = data_dir() . '/quotes.json';
    open(my $lock, '>', "$file.lock") or die "cannot lock $file: $!";
    flock($lock, LOCK_EX) or die "cannot lock $file: $!";
    my $doc = { symbols => {} };
    if (open(my $in, '<', $file)) {
        local $/;
        my $text = <$in>;
        my $old = eval { JSON::PP->new->utf8->decode($text) };
        $doc = $old if ref $old eq 'HASH' && ref $old->{symbols} eq 'HASH';
    }
    my $result = $change->($doc->{symbols});
    for my $sym (keys %$result) { delete $doc->{symbols}{$sym}{error} }
    open(my $out, '>', "$file.tmp") or die "cannot write $file: $!";
    print $out $JSON->encode($doc);
    close $out;
    rename "$file.tmp", $file or die "cannot write $file: $!";
    close $lock;
    return $result;
}

main(@ARGV);
