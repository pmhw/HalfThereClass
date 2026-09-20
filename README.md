# 半堂课（HalfThereClass）

基于 **NestJS + Vue 管理后台 + 微信小程序** 的教师课程平台。

> 每半堂课，都有新收获

## Ubuntu 22.04 远程一键安装（开机自启）

### 国内服务器（推荐）

直连 GitHub / NodeSource / npm 常会**长时间无输出**，请用镜像：

```bash
curl -fsSL https://ghfast.top/https://raw.githubusercontent.com/pmhw/HalfThereClass/main/scripts/remote-install.sh | sudo CN_MIRROR=1 bash
```

备用拉脚本方式（jsDelivr）：

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/pmhw/HalfThereClass@main/scripts/remote-install.sh | sudo CN_MIRROR=1 bash
```

### 海外 / 能直连 GitHub

```bash
curl -fsSL https://raw.githubusercontent.com/pmhw/HalfThereClass/main/scripts/remote-install.sh | sudo bash
```

指定端口 / 版本（推荐带 `TAG`，不走 GitHub API，避免国内 403）：

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/pmhw/HalfThereClass@main/scripts/remote-install.sh | sudo CN_MIRROR=1 PORT=10920 bash
curl -fsSL https://cdn.jsdelivr.net/gh/pmhw/HalfThereClass@main/scripts/remote-install.sh | sudo CN_MIRROR=1 TAG=v1.0.1 bash
```

安装时如果机器上有签名过期的第三方 apt 源（常见是 MySQL `EXPKEYSIG`），脚本会在 `apt update` 之前临时移开 `/etc/apt/sources.list.d`，装完依赖后自动恢复。若日志里没有「已临时移开」，说明镜像缓存了旧脚本，请改用 jsDelivr 并加时间戳：

```bash
curl -fsSL "https://cdn.jsdelivr.net/gh/pmhw/HalfThereClass@main/scripts/remote-install.sh?$(date +%s)" | sudo CN_MIRROR=1 PORT=10920 bash
```

安装完成后：

- 自动安装 Node.js 20
- 程序目录：`/opt/HalfThereClass`
- systemd 服务：`halfthereclass`（已开机自启）
- 默认访问：`http://服务器IP:3000/`

常用命令：

```bash
sudo systemctl status halfthereclass
sudo systemctl restart halfthereclass
sudo journalctl -u halfthereclass -f
sudo nano /opt/HalfThereClass/backend/.env
```

更完整的部署说明见 [DEPLOY.md](./DEPLOY.md)。

## 项目结构

```
HalfThereClass/
├── admin/             # Vue 管理后台
├── backend/           # NestJS 接口（SQLite / Prisma）
├── miniprogram/       # 微信小程序教师端
├── scripts/           # 打包发布、远程安装脚本
└── DEPLOY.md          # 服务器部署文档
```

## 功能概览

| 模块 | 说明 |
|------|------|
| 微信登录 / 认证 | 教师认证、合同签订、无犯罪证明按学期更新 |
| 课表 / 授课 | 节假日、抢课、签到、调课 |
| 管理后台 | 课程、学期排课、教师审核、费用、数据同步 |
| 发布更新 | Ubuntu 打包、GitHub Release、后台一键更新重启 |

## 技术栈

- **后端**: NestJS 10、Prisma 5、SQLite
- **管理后台**: Vue 3、Vite
- **小程序**: 微信原生
- **认证**: JWT + 微信登录

## 本地开发

### 后端

```bash
cd backend
npm install
cp .env.example .env
npx prisma migrate deploy
npm run start:dev
```

接口文档：`http://localhost:3000/api/docs`

### 管理后台

```bash
cd admin
npm install
npm run dev
```

默认：`http://localhost:5173/`（账号见 `.env` 中 `ADMIN_USER` / `ADMIN_PASSWORD`）

### 小程序

1. 用微信开发者工具打开 `miniprogram`
2. 修改 `config/index.js` 的 `baseUrl`
3. 编译预览

## 打包发布

```bash
# 只打本地 Ubuntu 包
npm run pack

# 升版本 + 推送 + 发布 GitHub Release
export GITHUB_TOKEN=你的token
npm run pack:publish
```

## API 约定

- 前缀：`/api`
- 响应：`{ "code": 0, "message": "success", "data": {} }`
- 鉴权：`Authorization: Bearer <token>`

## License

MIT
