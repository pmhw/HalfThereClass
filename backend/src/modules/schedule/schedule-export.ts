import ExcelJS = require('exceljs');

export type TimetableRow = {
  date: string;
  weekday: number;
  startTime: string;
  endTime: string;
  title: string;
  school: string;
  classroom: string;
  teacher: string;
  status: string;
  statusText: string;
  kindText: string;
  note: string;
};

const WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const STATUS_FILL: Record<string, string> = {
  scheduled: 'DBEAFE',
  completed: 'D1FAE5',
  holiday: 'FEF3C7',
  cancelled: 'FEE2E2',
  rescheduled: 'F2F4F7',
  observe: 'EDE9FE',
};

const NAVY = '1E3A8A';
const BLUE = '1D4ED8';
const LINE = 'D0D5DD';
const INK = '0F172A';
const MUTED = '667085';

function argb(hex: string) {
  return `FF${hex}`;
}

function thinBorder() {
  const edge = { style: 'thin' as const, color: { argb: argb(LINE) } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function monthLabel(month: string) {
  const [year, mon] = month.split('-');
  return `${year}年${Number(mon)}月`;
}

function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 ? 7 : day;
}

function weeksOf(month: string) {
  const [year, mon] = month.split('-').map(Number);
  const last = new Date(year, mon, 0);
  const cursor = new Date(year, mon - 1, 1);
  const lead = weekdayOf(`${month}-01`) - 1;
  cursor.setDate(cursor.getDate() - lead);
  const weeks: string[][] = [];
  while (cursor <= last) {
    const days: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const mm = `${cursor.getMonth() + 1}`.padStart(2, '0');
      const dd = `${cursor.getDate()}`.padStart(2, '0');
      days.push(`${cursor.getFullYear()}-${mm}-${dd}`);
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }
  return weeks;
}

function cellText(row: TimetableRow) {
  const time = row.endTime ? `${row.startTime}-${row.endTime}` : row.startTime;
  return [time, row.title, [row.school, row.teacher].filter(Boolean).join(' · '), row.statusText]
    .filter(Boolean)
    .join('\n');
}

export async function buildTimetableWorkbook(month: string, rows: TimetableRow[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '半堂课';
  wb.created = new Date();
  writeCalendar(wb, month, rows);
  writeDetail(wb, month, rows);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function writeCalendar(wb: ExcelJS.Workbook, month: string, rows: TimetableRow[]) {
  const sheet = wb.addWorksheet('月历', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 },
    views: [{ showGridLines: false }],
  });
  sheet.columns = WEEK.map(() => ({ width: 24 }));
  sheet.mergeCells('A1:G1');
  const title = sheet.getCell('A1');
  title.value = `${monthLabel(month)}课程表`;
  title.font = { name: '微软雅黑', size: 20, bold: true, color: { argb: argb('FFFFFF') } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(NAVY) } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 36;

  sheet.mergeCells('A2:G2');
  const sub = sheet.getCell('A2');
  const done = rows.filter((row) => row.status === 'completed').length;
  const wait = rows.filter((row) => row.status === 'scheduled').length;
  sub.value = `共 ${rows.length} 节 · 待上 ${wait} · 已上 ${done}`;
  sub.font = { name: '微软雅黑', size: 11, color: { argb: argb(BLUE) } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('EFF4FF') } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 22;

  WEEK.forEach((name, index) => {
    const cell = sheet.getCell(3, index + 1);
    cell.value = name;
    cell.font = { name: '微软雅黑', size: 12, bold: true, color: { argb: argb('FFFFFF') } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(index >= 5 ? '334155' : BLUE) } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = thinBorder();
  });
  sheet.getRow(3).height = 24;

  const byDate = new Map<string, TimetableRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.date) || [];
    list.push(row);
    byDate.set(row.date, list);
  }

  weeksOf(month).forEach((days, weekIndex) => {
    const excelRow = sheet.getRow(4 + weekIndex);
    let height = 78;
    days.forEach((date, index) => {
      const inMonth = date.startsWith(month);
      const items = inMonth ? (byDate.get(date) || []) : [];
      const cell = excelRow.getCell(index + 1);
      const dayNum = Number(date.slice(8));
      const body = items.map(cellText).join('\n\n');
      cell.value = body ? `${dayNum}\n${body}` : `${dayNum}`;
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
      cell.font = { name: '微软雅黑', size: 10, color: { argb: argb(inMonth ? INK : '98A2B3') } };
      cell.border = thinBorder();
      const weekend = index >= 5;
      const fill = !inMonth ? 'F8FAFC' : items.length ? (STATUS_FILL[items[0].status] || 'FFFFFF') : weekend ? 'F2F4F7' : 'FFFFFF';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(fill) } };
      height = Math.max(height, 36 + items.length * 58);
    });
    excelRow.height = Math.min(height, 180);
  });

  sheet.pageSetup.printTitlesRow = '1:3';
  sheet.headerFooter.oddFooter = `&L半堂课课表&R${month}`;
}

function writeDetail(wb: ExcelJS.Workbook, month: string, rows: TimetableRow[]) {
  const sheet = wb.addWorksheet('明细', {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  const headers = ['日期', '星期', '时间', '课程', '学校', '教室', '教师', '状态', '类型', '备注'];
  sheet.columns = [14, 10, 16, 22, 18, 14, 12, 10, 10, 24].map((width, index) => ({
    header: headers[index],
    key: headers[index],
    width,
  }));

  sheet.mergeCells('A1:J1');
  const title = sheet.getCell('A1');
  title.value = `${monthLabel(month)}课表明细（${rows.length} 节）`;
  title.font = { name: '微软雅黑', size: 16, bold: true, color: { argb: argb('FFFFFF') } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(NAVY) } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 30;

  const head = sheet.getRow(2);
  headers.forEach((name, index) => {
    const cell = head.getCell(index + 1);
    cell.value = name;
    cell.font = { name: '微软雅黑', size: 11, bold: true, color: { argb: argb('FFFFFF') } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(BLUE) } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = thinBorder();
  });
  head.height = 22;

  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 3);
    const values = [
      row.date,
      WEEK[(row.weekday || weekdayOf(row.date)) - 1] || '',
      row.endTime ? `${row.startTime}-${row.endTime}` : row.startTime,
      row.title,
      row.school,
      row.classroom,
      row.teacher,
      row.statusText,
      row.kindText,
      row.note,
    ];
    values.forEach((value, col) => {
      const cell = excelRow.getCell(col + 1);
      cell.value = value || '';
      cell.font = { name: '微软雅黑', size: 10, color: { argb: argb(INK) } };
      cell.alignment = { vertical: 'middle', horizontal: col === 3 || col === 9 ? 'left' : 'center', wrapText: col === 9 };
      cell.border = thinBorder();
      const zebra = index % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(col === 7 ? (STATUS_FILL[row.status] || zebra) : zebra) } };
    });
    excelRow.height = 22;
  });

  if (!rows.length) {
    sheet.mergeCells('A3:J3');
    const empty = sheet.getCell('A3');
    empty.value = '这个月还没有课次';
    empty.font = { name: '微软雅黑', size: 11, color: { argb: argb(MUTED) } };
    empty.alignment = { horizontal: 'center' };
  }

  sheet.autoFilter = { from: 'A2', to: 'J2' };
  sheet.pageSetup.printTitlesRow = '1:2';
}
