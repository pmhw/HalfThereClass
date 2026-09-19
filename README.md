# 半堂课（HalfThereClass）

一个基于 **NestJS + 微信小程序** 的在线课程学习平台。

> 每半堂课，都有新收获 ✨

## 📁 项目结构

```
HalfThereClass/
├── backend/           # 后端接口服务（NestJS + Prisma + MySQL）
└── miniprogram/       # 前端微信小程序
```

## 🎯 功能模块

### 后端模块

| 模块 | 说明 |
|------|------|
| 认证 | 微信登录、JWT 鉴权 |
| 用户 | 用户信息、学习统计 |
| 课程 | 课程 CRUD、推荐、热门、分类筛选 |
| 课时 | 课时管理、学习进度记录 |
| 订单 | 订单创建、订单列表 |
| 支付 | 微信支付、支付回调 |
| 评论 | 课程评价、评分统计 |
| 分类 | 课程分类管理 |
| 上传 | 七牛云上传凭证 |
| 管理 | 后台管理数据统计 |

### 前端页面

| 页面 | 说明 |
|------|------|
| 首页 | 分类导航、推荐课程、热门课程 |
| 课程列表 | 分类筛选、排序、分页加载 |
| 课程详情 | 课程介绍、课时列表、评价、购买 |
| 学习页 | 视频播放、进度上报 |
| 搜索 | 关键词搜索、历史记录、热门搜索 |
| 我的 | 用户信息、学习数据、我的课程 |
| 个人资料 | 昵称、头像修改 |
| 订单 | 订单列表、状态筛选 |
| 评价 | 发表评价、上传图片 |
| 登录 | 微信一键登录 |

## 🛠️ 技术栈

### 后端

- **框架**: NestJS 10
- **ORM**: Prisma 5
- **数据库**: MySQL
- **缓存**: Redis
- **认证**: JWT + 微信 OAuth
- **支付**: 微信支付 v3
- **存储**: 七牛云 OSS
- **文档**: Swagger

### 前端

- **框架**: 微信小程序原生
- **UI**: 自定义组件
- **状态**: 简易 Store + App 全局
- **请求**: 封装 wx.request

## 🚀 快速开始

### 后端启动

```bash
cd backend

# 安装依赖
npm install

# 复制环境变量
cp .env.example .env
# 修改 .env 中的数据库、Redis、微信配置

# 数据库迁移
npm run prisma:migrate

# 启动开发服务器
npm run start:dev
```

访问 `http://localhost:3000/api/docs` 查看 API 文档。

### 小程序启动

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开微信开发者工具，导入 `miniprogram` 目录
3. 修改 `config/index.js` 中的 `baseUrl` 为你的后端地址
4. 点击"编译"即可预览

## 📊 数据库设计

核心数据表：

- `users` - 用户表
- `categories` - 课程分类表
- `courses` - 课程表
- `lessons` - 课时表
- `user_courses` - 用户课程（购买记录）
- `lesson_progress` - 课时学习进度
- `orders` - 订单表
- `comments` - 评论表
- `banners` - 轮播图表

详细字段见 `backend/prisma/schema.prisma`。

## 📝 API 接口规范

- 接口前缀: `/api`
- 响应格式:

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

- 鉴权方式: `Authorization: Bearer <token>`
- 状态码: `0` 成功，其他为错误码

## 📄 License

MIT
