# HalfThereClass 服务器部署（Ubuntu 22.04）

## 远程一键安装（推荐）

在全新或已有的 Ubuntu 22.04 服务器上执行：

```bash
curl -fsSL https://raw.githubusercontent.com/pmhw/HalfThereClass/main/scripts/remote-install.sh | sudo bash
```

指定端口：

```bash
curl -fsSL https://raw.githubusercontent.com/pmhw/HalfThereClass/main/scripts/remote-install.sh | sudo PORT=8080 bash
```

指定版本：

```bash
curl -fsSL https://raw.githubusercontent.com/pmhw/HalfThereClass/main/scripts/remote-install.sh | sudo TAG=v1.0.1 bash
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

或把运维脚本拷到服务器后：

```bash
sudo bash /opt/HalfThereClass/../  # 仓库内
sudo bash scripts/server-ctl.sh status
sudo bash scripts/server-ctl.sh restart
sudo bash scripts/server-ctl.sh logs
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

- 自动检测 GitHub Release
- 一键更新并重启面板（保留数据库与 `.env`）
