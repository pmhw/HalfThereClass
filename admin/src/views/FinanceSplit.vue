<template>
  <section class="split-page">
    <div class="page-head">
      <div>
        <h1>分成比例</h1>
        <p>合集与分成比例是通用规则，设置一次长期有效；每个月自动按当月「月度结算单」金额套用规则，扣除税费与转账手续费后算出实发。结算单或配置变动后，本页与「财务打款」自动刷新。<span v-if="updatedAt" class="updated">更新于 {{ updatedAt }}</span></p>
      </div>
      <div class="actions head-icons">
        <ActionBtn icon="layers" tip="分成规则" @click="openRules" />
        <ActionBtn v-if="canCourseRule" icon="book" tip="课程分成规则" @click="openCourseRules" />
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" kpis :kpi-count="4" @retry="load">
      <div class="split-tabs">
        <div class="tabs">
          <button v-for="t in tabs" :key="t.key" type="button" :class="{ on: tab === t.key }" @click="setTab(t.key)">
            {{ t.label }}<em v-if="t.count != null">{{ t.count }}</em>
          </button>
        </div>
      </div>

      <article v-if="tab === 'config'" class="card rule-card">
        <div class="rule-head">
          <div>
            <strong>计算规则<CalcTip name="split.flow" :ctx="config" /></strong>
            <p>
              转账手续费 = {{ money(config.feeUnit) }} × ⌈金额 ÷ {{ plain(config.feeStep) }}⌉：
              {{ plain(config.feeStep) }} 内 {{ money(config.feeUnit) }}，每多 {{ plain(config.feeStep) }}（不足按一档）再加 {{ money(config.feeUnit) }}
            </p>
          </div>
          <button
            v-if="!configSaved && !configDirty && !configError"
            class="btn tiny primary"
            type="button"
            :disabled="configSaving"
            title="还没保存过计算规则，确认后「配置检查」才算完成"
            @click="saveConfig(true)"
          >{{ configSaving ? '保存中…' : '确认使用当前规则' }}</button>
          <span v-else class="save-state" :class="{ err: configError, busy: configSaving || configDirty }">
            {{ configError || (configSaving ? '保存中…' : configDirty ? '待保存…' : '已自动保存') }}
          </span>
        </div>
        <div class="rule-grid">
          <label>
            <span>税率（%）<CalcTip name="split.tax" :ctx="config" /></span>
            <input v-model.number="config.taxRate" type="number" min="0" max="99.99" step="0.01" />
          </label>
          <label>
            <span>每档手续费（¥）<CalcTip name="split.fee" :ctx="config" /></span>
            <input v-model.number="config.feeUnit" type="number" min="0" step="0.01" />
          </label>
          <label>
            <span>每档金额（¥）</span>
            <input v-model.number="config.feeStep" type="number" min="1" step="1" />
          </label>
          <label>
            <span>分成基数<CalcTip name="split.basis" /></span>
            <select v-model="config.basis">
              <option value="profit">利润（校方合计 − 成本）</option>
              <option value="school">校方合计</option>
            </select>
          </label>
          <label class="check">
            <input v-model="config.teacherFee" type="checkbox" />
            <span>教师课时费打款手续费由平台承担、从分成池扣除（每位教师每月一笔）；不勾选则从教师课时费中扣<CalcTip name="split.teacherFee" :ctx="config" /></span>
          </label>
          <label class="check">
            <input v-model="config.orgFee" type="checkbox" />
            <span>机构打款手续费由平台承担、从分成池扣除（每个机构每月一笔）；不勾选则从机构费中扣<CalcTip name="split.orgFee" :ctx="config" /></span>
          </label>
          <label class="check">
            <input v-model="config.memberFee" type="checkbox" />
            <span>分成人员到账扣转账手续费<CalcTip name="split.memberFee" :ctx="config" /></span>
          </label>
        </div>
        <div class="fee-try">
          <span>试算转账手续费</span>
          <input v-model.number="tryAmount" type="number" min="0" step="0.01" placeholder="输入金额" />
          <strong>{{ money(transferFee(tryAmount, config)) }}</strong>
        </div>
      </article>

      <template v-if="tab === 'month'">
      <div class="section-head">
        <div>
          <h2>{{ month }} 股东分成<CalcTip name="split.flow" :ctx="config" /></h2>
          <p>按所选月份的结算单金额套用「分成规则」计算；每个合集下方有算式和手续费说明，完整口径见页尾「计算说明」。要打印 / 导出给股东的汇总请切到「月度结算单」。</p>
        </div>
      </div>

      <div class="kpi-grid split-kpis">
        <article class="card kpi">
          <div class="label">可分配合计<CalcTip name="split.pool" :ctx="config" /></div>
          <div class="value">{{ money(summary.pool) }}</div>
          <div class="meta"><span class="flat">{{ results.length }} 个合集<template v-if="summary.reimburse"> · 已扣报销 {{ money(summary.reimburse) }}</template></span></div>
        </article>
        <article class="card kpi">
          <div class="label">税费合计<CalcTip name="split.taxTotal" :ctx="config" /></div>
          <div class="value">{{ money(summary.tax) }}</div>
          <div class="meta"><span class="flat">税率 {{ plain(config.taxRate) }}%</span></div>
        </article>
        <article class="card kpi">
          <div class="label">转账手续费合计<CalcTip name="split.feeTotal" /></div>
          <div class="value">{{ money(summary.fee) }}</div>
          <div class="meta"><span class="flat">教师 {{ money(summary.teacherFee) }} · 机构 {{ money(summary.orgFee) }} · 分成人员 {{ money(summary.memberFee) }}</span></div>
        </article>
        <article class="card kpi">
          <div class="label">实发合计<CalcTip name="split.net" /></div>
          <div class="value">{{ money(summary.net) }}</div>
          <div class="meta"><span class="flat">{{ data.locked ? '结算单已固定' : '结算单未固定，金额可能变动' }}</span></div>
        </article>
      </div>

      <p v-if="mergedCount || withTeacherCount" class="merged-note">
        <template v-if="mergedCount">{{ month }} 有 {{ mergedCount }} 位收款人在多个合集分成，已合并为一笔打款计算手续费（标「合并」）。</template>
        <template v-if="withTeacherCount">{{ withTeacherCount }} 位收款人同时是授课教师，分成与课时费合并为一笔、手续费只扣一次（标「含课时费」）。</template>
        <router-link :to="{ path: '/finance/payouts', query: { month } }">去财务打款</router-link>
      </p>
      <p v-if="unassigned.count" class="unassigned">
        {{ month }} 还有 {{ unassigned.count }} 门有课次的课程未归入任何合集（利润 {{ money(unassigned.profit) }}）。
      </p>

      <article v-for="item in results" :key="item.collection.id" class="card split-card">
        <header class="split-card-head">
          <div class="split-title">
            <strong>{{ item.collection.name }}</strong>
            <span class="month-tag">{{ month }}</span>
          </div>
        </header>

        <div class="flow">
          <div><small>{{ config.basis === 'school' ? '校方合计' : '利润' }}<CalcTip name="split.basis" /></small><strong>{{ money(item.calc.base) }}</strong></div>
          <span class="op">−</span>
          <div>
            <small>教师打款手续费（{{ item.calc.teachers.length }} 笔）<CalcTip name="split.teacherFee" :ctx="config" /></small>
            <strong>{{ money(item.calc.teacherFeeTotal) }}</strong>
          </div>
          <template v-if="item.calc.orgs.length">
            <span class="op">−</span>
            <div>
              <small>机构打款手续费（{{ item.calc.orgs.length }} 笔）<CalcTip name="split.orgFee" :ctx="config" /></small>
              <strong>{{ money(item.calc.orgFeeTotal) }}</strong>
            </div>
          </template>
          <template v-if="item.calc.reimbursements.length">
            <span class="op">−</span>
            <div>
              <small>报销扣除（{{ item.calc.reimbursements.length }} 笔）<CalcTip name="split.reimburse" /></small>
              <strong>{{ money(item.calc.reimburseTotal) }}</strong>
            </div>
          </template>
          <span class="op">=</span>
          <div class="pool"><small>可分配<CalcTip name="split.pool" :ctx="config" /></small><strong>{{ money(item.calc.pool) }}</strong></div>
          <div class="flow-meta">
            {{ item.calc.sessionCount }} 节 · 校方 {{ money(item.calc.schoolAmount) }} · 成本 {{ money(item.calc.costAmount) }}
          </div>
        </div>
        <p class="flow-note">{{ flowNote(item.calc) }}</p>

        <SplitTable :calc="item.calc" :notes="item.notes" />
        <ul v-if="item.notes.some(Boolean)" class="member-notes">
          <template v-for="(note, i) in item.notes" :key="i">
            <li v-if="note"><b>{{ noteMark(item.notes, i) }} {{ item.calc.members[i].name }}：</b>{{ note }}。</li>
          </template>
        </ul>

        <details v-if="item.calc.teachers.length" class="teacher-fees">
          <summary>教师打款手续费明细</summary>
          <table class="mini-table">
            <thead>
              <tr>
                <th>教师</th>
                <th class="num">本合集课时费</th>
                <th class="num">当月课时费合计</th>
                <th class="num">手续费（按金额分摊）</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in item.calc.teachers" :key="t.key">
                <td>{{ t.name }}</td>
                <td class="num">{{ money(t.amount) }}</td>
                <td class="num">{{ money(t.total) }}</td>
                <td class="num">{{ money(t.fee) }}</td>
              </tr>
            </tbody>
          </table>
        </details>
        <details v-if="item.calc.reimbursements.length" class="teacher-fees" open>
          <summary>报销扣除明细</summary>
          <table class="mini-table">
            <thead>
              <tr>
                <th>报销人</th>
                <th>事由</th>
                <th>状态</th>
                <th class="num">金额</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in item.calc.reimbursements" :key="r.id">
                <td>{{ r.userName || '—' }}</td>
                <td>{{ r.title }}</td>
                <td>{{ r.status === 'reimbursed' ? '已报销' : '已通过' }}</td>
                <td class="num">{{ money(r.amount) }}</td>
              </tr>
            </tbody>
          </table>
          <router-link class="mini-link" :to="{ path: '/reimbursements' }">去报销单调整</router-link>
        </details>
        <details v-if="item.calc.orgs.length" class="teacher-fees">
          <summary>机构打款手续费明细</summary>
          <table class="mini-table">
            <thead>
              <tr>
                <th>机构</th>
                <th class="num">本合集机构费</th>
                <th class="num">当月机构费合计</th>
                <th class="num">手续费（按金额分摊）</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in item.calc.orgs" :key="o.key">
                <td>{{ o.name }}</td>
                <td class="num">{{ money(o.amount) }}</td>
                <td class="num">{{ money(o.total) }}</td>
                <td class="num">{{ money(o.fee) }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </article>
      <article v-if="!results.length" class="card empty">
        <strong>还没有分成合集</strong>
        <p>点右上角「分成规则」图标，在弹窗里「分成合集新建」，之后每个月自动按此分成。</p>
        <button class="btn primary" type="button" @click="openCreate">分成合集新建</button>
      </article>
      <article v-if="results.length" class="card calc-notes-card">
        <strong>计算说明</strong>
        <ol>
          <li v-for="(line, i) in calcNotes" :key="i">{{ line }}</li>
        </ol>
        <p>{{ data.locked ? `${month} 结算单已固定，以上金额不再变动。` : `${month} 结算单尚未固定，课次收益按日期自动同步，金额可能随新上课次变化，以固定后为准。` }}</p>
      </article>
      </template>

      <SplitSheet v-if="tab === 'sheet'" class="card sheet-card" :month="month" />

      <template v-if="tab === 'history'">
      <article v-if="!results.length" class="card empty">
        <strong>还没有分成合集</strong>
        <p>点右上角「分成规则」图标，在弹窗里「分成合集新建」。</p>
      </article>
      <template v-if="results.length">
        <div class="section-head">
          <div>
            <h2>近 {{ historyMonths.length }} 个月实发<CalcTip name="split.history" /></h2>
            <p>同一套规则在每个月的分成结果（截至 {{ month }}），未固定的月份金额可能还会变动。</p>
          </div>
        </div>
        <article class="card history-card">
          <div class="history-scroll">
            <table class="history-table">
              <thead>
                <tr>
                  <th>合集 / 分成人员</th>
                  <th v-for="h in historyMonths" :key="h.month" class="num">
                    {{ h.month }}<small v-if="!h.locked">未固定</small>
                  </th>
                  <th class="num">合计</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="group in historyRows" :key="group.id">
                  <tr class="group-row">
                    <td>{{ group.name }} · 可分配</td>
                    <td v-for="(v, i) in group.pools" :key="i" class="num">{{ v ? money(v) : '—' }}</td>
                    <td class="num">{{ money(group.poolTotal) }}</td>
                  </tr>
                  <tr v-for="(m, mi) in group.members" :key="mi">
                    <td class="member-cell">{{ m.name }} <small>{{ plain(m.ratio) }}%</small></td>
                    <td v-for="(v, i) in m.nets" :key="i" class="num" :class="{ faint: !v }">{{ v ? money(v) : '—' }}</td>
                    <td class="num net">{{ money(m.total) }}</td>
                  </tr>
                </template>
              </tbody>
              <tfoot>
                <tr>
                  <td>实发合计</td>
                  <td v-for="(v, i) in historyTotals.nets" :key="i" class="num">{{ money(v) }}</td>
                  <td class="num">{{ money(historyTotals.total) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </article>
      </template>
      </template>
    </PageLoad>

    <PageModal
      :open="rulesOpen"
      size="wide"
      icon="layers"
      title="分成规则"
      desc="每个合集一套比例，所有月份通用；修改后历史月份与之后月份都会按新规则重新计算"
      @close="rulesOpen = false"
    >
      <div class="rules-bar">
        <span><span class="badge-soft">每月通用</span>共 {{ results.length }} 个合集</span>
        <button class="btn primary" type="button" @click="openCreate">分成合集新建</button>
      </div>
      <div class="rule-list">
        <article v-for="item in results" :key="item.collection.id" class="card rule-item">
          <header>
            <strong>{{ item.collection.name }}</strong>
            <div class="split-ops">
              <ActionBtn icon="pencil" tip="编辑" @click="openEdit(item.collection)" />
              <ActionBtn icon="trash" tip="删除" tone="danger" @click="remove(item.collection)" />
            </div>
          </header>
          <div class="rule-line">
            <small>课程 {{ item.courses.length }}</small>
            <div class="course-chips">
              <span v-for="c in item.courses" :key="c.id" class="course-chip">{{ c.title }}</span>
            </div>
          </div>
          <div class="rule-line">
            <small>分成人员</small>
            <div class="course-chips">
              <span v-for="(m, idx) in item.collection.members" :key="idx" class="member-chip" :class="{ virtual: !m.userId }">
                {{ m.name }} {{ plain(m.ratio) }}%<em>{{ m.userId ? '用户' : '虚拟' }}</em>
              </span>
              <span v-if="item.calc.ratioSum < 100" class="member-chip rest">留存 {{ plain(round2(100 - item.calc.ratioSum)) }}%</span>
            </div>
          </div>
          <p v-if="item.collection.note" class="rule-note">{{ item.collection.note }}</p>
        </article>
        <article v-if="!results.length" class="card empty">
          <strong>还没有分成合集</strong>
          <p>点上方「分成合集新建」，勾选课程并添加分成人员即可，之后每个月自动按此分成。</p>
        </article>
      </div>
    </PageModal>

    <PageModal
      :open="courseRulesOpen"
      size="plan"
      panel-class="course-rules-modal"
      icon="book"
      title="课程分成规则"
      desc="直接读取课程的校方价格、课时费和机构抽成；在这里修改会同步写回课程"
      @close="courseRulesOpen = false"
    >
      <FinanceRules embedded />
    </PageModal>

    <PageModal
      :open="!!form"
      :title="form?.id ? '编辑合集' : '分成合集新建'"
      desc="合集规则每月通用：勾选课程、设置分成人员比例，右侧按所选月份金额实时预览"
      icon="users"
      size="plan"
      @close="form = null"
    >
      <div v-if="form" class="split-form">
        <div class="form-col">
          <label class="field">
            <span>合集名称</span>
            <input v-model="form.name" maxlength="50" placeholder="如：初中综合课合集" />
          </label>
          <div class="field">
            <span>课程（已选 {{ form.courseIds.length }}）</span>
            <input v-model="courseQuery" class="course-search" placeholder="搜索课程 / 学校" />
            <div class="course-list">
              <template v-for="group in courseGroups" :key="group.school">
                <div class="course-group">{{ group.school }}</div>
                <label
                  v-for="c in group.items"
                  :key="c.id"
                  class="course-line"
                  :class="{ off: c.takenBy }"
                >
                  <input
                    type="checkbox"
                    :checked="form.courseIds.includes(c.id)"
                    :disabled="!!c.takenBy"
                    @change="toggleCourse(c.id)"
                  />
                  <span class="course-name">{{ c.title }}</span>
                  <small v-if="c.takenBy">已在「{{ c.takenBy }}」</small>
                  <small v-else-if="c.stat">{{ month }}：{{ c.stat.sessionCount }} 节 · 利润 {{ money(c.stat.profitAmount) }}</small>
                </label>
              </template>
              <p v-if="!courseGroups.length" class="faint pad">没有匹配的课程</p>
            </div>
          </div>
        </div>

        <div class="form-col">
          <div class="field">
            <div class="member-head">
              <span>分成人员</span>
              <span class="ratio-sum" :class="ratioClass">合计 {{ plain(formCalc.ratioSum) }}%</span>
            </div>
            <div v-for="(m, idx) in form.members" :key="idx" class="member-row">
              <div class="type-switch">
                <button type="button" :class="{ on: m.type !== 'user' }" @click="setMemberType(m, 'virtual')">虚拟</button>
                <button type="button" :class="{ on: m.type === 'user' }" @click="setMemberType(m, 'user')">用户</button>
              </div>
              <SearchSelect
                v-if="m.type === 'user'"
                :model-value="m.userId || ''"
                :options="userOptions"
                placeholder="选择用户"
                search-placeholder="搜索姓名 / 手机尾号"
                @update:model-value="(id) => onPickUser(m, id)"
              />
              <input v-else v-model="m.name" maxlength="30" placeholder="虚拟人员姓名" />
              <div class="ratio-input">
                <input v-model.number="m.ratio" type="number" min="0" max="100" step="0.01" placeholder="比例" />
                <em>%</em>
              </div>
              <button class="icon-btn" type="button" title="移除" @click="form.members.splice(idx, 1)">×</button>
            </div>
            <div class="member-actions">
              <button class="btn tiny" type="button" @click="form.members.push(newMember())">+ 虚拟人员</button>
              <button class="btn tiny" type="button" @click="form.members.push(newMember('user'))">+ 选择用户</button>
              <button
                v-if="form.members.length && formCalc.ratioSum < 100"
                class="link"
                type="button"
                @click="fillRest"
              >剩余 {{ plain(100 - formCalc.ratioSum) }}% 补给最后一位</button>
            </div>
            <p v-if="formCalc.ratioSum > 100" class="warn-text">比例合计超过 100%，请调整</p>
            <p class="hint-line">同一用户（或同名虚拟人员）在多个合集分成时，每月合并为一笔打款，手续费只收一次并按金额分摊。</p>
          </div>

          <div class="preview">
            <div class="preview-head">
              <strong>
                按
                <select v-model="month" class="preview-month">
                  <option v-for="item in monthOptions" :key="item" :value="item">{{ item }}</option>
                </select>
                金额预览
              </strong>
              <span>可分配 {{ money(formCalc.pool) }}</span>
            </div>
            <div class="preview-flow">
              {{ config.basis === 'school' ? '校方合计' : '利润' }} {{ money(formCalc.base) }}
              − 教师打款手续费 {{ money(formCalc.teacherFeeTotal) }}（{{ formCalc.teachers.length }} 笔）
              <template v-if="formCalc.orgs.length">− 机构打款手续费 {{ money(formCalc.orgFeeTotal) }}（{{ formCalc.orgs.length }} 笔）</template>
              <template v-if="formCalc.reimbursements.length">− 报销 {{ money(formCalc.reimburseTotal) }}（{{ formCalc.reimbursements.length }} 笔）</template>
            </div>
            <SplitTable :calc="formCalc" compact />
          </div>

          <label class="field">
            <span>备注</span>
            <input v-model="form.note" maxlength="200" placeholder="选填" />
          </label>
        </div>
      </div>
      <template #footer>
        <button class="btn" type="button" @click="form = null">取消</button>
        <button class="btn primary" type="button" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </PageModal>
  </section>
</template>

<script setup>
import { computed, defineComponent, h, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, getProfile } from '../api';
import { allow } from '../access';
import { money } from '../format';
import PageLoad from '../components/PageLoad.vue';
import CalcTip from '../components/CalcTip.vue';
import PageModal from '../components/PageModal.vue';
import ActionBtn from '../components/ActionBtn.vue';
import FinanceRules from './FinanceRules.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { useFinanceLive } from '../composables/useFinanceLive';
import { notify } from '../notify';
import SearchSelect from '../components/SearchSelect.vue';
import SplitSheet from '../components/SplitSheet.vue';
import { DEFAULT_SPLIT_CONFIG, computeSplitMonth, memberFeeNote, round2, splitNotes, transferFee, yuan } from '../split';
import { useFinanceMonth } from '../composables/useFinanceMonth';

const SplitTable = defineComponent({
  props: {
    calc: { type: Object, required: true },
    compact: { type: Boolean, default: false },
    notes: { type: Array, default: () => [] },
  },
  setup(props) {
    return () => {
      const { calc, notes } = props;
      const mark = (idx) => (notes[idx] ? h('sup', { class: 'note-mark' }, noteMark(notes, idx)) : null);
      const rows = calc.members.map((m, idx) => h('tr', { key: idx }, [
        h('td', [
          m.name || '—',
          mark(idx),
          m.userId ? h('span', { class: 'who-tag user' }, '用户') : h('span', { class: 'who-tag' }, '虚拟'),
        ]),
        h('td', { class: 'num' }, `${plain(m.ratio)}%`),
        h('td', { class: 'num' }, money(m.gross)),
        h('td', { class: 'num minus' }, m.tax ? `−${money(m.tax)}` : '—'),
        h('td', {
          class: 'num minus',
          title: m.withTeacher
            ? '与本人课时费合并为一笔转账，手续费按合计只收一次，分成只承担合并后多出的部分'
            : m.merged ? '与其他合集合并为一笔转账，手续费按应分占比分摊' : '',
        }, [
          m.fee ? `−${money(m.fee)}` : '—',
          mark(idx),
          m.withTeacher ? h('span', { class: 'merged-tag teacher' }, '含课时费') : m.merged ? h('span', { class: 'merged-tag' }, '合并') : null,
        ]),
        h('td', { class: 'num net' }, money(m.net)),
      ]));
      if (!rows.length) rows.push(h('tr', [h('td', { class: 'empty-cell', colspan: 6 }, '还没有分成人员')]));
      const foot = [
        h('tr', { class: 'total' }, [
          h('td', '合计'),
          h('td', { class: 'num' }, `${plain(calc.ratioSum)}%`),
          h('td', { class: 'num' }, money(calc.totals.gross)),
          h('td', { class: 'num minus' }, calc.totals.tax ? `−${money(calc.totals.tax)}` : '—'),
          h('td', { class: 'num minus' }, calc.totals.fee ? `−${money(calc.totals.fee)}` : '—'),
          h('td', { class: 'num net' }, money(calc.totals.net)),
        ]),
      ];
      if (calc.ratioSum < 100 && calc.members.length) {
        foot.push(h('tr', { class: 'retained' }, [
          h('td', '未分配留存'),
          h('td', { class: 'num' }, `${plain(round2(100 - calc.ratioSum))}%`),
          h('td', { class: 'num' }, money(calc.retained)),
          h('td', { colspan: 3 }, ''),
        ]));
      }
      return h('table', { class: ['split-table', { compact: props.compact }] }, [
        h('thead', [h('tr', [
          h('th', '分成人员'),
          h('th', { class: 'num' }, '比例'),
          h('th', { class: 'num' }, '应分'),
          h('th', { class: 'num' }, '税费'),
          h('th', { class: 'num' }, '转账手续费'),
          h('th', { class: 'num' }, '实发'),
        ])]),
        h('tbody', rows),
        h('tfoot', foot),
      ]);
    };
  },
});

function plain(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(round2(n));
}

const route = useRoute();
const router = useRouter();
const month = useFinanceMonth(() => load());
const monthOptions = computed(() => {
  const list = [];
  const now = new Date();
  for (let i = 0; i < 18; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return list;
});

const TAB_KEYS = ['month', 'sheet', 'config', 'history'];
const tab = ref(TAB_KEYS.includes(String(route.query.tab || '')) ? String(route.query.tab) : 'month');
const tabs = computed(() => [
  { key: 'month', label: '股东分成' },
  { key: 'sheet', label: '月度结算单' },
  { key: 'config', label: '计算规则' },
  { key: 'history', label: '历史' },
]);
function setTab(key) {
  tab.value = key;
  router.replace({ query: { ...route.query, tab: key === 'month' ? undefined : key } }).catch(() => {});
}

const canCourseRule = allow(getProfile(), 'finance.rule');
const rulesOpen = ref(false);
const courseRulesOpen = ref(false);
function openRules() {
  rulesOpen.value = true;
}
function openCourseRules() {
  courseRulesOpen.value = true;
}
/** 旧链接 ?tab=rules、收益规则页跳转 ?dialog=course-rules 直接打开对应弹窗 */
watch(() => [route.path, route.query.tab, route.query.dialog], ([path, queryTab, dialog]) => {
  if (path !== '/finance/split') return;
  if (queryTab !== 'rules' && !dialog) return;
  if (queryTab === 'rules') rulesOpen.value = true;
  if (dialog === 'course-rules' && canCourseRule) courseRulesOpen.value = true;
  const query = { ...route.query, dialog: undefined };
  if (queryTab === 'rules') query.tab = undefined;
  router.replace({ query }).catch(() => {});
}, { immediate: true });

const data = ref({ collections: [], courses: [], users: [], stats: [], reimbursements: [], history: [], locked: false });
const config = ref({ ...DEFAULT_SPLIT_CONFIG });
const savedConfig = ref(JSON.stringify(DEFAULT_SPLIT_CONFIG));
const configSaving = ref(false);
const configSaved = ref(true);
const tryAmount = ref(5000);
const form = ref(null);
const saving = ref(false);
const courseQuery = ref('');
const configError = ref('');
const updatedAt = ref('');
const { loading, ready, error, run, bindLoad } = usePageLoad();
const live = useFinanceLive(() => load());

const configDirty = computed(() => JSON.stringify(config.value) !== savedConfig.value);
const statsMap = computed(() => new Map((data.value.stats || []).map((s) => [s.courseId, s])));
const courseMap = computed(() => new Map((data.value.courses || []).map((c) => [c.id, c])));

const monthCalc = computed(() => computeSplitMonth(data.value.collections || [], statsMap.value, config.value, data.value.reimbursements));
const mergedCount = computed(() => monthCalc.value.payees.filter((p) => p.items.length > 1).length);
const withTeacherCount = computed(() => monthCalc.value.payees.filter((p) => p.withTeacher).length);

const payeeOfMember = computed(() => {
  const map = new Map();
  for (const p of monthCalc.value.payees) for (const item of p.items) map.set(item.member, p);
  return map;
});

const results = computed(() => (data.value.collections || []).map((collection, idx) => {
  const calc = monthCalc.value.collections[idx];
  return {
    collection,
    courses: collection.courseIds.map((id) => courseMap.value.get(id) || { id, title: `课程#${id}` }),
    calc,
    notes: calc.members.map((m) => memberFeeNote(calc, m, payeeOfMember.value.get(m), config.value)),
  };
}));

const calcNotes = computed(() => splitNotes(config.value));

/** 每个合集卡片下的一句话算式，截图时不用悬浮也能看懂 */
function flowNote(calc) {
  const cuts = [];
  if (calc.teacherFeeTotal) cuts.push(`教师打款手续费 ${yuan(calc.teacherFeeTotal)}（每位教师当月合并一笔，按本合集课时费占比分摊）`);
  if (calc.orgFeeTotal) cuts.push(`机构打款手续费 ${yuan(calc.orgFeeTotal)}`);
  if (calc.reimburseTotal) cuts.push(`报销 ${yuan(calc.reimburseTotal)}`);
  const head = `可分配 ${yuan(calc.pool)} = ${config.value.basis === 'school' ? '校方合计' : '利润'} ${yuan(calc.base)}${cuts.length ? ` − ${cuts.join(' − ')}` : ''}`;
  const tail = [`各人应分 = 可分配 × 比例，税费按 ${plain(config.value.taxRate)}% 从应分代扣、留在对公账户`];
  if (calc.retained > 0) tail.push(`未分配留存 ${yuan(calc.retained)} 留在对公账户`);
  return `${head}。${tail.join('；')}。`;
}

const MARKS = '①②③④⑤⑥⑦⑧⑨⑩';
function noteMark(notes, index) {
  const order = notes.slice(0, index + 1).filter(Boolean).length;
  return MARKS[order - 1] || `(${order})`;
}

const summary = computed(() => results.value.reduce((acc, { calc }) => ({
  pool: round2(acc.pool + calc.pool),
  reimburse: round2(acc.reimburse + calc.reimburseTotal),
  tax: round2(acc.tax + calc.totals.tax),
  teacherFee: round2(acc.teacherFee + calc.teacherFeeTotal),
  orgFee: round2(acc.orgFee + calc.orgFeeTotal),
  memberFee: round2(acc.memberFee + calc.totals.fee),
  fee: round2(acc.fee + calc.teacherFeeTotal + calc.orgFeeTotal + calc.totals.fee),
  net: round2(acc.net + calc.totals.net),
}), { pool: 0, reimburse: 0, tax: 0, teacherFee: 0, orgFee: 0, memberFee: 0, fee: 0, net: 0 }));

const historyMonths = computed(() => (data.value.history || []).map((h) => ({
  month: h.month,
  locked: !!h.locked,
  statsMap: new Map((h.stats || []).map((s) => [s.courseId, s])),
  reimbursements: Array.isArray(h.reimbursements) ? h.reimbursements : [],
})));

const historyCalcs = computed(() => historyMonths.value.map((h) => computeSplitMonth(data.value.collections || [], h.statsMap, config.value, h.reimbursements)));

const historyRows = computed(() => (data.value.collections || []).map((collection, cIdx) => {
  const calcs = historyCalcs.value.map((month) => month.collections[cIdx]);
  const pools = calcs.map((c) => c.pool);
  return {
    id: collection.id,
    name: collection.name,
    pools,
    poolTotal: round2(pools.reduce((acc, v) => acc + v, 0)),
    members: collection.members.map((m, idx) => {
      const nets = calcs.map((c) => c.members[idx]?.net || 0);
      return { name: m.name, ratio: m.ratio, nets, total: round2(nets.reduce((acc, v) => acc + v, 0)) };
    }),
  };
}));

const historyTotals = computed(() => {
  const nets = historyMonths.value.map((_, i) => round2(historyRows.value.reduce(
    (acc, g) => acc + g.members.reduce((sum, m) => sum + m.nets[i], 0),
    0,
  )));
  return { nets, total: round2(nets.reduce((acc, v) => acc + v, 0)) };
});

const unassigned = computed(() => {
  const taken = new Set((data.value.collections || []).flatMap((c) => c.courseIds));
  const rest = (data.value.stats || []).filter((s) => !taken.has(s.courseId));
  return { count: rest.length, profit: round2(rest.reduce((acc, s) => acc + Number(s.profitAmount || 0), 0)) };
});

const takenMap = computed(() => {
  const map = new Map();
  for (const c of data.value.collections || []) {
    if (form.value?.id && c.id === form.value.id) continue;
    for (const id of c.courseIds) map.set(id, c.name);
  }
  return map;
});

const courseGroups = computed(() => {
  const q = courseQuery.value.trim().toLowerCase();
  const selected = new Set(form.value?.courseIds || []);
  const list = (data.value.courses || [])
    .filter((c) => !q || `${c.title} ${c.school}`.toLowerCase().includes(q))
    .map((c) => ({ ...c, stat: statsMap.value.get(c.id), takenBy: takenMap.value.get(c.id) || '' }))
    .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || Number(!!b.stat) - Number(!!a.stat));
  const groups = new Map();
  for (const c of list) {
    const key = c.school || '—';
    if (!groups.has(key)) groups.set(key, { school: key, items: [] });
    groups.get(key).items.push(c);
  }
  return [...groups.values()];
});

/** 预览时把正在编辑的合集放回全部合集中一起算，跨合集合并打款的手续费才准确 */
const formCalc = computed(() => {
  const draft = form.value
    ? { ...form.value, id: form.value.id || 'draft', members: form.value.members.map((m) => ({ ...m, ratio: Number(m.ratio) || 0 })) }
    : { id: 'draft', courseIds: [], members: [] };
  const others = (data.value.collections || []).filter((c) => c.id !== form.value?.id);
  const result = computeSplitMonth([...others, draft], statsMap.value, config.value, data.value.reimbursements);
  return result.collections[result.collections.length - 1];
});

const userOptions = computed(() => (data.value.users || []).map((u) => ({
  value: u.id,
  label: u.name,
  hint: [roleText[u.role] || '用户', u.phoneTail ? `尾号 ${u.phoneTail}` : '', u.status === 0 ? '已冻结' : ''].filter(Boolean).join(' · '),
})));
const roleText = { teacher: '教师', user: '用户', admin: '管理员' };

function setMemberType(m, type) {
  if (type === 'user') {
    m.type = 'user';
  } else {
    m.type = 'virtual';
    m.userId = null;
  }
}

function onPickUser(m, id) {
  m.userId = id || null;
  const user = (data.value.users || []).find((u) => u.id === id);
  if (user) m.name = user.name;
}
const ratioClass = computed(() => {
  const sum = formCalc.value.ratioSum;
  if (sum > 100) return 'over';
  if (sum === 100) return 'full';
  return 'part';
});

async function load() {
  await run(async () => {
    const result = await api.financeSplit(month.value);
    data.value = {
      collections: Array.isArray(result?.collections) ? result.collections : [],
      courses: Array.isArray(result?.courses) ? result.courses : [],
      users: Array.isArray(result?.users) ? result.users : [],
      stats: Array.isArray(result?.stats) ? result.stats : [],
      reimbursements: Array.isArray(result?.reimbursements) ? result.reimbursements : [],
      history: Array.isArray(result?.history) ? result.history : [],
      locked: !!result?.locked,
    };
    configSaved.value = result?.configSaved !== false;
    if (!configDirty.value || !ready.value) {
      config.value = { ...DEFAULT_SPLIT_CONFIG, ...(result?.config || {}) };
      savedConfig.value = JSON.stringify(config.value);
    }
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  });
}


function configProblem(c) {
  const tax = Number(c.taxRate);
  if (c.taxRate === '' || !Number.isFinite(tax) || tax < 0 || tax >= 100) return '税率应在 0 ~ 100% 之间';
  if (c.feeUnit === '' || !(Number(c.feeUnit) >= 0)) return '每档手续费不能为空或负数';
  if (!(Number(c.feeStep) > 0)) return '每档金额须大于 0';
  return '';
}

/** 计算规则改动后自动保存（防抖），保存后通知打款页等实时刷新 */
async function saveConfig(force = false) {
  const problem = configProblem(config.value);
  configError.value = problem;
  if (problem || (!configDirty.value && force !== true)) return;
  const sent = JSON.stringify(config.value);
  configSaving.value = true;
  try {
    const saved = { ...DEFAULT_SPLIT_CONFIG, ...(await api.financeSaveSplitConfig(config.value)) };
    if (JSON.stringify(config.value) === sent) {
      config.value = saved;
      savedConfig.value = JSON.stringify(saved);
    } else {
      savedConfig.value = sent;
    }
    configSaved.value = true;
    live.notify('split-config');
  } catch (err) {
    configError.value = err.message || '保存失败';
  } finally {
    configSaving.value = false;
  }
}

let configTimer = 0;
watch(config, () => {
  window.clearTimeout(configTimer);
  if (!configDirty.value) {
    configError.value = '';
    return;
  }
  configTimer = window.setTimeout(saveConfig, 800);
}, { deep: true });

function openCreate() {
  courseQuery.value = '';
  form.value = { id: null, name: '', note: '', courseIds: [], members: [newMember()] };
}

function newMember(type = 'virtual') {
  return { type, name: '', userId: null, ratio: null };
}

function openEdit(collection) {
  courseQuery.value = '';
  form.value = {
    id: collection.id,
    name: collection.name,
    note: collection.note || '',
    courseIds: [...collection.courseIds],
    members: collection.members.map((m) => ({ ...m, type: m.userId ? 'user' : 'virtual' })),
  };
}

function toggleCourse(id) {
  const list = form.value.courseIds;
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(id);
}

function fillRest() {
  const members = form.value.members;
  const last = members[members.length - 1];
  const others = members.slice(0, -1).reduce((acc, m) => acc + (Number(m.ratio) || 0), 0);
  last.ratio = round2(100 - others);
}

async function save() {
  const body = {
    name: form.value.name,
    note: form.value.note,
    courseIds: form.value.courseIds,
    members: form.value.members
      .filter((m) => m.name || m.userId || m.ratio)
      .map((m) => ({
        name: m.type === 'user' ? '' : m.name,
        userId: m.type === 'user' ? m.userId || null : null,
        ratio: Number(m.ratio) || 0,
      })),
  };
  saving.value = true;
  try {
    if (form.value.id) await api.financeUpdateSplit(form.value.id, body);
    else await api.financeCreateSplit(body);
    notify.success('合集已保存');
    form.value = null;
    live.notify('split-collection');
    await load();
  } catch (err) {
    notify.error(err.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove(collection) {
  const ok = await notify.confirm({
    title: `删除合集「${collection.name}」`,
    message: '删除后该合集的分成人员与比例将一并移除，课程本身不受影响。确认删除？',
    okText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.financeDeleteSplit(collection.id);
    notify.success('已删除');
    live.notify('split-collection');
    await load();
  } catch (err) {
    notify.error(err.message || '删除失败');
  }
}


bindLoad(load);
</script>

<style>
.page-modal.course-rules-modal { width: min(1160px, 100%); }
</style>

<style scoped>
.head-icons { gap: 6px; }
.head-icons :deep(.action-btn) { width: 38px; height: 38px; }
.rules-bar {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  margin-bottom: 14px; color: var(--muted); font-size: 13px;
}
.rules-bar .badge-soft { margin-right: 8px; }
.rule-list > .empty { grid-column: 1 / -1; }
.split-tabs {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-bottom: 4px; padding-bottom: 10px; border-bottom: 1px solid var(--line);
}
.split-tabs .tabs { margin: 0; }
.split-tabs .tabs em { margin-left: 6px; font-style: normal; font-size: 12px; opacity: 0.7; }
.split-tabs select {
  height: 36px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0 10px; background: #fff;
}
.sheet-card { margin-top: 16px; padding: 18px 20px; }
.split-tabs + .rule-card { margin-top: 16px; }
.rule-card { padding: 18px 20px; margin-bottom: 16px; }
.save-state {
  flex: none; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;
  background: #ecfdf3; color: #067647;
}
.save-state.busy { background: #eff8ff; color: #175cd3; }
.save-state.err { background: #fef3f2; color: #b42318; }
.updated { margin-left: 8px; color: #98a2b3; font-size: 12px; }
.rule-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.rule-head strong { font-size: 15px; color: #0f172a; }
.rule-head p { margin: 4px 0 0; color: #667085; font-size: 13px; line-height: 1.5; }
.rule-grid {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 16px; margin-top: 14px;
}
.rule-grid label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #344054; }
.rule-grid input:not([type="checkbox"]), .rule-grid select {
  height: 38px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0 10px; background: #fff;
}
.rule-grid label.check { flex-direction: row; align-items: center; gap: 8px; grid-column: span 2; }
.rule-grid label.check input { width: 16px; height: 16px; accent-color: var(--primary); }
.fee-try {
  display: flex; align-items: center; gap: 10px; margin-top: 14px; padding-top: 12px;
  border-top: 1px dashed #e4e7ec; font-size: 13px; color: #667085;
}
.fee-try input {
  width: 140px; height: 34px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0 10px;
}
.fee-try strong { color: #b42318; }

.section-head {
  display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin: 24px 0 12px;
}
.section-head h2 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px; }
.section-head p { margin: 4px 0 0; color: #667085; font-size: 13px; }
.section-head select {
  height: 36px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0 10px; background: #fff;
}
.badge-soft {
  padding: 2px 8px; border-radius: 999px; background: #ecfdf3; color: #067647; font-size: 12px; font-weight: 600;
}

.rule-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
.rule-item { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.rule-item header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.rule-item header strong { font-size: 15px; color: #0f172a; }
.rule-line { display: flex; gap: 10px; align-items: flex-start; }
.rule-line > small { flex: none; width: 56px; padding-top: 3px; color: #667085; font-size: 12px; }
.rule-line .course-chips { margin-top: 0; }
.member-chip {
  padding: 2px 10px; border-radius: 999px; background: #f4f3ff; color: #5925dc; font-size: 12px; font-weight: 600;
}
.member-chip.rest { background: #f2f4f7; color: #667085; font-weight: 500; }
.rule-note { margin: 0; color: #667085; font-size: 12px; }
.month-tag {
  margin-left: 8px; padding: 1px 8px; border-radius: 6px; background: #f2f4f7; color: #475467; font-size: 12px; font-weight: 500;
}

.history-card { padding: 0; overflow: hidden; }
.history-scroll { overflow-x: auto; }
.history-table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 13px; }
.history-table th, .history-table td { padding: 10px 14px; border-bottom: 1px solid #f2f4f7; text-align: left; white-space: nowrap; }
.history-table th { background: #f8fafc; color: #475467; font-size: 12px; font-weight: 700; }
.history-table th small { display: block; color: #b54708; font-weight: 500; font-size: 11px; }
.history-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.history-table .group-row td { background: #fcfcfd; color: #344054; font-weight: 600; }
.history-table .member-cell { padding-left: 28px; }
.history-table .member-cell small { color: #98a2b3; margin-left: 4px; }
.history-table .net { color: #067647; font-weight: 700; }
.history-table tfoot td { background: #eaf2ff; font-weight: 700; border-top: 2px solid #84b0f5; }

.preview-month {
  height: 26px; margin: 0 4px; border: 1px solid #c7d7fe; border-radius: 6px; padding: 0 6px; background: #fff; font-size: 12px;
}

.split-kpis { margin-bottom: 16px; }
.unassigned {
  margin: 0 0 16px; padding: 10px 14px; border-radius: 10px;
  background: #fffaeb; color: #b54708; font-size: 13px; border: 1px solid #fedf89;
}

.split-card { padding: 0; margin-bottom: 16px; overflow: hidden; }
.split-card-head {
  display: flex; justify-content: space-between; gap: 16px; padding: 16px 20px 12px;
  border-bottom: 1px solid #f2f4f7;
}
.split-title strong { font-size: 16px; color: #0f172a; }
.course-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.course-chip {
  padding: 2px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 12px;
}
.course-chip.idle { background: #f2f4f7; color: #98a2b3; }
.split-ops { display: flex; gap: 8px; flex: none; align-items: flex-start; }

.flow {
  display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; padding: 14px 20px;
  background: #f8fafc; border-bottom: 1px solid #f2f4f7;
}
.flow > div small { display: block; font-size: 12px; color: #667085; }
.flow > div strong { font-size: 16px; color: #0f172a; font-variant-numeric: tabular-nums; }
.flow .pool strong { color: #067647; }
.flow .op { font-size: 18px; color: #98a2b3; }
.flow-meta { margin-left: auto; font-size: 12px; color: #667085; }

:deep(.split-table) { width: 100%; border-collapse: collapse; font-size: 13px; }
:deep(.split-table th), :deep(.split-table td) { padding: 10px 20px; border-bottom: 1px solid #f2f4f7; text-align: left; }
:deep(.split-table th) { background: #fff; color: #667085; font-size: 12px; font-weight: 600; }
:deep(.split-table .num) { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
:deep(.split-table .minus) { color: #b42318; }
:deep(.split-table .net) { color: #067647; font-weight: 700; }
:deep(.split-table tfoot .total td) { background: #eaf2ff; font-weight: 700; border-top: 2px solid #84b0f5; }
:deep(.split-table tfoot .retained td) { color: #667085; background: #fcfcfd; }
:deep(.split-table .empty-cell) { text-align: center; color: #98a2b3; padding: 20px; }
:deep(.split-table.compact th), :deep(.split-table.compact td) { padding: 8px 10px; }
:deep(.split-table .note-mark) { margin-left: 2px; color: #b45309; font-size: 10px; }
.flow-note { margin: 0; padding: 8px 20px; color: #667085; font-size: 12px; line-height: 1.7; background: #fcfcfd; border-bottom: 1px solid #f2f4f7; }
.member-notes { margin: 0; padding: 8px 20px 12px; list-style: none; background: #fffcf5; border-top: 1px solid #f2ead8; }
.member-notes li { color: #667085; font-size: 12px; line-height: 1.7; }
.member-notes b { color: #475467; font-weight: 600; }
.calc-notes-card { margin-top: 16px; padding: 16px 20px; }
.calc-notes-card strong { font-size: 14px; }
.calc-notes-card ol { margin: 8px 0 0; padding-left: 18px; color: #667085; font-size: 12px; line-height: 1.8; }
.calc-notes-card p { margin: 8px 0 0; color: #98a2b3; font-size: 12px; }

.teacher-fees { padding: 10px 20px 14px; font-size: 13px; }
.teacher-fees summary { cursor: pointer; color: var(--primary); }
.mini-table { width: 100%; max-width: 520px; margin-top: 8px; border-collapse: collapse; }
.mini-table th, .mini-table td { padding: 6px 10px; border-bottom: 1px solid #f2f4f7; text-align: left; }
.mini-table th { color: #667085; font-weight: 600; font-size: 12px; }
.mini-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.mini-link { display: inline-block; margin-top: 6px; font-size: 12px; color: var(--primary); }

.split-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 20px; padding-bottom: 12px; }
.form-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.field { display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: #344054; font-weight: 500; }
.field input:not([type="checkbox"]) {
  height: 38px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0 10px; font-weight: 400;
}
.course-list {
  max-height: 380px; overflow: auto; border: 1px solid var(--line); border-radius: 10px; padding: 4px 0;
}
.course-group {
  position: sticky; top: 0; padding: 6px 12px; background: #f8fafc; color: #667085; font-size: 12px; font-weight: 600;
}
.course-line {
  display: flex; align-items: center; gap: 8px; padding: 7px 12px; font-size: 13px; font-weight: 400; cursor: pointer;
}
.course-line:hover { background: #f8fafc; }
.course-line.off { cursor: not-allowed; color: #98a2b3; }
.course-line input { width: 15px; height: 15px; accent-color: var(--primary); flex: none; }
.course-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.course-line small { flex: none; color: #667085; font-size: 12px; }
.faint { color: #98a2b3 !important; }
.pad { padding: 16px; margin: 0; text-align: center; font-size: 13px; }

.member-head { display: flex; justify-content: space-between; align-items: center; }
.ratio-sum { font-size: 12px; padding: 2px 10px; border-radius: 999px; font-weight: 600; }
.ratio-sum.full { background: #ecfdf3; color: #067647; }
.ratio-sum.part { background: #fffaeb; color: #b54708; }
.ratio-sum.over { background: #fef3f2; color: #b42318; }
.member-row { display: grid; grid-template-columns: auto minmax(0, 1fr) 116px 32px; gap: 8px; align-items: center; }
.member-row :deep(.search-select) { min-width: 0; }
.member-row :deep(.select-search-trigger) { height: 38px; }
.type-switch { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 8px; overflow: hidden; height: 38px; }
.type-switch button {
  border: 0; background: #fff; padding: 0 10px; font-size: 12px; color: #667085; cursor: pointer;
}
.type-switch button + button { border-left: 1px solid var(--line-strong); }
.type-switch button.on { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
.hint-line { margin: 0; color: #667085; font-size: 12px; font-weight: 400; line-height: 1.5; }
.member-chip em { font-style: normal; margin-left: 6px; font-size: 11px; opacity: .75; font-weight: 500; }
.member-chip.virtual { background: #f2f4f7; color: #344054; }
:deep(.who-tag) {
  display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 4px; font-size: 11px;
  background: #f2f4f7; color: #667085; vertical-align: 1px;
}
:deep(.who-tag.user) { background: #f4f3ff; color: #5925dc; }
:deep(.merged-tag) {
  display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 4px; font-size: 11px;
  background: #fffaeb; color: #b54708;
}
:deep(.merged-tag.teacher) { background: #f4f3ff; color: #5925dc; }
.merged-note {
  margin: 0 0 12px; padding: 10px 14px; border-radius: 10px; background: #eff8ff; color: #175cd3; font-size: 13px;
  border: 1px solid #b2ddff;
}
.merged-note a { margin-left: 8px; font-weight: 600; }
.ratio-input { position: relative; }
.ratio-input input { width: 100%; padding-right: 28px !important; }
.ratio-input em { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-style: normal; color: #98a2b3; }
.icon-btn {
  width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: #98a2b3; font-size: 20px; cursor: pointer;
}
.icon-btn:hover { background: #fef3f2; color: #b42318; }
.member-actions { display: flex; align-items: center; gap: 12px; }
.warn-text { margin: 0; color: #b42318; font-size: 12px; font-weight: 400; }

.preview { border: 1px solid #d1e0ff; border-radius: 12px; overflow: hidden; background: #fff; }
.preview-head {
  display: flex; justify-content: space-between; padding: 10px 12px; background: #eff4ff; font-size: 13px;
}
.preview-head span { color: #067647; font-weight: 700; }
.preview-flow { padding: 8px 12px; font-size: 12px; color: #667085; border-bottom: 1px solid #f2f4f7; }

@media (max-width: 980px) {
  .rule-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .split-form { grid-template-columns: 1fr; }
}
</style>
