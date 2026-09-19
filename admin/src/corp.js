const LABELS = [
  ['corpName', /(公司名称|单位名称|账户名称|开户名称|户名|名称)\s*[:：]\s*([^\n]+)/],
  ['taxNo', /(纳税人识别号|统一社会信用代码|社会信用代码|信用代码|税号)\s*[:：]\s*([0-9A-Za-z]+)/],
  ['bankAccount', /(银行账号|对公账号|账号)\s*[:：]\s*([0-9\s\-]+)/],
  ['bankName', /(开户银行|开户行)\s*[:：]\s*([^\n]+)/],
  ['corpAddress', /(注册地址|单位地址|经营地址|地址)\s*[:：]\s*([^\n]+)/],
  ['corpPhone', /(联系电话|电话|手机)\s*[:：]\s*([0-9\-+\s]+)/],
];

function clean(value) {
  return String(value || '').trim();
}

function takePhone(text) {
  const match = String(text || '').match(/(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})/);
  return match ? match[1] : '';
}

function takeAccount(text) {
  const match = String(text || '').replace(/\s/g, '').match(/(\d{8,30})/);
  return match ? match[1] : '';
}

export function parseCorp(text) {
  const raw = String(text || '').replace(/\r/g, '').trim();
  const result = {
    corpName: '',
    taxNo: '',
    bankName: '',
    bankAccount: '',
    corpAddress: '',
    corpPhone: '',
    corpRaw: raw,
  };
  if (!raw) return result;

  const bankCombo = raw.match(/(开户行及账号|开户银行及账号)\s*[:：]\s*([^\n]+)/);
  const addressCombo = raw.match(/(地址、电话|地址电话|地址及电话)\s*[:：]\s*([^\n]+)/);
  for (const [key, pattern] of LABELS) {
    const match = raw.match(pattern);
    if (match) result[key] = clean(match[2]);
  }
  if (bankCombo) {
    result.bankAccount = takeAccount(bankCombo[2]);
    result.bankName = clean(bankCombo[2].replace(result.bankAccount, '').replace(/\s+/g, ' '));
  }
  if (addressCombo) {
    result.corpPhone = takePhone(addressCombo[2]);
    result.corpAddress = clean(addressCombo[2].replace(result.corpPhone, ''));
  }
  result.bankAccount = result.bankAccount.replace(/[\s\-]/g, '');
  result.corpPhone = result.corpPhone.replace(/\s/g, '');
  result.taxNo = result.taxNo.toUpperCase();

  const lines = raw.split('\n').map((line) => line.trim()).filter((line) => line && !/[:：]/.test(line));
  for (const line of lines) {
    const compact = line.replace(/\s/g, '');
    if (!result.taxNo && /^[0-9A-Z]{15,20}$/i.test(compact)) {
      result.taxNo = compact.toUpperCase();
      continue;
    }
    if (!result.bankAccount && /^\d{8,30}$/.test(compact)) {
      result.bankAccount = compact;
      continue;
    }
    if (!result.corpPhone && /^(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/.test(compact)) {
      result.corpPhone = compact;
      continue;
    }
    if (!result.bankName && /银行|信用社|支行|分行/.test(line)) {
      result.bankName = line;
      continue;
    }
    if (!result.corpAddress && /省|市|区|县|路|街|道|号|园|室/.test(line)) {
      result.corpAddress = line;
      continue;
    }
    if (!result.corpName && /公司|中心|学校|学院|机构|集团|工作室/.test(line)) {
      result.corpName = line;
    }
  }
  return result;
}

export function corpFilled(item) {
  return ['corpName', 'taxNo', 'bankName', 'bankAccount'].filter((key) => item?.[key]).length;
}
