/** 从电子发票 PDF 文本里尽量抽出号码、价税合计、税额、销售方 */

export type ParsedInvoice = {
  invoiceNo: string;
  sellerName: string;
  amount: number | null; // 价税合计（元）
  tax: number | null; // 税额（元）
  title: string;
  rawText: string;
};

function moneyFrom(text: string | undefined | null) {
  if (!text) return null;
  const cleaned = String(text).replace(/[,\s￥¥]/g, '').replace(/[（(].*?[）)]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function pick(text: string, patterns: RegExp[]) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return String(m[1]).trim();
  }
  return '';
}

export function parseInvoiceText(raw: string): ParsedInvoice {
  const text = String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ');

  const invoiceNo = pick(text, [
    /发票号码[:：\s]*([0-9]{8,20})/,
    /发\s*票\s*号\s*码[:：\s]*([0-9]{8,20})/,
    /No[\.\:：\s]*([0-9]{8,20})/i,
  ]);

  const sellerName = pick(text, [
    /销售方[:：\s]*名\s*称[:：\s]*([^\n\r]+)/,
    /销\s*售\s*方[:：\s]*([^\n\r]+)/,
    /销售方名称[:：\s]*([^\n\r]+)/,
  ]).replace(/购.*$/, '').trim();

  const amount = moneyFrom(pick(text, [
    /价税合计[（(]?大写[）)]?[:：\s]*[^\n\r]*?[（(]?小写[）)]?[:：\s]*[￥¥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/,
    /价税合计[:：\s]*[￥¥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/,
    /（小写）\s*[￥¥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/,
  ]));

  const tax = moneyFrom(pick(text, [
    /税额[:：\s]*[￥¥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/,
    /合\s*计[:：\s]*.*?税额[:：\s]*[￥¥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/,
  ]));

  const goods = pick(text, [
    /项目名称[:：\s]*([^\n\r]+)/,
    /货物或应税劳务[、,，]?服务名称[:：\s]*([^\n\r]+)/,
  ]);

  return {
    invoiceNo,
    sellerName: sellerName.slice(0, 80),
    amount,
    tax,
    title: (goods || sellerName || (invoiceNo ? `发票 ${invoiceNo}` : '开票费用')).slice(0, 80),
    rawText: text.slice(0, 20000),
  };
}
