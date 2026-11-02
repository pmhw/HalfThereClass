/** 老师时间固定中国；学生时区可选其它地区 */

export const TEACHER_ZONE = 'Asia/Shanghai';
/** @deprecated 兼容旧名，等同老师（中国）时区 */
export const STUDENT_ZONE = TEACHER_ZONE;

export const TIME_ZONES = [
  { id: 'Asia/Shanghai', label: '中国（北京）', short: '中国', city: '北京' },
  { id: 'America/Los_Angeles', label: '美国洛杉矶', short: '洛杉矶', city: '洛杉矶' },
  { id: 'America/Denver', label: '美国丹佛', short: '丹佛', city: '丹佛' },
  { id: 'America/Chicago', label: '美国芝加哥', short: '芝加哥', city: '芝加哥' },
  { id: 'America/New_York', label: '美国纽约', short: '纽约', city: '纽约' },
  { id: 'America/Toronto', label: '加拿大多伦多', short: '多伦多', city: '多伦多' },
  { id: 'America/Vancouver', label: '加拿大温哥华', short: '温哥华', city: '温哥华' },
  { id: 'Europe/London', label: '英国伦敦', short: '伦敦', city: '伦敦' },
  { id: 'Europe/Paris', label: '法国巴黎', short: '巴黎', city: '巴黎' },
  { id: 'Europe/Berlin', label: '德国柏林', short: '柏林', city: '柏林' },
  { id: 'Asia/Tokyo', label: '日本东京', short: '东京', city: '东京' },
  { id: 'Asia/Seoul', label: '韩国首尔', short: '首尔', city: '首尔' },
  { id: 'Asia/Singapore', label: '新加坡', short: '新加坡', city: '新加坡' },
  { id: 'Asia/Hong_Kong', label: '中国香港', short: '香港', city: '香港' },
  { id: 'Australia/Sydney', label: '澳大利亚悉尼', short: '悉尼', city: '悉尼' },
  { id: 'Pacific/Auckland', label: '新西兰奥克兰', short: '奥克兰', city: '奥克兰' },
];

export function zoneMeta(id) {
  return TIME_ZONES.find((z) => z.id === id) || { id, label: id, short: id, city: id };
}

/** 某时刻在指定时区的 UTC 偏移（毫秒）：local = utc + offset */
function offsetMsAt(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - utcMs;
}

/** 把某时区墙上的日期+时间转成 UTC Date */
export function wallToUtc(dateStr, timeStr, timeZone) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  if (!y || !m || !d || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const wantAsUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  let utc = wantAsUtc;
  utc = wantAsUtc - offsetMsAt(utc, timeZone);
  utc = wantAsUtc - offsetMsAt(utc, timeZone);
  return new Date(utc);
}

/** 把 UTC 格式化为某时区的 date / time */
export function formatInZone(utcDate, timeZone) {
  if (!utcDate || Number.isNaN(utcDate.getTime())) return { date: '', time: '' };
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = {};
  for (const p of dtf.formatToParts(utcDate)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
}

/**
 * 老师固定中国；学生可选时区。
 * @param {'teacher'|'student'} inputAs 录入的是哪一侧墙上时间
 */
export function buildDualTimes({
  date,
  startTime,
  endTime,
  inputAs = 'teacher',
  studentZone = TEACHER_ZONE,
}) {
  const zone = studentZone || TEACHER_ZONE;
  const inputZone = inputAs === 'student' ? zone : TEACHER_ZONE;
  const startUtc = wallToUtc(date, startTime, inputZone);
  if (!startUtc) return null;
  let endUtc = null;
  if (endTime) {
    endUtc = wallToUtc(date, endTime, inputZone);
    if (endUtc && endUtc.getTime() <= startUtc.getTime()) {
      endUtc = new Date(endUtc.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  const teacherStart = formatInZone(startUtc, TEACHER_ZONE);
  const teacherEnd = endUtc ? formatInZone(endUtc, TEACHER_ZONE) : { date: '', time: '' };
  const studentStart = formatInZone(startUtc, zone);
  const studentEnd = endUtc ? formatInZone(endUtc, zone) : { date: '', time: '' };

  return {
    studentZone: zone,
    teacherZone: TEACHER_ZONE,
    // 课表按学生日期挂月历（录入的学生日 / 换算出的学生日），老师中国时间仅作标注
    date: studentStart.date,
    startTime: studentStart.time,
    endTime: studentEnd.time || '',
    teacherDate: teacherStart.date,
    teacherStartTime: teacherStart.time,
    teacherEndTime: teacherEnd.time || '',
    studentDate: studentStart.date,
    studentStartTime: studentStart.time,
    studentEndTime: studentEnd.time || '',
  };
}

export function timeRangeText(start, end) {
  if (!start) return '';
  return end ? `${start}-${end}` : start;
}

/** 以老师（中国）时间为准，按新的学生时区重算两侧字段 */
export function rebuildFromTeacher(entry, studentZone = TEACHER_ZONE) {
  if (!entry?.teacherDate && !entry?.date) return null;
  return buildDualTimes({
    date: entry.teacherDate || entry.date,
    startTime: entry.teacherStartTime || entry.startTime,
    endTime: entry.teacherEndTime || entry.endTime || '',
    inputAs: 'teacher',
    studentZone: studentZone || TEACHER_ZONE,
  });
}

/** 生成从起日按周几重复的日期列表（含起日当周，至 until 或 count 周） */
export function expandWeeklyDates(startDate, weekdays, { until = '', weeks = 4 } = {}) {
  const start = String(startDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const days = [...new Set((weekdays || []).map(Number).filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  if (!days.length) return [start];

  const out = [];
  const cursor = new Date(`${start}T12:00:00`);
  const end = until && /^\d{4}-\d{2}-\d{2}$/.test(until)
    ? new Date(`${until}T12:00:00`)
    : new Date(cursor.getTime() + Math.max(1, Number(weeks) || 4) * 7 * 24 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);

  // JS: Sun=0 … Sat=6 → 周一=1…周日=7
  const toWeekday = (d) => {
    const n = d.getDay();
    return n === 0 ? 7 : n;
  };

  for (let i = 0; i < 370; i += 1) {
    if (cursor > end) break;
    if (days.includes(toWeekday(cursor))) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const day = String(cursor.getDate()).padStart(2, '0');
      out.push(`${y}-${m}-${day}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
