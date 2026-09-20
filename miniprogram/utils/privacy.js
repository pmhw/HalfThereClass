let told = false;

function messageOf(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return err.errMsg || err.message || '';
}

function undeclared(err) {
  const msg = messageOf(err);
  const code = err && err.errno;
  return code === 112 || /privacy agreement|privacy api banned|not declared/i.test(msg);
}

function denied(err) {
  return /auth deny|authorize:fail/i.test(messageOf(err));
}

function cancelled(err) {
  return /cancel/i.test(messageOf(err));
}

function explainUndeclared() {
  if (told) return;
  told = true;
  wx.showModal({
    title: '隐私保护指引未声明',
    content: '微信返回的是接口未声明，点同意也不会生效。请到公众平台：设置 → 服务内容声明 → 用户隐私保护指引，勾选「收集你的昵称、头像」「访问你的摄像头」「收集你选中的照片或视频信息」「收集你选中的文件」。保存后约 5 分钟生效，再在开发者工具里清除授权数据。',
    showCancel: false,
  });
}

module.exports = {
  undeclared,
  denied,
  cancelled,
  explainUndeclared,
};
