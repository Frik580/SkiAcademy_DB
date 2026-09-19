type ReadNormalizationResult<T> =
  | { success: true; data: T }
  | { success: false; reason: string };

const OPTIONAL_NULLABLE_KEYS = [
  'phoneNumber',
  'systemRole',
  'avatarUrl',
  'instructorId',
  'isInstructor',
  'isClientActive',
  'level',
  'skillScores',
  'skillComments',
  'hideProgressTracking',
  'todaySkillItemIds',
  'completedTodayTaskIds',
  'completedTodayDate',
  'customTodayTasks',
  'dismissedTodayTaskIds',
  'dismissedReviewIds',
] as const;

/**
 * Leftover `/users/{uid}` money fields. Not UserProfile-owned and not spendable
 * authority. Canonical wallet is `/users/{accountId}/wallet/state`.
 *
 * Zod 4 `z.record(WalletCurrencySchema, z.number())` also requires both `USD`
 * and `KZT` keys, so historical partial maps (`{ KZT }`, `{ USD }`, `{}`) and
 * null nested values fail login even though they are not wallet authority.
 */
const LEFTOVER_NON_AUTHORITATIVE_MONEY_KEYS = [
  'balanceUSD',
  'walletBalances',
  'pendingWalletCredit',
  'lastRefundBookingId',
] as const;

export function describeReceivedType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  const valueType = typeof value;
  if (valueType !== 'object') return valueType;
  if (isTimestampLike(value)) return 'timestamp';
  return 'object';
}

function isTimestampLike(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { seconds?: unknown; nanoseconds?: unknown; toDate?: unknown };
  return (
    typeof candidate.seconds === 'number' &&
    typeof candidate.nanoseconds === 'number' &&
    (typeof candidate.toDate === 'function' || candidate.toDate === undefined)
  );
}

function identityConflict(field: 'uid' | 'accountId'): ReadNormalizationResult<never> {
  return {
    success: false,
    reason: `${field}: identity conflict with document id`,
  };
}

function invalidAuthority(
  field: 'role' | 'systemRole' | 'instructorId' | 'isInstructor' | 'uid' | 'accountId',
  expected: string,
  received: unknown
): ReadNormalizationResult<never> {
  return {
    success: false,
    reason: `${field}: expected ${expected}, received ${describeReceivedType(received)}`,
  };
}

/**
 * In-memory read normalization for dual-purpose `/users/{accountId}` documents.
 * Does not write back to Firestore and does not invent privileged authority.
 */
export function normalizeUserProfileRead(
  fields: unknown,
  documentId: string
): ReadNormalizationResult<Record<string, unknown>> {
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    return {
      success: false,
      reason: `document: expected object, received ${describeReceivedType(fields)}`,
    };
  }

  const source = fields as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...source };

  const rawUid = source.uid;
  if (rawUid !== undefined && rawUid !== null) {
    if (typeof rawUid !== 'string' || rawUid !== documentId) {
      return typeof rawUid === 'string' && rawUid !== documentId
        ? identityConflict('uid')
        : invalidAuthority('uid', 'string matching document id', rawUid);
    }
  }
  normalized.uid = documentId;

  if (source.accountId !== undefined && source.accountId !== null) {
    if (typeof source.accountId !== 'string') {
      return invalidAuthority('accountId', 'string matching document id', source.accountId);
    }
    if (source.accountId !== documentId) {
      return identityConflict('accountId');
    }
  }

  const rawDisplayName = source.displayName;
  if (typeof rawDisplayName !== 'string') {
    if (rawDisplayName !== undefined && rawDisplayName !== null) {
      return {
        success: false,
        reason: `displayName: expected string, received ${describeReceivedType(rawDisplayName)}`,
      };
    }
    if (typeof source.name === 'string') {
      normalized.displayName = source.name;
    }
  }

  const rawRole = source.role;
  if (rawRole === undefined || rawRole === null || rawRole === '') {
    // Same ordinary-user default as admin identity projection: only `admin` is privileged.
    normalized.role = 'user';
  } else if (rawRole === 'user' || rawRole === 'admin') {
    normalized.role = rawRole;
  } else {
    return invalidAuthority('role', "'user' | 'admin'", rawRole);
  }

  const rawSystemRole = source.systemRole;
  if (rawSystemRole === undefined || rawSystemRole === null || rawSystemRole === '') {
    delete normalized.systemRole;
  } else if (rawSystemRole !== 'owner') {
    return invalidAuthority('systemRole', "'owner'", rawSystemRole);
  }

  const rawInstructorId = source.instructorId;
  if (rawInstructorId === undefined || rawInstructorId === null) {
    delete normalized.instructorId;
  } else if (typeof rawInstructorId !== 'string') {
    return invalidAuthority('instructorId', 'string', rawInstructorId);
  }

  const rawIsInstructor = source.isInstructor;
  if (rawIsInstructor === undefined || rawIsInstructor === null) {
    delete normalized.isInstructor;
  } else if (typeof rawIsInstructor !== 'boolean') {
    return invalidAuthority('isInstructor', 'boolean', rawIsInstructor);
  }

  if (typeof source.avatarUrl !== 'string') {
    normalized.avatarUrl = '';
  }

  for (const key of OPTIONAL_NULLABLE_KEYS) {
    if (normalized[key] === null) {
      delete normalized[key];
    }
  }

  for (const key of LEFTOVER_NON_AUTHORITATIVE_MONEY_KEYS) {
    delete normalized[key];
  }

  return { success: true, data: normalized };
}
