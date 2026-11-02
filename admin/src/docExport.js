import { renderMarkdown } from './markdown.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fillPlaceholders(content, vars = {}) {
  let text = String(content || '');
  Object.entries(vars).forEach(([key, value]) => {
    const token = `{{${key}}}`;
    const filled = value == null || value === '' ? '_______________' : String(value);
    text = text.split(token).join(filled);
  });
  return text.replace(/\{\{[^}]+\}\}/g, '_______________');
}

export function fillContractPreview(content, partyA = {}) {
  return fillPlaceholders(content, {
    合同编号: 'HTC-PREVIEW',
    甲方名称: partyA.name,
    甲方信用代码: partyA.creditCode,
    甲方住所: partyA.address,
    甲方法定代表人: partyA.legalRep,
    甲方电话: partyA.phone,
    甲方邮箱: partyA.email,
    乙方姓名: '',
    乙方身份证号: '',
    乙方住所: '',
    乙方电话: '',
    乙方邮箱: '',
    乙方开户行: '',
    乙方账户名: '',
    乙方账号: '',
    签订日期: '',
    合同开始日: '',
    合同结束日: '',
    学期名称: '',
    授课年级科目: '甲方安排年级科目',
    课程附件: '（预览件：签署时按该教师预分配课程生成附件。）',
  });
}

/** 协议 / 合同模板的打印预览 HTML（浏览器打印可另存 PDF） */
export function buildDocExportHtml({ title, content, note = '', filled = false } = {}) {
  const safeTitle = escapeHtml(title || '文档预览');
  const bodyHtml = renderMarkdown(content || '') || '<p>暂无内容</p>';
  const safeNote = note ? `<p class="meta">${escapeHtml(note)}</p>` : '';
  const watermark = filled ? '<p class="mark">导出预览 · 非正式签署件</p>' : '';
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle}</title>
<style>
*{box-sizing:border-box}
body{font-family:"PingFang SC","Microsoft YaHei",serif;max-width:800px;margin:24px auto;padding:0 16px 48px;color:#111;line-height:1.75;background:#fff;font-size:14px}
h1{text-align:center;font-size:22px;margin:8px 0 12px}
h2{font-size:17px;margin:22px 0 10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}
h3{font-size:15px;margin:16px 0 8px}
p{margin:8px 0} ul,ol{margin:8px 0;padding-left:1.4em} li{margin:4px 0}
blockquote{margin:10px 0;padding:8px 12px;background:#f8fafc;border-left:3px solid #cbd5e1;color:#475569}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:#f2f4f7;padding:1px 5px;border-radius:4px}
.meta{color:#667085;font-size:13px;text-align:center;margin-bottom:12px}
.mark{text-align:center;color:#b54708;font-size:12px;margin:0 0 16px}
.toolbar{position:sticky;top:0;z-index:2;background:#fff;padding:12px 0;margin-bottom:8px;border-bottom:1px solid #eef2f6;display:flex;gap:8px;flex-wrap:wrap}
.toolbar button{padding:10px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:14px;cursor:pointer}
.toolbar button.ghost{background:#eef2f6;color:#344054}
@media print{.toolbar{display:none!important} .mark{color:#98a2b3} body{margin:0;padding:12px} a{color:inherit;text-decoration:none}}
</style></head><body>
<div class="toolbar">
  <button type="button" onclick="window.print()">打印 / 另存为 PDF</button>
  <button type="button" class="ghost" onclick="window.close()">关闭</button>
</div>
<h1>${safeTitle}</h1>
${watermark}
${safeNote}
<article class="body">${bodyHtml}</article>
</body></html>`;
}

export function openDocExport(html, fileName = '文档预览.html') {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return { opened: false };
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return { opened: true };
}
