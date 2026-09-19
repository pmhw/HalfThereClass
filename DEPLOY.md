# HalfThereClass 1.0.0（Ubuntu 22）

## 一键打包并发布

在仓库根目录：

```bash
# 只打本地 Ubuntu 包（不升版本、不推送）
npm run pack

# 升 patch 版本 + 打包 + 推送 Git + 创建 GitHub Release
# 需要环境变量 GITHUB_TOKEN（Contents 读写权限）
set GITHUB_TOKEN=你的token
npm run pack:publish
```

产物在 `release/HalfThereClass-vX.Y.Z-ubuntu22.tar.gz`。

## 服务器安装

```bash
tar -xzf HalfThereClass-vX.Y.Z-ubuntu22.tar.gz
cd HalfThereClass-vX.Y.Z
bash install.sh
# 编辑 backend/.env
bash start.sh
```

访问 `http://服务器IP:3000/` 即管理后台，接口前缀 `/api`。

可选 systemd：把 `systemd/halfthereclass.service` 里的路径改成实际目录后启用。

## 数据库

- Git 只保留初始快照 `backend/prisma/init.db`
- 服务器运行时的 `backend/prisma/dev.db` 不进 Git
- 首次 `install.sh` 会在没有 `dev.db` 时从 `init.db` 复制一份
- 管理后台「系统设置 → 数据同步」可导出 / 导入 `.db`，用于本地和线上对齐；导入前会自动备份

## 后台版本提示

登录后台后，鼠标移到左上角「半堂课」Logo/标题，会弹出：

- 当前版本
- GitHub 上可更新的版本
- 「下载更新」按钮（下载 Ubuntu 部署包）
