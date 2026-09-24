#!/usr/bin/env bash
# Shifu's quest facts, for any app that counts real-life practice (Lingjing
# reads ~/.linggen/quests/*.json). The file is Shifu's MENU — every chore a
# player can do here — and each entry's `done_at` is Shifu's own record of the
# last time it saw that chore done. `pool: true` offers an entry to the game's
# one-chore-a-day pick.
#
#   quest.sh <id>          stamp <id> done now (no id: shifu-scan, the old caller)
#   quest.sh <id> <when>   done at <when> (UTC, 2026-09-24T15:00:00Z) — a record
#                          Shifu reads later; never moves an entry's time back
#
# Called at each chore's completion point: a finished disk scan, security
# check, clear, or photo backup. Only the fact crosses — due, done, when —
# never what the scan found, what was cleared or what was backed up.
#
# Read-merge-write: every other entry keeps its own `done_at`, and an entry
# this menu does not know stays as it is. Written whole (tmp + mv). Prints
# nothing; a failure here never fails the chore it follows.

set -u

id="${1:-shifu-scan}"
dir="${SHIFU_QUESTS:-${SHIFU_DATA:+$SHIFU_DATA/quests}}" # a test's mirror never writes the real file
dir="${dir:-$HOME/.linggen/quests}"
file="$dir/apple-shifu.json"
at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
case "${2:-}" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z) at="$2" ;;
  "") ;;
  *) exit 0 ;;
esac

mkdir -p "$dir" 2>/dev/null || exit 0
tmp="$file.$$.tmp"
/usr/bin/perl -e '
use strict; use warnings; use utf8; use JSON::PP;
my ($file, $id, $at) = @ARGV;
my $open = "/apps/apple-shifu/scripts/index.html?tab=";
my @menu = (
  { id => "shifu-scan", period => "week", reward => 30, stamina => 20, device => "mac", pool => JSON::PP::true,
    open => "${open}system", title => { zh => "清扫洞府 · 用 Shifu 扫描一次磁盘", en => "Tidy your cave abode · scan your disk in Shifu" } },
  { id => "shifu-security", period => "week", reward => 25, stamina => 15, device => "mac", pool => JSON::PP::true,
    open => "${open}system", title => { zh => "护阵 · 做一次安全检查", en => "Ward the gate · run a security scan" } },
  { id => "shifu-clear", period => "week", reward => 25, stamina => 15, device => "mac", pool => JSON::PP::true,
    open => "${open}files", title => { zh => "扫尘 · 清理一项可清理的东西", en => "Sweep the dust · clear one clearable" } },
  { id => "shifu-backup", period => "week", reward => 30, stamina => 20, device => "both", pool => JSON::PP::true,
    open => "${open}media", title => { zh => "藏珍 · 备份一次照片视频", en => "Keep the treasures · back up photos & videos" } },
);
exit 1 unless grep { $_->{id} eq $id } @menu;
my $old = eval { local $/; open my $fh, "<", $file or die; decode_json(<$fh>) } || {};
my @held = ref $old->{quests} eq "ARRAY" ? grep { ref $_ eq "HASH" } @{ $old->{quests} } : ();
my %was = map { (defined $_->{id} ? $_->{id} : "") => $_ } @held;
my $held_at = sub { my $t = ($was{$_[0]} || {})->{done_at}; defined $t && !ref $t ? $t : undef };
my $prev = $held_at->($id);
exit 1 if defined $prev && $prev ge $at; # a later record already stands
my @out = map { { %$_, due => JSON::PP::true,
  done_at => $_->{id} eq $id ? $at : $held_at->($_->{id}) } } @menu;
my %mine = map { $_->{id} => 1 } @menu;
push @out, grep { !$mine{defined $_->{id} ? $_->{id} : ""} } @held;
print JSON::PP->new->utf8->canonical->encode({ app => "apple-shifu", quests => \@out }), "\n";
' "$file" "$id" "$at" > "$tmp" 2>/dev/null && mv -f "$tmp" "$file" 2>/dev/null
rm -f "$tmp" 2>/dev/null
exit 0
