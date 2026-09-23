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
#   TAG=v1.0.1         # 指定版本（推荐；不走 API）
#   RELEASE_URL=...    # 直接指定包 URL 或本地路径式 http 地址
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

red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*" >&2; }
yellow() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
step() { printf '\n\033[36m==> %s\033[0m\n' "$*" >&2; }

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

# Node 装到 /usr/local 后，部分环境找不到 npx；统一解析并兜底 npm exec
NODE_BIN=""
NPM_BIN=""
NPX_BIN=""
ensure_node_bins() {
  export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:${PATH:-}"
  hash -r 2>/dev/null || true
  NODE_BIN="$(command -v node || true)"
  NPM_BIN="$(command -v npm || true)"
  if [[ -z "${NODE_BIN}" || -z "${NPM_BIN}" ]]; then
    red "未找到 node/npm，请确认 Node.js 已安装"
    exit 1
  fi
  local npm_dir
  npm_dir="$(dirname "${NPM_BIN}")"
  if [[ -x "${npm_dir}/npx" ]]; then
    NPX_BIN="${npm_dir}/npx"
  elif command -v npx >/dev/null 2>&1; then
    NPX_BIN="$(command -v npx)"
  else
    NPX_BIN=""
  fi
  green "Node: ${NODE_BIN} ($(node -v))  npm: ${NPM_BIN} ($(npm -v))  npx: ${NPX_BIN:-npm exec}"
}

run_npx() {
  ensure_node_bins
  if [[ -n "${NPX_BIN}" ]]; then
    "${NPX_BIN}" "$@"
  else
    "${NPM_BIN}" exec -- "$@"
  fi
}

ensure_env_kv() {
  local file="$1" key="$2" val="$3"
  if grep -q "^${key}=" "${file}" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "${file}"
  else
    echo "${key}=${val}" >> "${file}"
  fi
}

restore_apt_sources() {
  if [[ -n "${APT_LIST_BAK:-}" && -f "${APT_LIST_BAK}" ]]; then
    cp -a "${APT_LIST_BAK}" /etc/apt/sources.list
    rm -f "${APT_LIST_BAK}"
    APT_LIST_BAK=""
  fi
  if [[ -n "${APT_ASIDE:-}" && -d "${APT_ASIDE}" ]]; then
    mkdir -p /etc/apt/sources.list.d
    shopt -s nullglob
    mv "${APT_ASIDE}"/* /etc/apt/sources.list.d/ 2>/dev/null || true
    shopt -u nullglob
    rm -rf "${APT_ASIDE}"
    APT_ASIDE=""
  fi
}

install_base() {
  step "安装系统依赖（apt）..."
  export DEBIAN_FRONTEND=noninteractive
  APT_ASIDE=""
  APT_LIST_BAK=""
  # 先挪开第三方源。MySQL 等过期密钥会让 apt update 直接以非 0 退出，
  # 且 curl | bash 时 apt 还可能读走剩余脚本。这里在第一次 update 之前处理。
  shopt -s nullglob
  local f third=()
  for f in /etc/apt/sources.list.d/*; do
    third+=("${f}")
  done
  shopt -u nullglob
  if [[ ${#third[@]} -gt 0 ]]; then
    APT_ASIDE="$(mktemp -d /tmp/apt-aside.XXXXXX)"
    for f in "${third[@]}"; do
      mv "${f}" "${APT_ASIDE}/"
    done
    yellow "已临时移开 ${#third[@]} 个第三方 apt 源（含可能过期的 MySQL 源），装完依赖会恢复。"
    trap restore_apt_sources EXIT
  fi
  if [[ -f /etc/apt/sources.list ]] && grep -q 'repo.mysql.com' /etc/apt/sources.list; then
    APT_LIST_BAK="$(mktemp /tmp/sources.list.XXXXXX)"
    cp -a /etc/apt/sources.list "${APT_LIST_BAK}"
    sed -i '/repo.mysql.com/s/^/# halfthere-disabled /' /etc/apt/sources.list
    yellow "已临时注释 sources.list 中的 repo.mysql.com。"
  fi
  apt-get update -y < /dev/null
  apt-get install -y ca-certificates curl tar gzip xz-utils build-essential python3 < /dev/null
  restore_apt_sources
  trap - EXIT
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [[ "${major}" -ge 18 ]]; then
      green "已检测到 Node.js $(node -v)，跳过安装"
      ensure_node_bins
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
    ensure_node_bins
    npm config set registry https://registry.npmmirror.com
    return
  fi

  step "安装 Node.js ${NODE_MAJOR}.x（NodeSource）..."
  yellow "若长时间无输出，多半是访问 deb.nodesource.com 受阻，请改用：CN_MIRROR=1"
  curl_get "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
  ensure_node_bins
}

ensure_user() {
  if ! id -u "${APP_USER}" >/dev/null 2>&1; then
    useradd --system --home "${INSTALL_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
  fi
}

# 不依赖 api.github.com（国内代理常对 API 返回 403）
resolve_version() {
  if [[ -n "${TAG:-}" ]]; then
    printf '%s' "${TAG#v}"
    return
  fi
  local ver="" url
  local -a version_urls=(
    "https://cdn.jsdelivr.net/gh/${REPO}@main/VERSION"
    "https://cdn.jsdelivr.net/gh/${REPO}/VERSION"
    "https://raw.gitmirror.com/${REPO}/main/VERSION"
    "https://ghfast.top/https://raw.githubusercontent.com/${REPO}/main/VERSION"
    "https://mirror.ghproxy.com/https://raw.githubusercontent.com/${REPO}/main/VERSION"
    "https://raw.githubusercontent.com/${REPO}/main/VERSION"
  )
  for url in "${version_urls[@]}"; do
    yellow "读取版本: ${url}"
    if ver="$(curl_get -sS "${url}" 2>/dev/null | tr -d '\r' | awk 'NF{line=$0} END{print line}')"; then
      ver="${ver#v}"
      ver="${ver%%$'\n'*}"
      if [[ "${ver}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        printf '%s' "${ver}"
        return
      fi
    fi
  done
  return 1
}

# 生成候选下载地址（直连 + 多个国内代理）
release_download_urls() {
  local ver="$1"
  local asset="HalfThereClass-v${ver}-ubuntu22.tar.gz"
  local base="https://github.com/${REPO}/releases/download/v${ver}/${asset}"
  local p
  # 用户自定义代理优先
  if [[ -n "${GITHUB_PROXY:-}" ]]; then
    p="${GITHUB_PROXY}"
    [[ "${p}" == */ ]] || p="${p}/"
    echo "${p}${base}"
  fi
  echo "https://ghfast.top/${base}"
  echo "https://mirror.ghproxy.com/${base}"
  echo "https://ghproxy.net/${base}"
  echo "https://wget.la/${base}"
  echo "https://gitdl.cn/${base}"
  echo "${base}"
}

try_download() {
  local out="$1"
  shift
  local url
  for url in "$@"; do
    [[ -n "${url}" ]] || continue
    yellow "尝试下载: ${url}"
    rm -f "${out}"
    if curl_get -H "User-Agent: HalfThereClass-Installer" -o "${out}" "${url}"; then
      # 拒绝明显失败的小文件（403 HTML / 代理错误页）
      local size
      size="$(wc -c < "${out}" | tr -d ' ')"
      if [[ "${size}" -lt 100000 ]]; then
        yellow "文件过小 (${size} bytes)，视为失败，换源..."
        rm -f "${out}"
        continue
      fi
      # tar.gz 应为 gzip；代理常返回 403 HTML
      if ! python3 -c '
import sys
with open(sys.argv[1],"rb") as f: b=f.read(2)
sys.exit(0 if b==b"\x1f\x8b" else 1)
' "${out}" 2>/dev/null; then
        yellow "内容不是 gzip 包，换源..."
        rm -f "${out}"
        continue
      fi
      green "下载成功: ${url}"
      return 0
    fi
    yellow "失败，换下一个镜像..."
  done
  return 1
}

download_release() {
  local tmp="$1"

  # 手动指定完整包 URL / 本地路径时跳过探测
  if [[ -n "${RELEASE_URL:-}" ]]; then
    step "使用 RELEASE_URL 下载..."
    local name
    name="$(basename "${RELEASE_URL%%\?*}")"
    ARCHIVE_PATH="${tmp}/${name}"
    if [[ -f "${RELEASE_URL}" ]]; then
      cp -a "${RELEASE_URL}" "${ARCHIVE_PATH}"
      green "已使用本地文件: ${RELEASE_URL}"
    elif ! try_download "${ARCHIVE_PATH}" "${RELEASE_URL}" "$(proxy_url "${RELEASE_URL}")"; then
      red "RELEASE_URL 下载失败"
      exit 1
    fi
    VERSION_RESOLVED="$(printf '%s' "${name}" | sed -n 's/.*-v\([0-9.]*\)-ubuntu22.*/\1/p')"
    VERSION_RESOLVED="${VERSION_RESOLVED:-unknown}"
    green "下载完成 ($(du -h "${ARCHIVE_PATH}" | awk '{print $1}'))"
    return
  fi

  step "解析发布版本（不走 GitHub API，避免国内 403）..."
  local ver
  if ! ver="$(resolve_version)"; then
    red "无法读取版本号。可手动指定：TAG=v1.0.1 或 RELEASE_URL=包地址"
    exit 1
  fi
  if [[ ! "${ver}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    red "解析到的版本号无效：${ver}"
    red "请改用：sudo CN_MIRROR=1 TAG=v1.0.1 bash ..."
    exit 1
  fi
  VERSION_RESOLVED="${ver}"
  local asset_name="HalfThereClass-v${ver}-ubuntu22.tar.gz"
  ARCHIVE_PATH="${tmp}/${asset_name}"

  step "下载发布包 ${asset_name} ..."
  # shellcheck disable=SC2207
  local -a urls
  mapfile -t urls < <(release_download_urls "${ver}" | awk 'NF && !seen[$0]++')
  if ! try_download "${ARCHIVE_PATH}" "${urls[@]}"; then
    red "所有镜像均下载失败。"
    echo "可手动下载后上传到服务器，再执行："
    echo "  sudo RELEASE_URL=/path/or/https://.../HalfThereClass-v${ver}-ubuntu22.tar.gz bash remote-install.sh"
    echo "或指定版本重试： sudo CN_MIRROR=1 TAG=v${ver} bash ..."
    exit 1
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
  ensure_node_bins
  cd "${INSTALL_DIR}/backend"
  local created_env=0
  if [[ ! -f .env ]]; then
    cp .env.example .env
    created_env=1
  fi
  # 已有 PORT 不覆盖，避免把线上 10920 等端口改回默认 3000
  if ! grep -q '^PORT=' .env 2>/dev/null; then
    ensure_env_kv .env PORT "${PORT}"
  fi
  ensure_env_kv .env NODE_ENV production
  ensure_env_kv .env GITHUB_REPO "${REPO}"

  # 强制生成强 JWT / 初始管理员密码，杜绝示例弱口令上线
  local jwt_now admin_pass_now
  jwt_now="$(grep '^JWT_SECRET=' .env 2>/dev/null | cut -d= -f2- || true)"
  if [[ -z "${jwt_now}" || "${jwt_now}" == *"CHANGE_ME"* || "${jwt_now}" == *"your-jwt"* || ${#jwt_now} -lt 32 ]]; then
    ensure_env_kv .env JWT_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
  fi
  admin_pass_now="$(grep '^ADMIN_PASSWORD=' .env 2>/dev/null | cut -d= -f2- || true)"
  if [[ "${created_env}" == "1" || -z "${admin_pass_now}" || "${admin_pass_now}" == "admin123" || "${admin_pass_now}" == *"CHANGE_ME"* || ${#admin_pass_now} -lt 10 ]]; then
    admin_pass_now="$(openssl rand -base64 18 | tr -d '\n=/+' | cut -c1-20)"
    ensure_env_kv .env ADMIN_USER admin
    ensure_env_kv .env ADMIN_PASSWORD "${admin_pass_now}"
    umask 077
    {
      echo "ADMIN_USER=admin"
      echo "ADMIN_PASSWORD=${admin_pass_now}"
      echo "请登录后台后立即修改密码，并删除本文件"
    } > "${INSTALL_DIR}/INITIAL_ADMIN.txt"
    chmod 600 "${INSTALL_DIR}/INITIAL_ADMIN.txt" || true
    yellow "已生成初始管理员密码，见 ${INSTALL_DIR}/INITIAL_ADMIN.txt"
  fi

  if [[ "${CN_MIRROR}" == "1" || "${CN_MIRROR}" == "true" || "${CN_MIRROR}" == "yes" ]]; then
    ensure_env_kv .env CN_MIRROR 1
    ensure_env_kv .env GITHUB_PROXY "${GITHUB_PROXY}"
    "${NPM_BIN}" config set registry https://registry.npmmirror.com
    yellow "npm registry → https://registry.npmmirror.com（后台在线更新也将走国内加速）"
  fi

  "${NPM_BIN}" ci --omit=dev
  run_npx prisma generate
  if [[ ! -f prisma/dev.db && -f prisma/init.db ]]; then
    cp prisma/init.db prisma/dev.db
    green "已用 init.db 初始化运行库"
  fi
  run_npx prisma migrate deploy || true
  chmod +x "${INSTALL_DIR}/start.sh" "${INSTALL_DIR}/install.sh" 2>/dev/null || true
  mkdir -p "${INSTALL_DIR}/backend/uploads/backups" "${INSTALL_DIR}/backend/uploads/updates" "${INSTALL_DIR}/backend/uploads/certs" "${INSTALL_DIR}/backend/uploads/signs" "${INSTALL_DIR}/backend/uploads/avatars"
}

write_systemd() {
  step "写入 systemd 并开机自启..."
  ensure_node_bins
  local node_bin npm_bin prisma_cmd
  node_bin="${NODE_BIN}"
  npm_bin="${NPM_BIN}"
  if [[ -n "${NPX_BIN}" ]]; then
    prisma_cmd="${NPX_BIN} prisma"
  else
    prisma_cmd="${npm_bin} exec -- prisma"
  fi
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
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
EnvironmentFile=-${INSTALL_DIR}/backend/.env
ExecStart=${node_bin} --enable-source-maps ${INSTALL_DIR}/backend/dist/src/main.js
ExecStartPre=/bin/bash -lc 'export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:\$PATH; cd ${INSTALL_DIR}/backend && if [ ! -f prisma/dev.db ] && [ -f prisma/init.db ]; then cp prisma/init.db prisma/dev.db; fi'
ExecStartPre=/bin/bash -lc 'export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:\$PATH; cd ${INSTALL_DIR}/backend && ${prisma_cmd} migrate deploy'
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
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:\$PATH"
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
${prisma_cmd} migrate deploy
${prisma_cmd} generate
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
  echo " 手机端: http://${ip}:${PORT}/m/"
  echo
  if [[ -f "${INSTALL_DIR}/INITIAL_ADMIN.txt" ]]; then
    yellow "初始管理员账号密码已写入："
    echo "   ${INSTALL_DIR}/INITIAL_ADMIN.txt"
    yellow "登录后请立即修改密码，并删除该文件。"
  fi
  echo " 常用命令:"
  echo "   sudo systemctl status ${SERVICE_NAME}"
  echo "   sudo systemctl restart ${SERVICE_NAME}"
  echo "   sudo journalctl -u ${SERVICE_NAME} -f"
  echo "   sudo nano ${INSTALL_DIR}/backend/.env"
  echo
  yellow "请确认 JWT_SECRET / 微信 / 支付等生产配置已设置，然后执行："
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
