import { reactive } from 'vue';

let seq = 0;

const state = reactive({
  toasts: [],
  dialog: null,
});

function dismissToast(id) {
  const row = state.toasts.find((item) => item.id === id);
  if (!row || row.leaving) return;
  row.leaving = true;
  if (row._timer) clearTimeout(row._timer);
  setTimeout(() => {
    state.toasts = state.toasts.filter((item) => item.id !== id);
  }, 280);
}

function pushToast(type, message, options = {}) {
  const text = String(message || '').trim();
  if (!text) return null;
  const id = ++seq;
  const duration = options.duration ?? (type === 'error' ? 4200 : 2800);
  const item = {
    id,
    type,
    message: text,
    title: options.title || '',
    leaving: false,
    _timer: null,
  };
  state.toasts = [...state.toasts.slice(-4), item];
  if (duration > 0) {
    item._timer = setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export const notify = {
  state,
  toast(message, options) {
    return pushToast('info', message, options);
  },
  success(message, options) {
    return pushToast('success', message, options);
  },
  error(message, options) {
    return pushToast('error', message, options);
  },
  warn(message, options) {
    return pushToast('warn', message, options);
  },
  info(message, options) {
    return pushToast('info', message, options);
  },
  dismiss(id) {
    dismissToast(id);
  },
  clear() {
    state.toasts.forEach((item) => dismissToast(item.id));
  },
  /** Promise 确认框：resolve(true/false) */
  confirm(options = {}) {
    if (state.dialog?.resolve) state.dialog.resolve(false);
    return new Promise((resolve) => {
      state.dialog = {
        mode: 'confirm',
        title: options.title || '请确认',
        message: options.message || '',
        okText: options.okText || '确定',
        cancelText: options.cancelText || '取消',
        danger: !!options.danger,
        equalActions: !!options.equalActions,
        icon: options.icon || (options.danger ? 'trash' : 'help'),
        resolve: (ok) => {
          state.dialog = null;
          resolve(!!ok);
        },
      };
    });
  },
  /**
   * 多选一：resolve(actionId)；取消 / 点遮罩 resolve(null)
   * actions: [{ id, text, disabled?, primary?, danger? }]
   * equal: true 时各按钮同色同款（默认 true）
   */
  choose(options = {}) {
    if (state.dialog?.resolve) {
      if (state.dialog.mode === 'prompt') state.dialog.resolve(null);
      else if (state.dialog.mode === 'choose') state.dialog.resolve(null);
      else state.dialog.resolve(false);
    }
    const actions = (Array.isArray(options.actions) ? options.actions : [])
      .map((a) => ({
        id: String(a?.id ?? ''),
        text: String(a?.text || a?.id || '').trim(),
        disabled: !!a?.disabled,
        primary: !!a?.primary,
        danger: !!a?.danger,
      }))
      .filter((a) => a.id && a.text);
    return new Promise((resolve) => {
      state.dialog = {
        mode: 'choose',
        title: options.title || '请选择',
        message: options.message || '',
        actions,
        equal: options.equal !== false,
        cancelText: options.cancelText === false ? '' : (options.cancelText || '取消'),
        icon: options.icon || 'help',
        resolve: (id) => {
          state.dialog = null;
          resolve(id == null ? null : String(id));
        },
      };
    });
  },
  /** Promise 输入框：确定返回字符串，取消返回 null */
  prompt(options = {}) {
    if (state.dialog?.resolve) {
      if (state.dialog.mode === 'prompt') state.dialog.resolve(null);
      else state.dialog.resolve(false);
    }
    return new Promise((resolve) => {
      state.dialog = {
        mode: 'prompt',
        title: options.title || '请输入',
        message: options.message || '',
        value: String(options.value ?? ''),
        placeholder: options.placeholder || '',
        okText: options.okText || '确定',
        cancelText: options.cancelText || '取消',
        danger: !!options.danger,
        required: options.required !== false,
        icon: options.icon || 'pencil',
        resolve: (ok, value) => {
          state.dialog = null;
          resolve(ok ? String(value ?? '') : null);
        },
      };
    });
  },
};

export default notify;
