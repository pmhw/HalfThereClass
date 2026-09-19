export function money(value) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  const pad = (n) => `${n}`.padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function minutes(seconds) {
  if (!seconds) return '—';
  return `${Math.round(seconds / 60)} 分钟`;
}

export const orderStatusText = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  refunded: '已退款',
};

export const levelText = {
  beginner: '入门',
  intermediate: '进阶',
  advanced: '高级',
};

export const roleText = {
  user: '学员',
  teacher: '讲师',
  admin: '管理员',
};

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function todayText() {
  const date = new Date();
  const weeks = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weeks[date.getDay()]}`;
}
