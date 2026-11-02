<template>
  <div class="camp" :class="{ 'is-toc': !chapter }">
    <header class="hero">
      <div class="hero-bg" />
      <div class="orbs">
        <span class="orb o1" />
        <span class="orb o2" />
        <span class="orb o3" />
        <span class="orb o4" />
      </div>
      <div class="hero-inner">
        <div class="hero-copy">
          <div class="en">{{ CAMP.enTitle }}</div>
          <h1><i></i>{{ CAMP.title }}</h1>
          <p>{{ CAMP.slogan }}</p>
        </div>
        <div class="cube-wrap" aria-hidden="true">
          <div class="float f1"><IconPhotos /></div>
          <div class="float f2"><IconChart /></div>
          <div class="float f3"><IconFlask /></div>
          <div class="float f4"><IconLeaf /></div>
          <div class="cube">
            <b>AI</b>
          </div>
        </div>
      </div>
    </header>

    <main class="sheet">
      <template v-if="!chapter">
        <div class="toc-head">
          <h2>目录 <span>/ CONTENTS</span></h2>
          <div class="hint">
            <span class="hand">👆</span>
            {{ CAMP.hint }}
          </div>
        </div>
        <button type="button" class="card card-lead" @click="open(leadChapter.id)">
          <div class="card-top">
            <span class="num">{{ leadChapter.id }}</span>
            <span class="ico"><component :is="iconOf(leadChapter.icon)" /></span>
          </div>
          <div class="card-title">{{ leadChapter.title }}</div>
          <div class="card-brief">{{ leadChapter.brief }}</div>
          <span class="go" aria-hidden="true">→</span>
        </button>
        <div class="day-pack">
          <div class="day-pack-h">三天课程安排 · Day 1–3</div>
          <div class="day-row">
            <button
              v-for="item in dayChapters"
              :key="item.id"
              type="button"
              class="card card-day"
              @click="open(item.id)"
            >
              <span class="num">{{ item.id }}</span>
              <span class="ico"><component :is="iconOf(item.icon)" /></span>
              <div class="day-copy">
                <div class="card-title">{{ dayLabel(item) }} · {{ item.title.replace(/^Day\s*\d+：/, '') }}</div>
                <div class="card-brief">{{ item.brief }}</div>
              </div>
              <span class="go" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <div class="grid">
          <button
            v-for="item in restChapters"
            :key="item.id"
            type="button"
            class="card"
            @click="open(item.id)"
          >
            <div class="card-top">
              <span class="num">{{ item.id }}</span>
              <span class="ico"><component :is="iconOf(item.icon)" /></span>
            </div>
            <div class="card-title">{{ item.title }}</div>
            <div class="card-brief">{{ item.brief }}</div>
            <span class="go" aria-hidden="true">→</span>
          </button>
        </div>
      </template>

      <template v-else>
        <div class="chap-head">
          <div class="chap-kicker">CHAPTER {{ chapter.id }}</div>
          <h2>{{ chapter.title }}</h2>
          <p>{{ chapter.brief }}</p>
        </div>
        <div v-if="isDayChapter" class="day-tabs">
          <button
            v-for="item in dayChapters"
            :key="item.id"
            type="button"
            :class="{ on: item.id === chapter.id }"
            @click="open(item.id)"
          >
            {{ dayLabel(item) }}
          </button>
        </div>
        <article v-for="(block, i) in chapter.blocks" :key="i" class="block">
          <p v-if="block.type === 'lead'" class="lead">{{ block.text }}</p>
          <button
            v-else-if="block.type === 'image'"
            type="button"
            class="fig fig-block"
            @click="preview(block.src, block.alt)"
          >
            <img :src="media(block.src)" :alt="block.alt" />
            <span v-if="block.alt">{{ block.alt }}</span>
          </button>
          <h3 v-else-if="block.type === 'h'" class="h">{{ block.text }}</h3>
          <p v-else-if="block.type === 'p'" class="p">{{ block.text }}</p>
          <blockquote v-else-if="block.type === 'quote'" class="quote">{{ block.text }}</blockquote>
          <div v-else-if="block.type === 'callout'" class="callout" :class="block.tone">{{ block.text }}</div>
          <div v-else-if="block.type === 'formula'" class="formula">
            <div class="formula-t">{{ block.title }}</div>
            <div class="formula-b">{{ block.text }}</div>
          </div>
          <ol v-else-if="block.type === 'ol'" class="ol">
            <li v-for="(t, j) in block.items" :key="j">{{ t }}</li>
          </ol>
          <ul v-else-if="block.type === 'ul'" class="ul">
            <li v-for="(t, j) in block.items" :key="j">{{ t }}</li>
          </ul>
          <ul v-else-if="block.type === 'check'" class="check">
            <li v-for="(t, j) in block.items" :key="j"><i></i>{{ t }}</li>
          </ul>
          <div v-else-if="block.type === 'kpis'" class="kpis">
            <div v-for="k in block.items" :key="k.label" class="kpi">
              <b>{{ k.value }}</b>
              <span>{{ k.label }}</span>
            </div>
          </div>
          <div v-else-if="block.type === 'loop'" class="loop">
            <div v-for="s in block.items" :key="s.day" class="loop-item">
              <div class="loop-day">{{ s.day }}</div>
              <div class="loop-title">{{ s.title }}</div>
              <div class="loop-text">{{ s.text }}</div>
            </div>
          </div>
          <div v-else-if="block.type === 'cards'" class="mini-cards">
            <div v-for="c in block.items" :key="c.title" class="mini">
              <b>{{ c.title }}</b>
              <p>{{ c.text }}</p>
            </div>
          </div>
          <div v-else-if="block.type === 'compare'" class="compare">
            <div v-for="(row, j) in block.items" :key="j" class="cmp-row">
              <div class="cmp bad"><span>不合适</span>{{ row[0] }}</div>
              <div class="cmp good"><span>可检验</span>{{ row[1] }}</div>
            </div>
          </div>
          <div v-else-if="block.type === 'table'" class="table-wrap">
            <div v-if="block.caption" class="caption">{{ block.caption }}</div>
            <div class="table-hint">左右滑动查看完整表格</div>
            <table>
              <thead>
                <tr>
                  <th v-for="h in block.headers" :key="h">{{ h }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, r) in block.rows" :key="r">
                  <td v-for="(cell, c) in row" :key="c">{{ cell || '　' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else-if="block.type === 'prompt'" class="prompt">
            <div class="prompt-h">
              <b>{{ block.title }}</b>
              <button type="button" @click="copyText(block.text)">复制</button>
            </div>
            <pre>{{ block.text }}</pre>
          </div>
          <div v-else-if="block.type === 'resource'" class="resources">
            <a
              v-for="r in block.items"
              :key="r.url"
              class="res"
              :href="r.url"
              target="_blank"
              rel="noopener"
            >
              <b>{{ r.title }}</b>
              <span class="url">{{ r.url }}</span>
              <p>{{ r.text }}</p>
            </a>
          </div>
        </article>
      </template>
    </main>

    <footer class="bar">
      <button type="button" class="bar-home" @click="open('')">
        <span class="home-ico">⌂</span>
        返回目录
      </button>
      <div class="bar-now">当前：{{ chapter ? chapter.title : '目录' }}</div>
      <div class="bar-nav">
        <button type="button" class="nav-btn ghost" :disabled="!canPrev" @click="go(-1)">← 上一页</button>
        <button type="button" class="nav-btn" :disabled="!canNext" @click="go(1)">下一页 →</button>
      </div>
    </footer>

    <div v-if="previewSrc" class="lightbox" @click="previewSrc = ''">
      <img :src="media(previewSrc)" :alt="previewAlt" />
      <p v-if="previewAlt">{{ previewAlt }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CAMP, CHAPTERS } from '../data/aiCamp';
import { toast } from '../utils/helpers';

const route = useRoute();
const router = useRouter();

const DAY_IDS = ['02', '03', '04'];
const leadChapter = CHAPTERS[0];
const dayChapters = CHAPTERS.filter((c) => DAY_IDS.includes(c.id));
const restChapters = CHAPTERS.filter((c) => c.id !== '01' && !DAY_IDS.includes(c.id));

const chapter = computed(() => CHAPTERS.find((c) => c.id === route.params.id) || null);
const index = computed(() => CHAPTERS.findIndex((c) => c.id === chapter.value?.id));
const isDayChapter = computed(() => DAY_IDS.includes(chapter.value?.id));
const canPrev = computed(() => !!chapter.value);
const canNext = computed(() => !chapter.value || index.value < CHAPTERS.length - 1);

function dayLabel(item) {
  const m = String(item.title || '').match(/Day\s*\d+/i);
  return m ? m[0] : item.id;
}
const previewSrc = ref('');
const previewAlt = ref('');

function media(name) {
  const base = import.meta.env.BASE_URL || '/m/';
  return `${base}camp-media/${name}`;
}

function preview(src, alt = '') {
  previewSrc.value = src;
  previewAlt.value = alt;
}

watch(
  chapter,
  (c) => {
    document.title = c ? `${c.title}｜AI科研实践营` : 'AI科研与跨学科创新实践营';
  },
  { immediate: true },
);

function open(id) {
  router.push(id ? `/camp/${id}` : '/camp');
}

function go(step) {
  if (!chapter.value) {
    if (step > 0) open(CHAPTERS[0].id);
    return;
  }
  const next = CHAPTERS[index.value + step];
  if (next) open(next.id);
  else if (step < 0) open('');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制提示词');
  } catch {
    toast('复制失败，请长按选择');
  }
}

const IconBook = { template: `<svg viewBox="0 0 48 48" fill="none"><path d="M10 8h20a6 6 0 0 1 6 6v26H16a6 6 0 0 0-6 6V8z" fill="#fff" stroke="#3b82f6" stroke-width="2"/><path d="M10 40a6 6 0 0 1 6-6h26" stroke="#3b82f6" stroke-width="2"/><path d="M18 16h14M18 22h10" stroke="#60a5fa" stroke-width="2" stroke-linecap="round"/></svg>` };
const IconLaptop = { template: `<svg viewBox="0 0 48 48" fill="none"><rect x="8" y="10" width="32" height="22" rx="3" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/><path d="M6 34h36l-3 6H9l-3-6z" fill="#3b82f6"/><text x="24" y="25" text-anchor="middle" font-size="10" font-weight="700" fill="#2563eb">AI</text></svg>` };
const IconPhotos = { template: `<svg viewBox="0 0 48 48" fill="none"><rect x="8" y="14" width="24" height="20" rx="3" fill="#bfdbfe" stroke="#3b82f6" stroke-width="2"/><rect x="16" y="8" width="24" height="20" rx="3" fill="#fff" stroke="#2563eb" stroke-width="2"/><circle cx="24" cy="16" r="3" fill="#60a5fa"/><path d="M18 26l5-5 8 8H18z" fill="#93c5fd"/></svg>` };
const IconChart = { template: `<svg viewBox="0 0 48 48" fill="none"><path d="M10 34V18M20 34V12M30 34V22M38 34V10" stroke="#3b82f6" stroke-width="4" stroke-linecap="round"/><circle cx="38" cy="16" r="8" fill="#60a5fa"/><path d="M38 16h8a8 8 0 0 0-8-8v8z" fill="#2563eb"/></svg>` };
const IconSun = { template: `<svg viewBox="0 0 48 48" fill="none"><rect x="6" y="20" width="36" height="18" rx="4" fill="#bfdbfe"/><path d="M6 28c6-8 12-8 18 0s12 8 18 0" fill="#93c5fd"/><circle cx="34" cy="14" r="6" fill="#fbbf24"/><path d="M34 4v3M34 21v3M24 14h3M41 14h3M27 7l2 2M41 21l2 2M27 21l2-2M41 7l2-2" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/></svg>` };
const IconGrid = { template: `<svg viewBox="0 0 48 48" fill="none"><circle cx="16" cy="16" r="7" fill="#86efac"/><circle cx="32" cy="16" r="7" fill="#93c5fd"/><circle cx="16" cy="32" r="7" fill="#f9a8d4"/><circle cx="32" cy="32" r="7" fill="#fde68a"/></svg>` };
const IconToolbox = { template: `<svg viewBox="0 0 48 48" fill="none"><rect x="8" y="18" width="32" height="20" rx="4" fill="#93c5fd" stroke="#2563eb" stroke-width="2"/><path d="M16 18v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4" stroke="#2563eb" stroke-width="2"/><rect x="20" y="24" width="8" height="6" rx="2" fill="#fff"/></svg>` };
const IconChat = { template: `<svg viewBox="0 0 48 48" fill="none"><rect x="6" y="10" width="28" height="20" rx="6" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/><path d="M14 30l-4 8 10-6" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/><text x="20" y="24" text-anchor="middle" font-size="9" font-weight="700" fill="#2563eb">AI</text><rect x="28" y="22" width="14" height="12" rx="5" fill="#fff" stroke="#60a5fa" stroke-width="2"/></svg>` };
const IconDocs = { template: `<svg viewBox="0 0 48 48" fill="none"><rect x="10" y="8" width="20" height="28" rx="3" fill="#fff" stroke="#3b82f6" stroke-width="2"/><path d="M16 16h8M16 22h8M16 28h5" stroke="#60a5fa" stroke-width="2"/><rect x="22" y="16" width="16" height="24" rx="3" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/></svg>` };
const IconClipboard = { template: `<svg viewBox="0 0 48 48" fill="none"><rect x="12" y="10" width="24" height="32" rx="4" fill="#fff" stroke="#2563eb" stroke-width="2"/><rect x="18" y="6" width="12" height="8" rx="3" fill="#93c5fd"/><circle cx="20" cy="22" r="2" fill="#22c55e"/><circle cx="20" cy="30" r="2" fill="#22c55e"/><path d="M26 22h8M26 30h8" stroke="#93c5fd" stroke-width="2"/></svg>` };
const IconShield = { template: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 6l16 6v12c0 10-7 16-16 20C15 40 8 34 8 24V12l16-6z" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/><path d="M18 24l5 5 8-10" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>` };
const IconLibrary = { template: `<svg viewBox="0 0 48 48" fill="none"><rect x="8" y="12" width="10" height="24" rx="2" fill="#93c5fd"/><rect x="20" y="8" width="10" height="28" rx="2" fill="#60a5fa"/><rect x="32" y="14" width="8" height="22" rx="2" fill="#3b82f6"/><path d="M6 38h36" stroke="#1d4ed8" stroke-width="3" stroke-linecap="round"/></svg>` };
const IconFlask = { template: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 3h6M10 3v7L5 18a3 3 0 0 0 2.5 4.5h9A3 3 0 0 0 19 18l-5-8V3" stroke="#fff" stroke-width="1.6"/><path d="M8 16h8" stroke="#7dd3fc" stroke-width="1.6"/></svg>` };
const IconLeaf = { template: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 19c8-1 12-8 14-16-8 2-15 8-14 16z" fill="#86efac" stroke="#fff" stroke-width="1.2"/><path d="M7 17c4-3 7-8 8-13" stroke="#fff" stroke-width="1.2"/></svg>` };

const icons = {
  book: IconBook,
  laptop: IconLaptop,
  photos: IconPhotos,
  chart: IconChart,
  sun: IconSun,
  grid: IconGrid,
  toolbox: IconToolbox,
  chat: IconChat,
  docs: IconDocs,
  clipboard: IconClipboard,
  shield: IconShield,
  library: IconLibrary,
};

function iconOf(name) {
  return icons[name] || IconBook;
}
</script>

<style scoped>
.camp {
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
  background: #eef4ff;
  color: #12305a;
  font-size: 15px;
  padding-bottom: 92px;
  box-shadow: 0 0 40px rgba(15, 50, 120, 0.08);
}
.hero {
  position: relative;
  overflow: hidden;
  padding: 22px 18px 56px;
  background: linear-gradient(160deg, #072056 0%, #0b3dab 42%, #1a7dff 78%, #49b7ff 100%);
  color: #fff;
}
.hero-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 80% 20%, rgba(120, 220, 255, 0.35), transparent 32%),
    radial-gradient(circle at 10% 80%, rgba(80, 140, 255, 0.35), transparent 30%);
}
.orbs span {
  position: absolute;
  border-radius: 50%;
  background: linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.04));
  border: 1px solid rgba(255,255,255,.18);
}
.o1 { width: 54px; height: 54px; left: 8%; top: 18%; }
.o2 { width: 36px; height: 36px; right: 42%; top: 12%; }
.o3 { width: 22px; height: 22px; left: 38%; top: 58%; }
.o4 { width: 16px; height: 16px; right: 18%; bottom: 22%; }
.hero-inner {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 10px;
  align-items: center;
}
.hero-copy { flex: 1; min-width: 0; }
.en {
  font-size: 10px;
  letter-spacing: 1.4px;
  opacity: 0.72;
  font-weight: 700;
}
h1 {
  margin: 8px 0 10px;
  font-size: 26px;
  line-height: 1.25;
  font-weight: 800;
}
h1 i {
  display: inline-block;
  width: 5px;
  height: 22px;
  margin-right: 8px;
  border-radius: 4px;
  background: #5ce1ff;
  vertical-align: -2px;
}
.hero-copy p {
  margin: 0;
  font-size: 13px;
  color: #d7ecff;
}
.cube-wrap {
  position: relative;
  width: 132px;
  height: 118px;
  flex: none;
}
.cube {
  position: absolute;
  right: 8px;
  top: 22px;
  width: 72px;
  height: 72px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, #8fd3ff, #2f7bff 55%, #1d4ed8);
  box-shadow: 0 12px 24px rgba(8, 40, 120, 0.35), inset 0 1px 0 rgba(255,255,255,.5);
  transform: rotate(-8deg);
}
.cube b {
  font-size: 22px;
  letter-spacing: 1px;
  text-shadow: 0 2px 0 rgba(0,40,120,.25);
}
.float {
  position: absolute;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(255,255,255,.16);
  border: 1px solid rgba(255,255,255,.28);
  display: grid;
  place-items: center;
  backdrop-filter: blur(6px);
}
.float svg { width: 18px; height: 18px; }
.f1 { left: 0; top: 8px; }
.f2 { right: 0; top: 0; }
.f3 { left: 6px; bottom: 8px; }
.f4 { right: 2px; bottom: 0; }

.sheet {
  position: relative;
  margin-top: -28px;
  background: #f4f8ff;
  border-radius: 28px 28px 0 0;
  padding: 18px 14px 24px;
  min-height: 60vh;
}
.toc-head, .chap-head { padding: 4px 6px 14px; }
.toc-head h2, .chap-head h2 {
  margin: 0 0 8px;
  font-size: 26px;
  color: #0b2a62;
}
.toc-head h2 span, .chap-kicker {
  color: #7aa0d6;
  font-size: 13px;
  font-weight: 700;
}
.hint {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  color: #6b8cb8;
  font-size: 12px;
}
.chap-kicker {
  display: block;
  margin-bottom: 6px;
  letter-spacing: 0.8px;
}
.chap-head h2 { display: block; }
.chap-head p { margin: 0; color: #5b7aa8; }
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.card-lead { width: 100%; margin-bottom: 10px; }
.day-pack {
  margin: 0 0 10px;
  padding: 10px;
  background: linear-gradient(180deg, #eef6ff, #f7fbff);
  border: 1px solid #d7e7ff;
  border-radius: 20px;
}
.day-pack-h {
  margin: 0 4px 8px;
  font-size: 13px;
  font-weight: 800;
  color: #1d4ed8;
}
.day-row {
  display: grid;
  gap: 8px;
}
.card.card-day {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 8px;
  min-height: 0;
  padding: 10px 10px;
}
.card-day .num { font-size: 16px; margin: 0; }
.card-day .card-title { margin: 0; font-size: 13px; }
.card-day .card-brief { margin: 2px 0 0; font-size: 11px; padding-right: 0; }
.card-day .ico { width: 32px; height: 32px; }
.card-day .ico :deep(svg) { width: 32px; height: 32px; }
.day-copy { min-width: 0; }
.day-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin: 0 0 14px;
}
.day-tabs button {
  height: 36px;
  border-radius: 999px;
  background: #e8f1ff;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 800;
}
.day-tabs button.on {
  background: #2563eb;
  color: #fff;
}
.card {
  position: relative;
  text-align: left;
  background: #fff;
  border: 1px solid #e7effc;
  border-radius: 18px;
  padding: 14px 12px 16px;
  box-shadow: 0 8px 20px rgba(36, 90, 180, 0.06);
  min-height: 132px;
}
.card.active {
  background: linear-gradient(180deg, #f4f9ff, #eaf3ff);
  border-color: #cfe3ff;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.12);
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.num {
  font-size: 22px;
  font-weight: 800;
  color: #1d4ed8;
  letter-spacing: 0.5px;
}
.ico { width: 42px; height: 42px; }
.ico :deep(svg) { width: 42px; height: 42px; }
.card-title {
  margin-top: 10px;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.35;
  color: #15305f;
}
.card-brief {
  margin-top: 4px;
  font-size: 11px;
  color: #7b93b5;
  line-height: 1.4;
  padding-right: 22px;
}
.go {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #e8f1ff;
  color: #2b6fe0;
  display: grid;
  place-items: center;
  font-size: 12px;
}

.block { margin: 0 0 14px; }
.lead {
  margin: 0;
  padding: 14px 14px;
  background: #fff;
  border-radius: 16px;
  line-height: 1.7;
  color: #1e3a5f;
  box-shadow: 0 6px 16px rgba(30, 80, 160, 0.05);
}
.h {
  margin: 18px 2px 8px;
  font-size: 17px;
  color: #0b2a62;
}
.p { margin: 0 2px 8px; line-height: 1.7; color: #244468; }
.quote, .formula, .callout, .prompt, .mini, .loop-item, .res {
  background: #fff;
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: 0 6px 16px rgba(30, 80, 160, 0.05);
}
.quote {
  margin: 0;
  border-left: 4px solid #3b82f6;
  color: #1e3a5f;
  line-height: 1.7;
}
.callout { line-height: 1.7; }
.callout.info { background: #eef6ff; }
.callout.warn { background: #fff7ed; color: #9a3412; }
.callout.ok { background: #ecfdf5; color: #065f46; }
.formula-t { font-size: 12px; color: #64748b; margin-bottom: 6px; }
.formula-b { font-weight: 700; color: #1d4ed8; line-height: 1.6; }
.ol, .ul { margin: 0; padding: 4px 4px 4px 22px; color: #244468; line-height: 1.7; }
.ol li, .ul li { margin: 0 0 8px; }
.check { list-style: none; margin: 0; padding: 0; }
.check li {
  display: flex;
  gap: 8px;
  background: #fff;
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
  line-height: 1.6;
}
.check i {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border: 2px solid #60a5fa;
  border-radius: 4px;
}
.kpis, .loop, .mini-cards {
  display: grid;
  gap: 8px;
}
.kpis { grid-template-columns: 1fr 1fr; }
.kpi, .loop-item, .mini {
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  text-align: center;
}
.kpi b { display: block; color: #1d4ed8; font-size: 14px; line-height: 1.3; }
.kpi span { color: #7b93b5; font-size: 12px; }
.loop-day { color: #2563eb; font-weight: 800; font-size: 12px; }
.loop-title { font-weight: 800; margin: 4px 0; }
.loop-text { font-size: 13px; color: #5b7aa8; line-height: 1.55; }
.mini { text-align: left; }
.mini b { color: #1d4ed8; }
.mini p { margin: 6px 0 0; font-size: 13px; color: #335679; line-height: 1.6; }
.compare { display: grid; gap: 8px; }
.cmp {
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.55;
}
.cmp span {
  display: inline-block;
  margin-right: 6px;
  font-size: 11px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 999px;
}
.cmp.bad { background: #fff1f2; color: #9f1239; }
.cmp.bad span { background: #fecdd3; }
.cmp.good { background: #ecfdf5; color: #065f46; }
.cmp.good span { background: #bbf7d0; }
.table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 6px 16px rgba(30, 80, 160, 0.05);
}
.caption, .table-hint { padding: 10px 12px 0; font-size: 12px; color: #64748b; }
.table-hint { padding-top: 4px; }
table {
  width: max-content;
  min-width: 760px;
  border-collapse: collapse;
  font-size: 12px;
}
th, td {
  border-bottom: 1px solid #e8eef8;
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
  line-height: 1.55;
  min-width: 150px;
  max-width: 280px;
}
th { background: #eef5ff; color: #1d4ed8; font-weight: 700; }
th:first-child, td:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 58px;
  min-width: 58px;
  max-width: 58px;
  padding: 8px 4px;
  font-size: 11px;
  line-height: 1.3;
  word-break: break-word;
  box-shadow: 6px 0 8px -6px rgba(20, 50, 110, 0.18);
}
th:first-child { background: #e8f1ff; }
td:first-child { background: #f8fbff; font-weight: 700; }
.prompt-h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.prompt-h button {
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-size: 12px;
}
.prompt pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
  color: #1e3a5f;
  background: #f8fbff;
  border-radius: 10px;
  padding: 10px;
}
.resources { display: grid; gap: 8px; }
.res { display: block; }
.res b { display: block; color: #12305a; }
.res .url { display: block; color: #2563eb; font-size: 12px; word-break: break-all; margin: 4px 0; }
.res p { margin: 0; color: #5b7aa8; font-size: 13px; line-height: 1.6; }

.bar {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  bottom: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
  background: rgba(255,255,255,.94);
  backdrop-filter: blur(10px);
  border-top: 1px solid #e4edfb;
}
.bar-home, .nav-btn {
  height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  background: #e8f1ff;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}
.nav-btn { background: #2563eb; color: #fff; }
.nav-btn.ghost { background: #e8f1ff; color: #1d4ed8; }
.nav-btn:disabled, .bar-home:disabled { opacity: 0.4; }
.bar-now {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  color: #5b7aa8;
  font-size: 12px;
}
.bar-nav { display: flex; gap: 6px; }

.fig {
  display: block;
  width: 100%;
  padding: 0;
  overflow: hidden;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 20px rgba(36, 90, 180, 0.08);
  text-align: left;
}
.fig img {
  width: 100%;
  height: auto;
  display: block;
}
.fig span {
  display: block;
  padding: 8px 12px 10px;
  color: #5b7aa8;
  font-size: 12px;
  line-height: 1.4;
}
.fig-block { margin: 0; }
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(8, 20, 48, 0.92);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 16px 12px 80px;
}
.lightbox img {
  width: 100%;
  max-height: 80vh;
  object-fit: contain;
  border-radius: 8px;
}
.lightbox p {
  margin: 10px 4px 0;
  color: #dbeafe;
  font-size: 13px;
  text-align: center;
}
</style>
