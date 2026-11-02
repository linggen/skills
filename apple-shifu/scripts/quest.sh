#!/usr/bin/env bash
# Shifu's quest facts, for any app that counts real-life practice (Lingjing
# reads ~/.linggen/quests/*.json). The file is Shifu's MENU — every chore a
# player can do here — and each entry's `done_at` is Shifu's own record of the
# last time it saw that chore done; `due` says whether it can be done now (a
# row Shifu cannot offer publishes false, and a game hides it). `pool: true`
# offers an entry to the game's one-chore-a-day pick; `kind` is what sort of
# practice it is (a plain word a game reads; Shifu names no game): a glance, a
# scan or a clear is `sweep`, a security check or a backup is `ward`; `how`
# says in a line how it is done.
#
#   quest.sh <id>          stamp <id> done now (no id: shifu-scan, the old caller)
#   quest.sh <id> <when>   done at <when> (UTC, 2026-09-24T15:00:00Z) — a record
#                          Shifu reads later; never moves an entry's time back
#   quest.sh stamp <id> <when>   the engine's door for a phone fact (SKILL.md
#                          `quests:`): the same stamp, but its exit says how it
#                          went — 0 once the file holds <when> or later, else 1
#   quest.sh due           no stamp: bring the menu and every `due` up to date
#                          (the page calls it as it opens)
#
# Due, read from Shifu's own files (SHIFU_STATE, default the skill's data/):
#   shifu-glance, -scan, -security   always (this Mac)
#   shifu-clear    the last Clearable scan left a row (files/clearables/rows.txt)
#   shifu-backup   a backup destination is set and a photo staged from the
#                  phone is not yet in the archive (media/manifest vs archive)
#
# Called at each chore's completion point: the System page looked at, a
# finished disk scan, security check, clear, or photo backup. Only the fact
# crosses — due, done, when — never what the scan found, what was cleared or
# what was backed up.
#
# Read-merge-write: every other entry keeps its own `done_at`, a retired one
# leaves, and an entry this menu does not know stays as it is. Written whole
# (tmp + mv). Prints nothing; a failure here never fails the chore it follows
# (the stamp form alone reports one).

set -u

strict=0
if [ "${1:-}" = stamp ]; then
  strict=1
  shift
  [ -n "${2:-}" ] || exit 1
fi
fail() { [ "$strict" = 1 ] && exit 1; exit 0; }

id="${1:-shifu-scan}"
[ "$id" = due ] && [ "$strict" = 0 ] && id=""
dir="${SHIFU_QUESTS:-${SHIFU_DATA:+$SHIFU_DATA/quests}}" # a test's mirror never writes the real file
dir="${dir:-$HOME/.linggen/quests}"
file="$dir/apple-shifu.json"
state="${SHIFU_STATE:-$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)/data}"
at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
case "${2:-}" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z) at="$2" ;;
  "") ;;
  *) fail ;;
esac

mkdir -p "$dir" 2>/dev/null || fail
tmp="$file.$$.tmp"
/usr/bin/perl -e '
use strict; use warnings; use utf8; use JSON::PP;
my ($file, $id, $at, $state) = @ARGV;
my $open = "/apps/apple-shifu/scripts/index.html?tab=";
my $slurp = sub { open my $fh, "<", $_[0] or return undef; local $/; my $t = <$fh>; close $fh; $t };
my $lines = sub { my $t = $slurp->($_[0]); defined $t ? grep { /\S/ } split /\n/, $t : () };
# Something clearable: the last Clearable scan left a row (an `R|` line).
my $clearable = scalar grep { /^R\|/ } $lines->("$state/files/clearables/rows.txt");
# New photos to keep: a destination is set, and a staged photo is not in the archive.
my $dest = $slurp->("$state/media/backup-dest") // "";
my $st = eval { decode_json($slurp->("$state/media/state.json") // "") } || {};
my $has_dest = $dest =~ /\S/ || (ref $st->{backup} eq "HASH" && $st->{backup}{dest});
my $sha = sub { my @s; for (@_) { my $r = eval { decode_json($_) }; push @s, $r->{sha256} if ref $r eq "HASH" && $r->{sha256} } @s };
my %kept = map { $_ => 1 } $sha->($lines->("$state/media/archive.jsonl"));
my $new_photos = grep { !$kept{$_} } $sha->($lines->("$state/media/manifest.jsonl"));
my %due = ("shifu-clear" => $clearable ? 1 : 0, "shifu-backup" => ($has_dest && $new_photos) ? 1 : 0);
my @menu = (
  { id => "shifu-glance", kind => "sweep", period => "day", reward => 15, stamina => 10, device => "mac",
    open => "${open}system", title => { zh => "巡山 · 看一眼 Mac 的状况", en => "Walk the mountain · glance at your Mac" },
    how => { zh => "打开 Shifu 的系统页看一眼", en => "Open the System page in Shifu and look" } },
  { id => "shifu-scan", kind => "sweep", period => "week", reward => 30, stamina => 20, device => "mac", pool => JSON::PP::true,
    open => "${open}system", title => { zh => "清扫洞府 · 扫描一次磁盘", en => "Tidy your cave abode · scan your disk" },
    how => { zh => "在 Shifu 系统页点「扫描」，等它扫完", en => "Tap Scan on the System page; let it finish" } },
  { id => "shifu-security", kind => "ward", period => "week", reward => 25, stamina => 15, device => "mac", pool => JSON::PP::true,
    open => "${open}system", title => { zh => "护阵 · 做一次安全检查", en => "Ward the gate · run a security check" },
    how => { zh => "在 Shifu 系统页跑一次安全检查", en => "Run the security check on the System page" } },
  { id => "shifu-clear", kind => "sweep", period => "week", reward => 25, stamina => 15, device => "both", pool => JSON::PP::true,
    open => "${open}files", title => { zh => "扫尘 · 清理一项东西", en => "Sweep the dust · clear one thing" },
    how => { zh => "在 Shifu 文件页清掉一项可清理的", en => "Clear one row on the Files page" } },
  { id => "shifu-backup", kind => "ward", period => "month", reward => 30, stamina => 20, device => "both", pool => JSON::PP::true,
    open => "${open}media", title => { zh => "藏珍 · 备份一次照片视频", en => "Keep the treasures · back up photos & videos" },
    how => { zh => "在 Shifu 照片页点「备份」", en => "Tap Back up on the Photos page" } },
);
my %retired = ();
exit 1 if $id ne "" && !grep { $_->{id} eq $id } @menu;
my $old = eval { decode_json($slurp->($file) // "") } || {};
my @held = ref $old->{quests} eq "ARRAY" ? grep { ref $_ eq "HASH" } @{ $old->{quests} } : ();
my %was = map { (defined $_->{id} ? $_->{id} : "") => $_ } @held;
my $held_at = sub { my $t = ($was{$_[0]} || {})->{done_at}; defined $t && !ref $t ? $t : undef };
my $prev = $id ne "" ? $held_at->($id) : undef;
exit 3 if defined $prev && $prev ge $at; # a later record already stands
my @out = map { { %$_, due => (exists $due{$_->{id}} ? ($due{$_->{id}} ? JSON::PP::true : JSON::PP::false) : JSON::PP::true),
  done_at => $_->{id} eq $id ? $at : $held_at->($_->{id}) } } @menu;
my %mine = map { $_->{id} => 1 } @menu;
push @out, grep { my $i = defined $_->{id} ? $_->{id} : ""; !$mine{$i} && !$retired{$i} } @held;
print JSON::PP->new->utf8->canonical->encode({ app => "apple-shifu", quests => \@out }), "\n";
' "$file" "$id" "$at" "$state" > "$tmp" 2>/dev/null
rc=$?
[ "$rc" = 0 ] && { mv -f "$tmp" "$file" 2>/dev/null || rc=1; }
rm -f "$tmp" 2>/dev/null
[ "$rc" = 0 ] || [ "$rc" = 3 ] || fail
exit 0
