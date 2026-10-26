const COS = 0.866;
const SIN = 0.5;

export const SCHOOL_TYPES = [
  { key: 'primary', label: '小学' },
  { key: 'middle', label: '初中' },
  { key: 'training', label: '培训机构' },
];

export const SCHOOL_MODES = [
  { key: 'partner', label: '合作学校' },
  { key: 'direct', label: '直营学校' },
  { key: 'franchise', label: '加盟学校' },
];

export const PROFIT_TIERS = [
  { key: 'S', label: 'S 级', range: '¥10万以上', min: 100000, scale: 1.32 },
  { key: 'A', label: 'A 级', range: '¥5万～10万', min: 50000, scale: 1.14 },
  { key: 'B', label: 'B 级', range: '¥1万～5万', min: 10000, scale: 0.98 },
  { key: 'N', label: '新学校', range: '¥0～1万', min: -Infinity, scale: 0.82 },
];

export function tierOf(profit) {
  if (profit === null || profit === undefined) return PROFIT_TIERS[3];
  return PROFIT_TIERS.find((tier) => profit >= tier.min) || PROFIT_TIERS[3];
}

export const typeLabel = (key) => SCHOOL_TYPES.find((t) => t.key === key)?.label || '学校';
export const modeLabel = (key) => SCHOOL_MODES.find((m) => m.key === key)?.label || '';

function pt(x, y, z) {
  return [(x - y) * COS, (x + y) * SIN - z];
}

function poly(points, fill, extra = '') {
  const d = points.map(([x, y, z]) => pt(x, y, z).map((n) => n.toFixed(1)).join(',')).join(' ');
  return `<polygon points="${d}" fill="${fill}" ${extra}/>`;
}

const EDGE = 'stroke="rgba(40,52,90,.16)" stroke-width=".6" stroke-linejoin="round"';

function box({ x, y, z = 0, w, d, h, top, left, right }) {
  const x1 = x + w;
  const y1 = y + d;
  const z1 = z + h;
  return [
    poly([[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]], left, EDGE),
    poly([[x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1]], right, EDGE),
    top ? poly([[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]], top, EDGE) : '',
  ].join('');
}

/** 左立面（y = 常量）上的一排排窗户 */
function windowsLeft({ x, y, z = 0, w, h, cols, rows, color, pad = 3, gap = 3 }) {
  const cw = (w - pad * 2 - gap * (cols - 1)) / cols;
  const rh = (h - pad * 2 - gap * (rows - 1)) / rows;
  let out = '';
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const xa = x + pad + c * (cw + gap);
      const za = z + pad + r * (rh + gap);
      out += poly([[xa, y, za], [xa + cw, y, za], [xa + cw, y, za + rh], [xa, y, za + rh]], color);
    }
  }
  return out;
}

/** 右立面（x = 常量）上的窗户 */
function windowsRight({ x, y, z = 0, d, h, cols, rows, color, pad = 3, gap = 3 }) {
  const cw = (d - pad * 2 - gap * (cols - 1)) / cols;
  const rh = (h - pad * 2 - gap * (rows - 1)) / rows;
  let out = '';
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const ya = y + pad + c * (cw + gap);
      const za = z + pad + r * (rh + gap);
      out += poly([[x, ya, za], [x, ya + cw, za], [x, ya + cw, za + rh], [x, ya, za + rh]], color);
    }
  }
  return out;
}

/** 站在地面上的小卡通人物：头、身体、椭圆阴影 */
function person(x, y, shirt, scale = 1) {
  const [cx, cy] = pt(x, y, 0);
  const h = 6.2 * scale;
  return `<g><ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(2.4 * scale).toFixed(1)}" ry="${(1 * scale).toFixed(1)}" fill="rgba(40,52,90,.16)"/>`
    + `<rect x="${(cx - 1.5 * scale).toFixed(1)}" y="${(cy - h).toFixed(1)}" width="${(3 * scale).toFixed(1)}" height="${(h - 2).toFixed(1)}" rx="${(1.3 * scale).toFixed(1)}" fill="${shirt}"/>`
    + `<circle cx="${cx.toFixed(1)}" cy="${(cy - h - 1.1 * scale).toFixed(1)}" r="${(1.55 * scale).toFixed(1)}" fill="#ffd8b8"/></g>`;
}

function tree(x, y, size = 6, color = '#7fcf86') {
  const [cx, cy] = pt(x, y, 0);
  return `<g><rect x="${(cx - 1).toFixed(1)}" y="${(cy - size * 1.4).toFixed(1)}" width="2" height="${(size * 1.4).toFixed(1)}" rx="1" fill="#b98a5e"/>`
    + `<circle cx="${cx.toFixed(1)}" cy="${(cy - size * 1.7).toFixed(1)}" r="${size}" fill="${color}"/>`
    + `<circle cx="${(cx - size * 0.35).toFixed(1)}" cy="${(cy - size * 2).toFixed(1)}" r="${(size * 0.42).toFixed(1)}" fill="#fff" opacity=".35"/></g>`;
}

function flag(x, y, height, color) {
  const [bx, by] = pt(x, y, 0);
  const top = by - height;
  return `<g><line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${top.toFixed(1)}" stroke="#8a94a8" stroke-width="1.1" stroke-linecap="round"/>`
    + `<path class="sm-flag" d="M${bx.toFixed(1)} ${top.toFixed(1)} l11 3.5 l-11 3.5z" fill="${color}"/></g>`;
}

function base(top, left, right) {
  return box({ x: -30, y: -30, z: -5, w: 60, d: 60, h: 5, top, left, right });
}

function track(x, y, w, d, ring, field) {
  return poly([[x, y, 0.2], [x + w, y, 0.2], [x + w, y + d, 0.2], [x, y + d, 0.2]], ring, 'stroke="#fff" stroke-width=".6"')
    + poly([[x + 3, y + 3, 0.3], [x + w - 3, y + 3, 0.3], [x + w - 3, y + d - 3, 0.3], [x + 3, y + d - 3, 0.3]], field);
}

/** 文字贴在左立面上（沿 x 轴倾斜） */
function faceText(x, y, z, text, size, color) {
  const [tx, ty] = pt(x, y, z);
  return `<text transform="matrix(${COS},${SIN},0,1,${tx.toFixed(1)},${ty.toFixed(1)})" font-size="${size}" font-weight="800" fill="${color}" font-family="system-ui,-apple-system,'PingFang SC',sans-serif" letter-spacing=".5">${text}</text>`;
}

function primary() {
  const roof = { x0: -25, x1: 15, y0: -24, y1: -3, z: 22, r: 11 };
  const ym = (roof.y0 + roof.y1) / 2;
  return [
    base('#c8ebb1', '#a4d68c', '#8cc477'),
    track(3, 4, 23, 22, '#ff9f87', '#a9df8f'),
    box({ x: -24, y: -23, w: 38, d: 19, h: 22, top: '#fff6e2', left: '#ffeec8', right: '#f8d69a' }),
    windowsLeft({ x: -24, y: -4, w: 38, h: 22, cols: 5, rows: 2, color: '#8fd0ff', pad: 3.5, gap: 3.4 }),
    poly([[-7, -4, 0], [-2, -4, 0], [-2, -4, 9], [-7, -4, 9]], '#e59a5b'),
    windowsRight({ x: 14, y: -23, d: 19, h: 22, cols: 2, rows: 2, color: '#7cc0f2', pad: 3.5, gap: 3.4 }),
    poly([[roof.x0, roof.y0, roof.z], [roof.x1, roof.y0, roof.z], [roof.x1, ym, roof.z + roof.r], [roof.x0, ym, roof.z + roof.r]], '#ee6c4d', EDGE),
    poly([[roof.x1, roof.y0, roof.z], [roof.x1, roof.y1, roof.z], [roof.x1, ym, roof.z + roof.r]], '#ffb59c', EDGE),
    poly([[roof.x0, roof.y1, roof.z], [roof.x1, roof.y1, roof.z], [roof.x1, ym, roof.z + roof.r], [roof.x0, ym, roof.z + roof.r]], '#ff8a66', EDGE),
    box({ x: -9, y: -16, z: 27, w: 6, d: 6, h: 12, top: '#fff6e2', left: '#ffeec8', right: '#f8d69a' }),
    poly([[-9, -16, 39], [-3, -16, 39], [-6, -13, 45]], '#ee6c4d'),
    poly([[-9, -10, 39], [-3, -10, 39], [-3, -16, 39], [-6, -13, 45]], '#ff8a66'),
    flag(-24, 18, 34, '#ff5a5f'),
    person(10, 16, '#ff8a65', 1),
    person(18, 20, '#64b5f6', 0.86),
    person(-4, 18, '#ffd54f', 0.78),
    tree(-14, 22, 5.5),
    tree(26, -22, 5, '#8fd694'),
  ].join('');
}

function middle() {
  return [
    base('#dbe7f6', '#bccfe8', '#a7bedd'),
    track(4, 6, 22, 20, '#7fb6ff', '#bfe3c0'),
    box({ x: 8, y: -20, w: 18, d: 20, h: 20, top: '#f2f7ff', left: '#e3edfb', right: '#bed2ee' }),
    windowsLeft({ x: 8, y: 0, w: 18, h: 20, cols: 3, rows: 3, color: '#78aef5', pad: 2.6, gap: 2.4 }),
    windowsRight({ x: 26, y: -20, d: 20, h: 20, cols: 3, rows: 3, color: '#5f97e2', pad: 2.6, gap: 2.4 }),
    box({ x: -22, y: -24, w: 30, d: 22, h: 40, top: '#f6f9ff', left: '#eaf2ff', right: '#c7d9f3' }),
    windowsLeft({ x: -22, y: -2, w: 30, h: 40, cols: 4, rows: 5, color: '#6aa5f0', pad: 3, gap: 2.6 }),
    poly([[-11, -2, 0], [-5, -2, 0], [-5, -2, 9], [-11, -2, 9]], '#3b6fd1'),
    windowsRight({ x: 8, y: -24, d: 22, h: 40, cols: 3, rows: 5, color: '#5a90dc', pad: 3, gap: 2.6 }),
    box({ x: -14, y: -18, z: 40, w: 12, d: 10, h: 14, top: '#f6f9ff', left: '#eaf2ff', right: '#c7d9f3' }),
    (() => {
      const [cx, cy] = pt(-8, -8, 47);
      return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="4.4" ry="4.8" fill="#fff" stroke="#3b82f6" stroke-width="1.2" transform="rotate(-30 ${cx.toFixed(1)} ${cy.toFixed(1)}) skewX(0)"/>`
        + `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)} v-3 M${cx.toFixed(1)} ${cy.toFixed(1)} l2.4 1" stroke="#1e3a8a" stroke-width=".9" stroke-linecap="round"/>`;
    })(),
    poly([[-15, -19, 54], [-1, -19, 54], [-1, -7, 54], [-15, -7, 54]], '#3b82f6'),
    flag(-26, 16, 36, '#ef4444'),
    person(12, 18, '#5c7cfa', 1),
    person(18, 14, '#ff922b', 0.82),
    tree(-16, 24, 5, '#86d39a'),
    tree(-2, 26, 4.2, '#9be0a9'),
  ].join('');
}

function training() {
  return [
    base('#ebe6ff', '#d3caf9', '#c0b4f2'),
    poly([[-6, 6, 0.2], [6, 6, 0.2], [6, 30, 0.2], [-6, 30, 0.2]], '#ffffff', 'opacity=".8"'),
    box({ x: -22, y: -22, w: 38, d: 24, h: 30, top: '#f5f3ff', left: '#a7ece6', right: '#8b7cf6' }),
    windowsLeft({ x: -22, y: 2, w: 38, h: 30, cols: 6, rows: 3, color: 'rgba(255,255,255,.55)', pad: 2.6, gap: 1.6 }),
    windowsRight({ x: 16, y: -22, d: 24, h: 30, cols: 3, rows: 3, color: 'rgba(255,255,255,.35)', pad: 3, gap: 2.4 }),
    poly([[-6, 2, 0], [2, 2, 0], [2, 2, 10], [-6, 2, 10]], '#5b4bd6'),
    box({ x: -18, y: -16, z: 30, w: 22, d: 4, h: 10, top: '#ffffff', left: '#ffffff', right: '#ddd6fe' }),
    faceText(-16.5, -12, 31.8, 'EDU', 7.6, '#6d4cf5'),
    box({ x: 6, y: -18, z: 30, w: 8, d: 8, h: 6, top: '#c4f1ec', left: '#a7ece6', right: '#8b7cf6' }),
    person(-2, 16, '#5b4bd6', 1),
    person(8, 20, '#2ec4b6', 0.84),
    person(14, 14, '#ff8fab', 0.76),
    tree(-24, 20, 5, '#8ee0b8'),
    tree(22, 18, 5.4, '#7fd4a8'),
    tree(24, -4, 4.2, '#a3e8c4'),
  ].join('');
}

const ART = { primary, middle, training };
const cache = {};

export function schoolSvg(type = 'middle', className = '') {
  const key = ART[type] ? type : 'middle';
  if (!cache[key]) cache[key] = ART[key]();
  return `<svg class="${className}" viewBox="-58 -80 116 118" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${cache[key]}</svg>`;
}
