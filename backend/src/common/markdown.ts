/** 轻量 Markdown → HTML（合同/协议导出与预览共用） */
function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

export function renderMarkdown(source: string) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (line.startsWith('> ')) {
      const bits: string[] = [];
      while (index < lines.length && lines[index].startsWith('> ')) {
        bits.push(inline(lines[index].slice(2)));
        index += 1;
      }
      html.push(`<blockquote><p>${bits.join('<br>')}</p></blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const bits: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        bits.push(`<li>${inline(lines[index].replace(/^[-*]\s+/, ''))}</li>`);
        index += 1;
      }
      html.push(`<ul>${bits.join('')}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const bits: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        bits.push(`<li>${inline(lines[index].replace(/^\d+\.\s+/, ''))}</li>`);
        index += 1;
      }
      html.push(`<ol>${bits.join('')}</ol>`);
      continue;
    }
    const bits: string[] = [];
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,3}\s|>\s|[-*]\s|\d+\.\s)/.test(lines[index])
    ) {
      bits.push(inline(lines[index]));
      index += 1;
    }
    html.push(`<p>${bits.join('<br>')}</p>`);
  }
  return html.join('');
}
