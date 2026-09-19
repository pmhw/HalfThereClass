#!/usr/bin/env bash
# HalfThereClass - Ubuntu 22.04 一键安装 / 开机自启
#
# 海外 / 有 GitHub 直连：
#   curl -fsSL https://raw.githubusercontent.com/pmhw/HalfThereClass/main/scripts/remote-install.sh | sudo bash
#
# 国内推荐（走代理镜像，避免卡住无输出）：
#   curl -fsSL https://ghfast.top/https://raw.githubusercontent.com/pmhw/HalfThereClass/main/scripts/remote-install.sh | sudo CN_MIRROR=1 bash
#   或：
#   curl -fsSL https://cdn.jsdelivr.net/gh/pmhw/HalfThereClass@main/scripts/remote-install.sh | sudo CN_MIRROR=1 bash
#
# 可选环境变量：
#   PORT=3000
#   INSTALL_DIR=/opt/HalfThereClass
#   GITHUB_TOKEN=xxx   # 私有仓库下载 Release 时需要
#   TAG=v1.0.1         # 指定版本，默认最新
#   APP_USER=halfthere
#   CN_MIRROR=1        # 启用国内镜像（GitHub 代理 + npm 淘宝源）
#   GITHUB_PROXY=https://ghfast.top/   # 自定义 GitHub 代理前缀
set -euo pipefail

REPO="${GITHUB_REPO:-pmhw/HalfThereClass}"
INSTALL_DIR="${INSTALL_DIR:-/opt/HalfThereClass}"
PORT="${PORT:-3000}"
SERVICE_NAME="${SERVICE_NAME:-halfthereclass}"
NODE_MAJOR="${NODE_MAJOR:-20}"
APP_USER="${APP_USER:-halfthere}"
VERSION_RESOLVED=""
CN_MIRROR="${CN_MIRROR:-0}"
GITHUB_PROXY="${GITHUB_PROXY:-https://ghfast.top/}"
# curl：连接超时 + 总超时，避免国内直连 GitHub 无限挂起「没反应」
CURL_CONN="${CURL_CONNECT_TIMEOUT:-15}"
CURL_MAX="${CURL_MAX_TIME:-300}"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
step() { printf '\n\033[36m==> %s\033[0m\n' "$*"; }

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    red "请使用 root 执行，例如：curl -fsSL ... | sudo bash"
    exit 1
  fi
}

detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "${ID:-unknown} ${VERSION_ID:-}"
  else
    echo "unknown"
  fi
}

# 给 GitHub / raw / release URL 套代理（已是代理地址则不重复套）
proxy_url() {
  local url="$1"
  if [[ "${CN_MIRROR}" != "1" && "${CN_MIRROR}" != "true" && "${CN_MIRROR}" != "yes" ]]; then
    printf '%s' "${url}"
    return
  fi
  case "${url}" in
    "${GITHUB_PROXY}"*) printf '%s' "${url}" ;;
    http://*|https://*)
      # 保证代理前缀以 / 结尾
      local p="${GITHUB_PROXY}"
      [[ "${p}" == */ ]] || p="${p}/"
      printf '%s%s' "${p}" "${url}"
      ;;
    *) printf '%s' "${url}" ;;
  esac
}

curl_get() {
  # 用法: curl_get [额外 curl 参数...] URL
  local -a opts=(-fL --connect-timeout "${CURL_CONN}" --max-time "${CURL_MAX}" --retry 3 --retry-delay 2)
  opts+=("$@")
  curl "${opts[@]}"
}

install_base() {
  step "安装系统依赖（apt）..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl tar gzip xz-utils build-essential python3
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [[ "${major}" -ge 18 ]]; then
      green "已检测到 Node.js $(node -v)，跳过安装"
      return
    fi
  fi

  if [[ "${CN_MIRROR}" == "1" || "${CN_MIRROR}" == "true" || "${CN_MIRROR}" == "yes" ]]; then
    step "安装 Node.js ${NODE_MAJOR}.x（npmmirror 二进制，国内加速）..."
    local arch uname_m node_arch ver tarball url
    uname_m="$(uname -m)"
    case "${uname_m}" in
      x86_64|amd64) node_arch="x64" ;;
      aarch64|arm64) node_arch="arm64" ;;
      *)
        red "暂不支持的架构: ${uname_m}，请先手动安装 Node.js ${NODE_MAJOR}+"
        exit 1
        ;;
    esac
    # 取该大版本最新 LTS 目录名
    ver="$(curl_get -s "https://npmmirror.com/mirrors/node/index.json" | python3 -c "
import json,sys
maj=int('${NODE_MAJOR}')
data=json.load(sys.stdin)
for row in data:
    v=(row.get('version') or '').lstrip('v')
    parts=v.split('.')
    if len(parts)>=1 and parts[0].isdigit() and int(parts[0])==maj:
        print(row['version'].lstrip('v'))
        break
else:
    raise SystemExit('node version not found')
")"
    tarball="node-v${ver}-linux-${node_arch}.tar.xz"
    url="https://npmmirror.com/mirrors/node/v${ver}/${tarball}"
    yellow "下载 ${url}"
    local tmp
    tmp="$(mktemp -d /tmp/node-install.XXXXXX)"
    curl_get -o "${tmp}/${tarball}" "${url}"
    tar -xJf "${tmp}/${tarball}" -C /usr/local --strip-components=1
    rm -rf "${tmp}"
    hash -r
    green "Node.js $(node -v) / npm $(npm -v)"
    npm config set registry https://registry.npmmirror.com
    return
  fi

  step "安装 Node.js ${NODE_MAJOR}.x（NodeSource）..."
  yellow "若长时间无输出，多半是访问 deb.nodesource.com 受阻，请改用：CN_MIRROR=1"
  curl_get "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
  green "Node.js $(node -v) / npm $(npm -v)"
}

ensure_user() {
  if ! id -u "${APP_USER}" >/dev/null 2>&1; then
    useradd --system --home "${INSTALL_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
  fi
}

github_api() {
  local url="$1"
  local proxied
  proxied="$(proxy_url "${url}")"
  yellow "请求: ${proxied}"
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl_get -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" -H "User-Agent: HalfThereClass-Installer" "${proxied}"
  else
    curl_get -H "Accept: application/vnd.github+json" -H "User-Agent: HalfThereClass-Installer" "${proxied}"
  fi
}

download_release() {
  local tmp="$1"
  local api="https://api.github.com/repos/${REPO}/releases/latest"
  if [[ -n "${TAG:-}" ]]; then
    api="https://api.github.com/repos/${REPO}/releases/tags/${TAG}"
  fi
  step "获取 GitHub Release 元数据..."
  local json meta asset_url asset_name
  if ! json="$(github_api "${api}")"; then
    red "无法访问 GitHub API。国内请加 CN_MIRROR=1，或检查网络/代理。"
    exit 1
  fi
  meta="$(printf '%s' "${json}" | python3 -c '
import json,sys
data=json.load(sys.stdin)
assets=data.get("assets") or []
pick=None
for a in assets:
    name=a.get("name") or ""
    if "ubuntu22" in name and name.endswith(".tar.gz"):
        pick=a
        break
if not pick:
    for a in assets:
        if (a.get("name") or "").endswith(".tar.gz"):
            pick=a
            break
if not pick:
    raise SystemExit("release asset not found")
print(pick["browser_download_url"])
print(pick["name"])
print((data.get("tag_name") or "latest").lstrip("v"))
')"
  asset_url="$(printf '%s\n' "${meta}" | sed -n '1p')"
  asset_name="$(printf '%s\n' "${meta}" | sed -n '2p')"
  VERSION_RESOLVED="$(printf '%s\n' "${meta}" | sed -n '3p')"
  asset_url="$(proxy_url "${asset_url}")"
  step "下载发布包 ${asset_name} (v${VERSION_RESOLVED}) ..."
  yellow "地址: ${asset_url}"
  ARCHIVE_PATH="${tmp}/${asset_name}"
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl_get -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/octet-stream" \
      -H "User-Agent: HalfThereClass-Installer" -o "${ARCHIVE_PATH}" "${asset_url}"
  else
    curl_get -H "User-Agent: HalfThereClass-Installer" -o "${ARCHIVE_PATH}" "${asset_url}"
  fi
  green "下载完成 ($(du -h "${ARCHIVE_PATH}" | awk '{print $1}'))"
}

preserve_runtime() {
  local keep="/tmp/halfthere-keep-$$"
  mkdir -p "${keep}"
  if [[ -f "${INSTALL_DIR}/backend/.env" ]]; then
    cp -a "${INSTALL_DIR}/backend/.env" "${keep}/.env"
  fi
  if [[ -f "${INSTALL_DIR}/backend/prisma/dev.db" ]]; then
    cp -a "${INSTALL_DIR}/backend/prisma/dev.db" "${keep}/dev.db"
  fi
  if [[ -d "${INSTALL_DIR}/backend/uploads" ]]; then
    cp -a "${INSTALL_DIR}/backend/uploads" "${keep}/uploads"
  fi
  KEEP_DIR="${keep}"
}

restore_runtime() {
  mkdir -p "${INSTALL_DIR}/backend/prisma"
  if [[ -f "${KEEP_DIR}/.env" ]]; then
    cp -a "${KEEP_DIR}/.env" "${INSTALL_DIR}/backend/.env"
  fi
  if [[ -f "${KEEP_DIR}/dev.db" ]]; then
    cp -a "${KEEP_DIR}/dev.db" "${INSTALL_DIR}/backend/prisma/dev.db"
  fi
  if [[ -d "${KEEP_DIR}/uploads" ]]; then
    rm -rf "${INSTALL_DIR}/backend/uploads"
    cp -a "${KEEP_DIR}/uploads" "${INSTALL_DIR}/backend/uploads"
  fi
}

extract_package() {
  local tmp="$1"
  step "解压发布包..."
  mkdir -p "${tmp}/extract"
  tar -xzf "${ARCHIVE_PATH}" -C "${tmp}/extract"
  local pkg
  pkg="$(find "${tmp}/extract" -maxdepth 1 -type d -name 'HalfThereClass-v*' | head -1)"
  if [[ -z "${pkg}" ]]; then
    pkg="$(find "${tmp}/extract" -maxdepth 1 -mindepth 1 -type d | head -1)"
  fi
  if [[ -z "${pkg}" || ! -f "${pkg}/VERSION" ]]; then
    red "发布包结构不正确"
    exit 1
  fi
  preserve_runtime
  rm -rf "${INSTALL_DIR}"
  mkdir -p "$(dirname "${INSTALL_DIR}")"
  mv "${pkg}" "${INSTALL_DIR}"
  restore_runtime
  rm -rf "${KEEP_DIR:-}"
}

setup_app() {
  step "安装 npm 依赖并初始化数据库..."
  cd "${INSTALL_DIR}/backend"
  if [[ ! -f .env ]]; then
    cp .env.example .env
    if grep -q '^PORT=' .env; then
      sed -i "s/^PORT=.*/PORT=${PORT}/" .env
    else
      echo "PORT=${PORT}" >> .env
    fi
    if grep -q '^NODE_ENV=' .env; then
      sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' .env
    else
      echo "NODE_ENV=production" >> .env
    fi
    if ! grep -q '^GITHUB_REPO=' .env; then
      echo "GITHUB_REPO=${REPO}" >> .env
    fi
  else
    if grep -q '^PORT=' .env; then
      sed -i "s/^PORT=.*/PORT=${PORT}/" .env
    fi
  fi

  if [[ "${CN_MIRROR}" == "1" || "${CN_MIRROR}" == "true" || "${CN_MIRROR}" == "yes" ]]; then
    npm config set registry https://registry.npmmirror.com
    yellow "npm registry → https://registry.npmmirror.com"
  fi

  npm ci --omit=dev
  npx prisma generate
  if [[ ! -f prisma/dev.db && -f prisma/init.db ]]; then
    cp prisma/init.db prisma/dev.db
    green "已用 init.db 初始化运行库"
  fi
  npx prisma migrate deploy || true
  chmod +x "${INSTALL_DIR}/start.sh" "${INSTALL_DIR}/install.sh" 2>/dev/null || true
  mkdir -p "${INSTALL_DIR}/backend/uploads/backups" "${INSTALL_DIR}/backend/uploads/updates" "${INSTALL_DIR}/backend/uploads/certs" "${INSTALL_DIR}/backend/uploads/signs" "${INSTALL_DIR}/backend/uploads/avatars"
}

write_systemd() {
  step "写入 systemd 并开机自启..."
  local node_bin
  node_bin="$(command -v node)"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=HalfThereClass API + Admin
Documentation=https://github.com/${REPO}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${INSTALL_DIR}/backend
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
EnvironmentFile=-${INSTALL_DIR}/backend/.env
ExecStart=${node_bin} --enable-source-maps ${INSTALL_DIR}/backend/dist/src/main.js
ExecStartPre=/bin/bash -lc 'cd ${INSTALL_DIR}/backend && if [ ! -f prisma/dev.db ] && [ -f prisma/init.db ]; then cp prisma/init.db prisma/dev.db; fi'
ExecStartPre=/bin/bash -lc 'cd ${INSTALL_DIR}/backend && npx prisma migrate deploy'
Restart=always
RestartSec=3
KillMode=mixed
TimeoutStopSec=20
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

  cat > "${INSTALL_DIR}/start.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
ROOT="\$(cd "\$(dirname "\$0")" && pwd)"
cd "\$ROOT/backend"
export NODE_ENV=production
export PORT="\${PORT:-${PORT}}"
if [[ ! -f .env ]]; then
  echo "缺少 backend/.env"
  exit 1
fi
if [[ ! -f prisma/dev.db && -f prisma/init.db ]]; then
  cp prisma/init.db prisma/dev.db
fi
npx prisma migrate deploy
npx prisma generate
exec ${node_bin} --enable-source-maps dist/src/main.js
EOF
  chmod +x "${INSTALL_DIR}/start.sh"

  chown -R "${APP_USER}:${APP_USER}" "${INSTALL_DIR}"
  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"
  systemctl restart "${SERVICE_NAME}"
}

open_firewall() {
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi 'Status: active'; then
    ufw allow "${PORT}/tcp" || true
    yellow "已尝试放行防火墙端口 ${PORT}/tcp"
  fi
}

print_done() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  ip="${ip:-服务器IP}"
  echo
  green "========================================"
  green " HalfThereClass 安装完成"
  green "========================================"
  echo " 版本:   v${VERSION_RESOLVED:-unknown}"
  echo " 目录:   ${INSTALL_DIR}"
  echo " 服务:   ${SERVICE_NAME}"
  echo " 后台:   http://${ip}:${PORT}/"
  echo " 接口:   http://${ip}:${PORT}/api"
  echo " 文档:   http://${ip}:${PORT}/api/docs"
  echo
  echo " 常用命令:"
  echo "   sudo systemctl status ${SERVICE_NAME}"
  echo "   sudo systemctl restart ${SERVICE_NAME}"
  echo "   sudo journalctl -u ${SERVICE_NAME} -f"
  echo "   sudo nano ${INSTALL_DIR}/backend/.env"
  echo
  yellow "请尽快修改 ${INSTALL_DIR}/backend/.env 中的管理员密码、JWT、微信等配置，然后执行："
  echo "   sudo systemctl restart ${SERVICE_NAME}"
  green "已设置开机自启。"
}

main() {
  need_root
  yellow "系统: $(detect_os)"
  if [[ "${CN_MIRROR}" == "1" || "${CN_MIRROR}" == "true" || "${CN_MIRROR}" == "yes" ]]; then
    green "已启用国内镜像 CN_MIRROR=1（代理: ${GITHUB_PROXY}）"
  else
    yellow "未启用 CN_MIRROR。若长时间无输出，请 Ctrl+C 后用国内命令重试（见脚本头部注释）。"
  fi
  install_base
  install_node
  ensure_user
  local tmp
  tmp="$(mktemp -d /tmp/halfthere-install.XXXXXX)"
  trap 'rm -rf "'"${tmp}"'"' EXIT
  download_release "${tmp}"
  extract_package "${tmp}"
  setup_app
  write_systemd
  open_firewall
  sleep 2
  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    green "服务已启动"
  else
    red "服务启动失败，请查看：sudo journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
    systemctl --no-pager --full status "${SERVICE_NAME}" || true
    exit 1
  fi
  print_done
}

main "$@"
