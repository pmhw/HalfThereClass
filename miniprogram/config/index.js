// config/index.js - 配置文件

const config = {
  // 开发环境
  development: {
    baseUrl: 'http://localhost:3000/api',
    origin: 'http://localhost:3000',
    imgBaseUrl: 'https://cdn.example.com',
  },
  // 生产环境
  production: {
    baseUrl: 'https://api.halfthereclass.com/api',
    origin: 'https://api.halfthereclass.com',
    imgBaseUrl: 'https://cdn.halfthereclass.com',
  },
};

// 获取当前环境
const env = 'development'; // 可根据实际情况切换

module.exports = config[env];
