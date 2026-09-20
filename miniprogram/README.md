# 半堂课 - 微信小程序

基于原生微信小程序开发的课程学习平台。

## 技术栈

- **框架**: 微信小程序原生
- **UI**: 自定义组件
- **状态管理**: 简易 Store + 全局 App
- **请求**: 封装 wx.request
- **存储**: wx.setStorage / getStorage

## 快速开始

### 开发环境

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开微信开发者工具，选择"导入项目"
3. 选择 `miniprogram` 目录，填写 AppID（测试可选择测试号）
4. 点击导入，即可开始开发

### 配置

修改 `config/index.js`。当前已指向线上：

```js
production: {
  baseUrl: 'https://t.wisonenerge.com/api',
  origin: 'https://t.wisonenerge.com',
  imgBaseUrl: 'https://t.wisonenerge.com',
},
```

微信公众平台还需把 `https://t.wisonenerge.com` 配进 request、uploadFile、downloadFile 合法域名。本地调试把文件末尾的 `env` 改回 `development`。

## 项目结构

```
miniprogram/
├── pages/                 # 页面
│   ├── index/             # 首页
│   ├── course-list/       # 课程列表
│   ├── course-detail/     # 课程详情
│   ├── study/             # 课程学习（播放页）
│   ├── search/            # 搜索页
│   ├── my/                # 我的
│   ├── profile/           # 个人资料
│   ├── order/             # 订单列表
│   ├── comment/           # 发表评价
│   └── login/             # 登录页
├── components/            # 公共组件
│   ├── course-card/       # 课程卡片
│   ├── lesson-item/       # 课时项
│   ├── empty/             # 空状态
│   ├── loading/           # 加载中
│   ├── price/             # 价格显示
│   ├── progress-bar/      # 进度条
│   └── tab-bar/           # 自定义 TabBar
├── services/              # API 服务层
│   ├── auth.js            # 认证相关
│   ├── course.js          # 课程相关
│   ├── lesson.js          # 课时相关
│   ├── user.js            # 用户相关
│   ├── order.js           # 订单相关
│   ├── payment.js         # 支付相关
│   ├── comment.js         # 评论相关
│   ├── category.js        # 分类相关
│   └── upload.js          # 上传相关
├── utils/                 # 工具函数
│   ├── request.js         # 网络请求封装
│   └── util.js            # 通用工具
├── store/                 # 状态管理
│   └── index.js
├── config/                # 配置文件
│   └── index.js
├── styles/                # 公共样式
├── images/                # 图片资源
├── app.js                 # 入口文件
├── app.json               # 全局配置
├── app.wxss               # 全局样式
└── project.config.json    # 项目配置
```

## 主要页面功能

| 页面 | 路径 | 功能说明 |
|------|------|---------|
| 首页 | `/pages/index/index` | 分类导航、推荐课程、热门课程 |
| 课程列表 | `/pages/course-list/course-list` | 分类筛选、排序、课程列表 |
| 课程详情 | `/pages/course-detail/course-detail` | 课程信息、课时列表、评价、购买 |
| 学习页 | `/pages/study/study` | 视频播放、学习进度记录 |
| 搜索 | `/pages/search/search` | 搜索历史、热门搜索、搜索结果 |
| 我的 | `/pages/my/my` | 用户信息、学习数据、我的课程、功能菜单 |
| 个人资料 | `/pages/profile/profile` | 修改昵称、头像 |
| 订单 | `/pages/order/order` | 订单列表、订单状态筛选 |
| 评价 | `/pages/comment/comment` | 发表评价、评分、上传图片 |
| 登录 | `/pages/login/login` | 微信一键登录 |

## 后端接口对接

所有接口在 `services/` 目录下统一管理，基于 `utils/request.js` 封装：

- 自动添加 `Authorization` 请求头
- 统一响应格式处理 `{ code, message, data }`
- 401 自动清除登录态并提示
- 网络异常统一提示

## 主题色

主色调：`#ff6b35`（橙色系），在 `app.wxss` 中通过 CSS 变量定义：

```css
page {
  --primary-color: #ff6b35;
  --primary-light: #fff0eb;
}
```
