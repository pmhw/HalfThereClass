<template>
  <div class="wrap">
    <LoginPanel v-if="!isLogin" slogan="登录后管理认证、收入和调课" @success="refresh" />
    <div v-else class="page-tab">
      <div class="nav"><span class="nav-title">我的</span></div>

      <div class="profile card" @click="goCert">
        <div class="who">
          <div class="avatar">
            <img v-if="userInfo?.avatar" :src="assetUrl(userInfo.avatar)" alt="" />
            <span v-else>{{ avatarText }}</span>
          </div>
          <div class="info">
            <div class="name">{{ userInfo?.nickname || '老师' }}</div>
            <div v-if="cert?.status === 'approved' && cert?.contractSigned" class="badge on">
              认证教师 · {{ cert.teacherNo }}
            </div>
            <div v-else-if="cert?.status === 'approved'" class="badge">认证已通过 · 待签合同</div>
            <div v-else-if="cert?.status === 'pending'" class="badge">认证审核中</div>
            <div v-else-if="cert?.status === 'rejected'" class="badge">认证未通过，可重新提交</div>
            <div v-else class="badge">未认证</div>
            <div class="slogan">用教育点亮更多孩子的未来</div>
          </div>
          <span class="chev">›</span>
        </div>
        <div class="stats">
          <div class="stat">
            <span class="num">{{ summary.total }}</span>
            <span>累计授课(节)</span>
          </div>
          <div class="vline" />
          <div class="stat">
            <span class="num">{{ summary.month }}</span>
            <span>本月授课(节)</span>
          </div>
          <div class="vline" />
          <div class="stat">
            <span class="num">{{ summary.ratingText }}</span>
            <span>学生评分</span>
          </div>
        </div>
      </div>

      <div class="menu card">
        <button type="button" class="item" @click="router.push('/teaching')">我的授课 ›</button>
        <button type="button" class="item" @click="router.push('/schedule')">课程时刻表 ›</button>
        <button type="button" class="item" @click="router.push('/courses')">课程大厅 ›</button>
        <button type="button" class="item" @click="goIncome">我的收入 ›</button>
        <button type="button" class="item" @click="goAdjust">登记调课 ›</button>
        <button type="button" class="item" @click="router.push('/profile')">编辑资料 ›</button>
        <button type="button" class="item" @click="goCert">认证资料 ›</button>
        <button
          v-if="cert?.status === 'approved' && !cert?.contractSigned"
          type="button"
          class="item"
          @click="goContract"
        >
          签订合同 <span class="need">未签订</span> ›
        </button>
      </div>

      <button type="button" class="logout" @click="logout">退出登录</button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getCert, getTeacherSummary } from '../api';
import LoginPanel from '../components/LoginPanel.vue';
import { assetUrl, clearSession, getUser, isLoggedIn } from '../store';
import { requireLogin } from '../utils/helpers';

const router = useRouter();
const isLogin = ref(isLoggedIn());
const userInfo = ref(getUser());
const cert = ref(null);
const avatarText = ref('师');
const summary = ref({ total: 0, month: 0, ratingText: '—' });

onMounted(refresh);

function refresh() {
  isLogin.value = isLoggedIn();
  userInfo.value = getUser();
  const name = userInfo.value?.nickname || '师';
  avatarText.value = name.slice(0, 1);
  if (isLogin.value) load();
}

async function load() {
  try {
    const [certData, sum] = await Promise.all([
      getCert(),
      getTeacherSummary().catch(() => ({ total: 0, month: 0, rating: null })),
    ]);
    cert.value = certData;
    summary.value = {
      total: sum.total || 0,
      month: sum.month || 0,
      ratingText: sum.rating == null ? '—' : String(sum.rating),
    };
  } catch {
    /* ignore */
  }
}

function goCert() {
  if (!requireLogin(router)) return;
  router.push('/certify');
}

function goContract() {
  if (!requireLogin(router)) return;
  router.push('/contract');
}

function goIncome() {
  if (!requireLogin(router)) return;
  router.push('/income');
}

function goAdjust() {
  if (!requireLogin(router)) return;
  router.push('/adjust');
}

function logout() {
  clearSession();
  isLogin.value = false;
  userInfo.value = null;
  cert.value = null;
}
</script>

<style scoped>
.wrap { min-height: 100vh; background: var(--bg-color); }
.nav { padding: calc(24 * var(--r)) calc(28 * var(--r)) 0; }
.nav-title { font-size: calc(40 * var(--r)); font-weight: 700; }
.profile { margin: calc(24 * var(--r)) calc(28 * var(--r)); cursor: pointer; }
.who { display: flex; align-items: center; gap: calc(20 * var(--r)); }
.avatar {
  width: calc(100 * var(--r));
  height: calc(100 * var(--r));
  border-radius: 50%;
  overflow: hidden;
  background: #eef4ff;
  color: #2563eb;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: calc(40 * var(--r));
  flex-shrink: 0;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.info { flex: 1; min-width: 0; }
.name { font-size: calc(34 * var(--r)); font-weight: 700; }
.badge { margin-top: calc(8 * var(--r)); color: #667085; font-size: calc(24 * var(--r)); }
.badge.on { color: #2563eb; font-weight: 600; }
.slogan { margin-top: calc(8 * var(--r)); color: #98a2b3; font-size: calc(22 * var(--r)); }
.chev { color: #d0d5dd; font-size: calc(36 * var(--r)); }
.stats {
  display: flex;
  margin-top: calc(28 * var(--r));
  padding-top: calc(24 * var(--r));
  border-top: 1px solid #f0f0f0;
}
.stat { flex: 1; text-align: center; color: #98a2b3; font-size: calc(22 * var(--r)); }
.num { display: block; color: #111827; font-size: calc(36 * var(--r)); font-weight: 700; margin-bottom: calc(4 * var(--r)); }
.vline { width: 1px; background: #f0f0f0; }
.menu { margin: 0 calc(28 * var(--r)); padding: 0; overflow: hidden; }
.item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: calc(28 * var(--r)) calc(24 * var(--r));
  border-bottom: 1px solid #f5f5f5;
  text-align: left;
  color: #344054;
}
.item:last-child { border-bottom: none; }
.need { margin-left: auto; margin-right: calc(8 * var(--r)); color: #ee0a24; font-size: calc(24 * var(--r)); }
.logout {
  display: block;
  width: calc(100% - 56 * var(--r));
  margin: calc(32 * var(--r)) calc(28 * var(--r));
  padding: calc(24 * var(--r));
  text-align: center;
  color: #667085;
  background: #fff;
  border-radius: calc(16 * var(--r));
}
</style>
