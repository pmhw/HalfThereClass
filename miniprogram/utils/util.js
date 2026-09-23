// utils/util.js - 工具函数

/**
 * 格式化时间
 */
const formatTime = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();

  return `${year}-${formatNumber(month)}-${formatNumber(day)} ${formatNumber(hour)}:${formatNumber(minute)}:${formatNumber(second)}`;
};

const formatNumber = (n) => {
  n = n.toString();
  return n[1] ? n : `0${n}`;
};

/**
 * 格式化时长（秒转 分:秒）
 */
const formatDuration = (seconds) => {
  if (!seconds) return '00:00';
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${formatNumber(min)}:${formatNumber(sec)}`;
};

/**
 * 格式化日期
 */
const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  if (diff < 60 * 1000) {
    return '刚刚';
  } else if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))}分钟前`;
  } else if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
  } else if (diff < 7 * 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`;
  } else {
    return `${date.getFullYear()}-${formatNumber(date.getMonth() + 1)}-${formatNumber(date.getDate())}`;
  }
};

/**
 * 防抖
 */
const debounce = (func, wait = 300) => {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

/**
 * 节流
 */
const throttle = (func, wait = 300) => {
  let previous = 0;
  return function (...args) {
    const now = Date.now();
    if (now - previous > wait) {
      previous = now;
      func.apply(this, args);
    }
  };
};

/**
 * 价格格式化
 */
const formatPrice = (price) => {
  if (price === undefined || price === null) return '0.00';
  return Number(price).toFixed(2);
};

const weekdayText = (weekday) => {
  return ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'][weekday] || '';
};

const todayWeekday = () => {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
};

/**
 * 检查登录状态
 */
const checkLogin = () => {
  const token = wx.getStorageSync('token');
  return !!token;
};

/**
 * 需要登录的操作
 */
const requireLogin = (callback) => {
  if (checkLogin()) {
    callback && callback();
    return true;
  } else {
    wx.navigateTo({ url: '/pages/login/login' });
    return false;
  }
};

/** 证件/签名等受保护资源需带 access_token */
const assetUrl = (path) => {
  if (!path) return '';
  if (/^https?:\/\//.test(path) || path.startsWith('wxfile:') || path.startsWith('http://tmp') || path.startsWith('data:')) {
    return path;
  }
  const config = require('../config/index.js');
  const token = wx.getStorageSync('token');
  let url = `${config.origin}${path.startsWith('/') ? path : `/${path}`}`;
  if (token && /\/uploads\/(certs|signs)\//.test(path)) {
    url += `${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
  }
  return url;
};

module.exports = {
  formatTime,
  formatDuration,
  formatDate,
  formatPrice,
  weekdayText,
  todayWeekday,
  debounce,
  throttle,
  checkLogin,
  requireLogin,
  assetUrl,
};
