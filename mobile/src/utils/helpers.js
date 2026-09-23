export function weekdayText(weekday) {
  return ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'][weekday] || '';
}

export function pad(n) {
  return `${n}`.padStart(2, '0');
}

export function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function greet() {
  const hour = new Date().getHours();
  if (hour < 11) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function remainText(startTime) {
  if (!startTime) return '';
  const [hour, minute] = startTime.split(':').map(Number);
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  const diff = target - new Date();
  if (diff <= 0) return '已到上课时间';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0 && m > 0) return `距离上课 ${h}小时${m}分钟`;
  if (h > 0) return `距离上课 ${h}小时`;
  return `距离上课 ${m}分钟`;
}

export function countdownText(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days ? `${days}天 ${clock}` : clock;
}

export function requireLogin(router) {
  if (localStorage.getItem('token')) return true;
  router.push('/login');
  return false;
}

export function toast(message) {
  if (window.__novisToast) window.__novisToast(message);
  else window.alert(message);
}
