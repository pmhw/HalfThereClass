// config/index.js - 配置文件

const config = {
  // 开发环境
  development: {
    baseUrl: 'http://localhost:3000/api',
    origin: 'http://localhost:3000',
    imgBaseUrl: 'https://cdn.example.com',
  },
  // 生产环境（线上后台与接口同一域名）
  production: {
    baseUrl: 'https://t.wisonenerge.com/api',
    origin: 'https://t.wisonenerge.com',
    imgBaseUrl: 'https://t.wisonenerge.com',
  },
};

// 线上小程序用 production；本地调试可改回 development
const env = 'production';

module.exports = config[env];
