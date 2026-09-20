<template>
  <section>
    <div class="page-head">
      <div>
        <p class="crumb">课程管理 / 课程列表</p>
        <h1>课程管理</h1>
        <p>新增、修改课程，已安排老师的课程不能删除</p>
      </div>
      <div class="actions">
        <router-link v-if="!schoolAccount" class="btn" to="/categories"><Icon name="folder" />课程分类</router-link>
        <button class="btn primary" @click="openForm()">+ 新增课程</button>
      </div>
    </div>
    <div class="course-kpis">
      <article v-for="item in summary" :key="item.label" class="card course-kpi">
        <span :class="['kpi-icon', item.tone]"><Icon :name="item.icon" /></span>
        <div>
          <small>{{ item.label }}</small>
          <strong>{{ item.value }} 门课程</strong>
        </div>
      </article>
    </div>
    <div class="course-filters">
      <label class="field search-field">
        <Icon name="search" />
        <input v-model="keyword" placeholder="搜索课程名称" @keyup.enter="reload" />
      </label>
      <label class="field pick">
        <select v-model="status">
          <option value="">全部状态</option>
          <option value="1">上架</option>
          <option value="0">下架</option>
        </select>
        <Icon name="chevron" />
      </label>
      <label class="field pick">
        <select v-model="isFree">
          <option value="">全部价格</option>
          <option value="1">免费</option>
          <option value="0">付费</option>
        </select>
        <Icon name="chevron" />
      </label>
      <label class="field pick">
        <select v-model="categoryId">
          <option value="">全部分类</option>
          <option v-for="item in categories" :key="item.id" :value="String(item.id)">{{ item.name }}</option>
        </select>
        <Icon name="chevron" />
      </label>
      <button class="btn" type="button" @click="resetFilters">重置</button>
      <button class="btn primary" type="button" @click="reload"><Icon name="search" />搜索</button>
      <button class="btn danger" :disabled="!selected.length" @click="askRemoveSelected">批量删除{{ selected.length ? `（${selected.length}）` : '' }}</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <article class="card">
      <table>
        <thead>
          <tr><th class="check-col"><input type="checkbox" :checked="allChecked" :disabled="!selectable.length" @change="toggleAll" /></th><th>课程</th><th>分类</th><th>老师</th><th v-if="!schoolAccount">校企业</th><th>校方价格</th><th v-if="!schoolAccount">课时费</th><th>状态</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="item in result.list" :key="item.id">
            <td class="check-col"><input type="checkbox" :disabled="!canDelete(item)" :checked="selected.includes(item.id)" :title="lockReason(item)" @change="toggle(item)" /></td>
            <td>
              <div class="course-cell"><span class="thumb">课</span><span>{{ item.title }}</span></div>
            </td>
            <td>{{ item.category?.name || '—' }}</td>
            <td>{{ item.teacher?.teacherCert?.realName || item.teacher?.nickname || '未安排' }}</td>
            <td v-if="!schoolAccount">{{ item.owner?.name || '—' }}</td>
            <td>{{ item.isFree ? '免费' : money(item.price) }}</td>
            <td v-if="!schoolAccount">{{ item.sessionFee == null ? '—' : money(item.sessionFee) }}</td>
            <td><span :class="['tag', item.status === 1 ? 'green' : '']">{{ item.status === 1 ? '上架' : '下架' }}</span></td>
            <td>
              <div class="row-actions">
                <button v-if="!schoolAccount && item._count?.sessions" class="link plan" type="button" @click="openPlan(item)">已排课</button>
                <button v-else-if="!schoolAccount" class="link wait" type="button" @click="goSchedule(item)">未排课</button>
                <button class="link" @click="openForm(item)">编辑</button>
                <button class="link danger" :disabled="!!item.teacherId" :title="item.teacherId ? '已安排老师，不能删除' : ''" @click="askRemove(item)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!result.list.length">
            <td :colspan="schoolAccount ? 7 : 9">
              <div class="course-empty">
                <Icon name="search" />
                <strong>暂无课程</strong>
                <p>还没有创建任何课程，点击右上角「新增课程」开始吧</p>
                <button class="btn primary" type="button" @click="openForm()">+ 新增课程</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <Pager :page="result.pagination.page" :total-pages="result.pagination.totalPages" :total="result.pagination.total" :page-size="pageSize" :sizes="[10, 20, 50]" @change="changePage" @size="changeSize" />
    </article>

    <div v-if="form" class="modal-mask">
      <div class="modal course-dialog" role="dialog">
        <header class="course-head">
          <div class="course-head-main">
            <span class="course-mark"><Icon name="book" /></span>
            <div>
              <h3>{{ form.id ? '编辑课程' : '新增课程' }}</h3>
              <p>{{ form.id ? '修改课程信息，设置课程内容与授课安排' : '创建新的课程信息，设置课程内容与授课安排' }}</p>
            </div>
          </div>
          <button class="modal-close" type="button" @click="form = null">×</button>
        </header>
        <form id="course-form" class="form course-form" @submit.prevent="save">
          <div class="course-sec blue"><i></i><Icon name="clock" /><span>基础信息</span></div>
          <div class="course-grid">
            <label class="course-field">
              <span>课程名称<em>*</em></span>
              <div class="course-control">
                <Icon name="book" />
                <input v-model="form.title" placeholder="请输入课程名称" required />
              </div>
            </label>
            <label class="course-field">
              <span>课程分类<em>*</em></span>
              <div class="course-control">
                <Icon name="layers" />
                <select v-model.number="form.categoryId" required>
                  <option disabled value="">请选择</option>
                  <option v-for="item in categories" :key="item.id" :value="item.id">{{ item.name }}</option>
                </select>
                <Icon name="chevron" />
              </div>
            </label>
            <label class="course-field">
              <span>难度等级<em>*</em></span>
              <div class="course-control">
                <Icon name="signal" />
                <select v-model="form.level" required>
                  <option value="beginner">入门</option>
                  <option value="intermediate">进阶</option>
                  <option value="advanced">高级</option>
                </select>
                <Icon name="chevron" />
              </div>
            </label>
            <label class="course-field">
              <span>校方价格<em>*</em></span>
              <div class="course-control">
                <b class="yen">¥</b>
                <input v-model="form.price" type="number" min="0" step="0.01" placeholder="请输入校方价格" required />
                <em class="unit">元/课时</em>
              </div>
            </label>
            <label v-if="!schoolAccount" class="course-field">
              <span>课时费<em>*</em></span>
              <div class="course-control">
                <b class="yen">¥</b>
                <input v-model="form.sessionFee" type="number" min="0" step="0.01" placeholder="请输入教师结算费用" required />
                <em class="unit">元/课时</em>
              </div>
            </label>
            <label class="course-field">
              <span>课程封面</span>
              <button class="cover-box" type="button" @click="pickCover">
                <img v-if="form.cover" :src="form.cover" alt="" />
                <span v-else>
                  <Icon name="image" />
                  <strong>点击上传课程封面</strong>
                  <small>支持 jpg、png 格式，建议尺寸 750 × 420</small>
                </span>
              </button>
              <input ref="coverInput" class="cover-file" type="file" accept="image/jpeg,image/png" @change="onCover" />
            </label>
          </div>

          <div class="course-sec green"><i></i><Icon name="cal" /><span>授课信息</span></div>
          <div class="course-grid">
            <label class="course-field">
              <span>学校</span>
              <div class="course-control">
                <Icon name="building" />
                <select v-model="form.schoolId" @change="pickSchool">
                  <option value="">请选择学校</option>
                  <option v-for="item in schools" :key="item.id" :value="String(item.id)">{{ item.name }}</option>
                </select>
                <Icon name="chevron" />
              </div>
              <small v-if="form.schoolId" class="region-note">已记录 {{ form.province || '未设置省份' }} · {{ form.city || '未设置城市' }}</small>
            </label>
            <label class="course-field">
              <span>教室</span>
              <div class="course-control">
                <Icon name="pin" />
                <input v-model="form.classroom" placeholder="请输入教室名称" />
              </div>
            </label>
            <label class="course-field">
              <span>默认班级</span>
              <div class="course-control">
                <Icon name="users" />
                <input v-model="form.gradeLabel" placeholder="请输入班级名称（可选）" />
              </div>
            </label>
            <label v-if="!schoolAccount" class="course-field">
              <span>所属校企业</span>
              <div class="course-control">
                <Icon name="building" />
                <select v-model="form.ownerId">
                  <option value="">不分配</option>
                  <option v-for="item in schoolAccounts" :key="item.id" :value="String(item.id)">{{ item.name }} · {{ item.username }}</option>
                </select>
                <Icon name="chevron" />
              </div>
            </label>
            <label class="course-field">
              <span>安排老师</span>
              <div class="course-control">
                <Icon name="user" />
                <div class="select-search" ref="teacherBox">
                  <button type="button" class="select-search-trigger" @click="toggleTeacherMenu">
                    <span>{{ pickedLabel }}</span>
                    <Icon name="chevron" />
                  </button>
                </div>
              </div>
            </label>
          </div>
          <div class="course-note">
            <Icon name="info" />
            <span>上课时间不在这里填。一门课每周可以上多节，到学期排课里生成时再设置。</span>
          </div>

          <div class="course-sec orange"><i></i><Icon name="pencil" /><span>课程简介</span></div>
          <label class="course-field">
            <span>课程简介</span>
            <div class="course-area">
              <Icon name="pencil" />
              <textarea v-model="form.description" maxlength="500" placeholder="请输入课程简介、课程目标、适合人群等信息..."></textarea>
              <small>{{ descriptionCount }}/500</small>
            </div>
          </label>

          <div class="course-sec slate"><i></i><Icon name="gear" /><span>其他设置</span></div>
          <div class="course-settings">
            <div>
              <span>课程状态</span>
              <div class="set-line">
                <button class="switch" :class="{ on: form.published }" type="button" @click="form.published = !form.published" :aria-pressed="form.published"></button>
                <div>
                  <strong>{{ form.published ? '启用' : '停用' }}</strong>
                  <small>关闭后，课程将不在前台显示</small>
                </div>
              </div>
            </div>
            <label>
              <span>允许报名</span>
              <div class="set-line">
                <input v-model="form.allowEnroll" type="checkbox" />
                <div>
                  <strong>允许报名</strong>
                  <small>教师可申请/抢课</small>
                </div>
              </div>
            </label>
            <label>
              <span>推荐课程</span>
              <div class="set-line">
                <input v-model="form.isRecommend" type="checkbox" />
                <div>
                  <strong>推荐课程</strong>
                  <small>在课程列表中优先展示</small>
                </div>
              </div>
            </label>
          </div>
          <p v-if="formError" class="error">{{ formError }}</p>
        </form>
        <div class="course-foot">
          <button class="btn" type="button" @click="form = null">取消</button>
          <button class="btn primary" type="submit" form="course-form" :disabled="saving"><Icon name="check" />{{ saving ? '保存中' : '保存' }}</button>
        </div>
      </div>
    </div>
    <Confirm :open="!!pending.length" :message="confirmText" @cancel="pending = []" @ok="remove" />
    <Teleport to="body">
      <div v-if="form && teacherOpen" ref="teacherMenu" class="select-search-menu" :style="menuStyle">
        <input v-model="teacherQuery" placeholder="搜索姓名、工号或手机号" autocomplete="off" />
        <div class="select-search-list">
          <button type="button" :class="{ on: !form.teacherId }" @mousedown.prevent="pickTeacher(null)">未安排（可抢课）</button>
          <button
            v-for="item in filteredTeachers"
            :key="item.id"
            type="button"
            :class="{ on: String(item.id) === form.teacherId, off: !item.contractSigned && String(item.id) !== form.teacherId }"
            @mousedown.prevent="pickTeacher(item)"
          >{{ teacherLabel(item) }}</button>
          <p v-if="!filteredTeachers.length" class="combo-empty">没有认证通过的老师</p>
        </div>
        <p v-if="missingTeacher" class="combo-empty warn">当前老师未认证，请重新选择</p>
      </div>
    </Teleport>

    <div v-if="plan" class="modal-mask">
      <div class="modal plan-dialog" role="dialog">
        <header>
          <div>
            <h3>{{ plan.course.title }}</h3>
            <p class="muted">点某一节可改日期和时间，也可以加一节或删掉。</p>
          </div>
          <div class="plan-head-actions">
            <button v-if="!planEnded" class="btn primary" type="button" @click="openQuick">快捷生成</button>
            <button class="modal-close" type="button" @click="closePlan">×</button>
          </div>
        </header>
        <div class="form">
          <label v-if="plan.semesters.length > 1">学期
            <select v-model="planSemesterId" @change="focusPlanMonth">
              <option v-for="item in plan.semesters" :key="item.id" :value="item.id">{{ item.label }} {{ item.name }}</option>
            </select>
          </label>
          <div class="cal-nav">
            <button type="button" class="btn" @click="shiftPlanMonth(-1)">上个月</button>
            <strong class="plan-month">{{ planYear }}年{{ planMonth }}月</strong>
            <button type="button" class="btn" @click="shiftPlanMonth(1)">下个月</button>
          </div>
          <p v-if="planEnded" class="muted">这个学期已结束，课表只读。</p>
          <div class="cal-week"><span v-for="name in weekNames.slice(1)" :key="name">{{ name }}</span></div>
          <div class="cal-grid">
            <div
              v-for="cell in planCells"
              :key="cell.key"
              class="cal-cell plan-cell"
              :class="{ empty: cell.empty, weekend: cell.weekend, holiday: cell.holiday, off: cell.inTerm === false }"
            >
              <b v-if="!cell.empty">{{ cell.day }}</b>
              <button
                v-for="item in cell.sessions"
                :key="item.id"
                type="button"
                class="cal-chip"
                :disabled="planEnded"
                @click="openSession(item)"
              >{{ item.startTime }}{{ item.endTime ? `-${item.endTime}` : '' }}</button>
              <button v-if="!cell.empty && !planEnded && cell.inTerm !== false" type="button" class="cal-add" @click="openAdd(cell.date)">+</button>
            </div>
          </div>
          <p v-if="planError" class="error">{{ planError }}</p>
        </div>
      </div>
    </div>

    <div v-if="quickForm" class="modal-mask">
      <div class="modal" role="dialog">
        <header>
          <h3>快捷生成「{{ plan?.course?.title }}」</h3>
          <button class="modal-close" type="button" @click="quickForm = null">×</button>
        </header>
        <form class="form" @submit.prevent="runQuick">
          <p class="muted">按下面的每周时间继续排。没改过的生成课次会按新时间重排，单独改过的课次会保留。</p>
          <label>生成次数<input v-model.number="quickForm.count" type="number" min="1" max="200" required /></label>
          <div v-for="(slot, index) in quickForm.slots" :key="index" class="slot-row">
            <label>星期
              <select v-model="slot.weekday">
                <option v-for="day in 5" :key="day" :value="String(day)">{{ weekNames[day] }}</option>
              </select>
            </label>
            <label>开始<input v-model="slot.startTime" type="time" required /></label>
            <label>结束<input v-model="slot.endTime" type="time" /></label>
            <button class="btn" type="button" :disabled="quickForm.slots.length === 1" @click="quickForm.slots.splice(index, 1)">删除</button>
          </div>
          <button class="btn" type="button" @click="quickForm.slots.push({ weekday: '3', startTime: '19:00', endTime: '20:00' })">再加一节</button>
          <p v-if="planError" class="error">{{ planError }}</p>
          <div class="form-actions">
            <button class="btn primary" type="submit" :disabled="planSaving">{{ planSaving ? '生成中' : '按次数生成' }}</button>
            <button class="btn" type="button" @click="quickForm = null">取消</button>
          </div>
        </form>
      </div>
    </div>
    <div v-if="sessionForm" class="modal-mask">
      <div class="modal narrow" role="dialog">
        <header>
          <h3>{{ sessionForm.id ? '调整这一节' : '加一节' }}</h3>
          <button class="modal-close" type="button" @click="sessionForm = null">×</button>
        </header>
        <form class="form" @submit.prevent="saveSession">
          <label>日期<input v-model="sessionForm.date" type="date" required /></label>
          <div class="form-row">
            <label>开始<input v-model="sessionForm.startTime" type="time" required /></label>
            <label>结束<input v-model="sessionForm.endTime" type="time" /></label>
          </div>
          <p v-if="sessionError" class="error">{{ sessionError }}</p>
          <div class="form-actions">
            <button class="btn primary" type="submit" :disabled="planSaving">保存</button>
            <button v-if="sessionForm.id" class="btn danger" type="button" :disabled="planSaving" @click="removeSession">删除这一节</button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, getProfile } from '../api';
import { money } from '../format';
import Pager from '../components/Pager.vue';
import Confirm from '../components/Confirm.vue';
import Icon from '../components/Icon.vue';

const router = useRouter();
const schoolAccount = getProfile()?.role === 'school';
const schoolAccounts = ref([]);
const weekNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const keyword = ref('');
const status = ref('');
const isFree = ref('');
const page = ref(1);
const pageSize = ref(10);
const categoryId = ref('');
const error = ref('');
const form = ref(null);
const pending = ref([]);
const selected = ref([]);
const formError = ref('');
const saving = ref(false);
const categories = ref([]);
const teachers = ref([]);
const schools = ref([]);
const teacherQuery = ref('');
const teacherOpen = ref(false);
const teacherBox = ref(null);
const teacherMenu = ref(null);
const menuStyle = ref({});
const coverInput = ref(null);
function teacherLabel(item) {
  if (!item) return '';
  const name = item.realName || item.nickname || `教师${item.id}`;
  const extra = [item.teacherNo, item.phone].filter(Boolean).join(' · ');
  const base = extra ? `${name} · ${extra}` : name;
  return item.contractSigned ? base : `${base} · 未签合同`;
}
const filteredTeachers = computed(() => {
  const text = teacherQuery.value.trim().toLowerCase();
  if (!text) return teachers.value;
  return teachers.value.filter((item) => teacherLabel(item).toLowerCase().includes(text));
});
const pickedLabel = computed(() => {
  const selected = teachers.value.find((item) => String(item.id) === form.value?.teacherId);
  return selected ? teacherLabel(selected) : '未安排（可抢课）';
});
const missingTeacher = computed(() => {
  if (!form.value?.teacherId) return false;
  return !teachers.value.some((item) => String(item.id) === form.value.teacherId);
});
function pickTeacher(item) {
  if (!form.value) return;
  if (item && !item.contractSigned && String(item.id) !== String(form.value.teacherId)) {
    formError.value = '该老师尚未签订合同，不能安排课程';
    return;
  }
  formError.value = '';
  form.value.teacherId = item ? String(item.id) : '';
  teacherQuery.value = '';
  teacherOpen.value = false;
}
function placeTeacherMenu() {
  const el = teacherBox.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  menuStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
  };
}
function toggleTeacherMenu() {
  teacherOpen.value = !teacherOpen.value;
  teacherQuery.value = '';
  if (teacherOpen.value) nextTick(placeTeacherMenu);
}
function onTeacherPointer(event) {
  if (!teacherOpen.value) return;
  const target = event.target;
  if (teacherBox.value?.contains(target) || teacherMenu.value?.contains(target)) return;
  teacherOpen.value = false;
}
function syncTeacherQuery() {
  teacherQuery.value = '';
  teacherOpen.value = false;
}
const descriptionCount = computed(() => String(form.value?.description || '').length);
function pickSchool() {
  const item = schools.value.find((row) => String(row.id) === String(form.value?.schoolId));
  if (!form.value) return;
  form.value.school = item?.name || '';
  form.value.province = item?.province || '';
  form.value.city = item?.city || '';
}
function pickCover() {
  coverInput.value?.click();
}
function onCover(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !form.value) return;
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    formError.value = '封面只支持 jpg、png';
    return;
  }
  if (file.size > 1.5 * 1024 * 1024) {
    formError.value = '封面不能超过 1.5MB';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (form.value) form.value.cover = String(reader.result || '');
    formError.value = '';
  };
  reader.readAsDataURL(file);
}
const result = ref({ list: [], pagination: { page: 1, totalPages: 1, total: 0 }, stats: { all: 0, published: 0, unpublished: 0, free: 0, paid: 0 } });
const summary = computed(() => {
  const stats = result.value.stats || { all: 0, published: 0, unpublished: 0, free: 0, paid: 0 };
  return [
    { label: '全部课程', value: stats.all, icon: 'book', tone: 'blue' },
    { label: '上架课程', value: stats.published, icon: 'play', tone: 'green' },
    { label: '下架课程', value: stats.unpublished, icon: 'clock', tone: 'orange' },
    { label: '免费课程', value: stats.free, icon: 'folder', tone: 'violet' },
    { label: '付费课程', value: stats.paid, icon: 'receipt', tone: 'red' },
  ];
});

function blank() {
  return {
    id: null,
    title: '',
    categoryId: categories.value[0]?.id || '',
    price: '',
    originalPrice: '',
    sessionFee: '',
    cover: '',
    level: 'beginner',
    school: '',
    schoolId: '',
    province: '',
    city: '',
    classroom: '',
    gradeLabel: '',
    teacherId: '',
    ownerId: '',
    description: '',
    isFree: false,
    isRecommend: false,
    isHot: false,
    allowEnroll: true,
    published: true,
  };
}

function canDelete(item) {
  return !item.teacherId && !item._count?.orders && !item._count?.userCourses;
}
function lockReason(item) {
  if (item.teacherId) return '已安排老师，不能删除';
  if (item._count?.orders || item._count?.userCourses) return '已有订单或学习记录，不能删除';
  return '';
}
const selectable = computed(() => result.value.list.filter(canDelete));
const allChecked = computed(() => selectable.value.length > 0 && selectable.value.every((item) => selected.value.includes(item.id)));
const confirmText = computed(() => {
  if (pending.value.length === 1) return `确定删除「${pending.value[0].title}」？`;
  if (pending.value.length > 1) return `确定删除选中的 ${pending.value.length} 门课程？已安排老师的不会删除。`;
  return '';
});
function toggle(item) {
  if (!canDelete(item)) return;
  selected.value = selected.value.includes(item.id)
    ? selected.value.filter((id) => id !== item.id)
    : [...selected.value, item.id];
}
function toggleAll(event) {
  const ids = selectable.value.map((item) => item.id);
  selected.value = event.target.checked
    ? [...new Set([...selected.value, ...ids])]
    : selected.value.filter((id) => !ids.includes(id));
}
async function load() {
  error.value = '';
  try {
    result.value = await api.courses({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value,
      status: status.value,
      isFree: isFree.value,
      categoryId: categoryId.value,
    });
  } catch (err) {
    error.value = err.message;
  }
}
function reload() { page.value = 1; load(); }
function resetFilters() {
  keyword.value = '';
  status.value = '';
  isFree.value = '';
  categoryId.value = '';
  reload();
}
function changePage(next) { page.value = next; load(); }
function changeSize(next) { pageSize.value = next; reload(); }

function openForm(item) {
  formError.value = '';
  form.value = item
    ? {
        id: item.id,
        title: item.title,
        categoryId: item.categoryId,
        price: item.price,
        originalPrice: item.originalPrice ?? '',
        sessionFee: item.sessionFee ?? '',
        cover: item.cover || '',
        level: item.level || 'beginner',
        school: item.school || '',
        schoolId: item.schoolId ? String(item.schoolId) : '',
        province: item.province || '',
        city: item.city || '',
        classroom: item.classroom || '',
        gradeLabel: item.gradeLabel || '',
        teacherId: item.teacherId ? String(item.teacherId) : '',
        ownerId: item.ownerId ? String(item.ownerId) : '',
        description: item.description || '',
        isFree: item.isFree,
        isRecommend: item.isRecommend,
        isHot: item.isHot,
        allowEnroll: item.teacherId ? true : item.seats !== 0,
        published: item.status === 1,
      }
    : blank();
  syncTeacherQuery();
}

async function save() {
  saving.value = true;
  formError.value = '';
  const body = {
    ...form.value,
    status: form.value.published ? 1 : 0,
    teacherId: form.value.teacherId ? Number(form.value.teacherId) : null,
    originalPrice: form.value.originalPrice === '' ? null : form.value.originalPrice,
    ownerId: schoolAccount ? undefined : (form.value.ownerId ? Number(form.value.ownerId) : null),
  };
  if (schoolAccount) delete body.sessionFee;
  try {
    if (form.value.id) await api.updateCourse(form.value.id, body);
    else await api.createCourse(body);
    form.value = null;
    await load();
  } catch (err) {
    formError.value = err.message;
  } finally {
    saving.value = false;
  }
}

function askRemove(item) {
  if (!canDelete(item)) return;
  pending.value = [item];
}
function askRemoveSelected() {
  const items = result.value.list.filter((item) => selected.value.includes(item.id) && canDelete(item));
  if (!items.length) return;
  pending.value = items;
}

async function remove() {
  const items = pending.value;
  if (!items.length) return;
  pending.value = [];
  error.value = '';
  try {
    const data = await api.deleteCourses(items.map((item) => item.id));
    selected.value = selected.value.filter((id) => !data.deleted.includes(id));
    await load();
    if (data.blocked?.length) {
      error.value = `已删除 ${data.deleted.length} 门，未删除：${data.blocked.map((item) => `${item.title}（${item.reason}）`).join('、')}`;
    }
  } catch (err) {
    error.value = err.message;
  }
}

const plan = ref(null);
const planSemesterId = ref(null);
const planYear = ref(0);
const planMonth = ref(0);
const planError = ref('');
const planSaving = ref(false);
const sessionForm = ref(null);
const sessionError = ref('');
const quickForm = ref(null);
const planSemester = computed(() => plan.value?.semesters?.find((item) => item.id === planSemesterId.value) || plan.value?.semesters?.[0] || null);
const planEnded = computed(() => planSemester.value?.phase === 'ended');
const planCells = computed(() => {
  const semester = planSemester.value;
  const year = planYear.value;
  const month = planMonth.value;
  if (!semester || !year) return [];
  const holidayMap = {};
  for (const item of plan.value?.holidays || []) {
    if (item.semesterId === semester.id) holidayMap[item.date] = item;
  }
  const sessionMap = {};
  for (const item of plan.value?.sessions || []) {
    if (item.semesterId !== semester.id) continue;
    if (!sessionMap[item.date]) sessionMap[item.date] = [];
    sessionMap[item.date].push(item);
  }
  const first = new Date(year, month - 1, 1);
  const lead = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const count = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push({ key: `e${i}`, empty: true, sessions: [] });
  for (let day = 1; day <= count; day += 1) {
    const date = `${year}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
    const jsDay = new Date(year, month - 1, day).getDay();
    const weekday = jsDay === 0 ? 7 : jsDay;
    cells.push({
      key: date,
      date,
      day,
      weekend: weekday >= 6,
      holiday: holidayMap[date] || null,
      inTerm: date >= semester.startDate && date <= semester.endDate,
      sessions: sessionMap[date] || [],
    });
  }
  return cells;
});

function goSchedule(item) {
  router.push({ path: '/term', query: { courseId: String(item.id) } });
}

function focusPlanMonth() {
  const semester = planSemester.value;
  if (!semester) return;
  const today = new Date();
  const todayText = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
  const first = (plan.value?.sessions || []).find((item) => item.semesterId === semester.id);
  const anchor = todayText >= semester.startDate && todayText <= semester.endDate
    ? todayText
    : (first?.date || semester.startDate);
  const [year, month] = anchor.split('-').map(Number);
  planYear.value = year;
  planMonth.value = month;
}

function shiftPlanMonth(delta) {
  let year = planYear.value;
  let month = planMonth.value + delta;
  if (month < 1) { month = 12; year -= 1; }
  if (month > 12) { month = 1; year += 1; }
  planYear.value = year;
  planMonth.value = month;
}

async function openPlan(item) {
  planError.value = '';
  sessionForm.value = null;
  try {
    const data = await api.coursePlan(item.id);
    if (!data.scheduled) {
      goSchedule(item);
      return;
    }
    plan.value = data;
    const active = data.semesters.find((row) => row.phase === 'active') || data.semesters[0];
    planSemesterId.value = active?.id || null;
    focusPlanMonth();
  } catch (err) {
    error.value = err.message;
  }
}

function closePlan() {
  plan.value = null;
  sessionForm.value = null;
  quickForm.value = null;
}

function openQuick() {
  if (planEnded.value || !plan.value) return;
  const rows = (plan.value.sessions || []).filter((item) => item.semesterId === planSemesterId.value && item.status === 'scheduled');
  const seen = new Set();
  const slots = [];
  for (const item of rows) {
    if (!item.weekday || item.weekday >= 6 || !item.startTime) continue;
    const key = `${item.weekday}|${item.startTime}|${item.endTime || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ weekday: String(item.weekday), startTime: item.startTime, endTime: item.endTime || '' });
  }
  planError.value = '';
  quickForm.value = {
    count: rows.length || 16,
    slots: slots.length ? slots : [{ weekday: '1', startTime: '16:00', endTime: '17:00' }],
  };
}

async function runQuick() {
  if (!quickForm.value || !plan.value || !planSemesterId.value) return;
  const slots = quickForm.value.slots.map((slot) => ({
    weekday: Number(slot.weekday),
    startTime: slot.startTime,
    endTime: slot.endTime || null,
  }));
  if (slots.some((slot) => !slot.startTime)) {
    planError.value = '请填写每节课的开始时间';
    return;
  }
  const count = Number(quickForm.value.count);
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    planError.value = '生成次数请填 1 到 200';
    return;
  }
  planSaving.value = true;
  planError.value = '';
  try {
    const data = await api.generateCourse(plan.value.course.id, { semesterId: planSemesterId.value, slots, count });
    const short = data.created < count ? `，学期结束前只排到 ${data.created} 节` : '';
    quickForm.value = null;
    planError.value = `已生成 ${data.created} 节${short}`;
    await refreshPlan();
  } catch (err) {
    planError.value = err.message;
  } finally {
    planSaving.value = false;
  }
}

function openSession(item) {
  if (planEnded.value) return;
  sessionError.value = '';
  sessionForm.value = {
    id: item.id,
    date: item.date,
    startTime: item.startTime || '',
    endTime: item.endTime || '',
  };
}

function openAdd(date) {
  if (planEnded.value) return;
  sessionError.value = '';
  sessionForm.value = { id: null, date, startTime: '16:00', endTime: '17:00' };
}

async function refreshPlan() {
  const kept = planSemester.value;
  const data = await api.coursePlan(plan.value.course.id);
  if (kept && !data.semesters.some((item) => item.id === kept.id)) data.semesters.unshift(kept);
  plan.value = data;
  if (!planSemesterId.value) planSemesterId.value = data.semesters[0]?.id || kept?.id || null;
  await load();
}

async function saveSession() {
  if (!sessionForm.value || !plan.value) return;
  planSaving.value = true;
  sessionError.value = '';
  try {
    const body = {
      date: sessionForm.value.date,
      startTime: sessionForm.value.startTime,
      endTime: sessionForm.value.endTime || null,
      semesterId: planSemesterId.value,
    };
    if (sessionForm.value.id) await api.updateCourseSession(plan.value.course.id, sessionForm.value.id, body);
    else await api.createCourseSession(plan.value.course.id, body);
    sessionForm.value = null;
    await refreshPlan();
  } catch (err) {
    sessionError.value = err.message;
  } finally {
    planSaving.value = false;
  }
}

async function removeSession() {
  if (!sessionForm.value?.id || !plan.value) return;
  planSaving.value = true;
  sessionError.value = '';
  try {
    await api.deleteCourseSession(plan.value.course.id, sessionForm.value.id);
    sessionForm.value = null;
    await refreshPlan();
  } catch (err) {
    sessionError.value = err.message;
  } finally {
    planSaving.value = false;
  }
}

onMounted(async () => {
  document.addEventListener('mousedown', onTeacherPointer);
  window.addEventListener('resize', placeTeacherMenu);
  window.addEventListener('scroll', placeTeacherMenu, true);
  const jobs = [api.categories(), api.teachers(), api.schools()];
  if (!schoolAccount) jobs.push(api.schoolAccounts());
  const [categoryList, teacherList, schoolList, accountList] = await Promise.all(jobs);
  categories.value = categoryList;
  teachers.value = Array.isArray(teacherList) ? teacherList : [];
  schools.value = Array.isArray(schoolList) ? schoolList.filter((item) => item.status !== 0) : [];
  schoolAccounts.value = Array.isArray(accountList) ? accountList : [];
  await load();
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onTeacherPointer);
  window.removeEventListener('resize', placeTeacherMenu);
  window.removeEventListener('scroll', placeTeacherMenu, true);
});
</script>
