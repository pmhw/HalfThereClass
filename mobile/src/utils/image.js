/**
 * 压缩图片后再上传（手机相册原图常 5–15MB，头像只需很小）。
 * @param {Blob|File} file
 * @param {{ maxEdge?: number, quality?: number, maxBytes?: number }} [options]
 * @returns {Promise<File>}
 */
export async function compressImageFile(file, options = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) return file;
  const maxEdge = options.maxEdge ?? 1024;
  const quality = options.quality ?? 0.82;
  const maxBytes = options.maxBytes ?? 900 * 1024;

  if (file.size && file.size <= maxBytes && file.size <= 1.2 * 1024 * 1024) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    let q = quality;
    let blob = await canvasToBlob(canvas, 'image/jpeg', q);
    while (blob && blob.size > maxBytes && q > 0.45) {
      q -= 0.12;
      blob = await canvasToBlob(canvas, 'image/jpeg', q);
    }
    if (!blob) return file;
    const name = String(file.name || 'avatar.jpg').replace(/\.\w+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}
