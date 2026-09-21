const LOCK_PAGE = '/pages/frozen/frozen';

let reminded = false;
let modalOn = false;
let opening = false;
let pending = null;
let lastOkAt = 0;

function currentRoute() {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  return current ? current.route : '';
}

function remember(message) {
  const text = message && /冻结/.test(message) ? message : '账号已冻结';
  const app = getApp();
  if (app && app.globalData) app.globalData.frozenMessage = text;
  return text;
}

function openLock() {
  if (currentRoute() === 'pages/frozen/frozen' || opening) return;
  opening = true;
  wx.reLaunch({
    url: LOCK_PAGE,
    complete: () => {
      opening = false;
    },
  });
}

function lock(message) {
  const text = remember(message);
  if (currentRoute() === 'pages/frozen/frozen') return;
  if (!reminded) {
    reminded = true;
    modalOn = true;
    wx.showModal({
      title: '账号已冻结',
      content: `${text}。暂时无法使用，如有疑问请联系管理员。`,
      showCancel: false,
      confirmText: '我知道了',
      complete: () => {
        modalOn = false;
        openLock();
      },
    });
    return;
  }
  if (!modalOn) openLock();
}

function clear() {
  reminded = false;
  modalOn = false;
  const app = getApp();
  if (app && app.globalData) app.globalData.frozenMessage = '';
}

function isFrozenMessage(message) {
  return /账号已冻结/.test(String(message || ''));
}

async function check() {
  if (!wx.getStorageSync('token')) return false;
  if (Date.now() - lastOkAt < 2000) return false;
  if (pending) return pending;
  pending = runCheck().finally(() => {
    pending = null;
  });
  return pending;
}

async function runCheck() {
  try {
    const user = await require('../services/user.js').getUserProfile();
    if (user && Number(user.status) === 0) {
      lock('账号已冻结');
      return true;
    }
    lastOkAt = Date.now();
    clear();
    return false;
  } catch (err) {
    const message = err && err.message ? err.message : '';
    if (isFrozenMessage(message)) {
      lock(message);
      return true;
    }
    return false;
  }
}

module.exports = {
  lock,
  clear,
  check,
  isFrozenMessage,
};
