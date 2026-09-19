function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code style="padding:0 4px;background:#f3f5f8;border-radius:4px;">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#2563eb;">$1</a>');
}

function renderMarkdown(source) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let index = 0;
  const block = {
    h1: 'font-size:20px;font-weight:700;margin:16px 0 8px;color:#111827;',
    h2: 'font-size:17px;font-weight:700;margin:14px 0 8px;color:#111827;',
    h3: 'font-size:15px;font-weight:700;margin:12px 0 6px;color:#111827;',
    p: 'margin:0 0 10px;line-height:1.7;color:#344054;',
    quote: 'margin:0 0 10px;padding:8px 12px;border-left:3px solid #bfd3fe;background:#f8fbff;color:#475467;',
    list: 'margin:0 0 10px;padding-left:18px;color:#344054;line-height:1.7;',
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
        bits.push(`<li>${inline(lines[index].replace(/^[-*]\s+/, ''))}</li>`);
        index += 1;
      }
      html.push(`<ul style="${block.list}">${bits.join('')}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const bits = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        bits.push(`<li>${inline(lines[index].replace(/^\d+\.\s+/, ''))}</li>`);
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
