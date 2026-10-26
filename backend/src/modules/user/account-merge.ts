import { BadRequestException } from '@nestjs/common';
import { Prisma, TeacherCert } from '@prisma/client';

type Tx = Prisma.TransactionClient;

const CERT_RANK: Record<string, number> = {
  approved: 4,
  pending: 3,
  frozen: 2,
  rejected: 1,
};

const ROLE_RANK: Record<string, number> = {
  admin: 3,
  teacher: 2,
  user: 1,
};

const CONTRACT_FIELDS = [
  'contractStatus',
  'contractSemesterId',
  'contractSignedAt',
  'contractSign',
  'contractFlowStatus',
  'contractDraftStep',
  'contractDraftJson',
  'contractDraftAt',
] as const;

const CLEARANCE_FIELDS = ['clearance', 'clearanceStatus', 'clearanceSemesterId'] as const;

/** H5 短信注册的账号 openid 为 phone:手机号，其余为微信 openid */
export function isPhoneOpenid(openid?: string | null) {
  return String(openid || '').startsWith('phone:');
}

/** 合并前的检查：两边都绑了微信、手机号或 unionid 不同则不能合并 */
export function assertMergeable(
  keeper: { openid: string; phone: string | null; unionid: string | null },
  donor: { openid: string; phone: string | null; unionid: string | null },
) {
  if (!isPhoneOpenid(keeper.openid) && !isPhoneOpenid(donor.openid)) {
    throw new BadRequestException('两个账号都绑定了微信，合并后其中一个微信将无法登录，不能合并');
  }
  if (keeper.phone && donor.phone && keeper.phone !== donor.phone) {
    throw new BadRequestException(`两个账号的手机号不同（${keeper.phone} / ${donor.phone}），不能合并`);
  }
  if (keeper.unionid && donor.unionid && keeper.unionid !== donor.unionid) {
    throw new BadRequestException('两个账号的微信 unionid 不同，不能合并');
  }
}

/**
 * 把 donor 的全部数据并入 keeper 后删除 donor。
 * donor 的微信 / 手机号登录方式转到 keeper，合并后两种方式都登录到 keeper。
 */
export async function mergeUserInto(tx: Tx, keeperId: number, donorId: number) {
  if (keeperId === donorId) throw new BadRequestException('不能和自己合并');
  const [keeper, donor] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: keeperId } }),
    tx.user.findUniqueOrThrow({ where: { id: donorId } }),
  ]);
  assertMergeable(keeper, donor);

  // openid / phone / unionid 唯一，先从 donor 上摘下来
  await tx.user.update({
    where: { id: donorId },
    data: { openid: `merged:${donorId}:${Date.now()}`, phone: null, unionid: null },
  });
  await mergeTeacherCert(tx, keeperId, donorId);
  await reassignUserRows(tx, keeperId, donorId);

  const role = (ROLE_RANK[keeper.role] || 0) >= (ROLE_RANK[donor.role] || 0) ? keeper.role : donor.role;
  const lastLoginAt = [keeper.lastLoginAt, donor.lastLoginAt]
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
  await tx.user.update({
    where: { id: keeperId },
    data: {
      openid: isPhoneOpenid(keeper.openid) && !isPhoneOpenid(donor.openid) ? donor.openid : keeper.openid,
      unionid: keeper.unionid || donor.unionid,
      phone: keeper.phone || donor.phone,
      role,
      organizationId: keeper.organizationId ?? donor.organizationId,
      parentId: keeper.parentId ?? donor.parentId,
      nickname: keeper.nickname || donor.nickname,
      avatar: keeper.avatar || donor.avatar,
      gender: keeper.gender || donor.gender,
      lastLoginAt,
    },
  });
  await tx.user.updateMany({ where: { parentId: donorId }, data: { parentId: keeperId } });
  await tx.user.updateMany({ where: { id: keeperId, parentId: keeperId }, data: { parentId: null } });
  await tx.user.delete({ where: { id: donorId } });
  return tx.user.findUniqueOrThrow({ where: { id: keeperId } });
}

async function mergeTeacherCert(tx: Tx, keeperId: number, donorId: number) {
  const [keeperCert, donorCert] = await Promise.all([
    tx.teacherCert.findUnique({ where: { userId: keeperId } }),
    tx.teacherCert.findUnique({ where: { userId: donorId } }),
  ]);
  if (!donorCert) return;
  if (!keeperCert) {
    await tx.teacherCert.update({ where: { userId: donorId }, data: { userId: keeperId } });
    return;
  }

  const rank = (cert: TeacherCert) => CERT_RANK[cert.status] || 0;
  const preferDonor = rank(donorCert) > rank(keeperCert)
    || (
      rank(donorCert) === rank(keeperCert)
      && donorCert.contractStatus === 'signed'
      && keeperCert.contractStatus !== 'signed'
    );
  const preferred = preferDonor ? donorCert : keeperCert;
  const other = preferDonor ? keeperCert : donorCert;

  const { id: _id, userId: _userId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = preferred;
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const fallback = (other as Record<string, unknown>)[key];
    data[key] = (value === null || value === '') && fallback !== null && fallback !== '' ? fallback : value;
  }
  // 合同、无犯罪证明按整组取，避免混搭出不一致的状态
  if (preferred.contractStatus !== 'signed' && other.contractStatus === 'signed') {
    for (const key of CONTRACT_FIELDS) data[key] = other[key];
  }
  if (preferred.clearanceStatus === 'none' && other.clearanceStatus !== 'none') {
    for (const key of CLEARANCE_FIELDS) data[key] = other[key];
  }

  await tx.idOcrAudit.updateMany({ where: { userId: other.userId }, data: { userId: preferred.userId } });
  await tx.teacherCert.delete({ where: { id: other.id } });
  await tx.teacherCert.update({ where: { id: preferred.id }, data: { ...data, userId: keeperId } });
}

async function reassignUserRows(tx: Tx, keeperId: number, donorId: number) {
  await tx.course.updateMany({ where: { teacherId: donorId }, data: { teacherId: keeperId } });
  await tx.courseTermTeacher.updateMany({ where: { teacherId: donorId }, data: { teacherId: keeperId } });
  await tx.profitRecord.updateMany({ where: { teacherId: donorId }, data: { teacherId: keeperId } });
  await tx.teacherContract.updateMany({ where: { userId: donorId }, data: { userId: keeperId } });
  await tx.reimbursement.updateMany({ where: { userId: donorId }, data: { userId: keeperId } });
  await tx.order.updateMany({ where: { userId: donorId }, data: { userId: keeperId } });
  await tx.comment.updateMany({ where: { userId: donorId }, data: { userId: keeperId } });

  const grants = await tx.teacherCourseGrant.findMany({ where: { userId: donorId } });
  for (const row of grants) {
    const exists = await tx.teacherCourseGrant.findUnique({
      where: { userId_courseId: { userId: keeperId, courseId: row.courseId } },
    });
    if (exists) await tx.teacherCourseGrant.delete({ where: { id: row.id } });
    else await tx.teacherCourseGrant.update({ where: { id: row.id }, data: { userId: keeperId } });
  }

  const incomes = await tx.sessionIncome.findMany({ where: { userId: donorId } });
  for (const row of incomes) {
    const exists = await tx.sessionIncome.findUnique({
      where: { userId_courseId_date: { userId: keeperId, courseId: row.courseId, date: row.date } },
    });
    if (exists) await tx.sessionIncome.delete({ where: { id: row.id } });
    else await tx.sessionIncome.update({ where: { id: row.id }, data: { userId: keeperId } });
  }

  const checkIns = await tx.checkIn.findMany({ where: { userId: donorId } });
  for (const row of checkIns) {
    const exists = await tx.checkIn.findUnique({
      where: { userId_courseId_date: { userId: keeperId, courseId: row.courseId, date: row.date } },
    });
    if (exists) await tx.checkIn.delete({ where: { id: row.id } });
    else await tx.checkIn.update({ where: { id: row.id }, data: { userId: keeperId } });
  }

  const userCourses = await tx.userCourse.findMany({ where: { userId: donorId } });
  for (const row of userCourses) {
    const exists = await tx.userCourse.findUnique({
      where: { userId_courseId: { userId: keeperId, courseId: row.courseId } },
    });
    if (exists) await tx.userCourse.delete({ where: { id: row.id } });
    else await tx.userCourse.update({ where: { id: row.id }, data: { userId: keeperId } });
  }

  const progresses = await tx.lessonProgress.findMany({ where: { userId: donorId } });
  for (const row of progresses) {
    const exists = await tx.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: keeperId, lessonId: row.lessonId } },
    });
    if (exists) await tx.lessonProgress.delete({ where: { id: row.id } });
    else await tx.lessonProgress.update({ where: { id: row.id }, data: { userId: keeperId } });
  }

  await reassignPayouts(tx, keeperId, donorId);
  await reassignSplitMembers(tx, keeperId, donorId);
}

/** 财务打款记录：t:教师 / u:分成人员 的 key 跟着换成 keeper */
async function reassignPayouts(tx: Tx, keeperId: number, donorId: number) {
  const keyMap: Record<string, string> = {
    [`t:${donorId}`]: `t:${keeperId}`,
    [`u:${donorId}`]: `u:${keeperId}`,
  };
  const rows = await tx.splitPayout.findMany({
    where: { OR: [{ userId: donorId }, { payeeKey: { in: Object.keys(keyMap) } }] },
  });
  for (const row of rows) {
    const payeeKey = keyMap[row.payeeKey] || row.payeeKey;
    if (payeeKey !== row.payeeKey) {
      const clash = await tx.splitPayout.findUnique({ where: { month_payeeKey: { month: row.month, payeeKey } } });
      if (clash) {
        if (clash.status === 'paid' && row.status === 'paid') {
          throw new BadRequestException(`${row.month} 两个账号都有已打款记录，无法自动合并`);
        }
        if (row.status !== 'paid') {
          await tx.splitPayout.delete({ where: { id: row.id } });
          continue;
        }
        await tx.splitPayout.delete({ where: { id: clash.id } });
      }
    }
    await tx.splitPayout.update({
      where: { id: row.id },
      data: { payeeKey, userId: row.userId === donorId ? keeperId : row.userId },
    });
  }
}

/** 分成合集成员：donor 换成 keeper；同一合集里两人都在则比例相加 */
async function reassignSplitMembers(tx: Tx, keeperId: number, donorId: number) {
  const collections = await tx.splitCollection.findMany({ where: { members: { contains: `"userId":${donorId}` } } });
  for (const collection of collections) {
    let members: any[];
    try {
      members = JSON.parse(collection.members || '[]');
    } catch {
      continue;
    }
    if (!Array.isArray(members) || !members.some((m) => Number(m?.userId) === donorId)) continue;
    const merged: any[] = [];
    for (const member of members) {
      const userId = Number(member?.userId) === donorId ? keeperId : (member?.userId ?? null);
      const same = userId ? merged.find((m) => Number(m.userId) === Number(userId)) : null;
      if (same) same.ratio = Math.round(((Number(same.ratio) || 0) + (Number(member?.ratio) || 0)) * 100) / 100;
      else merged.push({ ...member, userId });
    }
    await tx.splitCollection.update({ where: { id: collection.id }, data: { members: JSON.stringify(merged) } });
  }
}
