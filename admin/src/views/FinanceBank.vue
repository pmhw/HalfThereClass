<template>
  <section class="bank-page">
    <div class="page-head">
      <div>
        <h1>浦发银行</h1>
        <p>对账恒等式：账户余额 = 当前可用 + 企业私户 + 对公预留。税费/开票/留存与银行杂费进「对公预留」。财务密码验证一次后，本浏览器各财务页共用，连续操作无需反复输入。</p>
      </div>
      <div class="actions">
        <input ref="fileInput" class="file" type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" @change="onFile" />
        <button class="btn primary" type="button" :disabled="importing" @click="fileInput?.click()">{{ importing ? '导入中…' : '导入交易单' }}</button>
        <button class="btn" type="button" :disabled="loading" @click="load">刷新</button>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="8" kpis :kpi-count="5" @retry="load">
      <div class="kpi-grid kpi-5">
        <article class="card kpi">
          <div class="label">账户余额</div>
          <div class="value">{{ summary.statementBalance == null ? '—' : money(summary.statementBalance) }}</div>
          <div class="meta"><span class="flat">{{ summary.statementAt || '导入原值' }}</span></div>
        </article>
        <article class="card kpi">
          <div class="label">当前可用余额</div>
          <div class="value warn">{{ summary.availableBalance == null ? '—' : money(summary.availableBalance) }}</div>
          <div class="meta"><span class="flat">余额 − 私户 − 预留</span></div>
        </article>
        <article class="card kpi">
          <div class="label">企业私户合计</div>
          <div class="value">{{ money(summary.privateTotal ?? summary.lockedTotal ?? 0) }}</div>
          <div class="meta"><span class="flat">个人资金，不计入可用</span></div>
        </article>
        <article class="card kpi kpi-click" role="button" tabindex="0" title="查看对公预留明细" @click="openReserveDetail" @keydown.enter.prevent="openReserveDetail">
          <div class="label">对公预留 <em class="kpi-more">明细</em></div>
          <div class="value">{{ money(summary.reserveTotal ?? reserves.total ?? 0) }}</div>
          <div class="meta"><span class="flat">税费 / 开票 / 费用等 · 点击查看</span></div>
        </article>
        <article class="card kpi">
          <div class="label">垫付池可用</div>
          <div class="value">{{ money(advanceTotals.pool) }}</div>
          <div class="meta"><span class="flat">待补还 {{ money(advanceTotals.owed) }}</span></div>
        </article>
      </div>

      <article class="card reserve-card">
        <div class="advance-head">
          <div>
            <strong>对公预留与费用</strong>
            <p class="muted">固定结算单后自动预留代扣税费与留存；确认开票后预留税额。网银费、年费等先登记占用预留，再匹配支出流水核销。全程不碰企业私户。</p>
          </div>
          <div class="reserve-actions">
            <button class="btn tiny" type="button" :disabled="busy" @click="syncReserveMonth">同步税费预留</button>
            <button class="btn tiny" type="button" :disabled="busy" @click="openExpenseForm(false)">登记费用</button>
            <button class="btn tiny" type="button" :disabled="busy" @click="openExpenseForm(true)">补登记已扣款</button>
          </div>
        </div>
        <div v-if="reserveBuckets.length" class="owner-caps">
          <button
            v-for="b in reserveBuckets"
            :key="b.kind"
            type="button"
            class="owner-cap owner-cap-btn"
            @click="openReserveDetail(b.kind)"
          >
            <strong>{{ b.label }}</strong> {{ money(b.amount) }}
          </button>
          <button class="link reserve-all-link" type="button" @click="openReserveDetail()">查看全部明细 →</button>
        </div>
        <div v-else class="empty-line">暂无对公预留。固定月度结算单或确认开票后会出现。</div>

        <div v-if="expenses.length" class="expense-list">
          <div v-for="item in expenses" :key="item.id" class="expense-row" :class="item.status">
            <div>
              <strong>{{ item.title || item.categoryLabel }}</strong>
              <small>{{ item.categoryLabel }} · {{ item.statusLabel }} · {{ money(item.amount) }}<template v-if="item.month"> · {{ item.month }}</template></small>
              <small v-if="item.note">{{ item.note }}</small>
            </div>
            <div class="ops">
              <button v-if="item.status === 'pending'" class="btn tiny primary" type="button" :disabled="busy" @click="matchExpense(item)">匹配流水</button>
              <button v-if="item.status === 'pending'" class="btn tiny" type="button" :disabled="busy" @click="voidExpense(item)">作废</button>
            </div>
          </div>
        </div>
      </article>

      <article class="card private-card">
        <div class="advance-head">
          <div>
            <strong>企业私户</strong>
            <p class="muted">从可用余额划入，或由流水归属 / 打款入账。可记增加、扣除项；划出后重新计入可用余额。</p>
          </div>
          <button class="btn primary tiny" type="button" :disabled="summary.availableBalance != null && !(summary.availableBalance > 0)" @click="openDepositForm">从可用余额划入</button>
        </div>
        <div v-if="!privateAccounts.length" class="empty-line">还没有企业私户。可从可用余额划入；收入流水可「划入企业私户」，支出流水可「从私户扣除」。</div>
        <div v-else class="private-list">
          <div v-for="acc in privateAccounts" :key="acc.id" class="private-row" :class="{ open: privateOpenId === acc.id }">
            <button type="button" class="private-main" @click="togglePrivate(acc.id)">
              <strong>{{ acc.name }}</strong>
              <span>余额 {{ money(acc.balance) }}</span>
              <small>
                <template v-if="acc.advanced">已垫付 {{ money(acc.advanced) }} · </template>
                可划出 {{ money(acc.withdrawable) }}
              </small>
            </button>
            <div class="private-ops">
              <button class="op-btn plus" type="button" :disabled="busy || !(summary.availableBalance > 0)" @click="openAdjust(acc, 'plus')">+ 增加</button>
              <button class="op-btn minus" type="button" :disabled="busy || !(acc.withdrawable > 0)" @click="openAdjust(acc, 'minus')">− 扣除</button>
              <button class="op-btn" type="button" :disabled="busy || !(acc.withdrawable > 0)" @click="openWithdraw(acc)">划出</button>
            </div>
            <div v-if="privateOpenId === acc.id" class="private-entries">
              <div v-if="!(acc.entries || []).length" class="empty-line">暂无流水</div>
              <div v-for="entry in acc.entries || []" :key="entry.id" class="entry-row" :class="[entry.direction, entry.kind]">
                <div class="entry-top">
                  <em class="entry-kind" :class="entry.kind">{{ entry.kindLabel }}</em>
                  <span class="entry-amt" :class="entry.direction">{{ entry.direction === 'in' ? '+' : '−' }}{{ money(entry.amount) }}</span>
                </div>
                <small v-if="entry.note" class="entry-note">{{ entry.note }}</small>
                <small>{{ formatAuditTime(entry.createdAt) }} · {{ entry.adminName || '管理员' }}</small>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="card advance-card">
        <div class="advance-head">
          <div>
            <strong>垫付资金池</strong>
            <p class="muted">从某人企业私户提取垫付，打款时可选用；对公进账后确认补还。可用 {{ money(advanceTotals.pool) }} · 待补还 {{ money(advanceTotals.owed) }}<template v-if="advanceTotals.pendingRepay"> · 待确认 {{ money(advanceTotals.pendingRepay) }}</template></p>
          </div>
          <button class="btn primary tiny" type="button" :disabled="!advanceableOwners.length" @click="openAdvanceForm">从企业私户提取垫付</button>
        </div>
        <div v-if="pendingRepays.length" class="pending-repays">
          <div v-for="item in pendingRepays" :key="item.repayId" class="pending-row">
            <span>待确认：{{ item.name }} ← 流水 {{ item.txnDate || '—' }} {{ money(item.amount) }}</span>
            <span class="ops">
              <button class="btn tiny primary" type="button" :disabled="busy" @click="confirmRepay(item.repayId)">确认补还</button>
              <button class="btn tiny" type="button" :disabled="busy" @click="rejectRepay(item.repayId)">忽略</button>
            </span>
          </div>
        </div>
        <div v-if="lockOwners.length" class="owner-caps">
          <span v-for="owner in lockOwners" :key="`${owner.userId || ''}-${owner.name}`" class="owner-cap">
            <strong>{{ owner.name }}</strong>
            私户 {{ money(owner.balance ?? owner.locked) }}
            <template v-if="owner.advanced"> · 已垫付 {{ money(owner.advanced) }}</template>
            · 可提取 {{ money(owner.advanceable) }}
          </span>
        </div>
        <div v-if="!advances.length" class="empty-line">还没有垫付单。先划入企业私户，再从私户提取垫付。</div>
        <div v-else class="advance-list">
          <div v-for="item in advances" :key="item.id" class="advance-row" :class="item.status">
            <div>
              <strong>{{ item.name }}</strong>
              <small>{{ item.status === 'open' ? '进行中' : '已结清' }} · 垫付 {{ money(item.amount) }} · 已用 {{ money(item.used) }} · 可用 {{ money(item.available) }} · 已补还 {{ money(item.repaid) }} · 仍欠 {{ money(item.owed) }}</small>
              <small v-if="item.uses?.length" class="use-line">打款消耗：{{ item.uses.map((u) => `${u.month} ${money(u.amount)}`).join('；') }}</small>
            </div>
            <button v-if="item.status === 'open' && item.available <= 0 && item.owed <= 0" class="btn tiny" type="button" :disabled="busy" @click="closeAdvance(item)">关闭</button>
          </div>
        </div>
      </article>

      <div class="tabs remark-tabs">
        <button type="button" :class="{ on: remarkKey === null }" @click="remarkKey = null">全部<em>{{ rows.length }}</em></button>
        <button
          v-for="chip in remarkChips"
          :key="chip.key"
          type="button"
          :class="{ on: remarkKey === chip.key }"
          @click="toggleRemark(chip.key)"
        >{{ chip.label }}<em>{{ chip.count }}</em></button>
      </div>

      <article class="card">
        <div v-if="!filtered.length" class="empty">{{ rows.length ? '这个备注下没有流水' : '还没有流水，先导入浦发交易查询表' }}</div>
        <div v-else class="table-scroll">
          <table class="bank-table">
            <thead>
              <tr>
                <th>流水</th>
                <th class="num">余额</th>
                <th class="num">已归属私户</th>
                <th class="num">未归属</th>
                <th>对方</th>
                <th>摘要</th>
                <th>备注</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filtered" :key="row.id" :class="{ open: openId === row.id, done: row.remain <= 0 }">
                <td>
                  <div class="flow" :class="row.direction">
                    <span class="flow-mark" :class="row.direction" aria-hidden="true">
                      <svg v-if="row.direction === 'in'" viewBox="0 0 24 24" width="16" height="16"><path d="M12 5v11M8 12l4 4 4-4" /></svg>
                      <svg v-else viewBox="0 0 24 24" width="16" height="16"><path d="M12 19V8M8 12l4-4 4 4" /></svg>
                    </span>
                    <span class="flow-main">
                      <strong :class="row.direction">{{ row.direction === 'in' ? '+' : '−' }}{{ money(row.amount) }}</strong>
                      <small>{{ row.txnDate }} {{ row.txnTime }}</small>
                    </span>
                  </div>
                </td>
                <td class="num balance">{{ row.balance == null ? '—' : money(row.balance) }}</td>
                <td class="num">{{ money(row.assigned) }}</td>
                <td class="num" :class="{ warn: row.remain > 0 }">{{ money(row.remain) }}</td>
                <td>
                  <div class="who">{{ row.counterName || '—' }}</div>
                  <small v-if="row.counterBank">{{ row.counterBank }}</small>
                </td>
                <td>{{ row.summary || '—' }}</td>
                <td>
                  <button v-if="row.remark" class="remark" type="button" @click="toggleRemark(row.remark)">{{ row.remark }}</button>
                  <button v-else class="remark muted" type="button" @click="toggleRemark('')">无备注</button>
                </td>
                <td class="ops">
                  <button
                    v-if="row.direction === 'in'"
                    class="btn tiny"
                    type="button"
                    @click="openDrawer(row)"
                  >划入企业私户</button>
                  <button
                    v-else
                    class="btn tiny"
                    type="button"
                    :disabled="!(row.remain > 0) && !(row.allocations || []).length"
                    @click="openDrawer(row)"
                  >从私户扣除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </PageLoad>

    <Teleport to="body">
      <div v-if="reserveDetailOpen" class="bank-drawer-mask" @click.self="closeReserveDetail">
        <aside class="bank-drawer reserve-detail-drawer" role="dialog" aria-label="对公预留明细">
          <header>
            <div>
              <h3>对公预留明细</h3>
              <p>合计 {{ money(reserves.total) }} · 共 {{ reserveDetailEntries.length }} 条流水<template v-if="reserveDetailKind"> · 筛选「{{ reserveKindLabel(reserveDetailKind) }}」</template></p>
            </div>
            <button class="modal-close" type="button" aria-label="关闭" @click="closeReserveDetail">×</button>
          </header>
          <div class="bank-drawer-body">
            <div class="reserve-detail-buckets">
              <button
                type="button"
                class="bucket-chip"
                :class="{ on: !reserveDetailKind }"
                @click="reserveDetailKind = ''"
              >全部 {{ money(reserves.total) }}</button>
              <button
                v-for="b in reserveBuckets"
                :key="b.kind"
                type="button"
                class="bucket-chip"
                :class="{ on: reserveDetailKind === b.kind }"
                @click="reserveDetailKind = b.kind"
              >{{ b.label }} {{ money(b.amount) }}</button>
            </div>

            <div v-if="!reserveDetailEntries.length" class="empty-line">该分类暂无流水明细</div>
            <div v-else class="reserve-entry-list">
              <div v-for="row in reserveDetailEntries" :key="row.id" class="reserve-entry" :class="row.direction">
                <div class="reserve-entry-top">
                  <em class="kind-pill">{{ row.kindLabel }}</em>
                  <strong :class="row.direction">{{ row.direction === 'in' ? '+' : '−' }}{{ money(row.amount) }}</strong>
                </div>
                <span class="reserve-entry-note">{{ row.note || '—' }}</span>
                <small>
                  <template v-if="row.month">{{ row.month }} · </template>
                  {{ dateTime(row.createdAt) }}
                  <template v-if="row.adminName"> · {{ row.adminName }}</template>
                  <template v-if="row.refKey"> · {{ row.refType }}/{{ row.refKey }}</template>
                </small>
              </div>
            </div>

            <div v-if="!reserveDetailKind && expenses.length" class="reserve-expense-block">
              <h4>费用登记</h4>
              <div v-for="item in expenses" :key="item.id" class="expense-row compact" :class="item.status">
                <div>
                  <strong>{{ item.title || item.categoryLabel }}</strong>
                  <small>{{ item.categoryLabel }} · {{ item.statusLabel }} · {{ money(item.amount) }}<template v-if="item.month"> · {{ item.month }}</template></small>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div v-if="active" class="bank-drawer-mask" @click.self="closeDrawer">
        <aside class="bank-drawer" role="dialog" :aria-label="active.direction === 'out' ? '从私户扣除' : '划入企业私户'">
          <header>
            <div>
              <h3>{{ active.direction === 'out' ? '从企业私户扣除' : '划入企业私户' }}</h3>
              <p>{{ active.txnDate }} {{ active.txnTime }} · {{ active.counterName || '无对方户名' }}</p>
            </div>
            <button class="modal-close" type="button" aria-label="关闭" @click="closeDrawer">×</button>
          </header>
          <div class="bank-drawer-body">
            <div class="drawer-facts">
              <div>
                <small>交易金额</small>
                <strong :class="active.direction">{{ active.direction === 'in' ? '+' : '−' }}{{ money(active.amount) }}</strong>
                <em>{{ active.direction === 'in' ? '收入' : '支出' }}</em>
              </div>
              <div>
                <small>账户余额</small>
                <strong>{{ active.balance == null ? '—' : money(active.balance) }}</strong>
                <em>导入原值</em>
              </div>
              <div>
                <small>未归属</small>
                <strong class="warn">{{ money(active.remain) }}</strong>
                <em>{{ active.direction === 'out' ? '还可从私户扣' : '可划入私户' }}</em>
              </div>
            </div>
            <p v-if="active.direction === 'out'" class="hint">支出流水只能从企业私户扣除（私户可划出余额须足够）。扣除后可用余额会回升；解除则金额退回该私户。</p>
            <p v-else class="hint">收入流水可划入某人企业私户，不超过本笔未归属与当前可用余额。解除会记审计流水，记录清楚、禁止删除。</p>
            <div v-if="active.allocations.length" class="allocs">
              <div v-for="item in active.allocations" :key="item.id" class="alloc" :class="{ unlocked: !item.locked }">
                <strong>{{ item.name }}</strong>
                <span>{{ money(item.amount) }}</span>
                <em v-if="item.note">{{ item.note }}</em>
                <em class="lock">{{
                  active.direction === 'out'
                    ? (item.locked ? '已从私户扣除' : '已解除（已退回私户）')
                    : (item.locked ? '已在企业私户' : '已解除（金额已释放）')
                }}</em>
                <button v-if="item.locked" class="link" type="button" :disabled="busy" @click="unlock(item)">
                  {{ active.direction === 'out' ? '解除扣除' : '解除划入' }}
                </button>
                <button
                  v-else
                  class="link"
                  type="button"
                  :disabled="busy || !canRelock(active, item)"
                  @click="relock(item)"
                >{{ active.direction === 'out' ? '重新扣除' : '重新划入' }}</button>
              </div>
            </div>
            <p v-else class="hint">{{ active.direction === 'out' ? '这笔支出还没有从私户扣除。' : '这笔余额还没有划入企业私户。' }}</p>
            <form v-if="active.remain > 0" class="alloc-form" novalidate @submit.prevent="submitAlloc(active)">
              <template v-if="active.direction === 'out'">
                <label class="amt">
                  <span>选择企业私户</span>
                  <select v-model="form.accountId" required @change="onOutAccountChange(active)">
                    <option value="">请选择私户</option>
                    <option
                      v-for="acc in privateAccounts"
                      :key="acc.id"
                      :value="String(acc.id)"
                      :disabled="!(Number(acc.withdrawable) > 0)"
                    >{{ acc.name }} · 可扣 {{ money(acc.withdrawable) }}（余额 {{ money(acc.balance) }}）</option>
                  </select>
                </label>
              </template>
              <template v-else>
                <div class="type-switch">
                  <button type="button" :class="{ on: form.mode === 'user' }" @click="form.mode = 'user'">系统人员</button>
                  <button type="button" :class="{ on: form.mode === 'name' }" @click="form.mode = 'name'">手填姓名</button>
                </div>
                <SearchSelect
                  v-if="form.mode === 'user'"
                  :model-value="form.userId"
                  :options="userOptions"
                  placeholder="选择所属人员"
                  search-placeholder="搜索姓名"
                  @update:model-value="(id) => (form.userId = id || '')"
                />
                <input v-else v-model="form.name" maxlength="40" placeholder="资金所属人员" />
              </template>
              <label class="amt">
                <span>{{ active.direction === 'out' ? '扣除金额' : '划入金额（可手填）' }}</span>
                <input v-model="form.amount" type="number" min="0.01" :max="lockMax(active)" step="0.01" />
                <em v-if="active.direction === 'out'">
                  最多 {{ money(lockMax(active)) }}（本笔未归属 {{ money(active.remain) }}
                  <template v-if="selectedPrivate"> · 该私户可扣 {{ money(selectedPrivate.withdrawable) }}</template>）
                </em>
                <em v-else>最多 {{ money(lockMax(active)) }}（本笔未归属 {{ money(active.remain) }} · 可用余额 {{ summary.availableBalance == null ? '—' : money(summary.availableBalance) }}）</em>
              </label>
              <input v-model="form.note" maxlength="80" placeholder="备注，可不填" />
              <div class="drawer-actions">
                <button class="btn primary" type="submit" :disabled="busy || (active.direction === 'out' && !form.accountId)">
                  {{ active.direction === 'out' ? '确认从私户扣除' : '划入企业私户' }}
                </button>
                <button v-if="active.direction === 'in' && active.counterName" class="link" type="button" @click="fillCounterparty(active)">按对方户名填入</button>
              </div>
            </form>
            <p v-if="active.direction === 'in' && active.suggested && active.remain > 0" class="hint">对方户名对应系统人员「{{ active.suggested.name }}」，选中后仍需确认划入金额。</p>
            <p v-if="active.remain <= 0" class="hint">{{ active.direction === 'out' ? '这笔支出已全部从私户扣除。' : '这笔未归属余额已经全部划入企业私户。' }}</p>
            <div v-if="active.logs?.length" class="audit-logs">
              <strong>操作记录</strong>
              <div v-for="log in active.logs" :key="log.id" class="audit-row">
                <div>
                  <b>{{ log.actionLabel }}</b> {{ money(log.amount) }} · {{ log.name || '—' }}
                  <small>{{ formatAuditTime(log.createdAt) }} · {{ log.adminName || '管理员' }} · IP {{ log.ip || '—' }}</small>
                  <small v-if="log.fingerprint">设备 {{ shortFp(log.fingerprint) }}</small>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
      <div v-if="depositOpen" class="bank-drawer-mask" @click.self="closeDeposit">
        <aside class="bank-drawer adjust-drawer" role="dialog" aria-label="从可用余额划入">
          <header class="plus">
            <div>
              <h3>从可用余额划入</h3>
              <p>选择人员，划入其企业私户</p>
            </div>
            <button class="modal-close" type="button" aria-label="关闭" @click="closeDeposit">×</button>
          </header>
          <div class="bank-drawer-body">
            <div class="drawer-facts adjust-facts">
              <div>
                <small>当前可用</small>
                <strong class="warn">{{ summary.availableBalance == null ? '—' : money(summary.availableBalance) }}</strong>
                <em>划入后从可用扣除</em>
              </div>
            </div>
            <form class="alloc-form adjust-form" novalidate @submit.prevent="submitDeposit">
              <label class="amt">
                <span>所属人员</span>
                <SearchSelect
                  :model-value="depositForm.userId"
                  :options="userOptions"
                  placeholder="搜索并选择人员"
                  search-placeholder="搜索姓名 / 尾号"
                  empty-text="没有匹配的人员"
                  @update:model-value="(id) => (depositForm.userId = id || '')"
                />
              </label>
              <label class="amt">
                <span>划入金额</span>
                <input
                  v-model="depositForm.amount"
                  type="number"
                  min="0.01"
                  :max="Math.max(0, Number(summary.availableBalance) || 0)"
                  step="0.01"
                  placeholder="0.00"
                />
                <em>最多 {{ summary.availableBalance == null ? '—' : money(summary.availableBalance) }}</em>
              </label>
              <label class="amt">
                <span>原因备注（必填）</span>
                <textarea v-model="depositForm.note" maxlength="120" rows="3" placeholder="写清楚划入原因，便于事后核对" required />
              </label>
              <div class="drawer-actions">
                <button class="btn primary" type="submit" :disabled="busy">{{ busy ? '提交中…' : '确认划入' }}</button>
                <button class="link" type="button" @click="closeDeposit">取消</button>
              </div>
            </form>
          </div>
        </aside>
      </div>
      <div v-if="adjustTarget" class="bank-drawer-mask" @click.self="closeAdjust">
        <aside class="bank-drawer adjust-drawer" role="dialog" :aria-label="adjustForm.direction === 'plus' ? '增加项' : '扣除项'">
          <header :class="adjustForm.direction">
            <div>
              <h3>{{ adjustForm.direction === 'plus' ? '增加项' : '扣除项' }}</h3>
              <p>{{ adjustTarget.name }} · 企业私户</p>
            </div>
            <button class="modal-close" type="button" aria-label="关闭" @click="closeAdjust">×</button>
          </header>
          <div class="bank-drawer-body">
            <div class="drawer-facts adjust-facts">
              <div>
                <small>私户余额</small>
                <strong>{{ money(adjustTarget.balance) }}</strong>
              </div>
              <div v-if="adjustForm.direction === 'plus'">
                <small>当前可用</small>
                <strong class="warn">{{ summary.availableBalance == null ? '—' : money(summary.availableBalance) }}</strong>
                <em>增加不超过可用</em>
              </div>
              <div v-else>
                <small>可扣除</small>
                <strong class="warn">{{ money(adjustTarget.withdrawable) }}</strong>
                <em>扣除后回可用余额</em>
              </div>
            </div>
            <p class="hint">
              {{ adjustForm.direction === 'plus'
                ? '从当前可用余额增加至该企业私户，必须填写备注。'
                : '从该企业私户扣除并释放回可用余额，必须填写备注。' }}
            </p>
            <form class="alloc-form adjust-form" novalidate @submit.prevent="submitAdjust">
              <div class="dir-switch">
                <button type="button" class="plus" :class="{ on: adjustForm.direction === 'plus' }" :disabled="!(summary.availableBalance > 0)" @click="adjustForm.direction = 'plus'">+ 增加</button>
                <button type="button" class="minus" :class="{ on: adjustForm.direction === 'minus' }" :disabled="!(adjustTarget.withdrawable > 0)" @click="adjustForm.direction = 'minus'">− 扣除</button>
              </div>
              <label class="amt">
                <span>{{ adjustForm.direction === 'plus' ? '增加金额' : '扣除金额' }}</span>
                <input v-model="adjustForm.amount" type="number" min="0.01" :max="adjustMax" step="0.01" placeholder="0.00" />
                <em>最多 {{ money(adjustMax) }}</em>
              </label>
              <label class="amt">
                <span>原因备注（必填）</span>
                <textarea v-model="adjustForm.note" maxlength="120" rows="3" placeholder="写清楚为什么增减，便于事后核对" required />
              </label>
              <div class="drawer-actions">
                <button
                  class="btn"
                  :class="adjustForm.direction === 'plus' ? 'primary' : 'danger'"
                  type="submit"
                  :disabled="busy"
                >
                  {{ busy ? '提交中…' : (adjustForm.direction === 'plus' ? '确认增加' : '确认扣除') }}
                </button>
                <button class="link" type="button" @click="closeAdjust">取消</button>
              </div>
            </form>
          </div>
        </aside>
      </div>
      <div v-if="dragging" class="bank-drop">
        <div class="bank-drop-card">
          <strong>{{ importing ? '正在导入…' : '松开即可导入交易单' }}</strong>
          <span>浦发交易查询表（旧版备注列 / 新版 etabBill 交易附言），xls 或 xlsx</span>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref } from 'vue';
import PageLoad from '../components/PageLoad.vue';
import SearchSelect from '../components/SearchSelect.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { api } from '../api';
import { dateTime, money } from '../format';
import { notify } from '../notify';

const { loading, error, ready, run, bindLoad } = usePageLoad();
const data = ref({
  txns: [],
  people: [],
  summary: { statementBalance: null, statementAt: null, lockedTotal: 0, privateTotal: 0, reserveTotal: 0, availableBalance: null },
  lockOwners: [],
  privateAccounts: [],
  advances: { list: [], totals: { pool: 0, owed: 0, pendingRepay: 0 } },
  reserves: { total: 0, buckets: [], entries: [], expenses: [] },
});
const remarkKey = ref(null);
const openId = ref(null);
const privateOpenId = ref(null);
const adjustTarget = ref(null);
const depositOpen = ref(false);
const importing = ref(false);
const dragging = ref(false);
const busy = ref(false);
const fileInput = ref(null);
const form = reactive({ mode: 'user', userId: '', name: '', amount: '', note: '', accountId: '' });
const adjustForm = reactive({ direction: 'plus', amount: '', note: '' });
const depositForm = reactive({ userId: '', amount: '', note: '' });

const adjustMax = computed(() => {
  if (!adjustTarget.value) return 0;
  if (adjustForm.direction === 'plus') {
    return Math.max(0, Number(summary.value.availableBalance) || 0);
  }
  return Math.max(0, Number(adjustTarget.value.withdrawable) || 0);
});

const rows = computed(() => data.value.txns || []);
const summary = computed(() => data.value.summary || {});
const lockOwners = computed(() => data.value.lockOwners || []);
const privateAccounts = computed(() => data.value.privateAccounts || []);
const advances = computed(() => data.value.advances?.list || []);
const advanceTotals = computed(() => data.value.advances?.totals || { pool: 0, owed: 0, pendingRepay: 0 });
const advanceableOwners = computed(() => lockOwners.value.filter((item) => Number(item.advanceable) > 0));
const reserves = computed(() => data.value.reserves || { total: 0, buckets: [], entries: [], expenses: [] });
const reserveBuckets = computed(() => (reserves.value.buckets || []).filter((b) => Math.abs(Number(b.amount) || 0) > 0.0001));
const expenses = computed(() => reserves.value.expenses || []);
const outTxns = computed(() => (rows.value || []).filter((r) => r.direction === 'out'));
const reserveDetailOpen = ref(false);
const reserveDetailKind = ref('');

const RESERVE_KIND_FILTER = {
  tax_withhold: ['tax_withhold'],
  invoice_tax: ['invoice_tax'],
  retention: ['retention'],
  expense: ['expense_hold', 'expense_clear'],
  manual: ['manual_hold', 'manual_release'],
};

function reserveKindLabel(kind) {
  return reserveBuckets.value.find((b) => b.kind === kind)?.label
    || ({ tax_withhold: '代扣税费', invoice_tax: '开票税额', retention: '分成留存', expense: '费用占用', manual: '手工预留' }[kind] || kind);
}

const reserveDetailEntries = computed(() => {
  const list = reserves.value.entries || [];
  const kind = reserveDetailKind.value;
  if (!kind) return list;
  const allow = new Set(RESERVE_KIND_FILTER[kind] || [kind]);
  return list.filter((row) => allow.has(row.kind));
});

function openReserveDetail(kind) {
  reserveDetailKind.value = typeof kind === 'string' ? kind : '';
  reserveDetailOpen.value = true;
}

function closeReserveDetail() {
  reserveDetailOpen.value = false;
}

function togglePrivate(id) {
  privateOpenId.value = privateOpenId.value === id ? null : id;
}
const pendingRepays = computed(() => {
  const list = [];
  for (const adv of advances.value) {
    for (const repay of adv.repays || []) {
      if (repay.status !== 'pending') continue;
      list.push({
        repayId: repay.id,
        name: adv.name,
        amount: repay.amount,
        txnDate: repay.bankTxn ? `${repay.bankTxn.txnDate} ${repay.bankTxn.txnTime || ''}`.trim() : '',
      });
    }
  }
  return list;
});
const remarkChips = computed(() => {
  const map = new Map();
  for (const row of rows.value) {
    const key = row.remark || '';
    const chip = map.get(key) || { key, label: key || '无备注', count: 0 };
    chip.count += 1;
    map.set(key, chip);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh'));
});
const filtered = computed(() => (
  remarkKey.value === null ? rows.value : rows.value.filter((row) => (row.remark || '') === remarkKey.value)
));
const totals = computed(() => {
  const sum = { inAmount: 0, outAmount: 0, inCount: 0, outCount: 0, locked: 0 };
  for (const row of rows.value) {
    if (row.direction === 'in') {
      sum.inAmount += row.amount;
      sum.inCount += 1;
    } else {
      sum.outAmount += row.amount;
      sum.outCount += 1;
    }
    for (const item of row.allocations) if (item.locked) sum.locked += item.amount;
  }
  return sum;
});
const active = computed(() => rows.value.find((row) => row.id === openId.value) || null);
const userOptions = computed(() => (data.value.people || []).map((person) => ({
  value: person.id,
  label: person.name,
  hint: [person.role === 'teacher' ? '教师' : '用户', person.phoneTail ? `尾号 ${person.phoneTail}` : ''].filter(Boolean).join(' · '),
})));

const selectedPrivate = computed(() => {
  const id = Number(form.accountId);
  if (!id) return null;
  return privateAccounts.value.find((a) => a.id === id) || null;
});

function lockMax(row) {
  const remain = Number(row?.remain) || 0;
  if (row?.direction === 'out') {
    const cap = selectedPrivate.value ? Number(selectedPrivate.value.withdrawable) || 0 : 0;
    if (!form.accountId) return remain;
    return Math.max(0, Math.min(remain, cap));
  }
  const available = summary.value.availableBalance;
  if (available == null) return remain;
  return Math.max(0, Math.min(remain, Number(available) || 0));
}

function canRelock(row, item) {
  if (!row || !item) return false;
  if (item.amount > row.remain) return false;
  if (row.direction === 'out') {
    const acc = privateAccounts.value.find((a) => a.name === item.name || (item.userId && a.userId === item.userId));
    return !!acc && Number(acc.withdrawable) >= Number(item.amount);
  }
  if (summary.value.availableBalance != null && item.amount > summary.value.availableBalance) return false;
  return true;
}

function onOutAccountChange(row) {
  const max = lockMax(row);
  form.amount = max > 0 ? max : '';
}

function toggleRemark(key) {
  remarkKey.value = remarkKey.value === key ? null : key;
}

function fillCounterparty(row) {
  if (row.suggested) {
    form.mode = 'user';
    form.userId = row.suggested.userId;
    form.name = row.suggested.name;
  } else {
    form.mode = 'name';
    form.userId = '';
    form.name = row.counterName;
  }
  form.amount = lockMax(row) || '';
}

function closeDrawer() {
  openId.value = null;
}

function openDrawer(row) {
  openId.value = row.id;
  form.mode = row.suggested ? 'user' : 'name';
  form.userId = row.suggested?.userId || '';
  form.name = row.suggested ? '' : (row.counterName || '');
  form.accountId = '';
  form.note = '';
  if (row.direction === 'out') {
    const match = privateAccounts.value.find((a) => (
      (row.suggested?.userId && a.userId === row.suggested.userId)
      || (row.counterName && a.name === row.counterName)
    ) && Number(a.withdrawable) > 0)
      || privateAccounts.value.find((a) => Number(a.withdrawable) > 0);
    form.accountId = match ? String(match.id) : '';
  }
  const max = lockMax(row);
  form.amount = max > 0 ? max : '';
}

async function load() {
  await run(async () => {
    const result = await api.bankTxns();
    data.value = {
      txns: Array.isArray(result?.txns) ? result.txns : [],
      people: Array.isArray(result?.people) ? result.people : [],
      summary: result?.summary || { statementBalance: null, statementAt: null, lockedTotal: 0, privateTotal: 0, reserveTotal: 0, availableBalance: null },
      lockOwners: Array.isArray(result?.lockOwners) ? result.lockOwners : [],
      privateAccounts: Array.isArray(result?.privateAccounts) ? result.privateAccounts : [],
      advances: result?.advances || { list: [], totals: { pool: 0, owed: 0, pendingRepay: 0 } },
      reserves: result?.reserves || { total: 0, buckets: [], entries: [], expenses: [] },
    };
  });
}

function defaultMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function syncReserveMonth() {
  const month = await notify.prompt({
    title: '同步税费预留',
    message: '按该月分成试算，把代扣税费与留存写入对公预留（需已固定结算单）。开票税额按发票单独挂。企业私户不受影响。',
    value: defaultMonth(),
    placeholder: 'YYYY-MM',
    okText: '同步',
  });
  if (month == null) return;
  const key = String(month).trim();
  if (!/^\d{4}-\d{2}$/.test(key)) {
    notify.error('月份格式应为 YYYY-MM');
    return;
  }
  busy.value = true;
  try {
    await api.financeSyncReserves(key);
    notify.success(`已同步 ${key} 税费/留存预留`);
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '同步失败');
  } finally {
    busy.value = false;
  }
}

async function openExpenseForm(afterImport) {
  const category = await notify.prompt({
    title: afterImport ? '补登记已扣款费用' : '登记对公费用',
    message: afterImport
      ? '银行已扣款后补记。请填写类别代码：bank_service 网银服务费 / card_annual 结算卡年费 / tax_payment 缴税 / other 其它'
      : '先占用对公预留（从可用划入），匹配支出流水后核销。类别：bank_service / card_annual / tax_payment / other',
    value: 'bank_service',
    placeholder: '类别代码',
    okText: '下一步',
  });
  if (category == null) return;
  const amountText = await notify.prompt({
    title: '费用金额',
    message: afterImport ? '与银行支出流水金额一致' : `当前可用 ${summary.value.availableBalance == null ? '—' : money(summary.value.availableBalance)}`,
    value: '',
    placeholder: '0.00',
    okText: '下一步',
  });
  if (amountText == null) return;
  const amount = Number(amountText);
  if (!(amount > 0)) {
    notify.error('请填写有效金额');
    return;
  }
  const title = await notify.prompt({
    title: '费用名称',
    message: '可选，便于对账',
    value: '',
    placeholder: '例如：2026 结算卡年费',
    okText: afterImport ? '下一步选流水' : '确认登记',
    required: false,
  });
  if (title == null) return;

  let bankTxnId = null;
  if (afterImport) {
    if (!outTxns.value.length) {
      notify.error('没有支出流水，请先导入交易单');
      return;
    }
    const choices = outTxns.value.slice(0, 30).map((t) => `#${t.id} ${t.txnDate} ${money(Math.abs(t.amount))} ${t.summary || t.remark || ''}`).join('\n');
    const picked = await notify.prompt({
      title: '选择支出流水 ID',
      message: `最近支出：\n${choices}`,
      value: String(outTxns.value.find((t) => Math.round(Math.abs(Number(t.amount) || 0) * 100) === Math.round(amount * 100))?.id || ''),
      placeholder: '流水 ID',
      okText: '确认补登记',
    });
    if (picked == null) return;
    bankTxnId = Number(picked);
    if (!Number.isFinite(bankTxnId) || bankTxnId <= 0) {
      notify.error('请填写有效流水 ID');
      return;
    }
  }

  busy.value = true;
  try {
    await api.financeCreateExpense({
      category: String(category).trim() || 'other',
      amount,
      title: String(title || '').trim(),
      afterImport: !!afterImport,
      bankTxnId,
      month: defaultMonth(),
    });
    notify.success(afterImport ? '已补登记并核销' : '已登记费用（待匹配流水）');
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '登记失败');
  } finally {
    busy.value = false;
  }
}

async function matchExpense(item) {
  if (!outTxns.value.length) {
    notify.error('没有支出流水，请先导入交易单');
    return;
  }
  const choices = outTxns.value.slice(0, 30).map((t) => `#${t.id} ${t.txnDate} ${money(Math.abs(t.amount))} ${t.summary || t.remark || ''}`).join('\n');
  const picked = await notify.prompt({
    title: `核销「${item.title || item.categoryLabel}」`,
    message: `费用 ${money(item.amount)}。选择金额一致的支出流水：\n${choices}`,
    value: String(outTxns.value.find((t) => Math.round(Math.abs(Number(t.amount) || 0) * 100) === Math.round(Number(item.amount) * 100))?.id || ''),
    placeholder: '流水 ID',
    okText: '确认核销',
  });
  if (picked == null) return;
  const bankTxnId = Number(picked);
  if (!Number.isFinite(bankTxnId) || bankTxnId <= 0) {
    notify.error('请填写有效流水 ID');
    return;
  }
  busy.value = true;
  try {
    await api.financeMatchExpense(item.id, { bankTxnId });
    notify.success('已核销');
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '核销失败');
  } finally {
    busy.value = false;
  }
}

async function voidExpense(item) {
  const ok = await notify.confirm({
    title: '作废费用',
    message: `作废「${item.title || item.categoryLabel}」${money(item.amount)}？占用的预留将释放回当前可用。`,
    okText: '作废',
    danger: true,
  });
  if (!ok) return;
  busy.value = true;
  try {
    await api.financeVoidExpense(item.id);
    notify.success('已作废');
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '作废失败');
  } finally {
    busy.value = false;
  }
}

function isWorkbook(file) {
  return /\.xlsx?$/i.test(file?.name || '');
}

async function importFile(file) {
  if (!file || importing.value) return;
  if (!isWorkbook(file)) {
    notify.error('请拖入浦发交易查询表（xls / xlsx，旧版备注或新版交易附言均可）');
    return;
  }
  importing.value = true;
  try {
    const result = await api.importBankTxns(file);
    const parts = [];
    if (result.inserted) parts.push(`已导入 ${result.inserted} 笔`);
    if (result.skipped) parts.push(`跳过重复 ${result.skipped} 笔`);
    if (result.advanceConfirmed) parts.push(`自动确认补还垫付 ${result.advanceConfirmed} 笔`);
    if (result.advancePending) parts.push(`待确认垫付匹配 ${result.advancePending} 笔（本页确认）`);
    notify.success(parts.length ? parts.join('，') : '没有新流水');
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '导入失败');
  } finally {
    importing.value = false;
    dragging.value = false;
  }
}

function onFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  importFile(file);
}

function hasFiles(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files');
}

function onWindowDragEnter(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragging.value = true;
}

function onWindowDragOver(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = importing.value ? 'none' : 'copy';
}

function onWindowDragLeave(event) {
  if (event.relatedTarget) return;
  dragging.value = false;
}

function onWindowDrop(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragging.value = false;
  importFile(event.dataTransfer?.files?.[0]);
}

let dragBound = false;
function bindDrag() {
  if (dragBound) return;
  dragBound = true;
  window.addEventListener('dragenter', onWindowDragEnter);
  window.addEventListener('dragover', onWindowDragOver);
  window.addEventListener('dragleave', onWindowDragLeave);
  window.addEventListener('drop', onWindowDrop);
}

function unbindDrag() {
  if (!dragBound) return;
  dragBound = false;
  dragging.value = false;
  window.removeEventListener('dragenter', onWindowDragEnter);
  window.removeEventListener('dragover', onWindowDragOver);
  window.removeEventListener('dragleave', onWindowDragLeave);
  window.removeEventListener('drop', onWindowDrop);
}

onMounted(bindDrag);
onActivated(bindDrag);
onDeactivated(unbindDrag);
onBeforeUnmount(unbindDrag);

async function submitAlloc(row) {
  const isOut = row.direction === 'out';
  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    notify.error(isOut ? '请填写扣除金额' : '请填写划入金额');
    return;
  }
  const max = lockMax(row);
  if (Math.round(amount * 100) > Math.round(max * 100)) {
    notify.error(isOut
      ? `最多可扣 ${money(max)}（本笔未归属与所选私户可扣额取较小值）`
      : `最多可划入 ${money(max)}（本笔未归属与当前可用余额取较小值）`);
    return;
  }
  let payload = {
    amount,
    note: form.note.trim(),
  };
  if (isOut) {
    if (!form.accountId) {
      notify.error('请选择要扣除的企业私户');
      return;
    }
    payload.accountId = Number(form.accountId);
  } else {
    const person = (data.value.people || []).find((item) => item.id === form.userId);
    if (form.mode === 'user' && !person) {
      notify.error('请选择所属人员');
      return;
    }
    if (form.mode === 'name' && !form.name.trim()) {
      notify.error('请填写所属人员');
      return;
    }
    payload = {
      ...payload,
      userId: form.mode === 'user' ? form.userId : null,
      name: form.mode === 'user' ? person.name : form.name.trim(),
    };
  }
  busy.value = true;
  try {
    await api.allocateBankTxn(row.id, payload);
    notify.success(isOut ? '已从企业私户扣除' : '已划入企业私户');
    await load();
    const next = rows.value.find((item) => item.id === row.id);
    if (next) {
      const nextMax = lockMax(next);
      form.amount = nextMax > 0 ? nextMax : '';
    }
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || (isOut ? '扣除失败' : '划入失败'));
  } finally {
    busy.value = false;
  }
}

function formatAuditTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function shortFp(fp) {
  const text = String(fp || '');
  if (text.length <= 18) return text;
  return `${text.slice(0, 10)}…${text.slice(-6)}`;
}

async function unlock(item) {
  const isOut = active.value?.direction === 'out';
  const ok = await notify.confirm({
    title: isOut ? '解除私户扣除' : '解除企业私户划入',
    message: isOut
      ? `解除「${item.name}」¥${Number(item.amount).toFixed(2)} 的支出私户扣除？金额将退回该企业私户。`
      : `解除「${item.name}」¥${Number(item.amount).toFixed(2)} 的流水划入？金额将重新计入当前可用余额；若该人已提取垫付，须仍覆盖垫付额。`,
    okText: '确认解除',
    danger: true,
  });
  if (!ok) return;
  busy.value = true;
  try {
    await api.lockBankAlloc(item.id, false);
    notify.success(isOut ? '已解除，金额已退回企业私户' : '已解除，金额已计入可用余额');
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '解除失败');
  } finally {
    busy.value = false;
  }
}

async function relock(item) {
  const isOut = active.value?.direction === 'out';
  const ok = await notify.confirm({
    title: isOut ? '重新从私户扣除' : '重新划入企业私户',
    message: isOut
      ? `将「${item.name}」¥${Number(item.amount).toFixed(2)} 重新从企业私户扣除？私户可划出余额须足够。`
      : `将「${item.name}」¥${Number(item.amount).toFixed(2)} 重新划入企业私户？会占用当前可用余额并记入流水。`,
    okText: isOut ? '重新扣除' : '重新划入',
  });
  if (!ok) return;
  busy.value = true;
  try {
    await api.lockBankAlloc(item.id, true);
    notify.success(isOut ? '已重新从企业私户扣除' : '已重新划入企业私户');
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || (isOut ? '重新扣除失败' : '重新划入失败'));
  } finally {
    busy.value = false;
  }
}

function openDepositForm() {
  if (!(Number(summary.value.availableBalance) > 0) && summary.value.availableBalance != null) {
    notify.error('当前没有可用余额');
    return;
  }
  depositOpen.value = true;
  depositForm.userId = '';
  depositForm.amount = summary.value.availableBalance > 0 ? String(summary.value.availableBalance) : '';
  depositForm.note = '';
}

function closeDeposit() {
  depositOpen.value = false;
  depositForm.userId = '';
  depositForm.amount = '';
  depositForm.note = '';
}

async function submitDeposit() {
  const person = (data.value.people || []).find((item) => item.id === depositForm.userId);
  if (!person) {
    notify.error('请先选择所属人员');
    return;
  }
  const amount = Number(depositForm.amount);
  const note = String(depositForm.note || '').trim();
  const max = Math.max(0, Number(summary.value.availableBalance) || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    notify.error('请填写大于 0 的金额');
    return;
  }
  if (summary.value.availableBalance != null && Math.round(amount * 100) > Math.round(max * 100)) {
    notify.error(`最多可划入 ${money(max)}`);
    return;
  }
  if (!note) {
    notify.error('请填写原因备注');
    return;
  }
  busy.value = true;
  try {
    await api.depositPrivateAccount({
      userId: person.id,
      name: person.name,
      amount,
      note,
    });
    notify.success(`已划入「${person.name}」企业私户`);
    closeDeposit();
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '划入失败');
  } finally {
    busy.value = false;
  }
}

function openAdjust(acc, direction) {
  const plus = direction === 'plus';
  if (plus && !(Number(summary.value.availableBalance) > 0)) {
    notify.error('当前没有可用余额，无法增加');
    return;
  }
  if (!plus && !(Number(acc.withdrawable) > 0)) {
    notify.error('可扣除金额为 0');
    return;
  }
  adjustTarget.value = acc;
  adjustForm.direction = plus ? 'plus' : 'minus';
  adjustForm.amount = '';
  adjustForm.note = '';
}

function closeAdjust() {
  adjustTarget.value = null;
  adjustForm.amount = '';
  adjustForm.note = '';
}

async function submitAdjust() {
  const acc = adjustTarget.value;
  if (!acc) return;
  const plus = adjustForm.direction === 'plus';
  const amount = Number(adjustForm.amount);
  const note = String(adjustForm.note || '').trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    notify.error('请填写大于 0 的金额');
    return;
  }
  if (Math.round(amount * 100) > Math.round(adjustMax.value * 100)) {
    notify.error(`最多 ${money(adjustMax.value)}`);
    return;
  }
  if (!note) {
    notify.error('请填写原因备注');
    return;
  }
  busy.value = true;
  try {
    await api.adjustPrivateAccount({
      accountId: acc.id,
      amount,
      direction: plus ? 'plus' : 'minus',
      note,
    });
    notify.success(plus ? '已记增加项' : '已记扣除项');
    privateOpenId.value = acc.id;
    closeAdjust();
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '操作失败');
  } finally {
    busy.value = false;
  }
}

async function openWithdraw(acc) {
  const amountText = await notify.prompt({
    title: `划出到可用余额 · ${acc.name}`,
    message: `可划出 ${money(acc.withdrawable)}（余额 ${money(acc.balance)}，已垫付 ${money(acc.advanced)}）。`,
    value: String(acc.withdrawable),
    okText: '确认划出',
    required: true,
  });
  if (amountText == null) return;
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) {
    notify.error('请填写大于 0 的金额');
    return;
  }
  busy.value = true;
  try {
    await api.withdrawPrivateAccount({ accountId: acc.id, amount });
    notify.success('已划出到可用余额');
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '划出失败');
  } finally {
    busy.value = false;
  }
}

async function openAdvanceForm() {
  if (!advanceableOwners.value.length) {
    notify.error('没有可提取的企业私户余额，请先划入企业私户');
    return;
  }
  const choices = advanceableOwners.value.map((item) => `${item.name}（可提取 ${money(item.advanceable)}）`).join('\n');
  const name = await notify.prompt({
    title: '从企业私户提取垫付',
    message: `可提取人员：\n${choices}\n\n填写垫付人姓名（须与企业私户一致）`,
    value: advanceableOwners.value[0]?.name || '',
    okText: '下一步',
    required: true,
  });
  if (name == null) return;
  const owner = advanceableOwners.value.find((item) => item.name === String(name).trim())
    || advanceableOwners.value.find((item) => item.name.includes(String(name).trim()));
  if (!owner) {
    notify.error('未找到该人的可提取企业私户余额');
    return;
  }
  const amountText = await notify.prompt({
    title: '提取金额',
    message: `「${owner.name}」可提取 ${money(owner.advanceable)}（企业私户 ${money(owner.balance ?? owner.locked)}）。填写垫入资金池的金额`,
    value: String(owner.advanceable),
    okText: '提取',
    required: true,
  });
  if (amountText == null) return;
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) {
    notify.error('请填写大于 0 的金额');
    return;
  }
  if (Math.round(amount * 100) > Math.round(owner.advanceable * 100)) {
    notify.error(`不能超过可提取额度 ${money(owner.advanceable)}`);
    return;
  }
  busy.value = true;
  try {
    await api.financeCreateAdvance({
      userId: owner.userId || null,
      name: owner.name,
      amount,
    });
    notify.success('已从企业私户提取垫付，进入可用池');
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '创建失败');
  } finally {
    busy.value = false;
  }
}

async function closeAdvance(item) {
  const ok = await notify.confirm({
    title: '关闭垫付单',
    message: `关闭「${item.name}」的垫付单？关闭后不再参与资金池。`,
    okText: '关闭',
  });
  if (!ok) return;
  busy.value = true;
  try {
    await api.financeCloseAdvance(item.id);
    notify.success('已关闭');
    await load();
  } catch (err) {
    notify.error(err?.message || '关闭失败');
  } finally {
    busy.value = false;
  }
}

async function confirmRepay(id) {
  busy.value = true;
  try {
    await api.financeConfirmAdvanceRepay(id);
    notify.success('已确认补还垫付人');
    await load();
  } catch (err) {
    notify.error(err?.message || '确认失败');
  } finally {
    busy.value = false;
  }
}

async function rejectRepay(id) {
  const ok = await notify.confirm({
    title: '忽略补还匹配',
    message: '忽略后这条自动匹配会删除，可稍后手动补还。',
    okText: '忽略',
    danger: true,
  });
  if (!ok) return;
  busy.value = true;
  try {
    await api.financeRejectAdvanceRepay(id);
    notify.success('已忽略');
    await load();
  } catch (err) {
    notify.error(err?.message || '操作失败');
  } finally {
    busy.value = false;
  }
}

bindLoad(load);
</script>

<style scoped>
.file { display: none; }
.remark-tabs { margin-top: 4px; }
.remark-tabs em { margin-left: 6px; font-style: normal; color: #98a2b3; }
.kpi .value.warn { color: #b54708; }
.kpi-click { cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.kpi-click:hover, .kpi-click:focus-visible {
  border-color: #b2ddff; box-shadow: 0 0 0 3px rgba(23, 92, 211, 0.12); outline: none;
}
.kpi-more {
  margin-left: 6px; padding: 1px 6px; border-radius: 999px;
  background: #eff4ff; color: #175cd3; font-size: 11px; font-style: normal; font-weight: 700;
}
.kpi-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.owner-cap-btn {
  appearance: none; font: inherit; cursor: pointer; border: 1px solid transparent;
}
.owner-cap-btn:hover { border-color: #b2ddff; background: #f5f8ff; }
.reserve-all-link { margin-left: 4px; font-size: 12px; }
.reserve-detail-drawer { width: min(560px, 100%); }
.reserve-detail-buckets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.bucket-chip {
  height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid #e4e7ec;
  background: #fff; color: #475467; font-size: 12px; font-weight: 600; cursor: pointer;
}
.bucket-chip.on { border-color: #175cd3; background: #eff4ff; color: #175cd3; }
.reserve-entry-list { display: flex; flex-direction: column; gap: 8px; max-height: min(52vh, 480px); overflow: auto; }
.reserve-entry {
  padding: 10px 12px; border-radius: 10px; border: 1px solid #eef2f6; background: #f8fafc;
}
.reserve-entry.in { border-color: #abefc6; background: #f6fef9; }
.reserve-entry.out { border-color: #fecdca; background: #fff8f7; }
.reserve-entry-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.kind-pill {
  display: inline-flex; padding: 1px 8px; border-radius: 999px;
  background: #f2f4f7; color: #475467; font-size: 11px; font-style: normal; font-weight: 700;
}
.reserve-entry-top strong { font-variant-numeric: tabular-nums; }
.reserve-entry-top strong.in { color: #067647; }
.reserve-entry-top strong.out { color: #b42318; }
.reserve-entry-note { display: block; margin-top: 4px; color: #344054; font-size: 13px; line-height: 1.45; }
.reserve-entry small { display: block; margin-top: 2px; color: #98a2b3; font-size: 12px; }
.reserve-expense-block { margin-top: 16px; padding-top: 12px; border-top: 1px dashed #e4e7ec; }
.reserve-expense-block h4 { margin: 0 0 8px; font-size: 13px; color: #344054; }
.expense-row.compact { padding: 8px 10px; }
@media (max-width: 1100px) {
  .kpi-5 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.private-card, .advance-card, .reserve-card { margin: 12px 0; padding: 14px 16px; }
.advance-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.advance-head .muted { margin: 4px 0 0; color: #667085; font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
.reserve-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.expense-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.expense-row {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
  padding: 10px 12px; border: 1px solid #e4e7ec; border-radius: 10px; background: #f8fafc;
}
.expense-row.matched { background: #f0fdf4; border-color: #abefc6; }
.expense-row.void { opacity: 0.55; }
.expense-row strong { display: block; color: #0f172a; }
.expense-row small { display: block; margin-top: 2px; color: #667085; font-size: 12px; }
.expense-row .ops { display: flex; gap: 6px; flex-wrap: wrap; }
.private-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.private-row {
  display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; align-items: start;
  padding: 10px 12px; border: 1px solid #e4e7ec; border-radius: 10px; background: #f8fafc;
}
.private-row.open { background: #f5f8ff; border-color: #c7d7fe; }
.private-main {
  appearance: none; border: 0; background: transparent; padding: 0; text-align: left; cursor: pointer; min-width: 0;
}
.private-main strong { display: block; color: #0f172a; }
.private-main span { display: block; margin-top: 2px; color: #175cd3; font-weight: 700; font-variant-numeric: tabular-nums; }
.private-main small { display: block; margin-top: 2px; color: #667085; font-size: 12px; }
.private-ops { display: flex; gap: 6px; flex-wrap: wrap; }
.op-btn {
  height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #e4e7ec;
  background: #fff; color: #344054; font-size: 12px; font-weight: 600; cursor: pointer;
}
.op-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.op-btn.plus { color: #067647; border-color: #abefc6; background: #ecfdf3; }
.op-btn.plus:hover:not(:disabled) { background: #d1fadf; }
.op-btn.minus { color: #b42318; border-color: #fecdca; background: #fef3f2; }
.op-btn.minus:hover:not(:disabled) { background: #fee4e2; }
.private-entries { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px dashed #e4e7ec; }
.entry-row { padding: 8px 10px; border-radius: 8px; background: #fff; border: 1px solid #eef2f6; }
.entry-row.adjust_plus { border-color: #abefc6; background: #f6fef9; }
.entry-row.adjust_minus { border-color: #fecdca; background: #fff8f7; }
.entry-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.entry-kind {
  display: inline-flex; padding: 1px 8px; border-radius: 999px;
  background: #f2f4f7; color: #475467; font-size: 11px; font-style: normal; font-weight: 700;
}
.entry-kind.adjust_plus { background: #dcfae6; color: #067647; }
.entry-kind.adjust_minus { background: #fee4e2; color: #b42318; }
.entry-amt { font-weight: 700; font-variant-numeric: tabular-nums; }
.entry-amt.in { color: #067647; }
.entry-amt.out { color: #b42318; }
.entry-note { display: block; margin-top: 4px; color: #344054; font-size: 12px; line-height: 1.45; }
.entry-row small { display: block; margin-top: 2px; color: #98a2b3; font-size: 12px; line-height: 1.4; }
.adjust-drawer header.plus { border-bottom-color: #abefc6; }
.adjust-drawer header.minus { border-bottom-color: #fecdca; }
.adjust-drawer header.plus h3 { color: #067647; }
.adjust-drawer header.minus h3 { color: #b42318; }
.adjust-facts { margin-bottom: 4px; }
.dir-switch {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 4px;
}
.dir-switch button {
  height: 36px; border-radius: 10px; border: 1px solid #e4e7ec; background: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer; color: #667085;
}
.dir-switch button:disabled { opacity: 0.4; cursor: not-allowed; }
.dir-switch button.plus.on { color: #067647; border-color: #abefc6; background: #ecfdf3; }
.dir-switch button.minus.on { color: #b42318; border-color: #fecdca; background: #fef3f2; }
.adjust-form textarea {
  width: 100%; min-height: 84px; resize: vertical; padding: 10px 12px;
  border: 1px solid #e4e7ec; border-radius: 10px; font: inherit; color: #101828;
}
.adjust-form textarea:focus { outline: none; border-color: #84b0f5; box-shadow: 0 0 0 3px rgba(46, 144, 250, 0.15); }
.btn.danger {
  background: #d92d20; color: #fff; border: 0;
}
.btn.danger:hover:not(:disabled) { background: #b42318; }
.owner-caps { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.owner-cap { background: #f4f7fb; border-radius: 999px; padding: 4px 10px; color: #344054; font-size: 13px; }
.owner-cap strong { margin-right: 4px; }
.pending-repays { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.pending-row { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 8px 10px; background: #fffbeb; border: 1px solid #fcd9a1; border-radius: 8px; font-size: 13px; }
.advance-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.advance-row { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid #e4e7ec; border-radius: 10px; background: #f8fafc; }
.advance-row.closed { opacity: .7; }
.advance-row strong { display: block; }
.advance-row small { display: block; margin-top: 4px; color: #667085; font-size: 12px; line-height: 1.45; }
.advance-row .use-line { color: #175cd3; }
.empty-line { margin-top: 10px; color: #667085; font-size: 13px; }
.bank-table { width: 100%; border-collapse: collapse; }
.bank-table th, .bank-table td { padding: 10px 8px; border-bottom: 1px solid #eef2f6; text-align: left; vertical-align: top; }
.bank-table th { color: #667085; font-weight: 600; font-size: 13px; }
.bank-table .num { text-align: right; white-space: nowrap; }
.bank-table .num.warn { color: #b54708; }
.bank-table tr.done td:not(:first-child) { color: #667085; }
.bank-table tr.open { background: #f5f8ff; }
.num.balance { font-weight: 650; }
.who + small { display: block; color: #98a2b3; }
.flow { display: flex; align-items: flex-start; gap: 10px; }
.flow-mark {
  width: 32px; height: 32px; border-radius: 10px; flex: none;
  display: grid; place-items: center;
}
.flow-mark svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.flow-mark.in { background: #e7f6ee; color: #067647; }
.flow-mark.out { background: #fff1e8; color: #c2410c; }
.flow-main { display: flex; flex-direction: column; min-width: 0; }
.flow-main strong { font-size: 16px; font-weight: 720; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.2; }
.flow-main strong.in { color: #067647; }
.flow-main strong.out { color: #c2410c; }
.flow-main small { margin-top: 3px; color: #98a2b3; font-size: 12px; line-height: 1.3; }
.kpi .label .flow-mark { width: 22px; height: 22px; border-radius: 7px; }
.kpi .value.in { color: #067647; }
.kpi .value.out { color: #c2410c; }
.drawer-facts strong.in { color: #067647; }
.drawer-facts strong.out { color: #c2410c; }
.remark { border: 0; background: #eef4ff; color: #175cd3; border-radius: 999px; padding: 2px 8px; cursor: pointer; }
.remark.muted { background: #f2f4f7; color: #667085; }
.ops { white-space: nowrap; }
.detail td { background: #f8fafc; }
.allocs { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.alloc { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.alloc .lock { color: #067647; font-style: normal; }
.alloc.unlocked { opacity: 0.72; }
.alloc.unlocked .lock { color: #98a2b3; }
.audit-logs {
  margin-top: 18px; padding-top: 14px; border-top: 1px solid #eef2f6;
  display: flex; flex-direction: column; gap: 10px;
}
.audit-logs > strong { font-size: 13px; color: #344054; }
.audit-row { font-size: 13px; color: #344054; line-height: 1.45; }
.audit-row b { font-weight: 650; }
.audit-row small { display: block; margin-top: 2px; color: #98a2b3; font-size: 12px; }
.alloc-form { display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
.alloc-form input { height: 34px; border: 1px solid #d0d5dd; border-radius: 8px; padding: 0 10px; }
.amt span { color: #667085; font-size: 13px; }
.drawer-actions { display: flex; align-items: center; gap: 12px; }
.bank-drawer-mask { position: fixed; inset: 0; z-index: 60; background: rgba(15, 23, 42, 0.28); }
.bank-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100%);
  background: #fff; box-shadow: -12px 0 40px rgba(16, 24, 40, 0.12);
  display: flex; flex-direction: column;
}
.bank-drawer header { display: flex; justify-content: space-between; gap: 12px; padding: 18px 18px 14px; border-bottom: 1px solid #eef2f6; }
.bank-drawer h3 { margin: 0; font-size: 18px; }
.bank-drawer header p { margin: 4px 0 0; color: #667085; font-size: 13px; }
.bank-drawer-body { padding: 16px 18px 28px; overflow: auto; }
.drawer-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.drawer-facts div { background: #f8fafc; border-radius: 10px; padding: 10px; }
.drawer-facts small, .drawer-facts em { display: block; color: #98a2b3; font-style: normal; font-size: 12px; }
.drawer-facts strong { display: block; margin: 4px 0; font-size: 15px; }
.drawer-facts .warn { color: #b54708; }
.amt { display: flex; flex-direction: column; }
.amt em { font-style: normal; color: #98a2b3; font-size: 12px; }
.hint { color: #667085; margin: 0 0 8px; }
.link { border: 0; background: transparent; color: #175cd3; cursor: pointer; padding: 0; }
.link.danger { color: #b42318; }
.empty { padding: 28px 8px; color: #667085; }
.type-switch { display: flex; gap: 4px; }
.type-switch button { height: 34px; border: 0; border-radius: 8px; background: #fff; padding: 0 10px; color: #667085; }
.type-switch button.on { background: var(--primary-soft); color: var(--primary); }
.bank-drop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(23, 92, 211, 0.16);
  pointer-events: none;
}
.bank-drop-card {
  min-width: 280px;
  padding: 28px 32px;
  border: 2px dashed #175cd3;
  border-radius: 16px;
  background: #fff;
  text-align: center;
  box-shadow: 0 12px 40px rgba(16, 24, 40, 0.12);
}
.bank-drop-card strong { display: block; font-size: 18px; color: #175cd3; }
.bank-drop-card span { display: block; margin-top: 8px; color: #667085; }
</style>
