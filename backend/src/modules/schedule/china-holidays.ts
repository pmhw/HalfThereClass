import { getDayDetail, getHolidaysInRange, getLunarDate, getSolarTerms } from 'chinese-days';

const WEEKDAYS = new Set(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

const DISPLAY_NAME: Record<string, string> = {
  元旦: '元旦',
  春节: '春节',
  清明: '清明节',
  劳动节: '劳动节',
  端午: '端午节',
  中秋: '中秋节',
  国庆节: '国庆节',
};

function festivalName(raw: string) {
  if (!raw || WEEKDAYS.has(raw)) return '';
  const name = raw.split(',')[1] || raw.split(',')[0];
  return DISPLAY_NAME[name] || name;
}

function pad(value: number) {
  return `${value}`.padStart(2, '0');
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function yearsBetween(start: string, end: string) {
  const years: number[] = [];
  for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year += 1) years.push(year);
  return years;
}

function yearHasOfficial(year: number) {
  return getHolidaysInRange(`${year}-01-01`, `${year}-12-31`, false).some((date) => festivalName(getDayDetail(date).name));
}

function pushSpan(items: { date: string; name: string }[], start: string, days: number, name: string) {
  for (let index = 0; index < days; index += 1) items.push({ date: addDays(start, index), name });
}

/** 国务院当年安排还没公布时，按农历和固定节日补上法定假期。 */
function statutoryFallback(year: number) {
  const items: { date: string; name: string }[] = [];
  items.push({ date: `${year}-01-01`, name: '元旦' });
  pushSpan(items, `${year}-05-01`, 5, '劳动节');
  pushSpan(items, `${year}-10-01`, 7, '国庆节');
  const qingming = getSolarTerms(`${year}-04-01`, `${year}-04-10`).find((item) => item.name === '清明');
  if (qingming) items.push({ date: qingming.date, name: '清明节' });

  const cursor = new Date(year, 0, 1);
  const last = new Date(year, 11, 31);
  while (cursor <= last) {
    const date = formatDate(cursor);
    const lunar = getLunarDate(date);
    if (!lunar.isLeap && lunar.lunarMon === 1 && lunar.lunarDay === 1) {
      pushSpan(items, addDays(date, -1), 8, '春节');
    }
    if (!lunar.isLeap && lunar.lunarMon === 5 && lunar.lunarDay === 5) pushSpan(items, addDays(date, -1), 3, '端午节');
    if (!lunar.isLeap && lunar.lunarMon === 8 && lunar.lunarDay === 15) pushSpan(items, addDays(date, -1), 3, '中秋节');
    cursor.setDate(cursor.getDate() + 1);
  }
  return items;
}

export function chinaHolidays(start: string, end: string) {
  const map = new Map<string, string>();
  for (const date of getHolidaysInRange(start, end, true)) {
    const detail = getDayDetail(date);
    const name = festivalName(detail.name);
    if (name) map.set(detail.date, name);
  }
  for (const year of yearsBetween(start, end)) {
    if (yearHasOfficial(year)) continue;
    for (const item of statutoryFallback(year)) {
      if (item.date >= start && item.date <= end) map.set(item.date, item.name);
    }
  }
  return [...map.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, name]) => ({ date, name }));
}
