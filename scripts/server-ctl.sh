#!/usr/bin/env bash
# 服务器快捷运维
# 用法：
#   bash scripts/server-ctl.sh status|start|stop|restart|logs|env
set -euo pipefail
SERVICE_NAME="${SERVICE_NAME:-halfthereclass}"
INSTALL_DIR="${INSTALL_DIR:-/opt/HalfThereClass}"
cmd="${1:-status}"

case "${cmd}" in
  status) systemctl --no-pager --full status "${SERVICE_NAME}" ;;
  start) systemctl start "${SERVICE_NAME}" && systemctl status "${SERVICE_NAME}" --no-pager ;;
  stop) systemctl stop "${SERVICE_NAME}" ;;
  restart) systemctl restart "${SERVICE_NAME}" && systemctl status "${SERVICE_NAME}" --no-pager ;;
  enable) systemctl enable --now "${SERVICE_NAME}" ;;
  logs) journalctl -u "${SERVICE_NAME}" -f ;;
  env) ${EDITOR:-nano} "${INSTALL_DIR}/backend/.env" ;;
  url)
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    port="$(grep -E '^PORT=' "${INSTALL_DIR}/backend/.env" 2>/dev/null | cut -d= -f2 || echo 3000)"
    echo "http://${ip:-127.0.0.1}:${port}/"
    ;;
  *)
    echo "用法: $0 {status|start|stop|restart|enable|logs|env|url}"
    exit 1
    ;;
esac
