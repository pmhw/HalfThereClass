function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code style="padding:0 4px;background:#f3f5f8;border-radius:4px;font-size:0.92em;">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#111827;font-weight:700;">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#2563eb;">$1</a>');
}

function renderMarkdown(source) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let index = 0;
  const block = {
    h1: 'font-size:19px;font-weight:700;margin:18px 0 8px;color:#111827;line-height:1.35;',
    h2: 'font-size:16px;font-weight:700;margin:16px 0 8px;color:#111827;line-height:1.35;',
    h3: 'font-size:15px;font-weight:700;margin:14px 0 6px;color:#111827;line-height:1.35;',
    p: 'margin:0 0 12px;line-height:1.75;color:#344054;font-size:15px;',
    quote: 'margin:0 0 12px;padding:10px 12px;border-left:3px solid #93c5fd;background:#f8fbff;color:#475467;border-radius:0 8px 8px 0;line-height:1.65;font-size:14px;',
    list: 'margin:0 0 12px;padding-left:20px;color:#344054;line-height:1.75;font-size:15px;',
  };
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level} style="${block[`h${level}`]}">${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (line.startsWith('> ')) {
      const bits = [];
      while (index < lines.length && lines[index].startsWith('> ')) {
        bits.push(inline(lines[index].slice(2)));
        index += 1;
      }
      html.push(`<blockquote style="${block.quote}"><p style="margin:0;">${bits.join('<br>')}</p></blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const bits = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        bits.push(`<li style="margin:4px 0;">${inline(lines[index].replace(/^[-*]\s+/, ''))}</li>`);
        index += 1;
      }
      html.push(`<ul style="${block.list}">${bits.join('')}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const bits = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        bits.push(`<li style="margin:4px 0;">${inline(lines[index].replace(/^\d+\.\s+/, ''))}</li>`);
        index += 1;
      }
      html.push(`<ol style="${block.list}">${bits.join('')}</ol>`);
      continue;
    }
    const bits = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s|>\s|[-*]\s|\d+\.\s)/.test(lines[index])) {
      bits.push(inline(lines[index]));
      index += 1;
    }
    html.push(`<p style="${block.p}">${bits.join('<br>')}</p>`);
  }
  return html.join('');
}

module.exports = { renderMarkdown };
