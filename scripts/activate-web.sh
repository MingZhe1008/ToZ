#!/usr/bin/env bash
# Run on the existing ToZ Linux server after uploading a complete build:web output.
set -euo pipefail
release=$(realpath "${1:?release directory required}")
candidate=$(realpath "${2:?nginx candidate required}")
case "$release" in /opt/toz-web/releases/*) ;; *) echo 'Invalid release directory' >&2; exit 1;; esac
for file in index.html bootstrap.js runtime.js app.js sql-wasm.js sql-wasm.wasm; do test -s "$release/$file"; done
test -f "$candidate"
backup="/opt/toz-web/nginx-before-$(date +%Y%m%d%H%M%S).conf"
cp -p /etc/nginx/conf.d/toz-sync.conf "$backup"
previous=$(readlink /opt/toz-web/current || true)
rollback() {
    cp -p "$backup" /etc/nginx/conf.d/toz-sync.conf
    if [ -n "$previous" ]; then ln -sfn "$previous" /opt/toz-web/current; fi
    nginx -t && systemctl reload nginx
}
trap rollback ERR
chmod -R a+rX "$release"
ln -sfn "$release" /opt/toz-web/current-next
mv -Tf /opt/toz-web/current-next /opt/toz-web/current
install -m 644 "$candidate" /etc/nginx/conf.d/toz-sync.conf
nginx -t
systemctl reload nginx
curl -fsS https://82.157.65.130/health
probe=$(mktemp)
curl --retry 5 --retry-delay 1 --retry-all-errors -fsS https://82.157.65.130/toz/ -o "$probe"
grep -q 'web-starting' "$probe"
rm -f "$probe"
systemctl is-active toz-sync nginx
trap - ERR
echo "Web release active: $release; previous nginx: $backup"
