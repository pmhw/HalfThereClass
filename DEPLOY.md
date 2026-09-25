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

这是服务器上已有的 MySQL apt 源，不是本项目依赖。脚本会在 `apt update` **之前**临时移开 `/etc/apt/sources.list.d`，用系统源装完依赖后再恢复，不会改你的源配置。新脚本应先打印：

```text
已临时移开 N 个第三方 apt 源（含可能过期的 MySQL 源），装完依赖会恢复。
```

若仍然直接停在 MySQL 的 `EXPKEYSIG`、且没有上面这句，说明拉到了旧脚本（镜像缓存）。请改用：

```bash
curl -fsSL "https://cdn.jsdelivr.net/gh/pmhw/HalfThereClass@main/scripts/remote-install.sh?$(date +%s)" | sudo CN_MIRROR=1 PORT=10920 bash
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

## 忘记后台密码如何重置

管理后台密码存在 SQLite（`backend/prisma/dev.db`）里，用 bcrypt 哈希存储。忘记后在**服务器上**重置即可（不要用弱口令；至少 10 位）。

```bash
# 1. 先停服务（可选，避免写入冲突）
sudo systemctl stop halfthereclass

# 2. 进入程序目录
cd /opt/HalfThereClass/backend

# 3. 设置新密码与账号（默认账号 admin）
export NEW_PASS='你的新强密码至少10位'
export ADMIN_USER=admin

# 4. 用运行用户执行重置（同时解开输错冻结）
sudo -u halfthere env NEW_PASS="$NEW_PASS" ADMIN_USER="$ADMIN_USER" node -e '
const {PrismaClient}=require("@prisma/client");
const bcrypt=require("bcryptjs");
const p=new PrismaClient();
(async()=>{
  const username=process.env.ADMIN_USER||"admin";
  const password=process.env.NEW_PASS||"";
  if(password.length<10) throw new Error("密码至少10位");
  const hash=await bcrypt.hash(password,12);
  const row=await p.adminAccount.findUnique({where:{username}});
  if(!row) throw new Error("账号不存在: "+username);
  await p.adminAccount.update({
    where:{id:row.id},
    data:{password:hash, failCount:0, lockedUntil:null, status:1},
  });
  console.log("已重置密码:", username);
  await p.$disconnect();
})().catch(async e=>{
  console.error(e.message||e);
  await p.$disconnect();
  process.exit(1);
});
'

# 5. 清掉环境变量里的明文密码，再启动
unset NEW_PASS
sudo systemctl start halfthereclass
sudo systemctl status halfthereclass --no-pager
```

说明：

- 若账号不是 `admin`，改 `ADMIN_USER` 即可
- 连续输错 5 次会冻结 15 分钟；上面脚本会把 `lockedUntil` 清空
- 重置后用新密码登录后台；旧登录态可能仍有效到 token 过期，不放心可改 `JWT_SECRET` 后重启（会让所有人重新登录）
- 首次安装若生成过 `INITIAL_ADMIN.txt`，也可先看该文件里的初始密码

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
