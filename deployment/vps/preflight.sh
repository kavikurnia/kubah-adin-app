#!/usr/bin/env bash
set -euo pipefail
# Read-only inspection. No installations, restart, firewall or volume changes.
printf 'HOST\n'; hostname
printf 'OS\n'; cat /etc/os-release
printf 'KERNEL\n'; uname -srmo
printf 'CAPACITY\n'; nproc; free -h; df -hT / /var /srv
printf 'LISTENERS\n'; ss -lntup
printf 'SERVICES\n'; systemctl --no-pager --type=service --state=running
printf 'TOOLS\n'; command -v nginx apache2 caddy docker certbot git python3 || true
if command -v docker >/dev/null; then
  docker version; docker compose version || true
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
  docker volume ls
fi
printf 'WEB CONFIG NAMES\n'
find /etc/nginx/sites-enabled /etc/apache2/sites-enabled /etc/caddy -maxdepth 2 -type f -o -type l 2>/dev/null || true
printf 'FIREWALL\n'; if command -v ufw >/dev/null; then ufw status; fi
