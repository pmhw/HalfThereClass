# HalfThereClass 服务器部署（Ubuntu 22.04）

## 远程一键安装（推荐）

### 国内网络说明

安装过程会访问 **GitHub API / Release、NodeSource、npm**。国内直连经常表现为：执行后**长时间没反应、无报错**。  
请使用下方「国内」命令（`CN_MIRROR=1`：GitHub 走代理 + Node/npm 用 npmmirror）。

快速自检：

```bash
curl -I --connect-timeout 8 https://api.github.com
curl -I --connect-timeout 8 https://registry.npmjs.org
```

若卡住或超时，务必用国内安装命令。

### 国内服务器

```bash
curl -fsSL https://ghfast.top/https://raw.githubusercontent.com/pmhw/HalfThereClass/main/scripts/remote-install.sh | sudo CN_MIRROR=1 bash
```

备用（jsDelivr 拉脚本）：

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/pmhw/HalfThereClass@main/scripts/remote-install.sh | sudo CN_MIRROR=1 bash
```

### 海外 / 能直连 GitHub

```bash
curl -fsSL https://raw.githubusercontent.com/pmhw/HalfThereClass/main/scripts/remote-install.sh | sudo bash
```

指定端口 / 版本（`TAG` 可跳过版本探测；安装脚本**不再依赖** `api.github.com`，避免国内代理 403）：

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/pmhw/HalfThereClass@main/scripts/remote-install.sh | sudo CN_MIRROR=1 PORT=10920 bash
curl -fsSL https://cdn.jsdelivr.net/gh/pmhw/HalfThereClass@main/scripts/remote-install.sh | sudo CN_MIRROR=1 TAG=v1.0.1 bash
```

### 常见安装失败

**MySQL 源密钥过期**（`EXPKEYSIG` / `The repository is not signed`）

这是服务器上已有的 MySQL apt 源，不是本项目依赖。脚本会临时移开 `/etc/apt/sources.list.d`，用系统源装完 `curl` 等依赖后再恢复，不会改你的源配置。看到这段提示后继续等待即可：

```text
apt update 失败。常见原因是第三方源签名过期（例如 MySQL EXPKEYSIG）。
临时跳过 /etc/apt/sources.list.d 后继续，安装结束会恢复原配置。
```

**国内下载 Release 返回 403**

不要依赖 `api.github.com`。请带 `CN_MIRROR=1`，需要时再加 `TAG=v1.0.1`。脚本会依次尝试 ghfast、ghproxy 等镜像。

**`npx: command not found`**

Node 装在 `/usr/local` 时 PATH 里可能没有 `npx`。当前脚本会改用 `npm exec`。若是旧脚本中断的，重新执行上面的一键安装即可，已有 `.env` 和数据库会保留。

若镜像仍失败，可浏览器下载 Release 包后放到可访问 URL，再：

```bash
sudo CN_MIRROR=1 RELEASE_URL='https://你的地址/HalfThereClass-v1.0.1-ubuntu22.tar.gz' bash remote-install.sh
```

自定义 GitHub 代理前缀（可选）：

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/pmhw/HalfThereClass@main/scripts/remote-install.sh \
  | sudo CN_MIRROR=1 GITHUB_PROXY=https://ghfast.top/ bash
```

安装完成后会：

- 自动安装 Node.js 20
- 下载最新 Ubuntu 发布包到 `/opt/HalfThereClass`
- 初始化数据库（首次用 `init.db`）
- 注册 systemd 服务 `halfthereclass` 并**开机自启**
- 立即启动，默认端口 `3000`

访问：`http://服务器IP:3000/`

## 常用命令

```bash
sudo systemctl status halfthereclass
sudo systemctl restart halfthereclass
sudo journalctl -u halfthereclass -f
sudo nano /opt/HalfThereClass/backend/.env
```

仓库内运维脚本：

```bash
sudo bash scripts/server-ctl.sh status
sudo bash scripts/server-ctl.sh restart
sudo bash scripts/server-ctl.sh logs
sudo bash scripts/server-ctl.sh env
sudo bash scripts/server-ctl.sh url
```
## 本地打包发布

```bash
# 只打本地包
npm run pack

# 升版本 + 推送 + GitHub Release
export GITHUB_TOKEN=你的token
npm run pack:publish
```

产物：`release/HalfThereClass-vX.Y.Z-ubuntu22.tar.gz`

## 手动安装包

```bash
tar -xzf HalfThereClass-vX.Y.Z-ubuntu22.tar.gz
cd HalfThereClass-vX.Y.Z
bash install.sh
bash start.sh
```

## 数据库

- Git 只保留初始快照 `backend/prisma/init.db`
- 服务器运行库 `backend/prisma/dev.db` 不进 Git
- 一键安装会保留已有 `.env` / `dev.db` / `uploads`
- 管理后台「系统设置 → 数据同步」可导出 / 导入，方便本地与线上对齐

## 后台版本更新

登录后台后，鼠标移到左上角「半堂课」：

- 自动检测 GitHub Release（国内 API 失败时回退读 `VERSION`）
- 一键更新并重启面板（保留数据库与 `.env`）

国内服务器请在 `backend/.env` 配置（一键安装 `CN_MIRROR=1` 时会自动写入）：

```bash
CN_MIRROR=1
GITHUB_PROXY=https://ghfast.top/
```

然后 `sudo systemctl restart halfthereclass`。更新下载会走多个 GitHub 代理，`npm ci` 使用 npmmirror。
