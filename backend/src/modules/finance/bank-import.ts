import * as XLSX from 'xlsx';

export type ParsedBankTxn = {
  accountNo: string;
  accountName: string;
  txnDate: string;
  txnTime: string;
  applyDate: string;
  voucherNo: string;
  direction: 'in' | 'out';
  amountCents: number;
  balanceCents: number | null;
  counterAccount: string;
  counterName: string;
  counterBank: string;
  serialNo: string;
  slipNo: string;
  recordStatus: string;
  summary: string;
  remark: string;
};

const HEADERS = ['交易日期', '交易时间', '借方金额', '贷方金额', '交易流水号', '摘要'] as const;

function cellText(value: unknown) {
  if (value == null) return '';
  return String(value).replace(/\u00a0/g, ' ').trim();
}

function toCents(value: unknown) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function centsOf(value: unknown) {
  const cents = toCents(value);
  return cents != null && cents > 0 ? cents : 0;
}

function formatDate(value: unknown) {
  const text = cellText(value).replace(/[^\d]/g, '');
  if (text.length === 8) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    const y = utc.getUTCFullYear();
    const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
    const d = String(utc.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

function formatTime(value: unknown) {
  const text = cellText(value);
  if (!text) return '';
  if (text.includes(':')) {
    const parts = text.split(':').map((part) => part.padStart(2, '0'));
    if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`;
    return parts.slice(0, 3).join(':');
  }
  const digits = text.replace(/\D/g, '');
  if (!digits) return '';
  const padded = digits.padStart(6, '0').slice(-6);
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)}`;
}

function findHeader(rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += 1) {
    const first = cellText(rows[i]?.[0]);
    if (first === '交易日期') return i;
  }
  return -1;
}

function columnIndex(header: unknown[], name: string) {
  return header.findIndex((cell) => cellText(cell) === name);
}

function labeledValue(rows: unknown[][], label: string) {
  for (const row of rows) {
    const idx = (row || []).findIndex((cell) => cellText(cell) === label);
    if (idx < 0) continue;
    for (let i = idx + 1; i < row.length; i += 1) {
      const text = cellText(row[i]);
      if (text) return text;
    }
  }
  return '';
}

/** 解析浦发银行「交易查询」导出的 xls / xlsx。同一流水号的汇款和手续费靠传票序号区分。 */
export function parseSpdWorkbook(buffer: Buffer): { accountNo: string; accountName: string; rows: ParsedBankTxn[] } {
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch {
    throw new Error('无法读取这个文件，请上传浦发银行导出的交易查询表（xls 或 xlsx）');
  }
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error('交易查询表是空的');
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][];
  const headerAt = findHeader(grid);
  if (headerAt < 0) throw new Error('没有找到「交易日期」表头，请确认是浦发交易查询导出');
  const header = grid[headerAt] || [];
  const missing = HEADERS.filter((name) => columnIndex(header, name) < 0);
  if (missing.length) throw new Error(`交易查询表缺少列：${missing.join('、')}`);

  const accountNo = labeledValue(grid.slice(0, headerAt), '账号');
  const accountName = labeledValue(grid.slice(0, headerAt), '账户名称');
  if (!accountNo) throw new Error('没有读到账号，请确认是浦发交易查询导出');

  const col = (name: string) => columnIndex(header, name);
  const rows: ParsedBankTxn[] = [];
  const seen = new Set<string>();
  for (let i = headerAt + 1; i < grid.length; i += 1) {
    const row = grid[i] || [];
    if (!row.some((cell) => cellText(cell))) continue;
    const txnDate = formatDate(row[col('交易日期')]);
    if (!txnDate) continue;
    const debit = centsOf(row[col('借方金额')]);
    const credit = centsOf(row[col('贷方金额')]);
    if (!debit && !credit) continue;
    if (debit && credit) throw new Error(`第 ${i + 1} 行同时有借方和贷方金额，无法判断资金方向`);
    const direction = credit ? 'in' : 'out';
    const amountCents = credit || debit;
    const parsed: ParsedBankTxn = {
      accountNo,
      accountName,
      txnDate,
      txnTime: formatTime(row[col('交易时间')]),
      applyDate: formatDate(row[col('申请日期')]),
      voucherNo: cellText(row[col('凭证号')]),
      direction,
      amountCents,
      balanceCents: toCents(row[col('余额')]),
      counterAccount: cellText(row[col('对方账号')]),
      counterName: cellText(row[col('对方户名')]),
      counterBank: cellText(row[col('对方行名')]),
      serialNo: cellText(row[col('交易流水号')]),
      slipNo: cellText(row[col('传票序号')]),
      recordStatus: cellText(row[col('记录状态')]),
      summary: cellText(row[col('摘要')]),
      remark: cellText(row[col('备注')]),
    };
    const key = [accountNo, parsed.serialNo, parsed.slipNo, parsed.txnDate, parsed.txnTime, direction, amountCents].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(parsed);
  }
  if (!rows.length) throw new Error('表里没有可导入的交易');
  return { accountNo, accountName, rows };
}
