import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function capturePosterEl(el, { bg = '#ffffff', scale = 2 } = {}) {
  if (!el) throw new Error('预览尚未就绪');
  const useScale = Number(scale) === 3 ? 3 : 2;
  return html2canvas(el, {
    backgroundColor: bg || '#ffffff',
    scale: useScale,
    useCORS: true,
    logging: false,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });
}

export async function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((file) => (file ? resolve(file) : reject(new Error('生成图片失败'))), 'image/png');
  });
}

export function addCanvasToPdf(pdf, canvas, { margin = 6 } = {}) {
  const img = canvas.toDataURL('image/png');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  pdf.addImage(img, 'PNG', x, y, w, h, undefined, 'FAST');
}

export function createPosterPdf(size) {
  const landscape = size !== 'a4-portrait' && size !== 'square';
  return new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: size === 'square' ? [200, 200] : 'a4',
    compress: true,
  });
}

function pushCalendarItem(byDate, key, item) {
  if (!key) return;
  const bucket = byDate.get(key) || [];
  bucket.push(item);
  byDate.set(key, bucket);
}

/**
 * 月历挂格：同日只挂一格；跨日时学生日 / 老师中国日各挂一格（slot: student | teacher | both）
 */
export function buildCalendarDays(month, sessions = []) {
  const [y, m] = String(month || '').split('-').map(Number);
  if (!y || !m) return [];
  const first = new Date(y, m - 1, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  const prevDays = new Date(y, m - 1, 0).getDate();
  const byDate = new Map();
  for (const item of sessions) {
    const studentDate = item.studentDate || item.date;
    const teacherDate = item.teacherDate || '';
    const studentStart = String(item.studentStartTime || item.startTime || '').slice(0, 5);
    const studentEnd = item.studentEndTime || item.endTime
      ? String(item.studentEndTime || item.endTime).slice(0, 5)
      : '';
    const teacherStart = String(item.teacherStartTime || '').slice(0, 5);
    const teacherEnd = item.teacherEndTime ? String(item.teacherEndTime).slice(0, 5) : '';
    const cross = Boolean(teacherDate && studentDate && teacherDate !== studentDate && teacherStart);

    if (cross) {
      pushCalendarItem(byDate, studentDate, {
        ...item,
        slot: 'student',
        placeKey: `${item.id || studentDate}__stu`,
        date: studentDate,
        startTime: studentStart,
        endTime: studentEnd,
      });
      pushCalendarItem(byDate, teacherDate, {
        ...item,
        slot: 'teacher',
        placeKey: `${item.id || teacherDate}__tch`,
        date: teacherDate,
        startTime: teacherStart,
        endTime: teacherEnd,
      });
      continue;
    }

    const key = studentDate || item.date;
    if (!key) continue;
    pushCalendarItem(byDate, key, {
      ...item,
      slot: 'both',
      placeKey: `${item.id || key}__both`,
      date: key,
      startTime: studentStart || String(item.startTime || '').slice(0, 5),
      endTime: studentEnd || (item.endTime ? String(item.endTime).slice(0, 5) : ''),
    });
  }
  for (const bucket of byDate.values()) {
    bucket.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime))
      || String(a.placeKey || a.id).localeCompare(String(b.placeKey || b.id)));
  }
  const cells = [];
  for (let i = 0; i < startPad; i += 1) {
    const day = prevDays - startPad + i + 1;
    const date = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ date, day, inMonth: false, weekend: false, items: byDate.get(date) || [] });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const wd = new Date(y, m - 1, day).getDay();
    cells.push({
      date,
      day,
      inMonth: true,
      weekend: wd === 0 || wd === 6,
      items: byDate.get(date) || [],
    });
  }
  while (cells.length % 7 !== 0) {
    const day = cells.length - (startPad + daysInMonth) + 1;
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    const date = `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ date, day, inMonth: false, weekend: false, items: byDate.get(date) || [] });
  }
  return cells;
}

export function monthLabel(month) {
  const [y, m] = String(month || '').split('-');
  if (!y || !m) return month || '';
  return `${y}年${Number(m)}月`;
}

export function listMonthsBetween(from, to) {
  if (!from || !to) return [];
  let [y, m] = from.split('-').map(Number);
  const [ey, em] = to.split('-').map(Number);
  if (!y || !m || !ey || !em) return [];
  const out = [];
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 36) break;
  }
  return out;
}

export const POSTER_PRESETS = [
  { name: '深蓝', theme: '#1d4ed8', headerText: '#ffffff', bg: '#f8fafc', card: '#eff4ff' },
  { name: '墨绿', theme: '#0f766e', headerText: '#ffffff', bg: '#f0fdfa', card: '#ccfbf1' },
  { name: '暖橙', theme: '#c2410c', headerText: '#ffffff', bg: '#fff7ed', card: '#ffedd5' },
  { name: '墨黑', theme: '#0f172a', headerText: '#ffffff', bg: '#f8fafc', card: '#e2e8f0' },
];

export function defaultPosterStyle() {
  return {
    title: '',
    subtitle: '',
    footer: '',
    size: 'a4-landscape',
    density: 'comfortable',
    scale: 2,
    theme: '#1d4ed8',
    headerText: '#ffffff',
    bg: '#f8fafc',
    card: '#eff4ff',
    showTime: true,
    showStudentTime: true,
    showTeacherTime: true,
    showTeacher: true,
    showSchool: true,
    showClassroom: false,
    showWeekend: true,
    hideEmptyOut: true,
    hideCancelled: true,
    studentZone: 'Asia/Shanghai',
  };
}
