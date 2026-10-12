#!/usr/bin/env bash
# Read-only VPS diagnostics. Does not expose tokens, passwords or user profiles.
set -euo pipefail
echo '=== CPU ==='
if command -v lscpu >/dev/null 2>&1; then
  lscpu | grep -E 'Architecture:|CPU\(s\):|Model name:|Thread\(s\) per core:|Core\(s\) per socket:' || true
else
  getconf _NPROCESSORS_ONLN || true
fi
echo '=== MEMORY ==='
free -h || true
echo '=== ROOT DISK ==='
df -h . || true
echo '=== SYSTEM PRESSURE ==='
uptime || true
echo '=== APP / HOST STATUS ==='
systemctl is-active games-for-children.service 2>/dev/null || true
curl --silent --show-error --max-time 3 http://127.0.0.1:3100/api/health || true
printf '\n'
curl --silent --show-error --max-time 3 http://127.0.0.1:4173/__health || true
printf '\n'
echo '=== TOP MEMORY USERS (NO COMMAND ARGUMENTS) ==='
ps -eo comm,%cpu,%mem,rss --sort=-rss | head -n 12 || true
echo '=== CACHED FAMILY WORLD SIZE (NO CONTENTS) ==='
if test -d data/opuscraft/profile-v2; then du -sh data/opuscraft/profile-v2 || true; fi
echo 'Diagnostics complete. No user data was modified.'
