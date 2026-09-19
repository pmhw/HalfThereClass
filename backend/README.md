# 半堂课 - 后端接口

基于 NestJS + Prisma + MySQL 的课程平台后端服务。

## 技术栈

- **框架**: NestJS 10
- **ORM**: Prisma 5
- **数据库**: MySQL
- **缓存**: Redis
- **认证**: JWT + 微信登录
- **支付**: 微信支付
- **对象存储**: 七牛云
- **API 文档**: Swagger

## 快速开始

```bash
# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env

# 配置数据库连接
# 修改 .env 中的 DATABASE_URL

# 生成数据库迁移
npm run prisma:migrate

# 启动开发服务器
npm run start:dev
```

## 项目结构

```
src/
├── common/              # 公共模块
│   ├── decorators/      # 自定义装饰器
│   ├── filters/         # 异常过滤器
│   ├── guards/          # 守卫
│   ├── interceptors/    # 拦截器
│   ├── pipes/           # 管道
│   ├── prisma/          # Prisma 服务
│   └── utils/           # 工具函数
├── config/              # 配置
├── modules/             # 业务模块
│   ├── admin/           # 管理后台
│   ├── auth/            # 认证模块
│   ├── category/        # 分类模块
│   ├── comment/         # 评论模块
│   ├── course/          # 课程模块
│   ├── lesson/          # 课时模块
│   ├── order/           # 订单模块
│   ├── payment/         # 支付模块
│   ├── upload/          # 上传模块
│   └── user/            # 用户模块
├── prisma/              # Prisma 配置
├── app.controller.ts
├── app.module.ts
├── app.service.ts
└── main.ts
```

## API 接口

启动后访问 `http://localhost:3000/api/docs` 查看 Swagger 文档。

### 主要模块

| 模块 | 接口前缀 | 说明 |
|------|---------|------|
| 认证 | `/api/auth` | 微信登录 |
| 用户 | `/api/user` | 用户信息、学习统计 |
| 课程 | `/api/courses` | 课程列表、详情、推荐、热门 |
| 课时 | `/api/lessons` | 课时详情、学习进度 |
| 订单 | `/api/orders` | 创建订单、订单列表 |
| 支付 | `/api/payment` | 微信支付、回调 |
| 评论 | `/api/comments` | 课程评论 |
| 分类 | `/api/categories` | 分类列表 |
| 上传 | `/api/upload` | 获取上传凭证 |
| 管理 | `/api/admin` | 后台管理接口 |

## 数据库设计

主要数据表：

- `users` - 用户表
- `categories` - 课程分类表
- `courses` - 课程表
- `lessons` - 课时表
- `user_courses` - 用户课程（购买记录）
- `lesson_progress` - 课时学习进度
- `orders` - 订单表
- `comments` - 评论表
- `banners` - 轮播图表
