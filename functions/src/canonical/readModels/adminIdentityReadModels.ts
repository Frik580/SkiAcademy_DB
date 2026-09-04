import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import {
  ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_DEFAULT,
  AccountIdSchema,
  AggregateRevisionSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  QueryAdminIdentityReadModelsResultSchema,
  decodeAdminIdentityListCursor,
  diagnoseAccountIdentity,
  diagnoseParticipantIdentity,
  encodeAdminIdentityListCursor,
  parseInstructorCatalogRevision,
  type AccountId,
  type AdminAccountDetailReadModel,
  type AdminAccountListItem,
  type AdminEligibleParticipantItem,
  type AdminIdentityAuthorizedAction,
  type AdminInstructorDetailReadModel,
  type AdminInstructorListItem,
  type AdminParticipantDetailReadModel,
  type AdminParticipantListItem,
  type IdentityDiagnostic,
  type InstructorId,
  type Participant,
  type ParticipantId,
  type ParticipantManagement,
  type QueryAdminIdentityReadModelsInput,
  type QueryAdminIdentityReadModelsResult,
  type ReadModelAdministratorActor,
} from '@ski-academy/shared-domain';
import {
  parseAccount,
  parseActiveOwnerGuard,
  parseParticipant,
  parseParticipantBlock,
  parseParticipantManagement,
} from '../participantAccess/participantAccessStore';
import { parseInstructorCatalog } from '../bookings/bookingStore';

export class InvalidAdminIdentityReadCursorError extends Error {
  constructor() {
    super('The Admin identity cursor is invalid for this query.');
    this.name = 'InvalidAdminIdentityReadCursorError';
  }
}

const PREFIX_END = '\uf8ff';
const COUNT_SCAN_LIMIT = 51;

type ActorAuthority = {
  readonly accountId: AccountId;
  readonly systemRole?: 'owner';
};

function pageSizeOf(value: number | undefined): number {
  return value ?? ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_DEFAULT;
}

function readString(data: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function emailOf(data: Record<string, unknown> | undefined): string | undefined {
  const email = readString(data, 'email');
  if (!email || !email.includes('@') || email.length > 320) return undefined;
  return email.toLowerCase();
}

function displayNameOf(data: Record<string, unknown> | undefined, fallback: string): string {
  return readString(data, 'displayName') ?? readString(data, 'name') ?? fallback;
}

function roleProjection(data: Record<string, unknown> | undefined): AdminAccountListItem['role'] {
  return {
    role: data?.role === 'admin' ? 'admin' : 'user',
    ...(data?.systemRole === 'owner' ? { systemRole: 'owner' as const } : {}),
  };
}

function instructorLinkOf(
  data: Record<string, unknown> | undefined
): AdminAccountListItem['instructorLink'] {
  const instructorId = InstructorIdSchema.safeParse(data?.instructorId);
  return {
    isInstructor: data?.isInstructor === true || instructorId.success,
    ...(instructorId.success ? { instructorId: instructorId.data } : {}),
  };
}

function decodeCursor(cursor: string | undefined): {
  readonly documentId: string;
  readonly sortKey?: string;
} | undefined {
  if (!cursor) return undefined;
  try {
    return decodeAdminIdentityListCursor(cursor);
  } catch {
    throw new InvalidAdminIdentityReadCursorError();
  }
}

async function loadActorAuthority(
  firestore: Firestore,
  actor: ReadModelAdministratorActor
): Promise<ActorAuthority> {
  const snapshot = await firestore.collection('users').doc(actor.accountId).get();
  const data = snapshot.data() as Record<string, unknown> | undefined;
  return {
    accountId: actor.accountId,
    ...(data?.systemRole === 'owner' ? { systemRole: 'owner' as const } : {}),
  };
}

async function queryActiveManagementForAccount(
  firestore: Firestore,
  accountId: AccountId
): Promise<ParticipantManagement[]> {
  const snapshot = await firestore
    .collection('participant_management')
    .where('accountId', '==', accountId)
    .where('status', '==', 'active')
    .get();
  return snapshot.docs
    .map((doc) => parseParticipantManagement(doc.data() as Record<string, unknown>))
    .filter((value): value is ParticipantManagement => value !== undefined);
}

async function queryActiveManagementForParticipant(
  firestore: Firestore,
  participantId: ParticipantId
): Promise<ParticipantManagement[]> {
  const snapshot = await firestore
    .collection('participant_management')
    .where('participantId', '==', participantId)
    .where('status', '==', 'active')
    .get();
  return snapshot.docs
    .map((doc) => parseParticipantManagement(doc.data() as Record<string, unknown>))
    .filter((value): value is ParticipantManagement => value !== undefined);
}

async function countQuery(query: Query): Promise<number> {
  try {
    const snapshot = await query.limit(COUNT_SCAN_LIMIT).get();
    return snapshot.size;
  } catch {
    return 0;
  }
}

function accountActions(input: {
  readonly actor: ActorAuthority;
  readonly accountId: AccountId;
  readonly lifecycle: AdminAccountListItem['lifecycle'];
  readonly revision?: number;
  readonly targetSystemRole?: 'owner';
  readonly missingSelf: boolean;
  readonly hasInstructorLink?: boolean;
}): AdminIdentityAuthorizedAction[] {
  const actions: AdminIdentityAuthorizedAction[] = [];
  const revision = AggregateRevisionSchema.parse(input.revision ?? 1);
  if (input.lifecycle === 'active' && input.targetSystemRole !== 'owner') {
    actions.push({ kind: 'disable_account', expectedRevision: revision });
  }
  if (input.lifecycle === 'disabled') {
    actions.push({ kind: 'enable_account', expectedRevision: revision });
  }
  if (input.revision !== undefined) {
    actions.push({ kind: 'update_account_contact_as_administrator', expectedRevision: revision });
  }
  if (
    input.actor.systemRole === 'owner' &&
    input.targetSystemRole !== 'owner' &&
    (input.actor.accountId !== input.accountId || input.lifecycle !== 'disabled')
  ) {
    actions.push({ kind: 'change_account_role', expectedRevision: revision });
  }
  if (input.lifecycle !== 'disabled' && input.missingSelf) {
    actions.push({ kind: 'provision_self_participant_for_account', expectedRevision: revision });
  }
  if (input.lifecycle === 'active') {
    actions.push({ kind: 'create_managed_dependent_participant', expectedRevision: revision });
    if (!input.hasInstructorLink) {
      actions.push({ kind: 'link_account_instructor_catalog', expectedRevision: revision });
    }
  }
  return actions.slice(0, 8);
}

function participantActions(input: {
  readonly lifecycle: 'active' | 'archived';
  readonly revision: number;
  readonly classification: AdminParticipantListItem['classification'];
  readonly managementRevision?: number;
  readonly archiveBlockedByCommitments: boolean;
  readonly ownerGuardRepairable: boolean;
}): AdminIdentityAuthorizedAction[] {
  const actions: AdminIdentityAuthorizedAction[] = [];
  const revision = AggregateRevisionSchema.parse(input.revision);
  const managementRevision =
    input.managementRevision === undefined
      ? undefined
      : AggregateRevisionSchema.parse(input.managementRevision);
  if (input.lifecycle === 'active') {
    actions.push({ kind: 'update_participant_profile', expectedRevision: revision });
    if (!input.archiveBlockedByCommitments) {
      actions.push({ kind: 'archive_participant', expectedRevision: revision });
    }
  }
  if (input.lifecycle === 'archived') {
    actions.push({ kind: 'reactivate_participant', expectedRevision: revision });
  }
  if (input.lifecycle === 'active' && input.classification === 'unmanaged_guest') {
    actions.push({
      kind: 'assign_participant_management_as_administrator',
      expectedRevision: revision,
    });
  }
  if (
    input.lifecycle === 'active' &&
    input.classification === 'dependent' &&
    managementRevision !== undefined
  ) {
    actions.push({
      kind: 'revoke_participant_management',
      expectedRevision: managementRevision,
    });
  }
  if (input.ownerGuardRepairable) {
    actions.push({
      kind: 'repair_participant_management_owner_guard',
      expectedRevision: revision,
    });
  }
  return actions.slice(0, 8);
}

function instructorActions(input: {
  readonly revision: number;
  readonly isAvailable: boolean;
  readonly linkedAccountId?: AccountId;
  readonly linkedAccountRevision?: number;
}): AdminIdentityAuthorizedAction[] {
  const revision = AggregateRevisionSchema.parse(input.revision);
  const linkedAccountRevision =
    input.linkedAccountRevision === undefined
      ? undefined
      : AggregateRevisionSchema.parse(input.linkedAccountRevision);
  const actions: AdminIdentityAuthorizedAction[] = [
    { kind: 'update_instructor_catalog_profile', expectedRevision: revision },
  ];
  if (input.isAvailable) {
    actions.push({ kind: 'deactivate_instructor_catalog', expectedRevision: revision });
  } else {
    actions.push({ kind: 'reactivate_instructor_catalog', expectedRevision: revision });
  }
  if (input.linkedAccountId && linkedAccountRevision !== undefined) {
    actions.push({
      kind: 'unlink_account_instructor_catalog',
      expectedRevision: linkedAccountRevision,
    });
  }
  return actions.slice(0, 8);
}

function looksLikePhoneSearch(search: string): boolean {
  const digits = search.replace(/\D/g, '');
  return digits.length >= 6 && (/^\+/.test(search) || /^[\d\s()-]+$/.test(search));
}

async function paginateCollection(
  firestore: Firestore,
  collection: string,
  input: { search?: string; pageSize?: number; cursor?: string },
  searchField: 'displayName' | 'name'
): Promise<{ readonly docs: FirebaseFirestore.QueryDocumentSnapshot[]; readonly hasMore: boolean }> {
  const size = pageSizeOf(input.pageSize);
  const cursor = decodeCursor(input.cursor);
  const search = input.search?.trim();
  let query: Query = firestore.collection(collection);

  if (search) {
    const asId =
      collection === 'users'
        ? AccountIdSchema.safeParse(search)
        : collection === 'participants'
          ? ParticipantIdSchema.safeParse(search)
          : InstructorIdSchema.safeParse(search);
    if (collection === 'users' && search.includes('@')) {
      const snapshot = await firestore
        .collection(collection)
        .where('email', '==', search.toLowerCase())
        .limit(size + 1)
        .get();
      return {
        docs: snapshot.docs.slice(0, size),
        hasMore: snapshot.docs.length > size,
      };
    }
    if (collection === 'users' && looksLikePhoneSearch(search)) {
      const snapshot = await firestore
        .collection(collection)
        .where('phoneNumber', '==', search)
        .limit(size + 1)
        .get();
      return {
        docs: snapshot.docs.slice(0, size),
        hasMore: snapshot.docs.length > size,
      };
    }
    if (asId.success) {
      const snapshot = await firestore.collection(collection).doc(asId.data).get();
      return {
        docs: snapshot.exists
          ? ([snapshot as FirebaseFirestore.QueryDocumentSnapshot] as FirebaseFirestore.QueryDocumentSnapshot[])
          : [],
        hasMore: false,
      };
    }
    query = query
      .where(searchField, '>=', search)
      .where(searchField, '<=', `${search}${PREFIX_END}`)
      .orderBy(searchField)
      .orderBy(FieldPath.documentId());
    if (cursor?.sortKey) {
      query = query.startAfter(cursor.sortKey, cursor.documentId);
    } else if (cursor) {
      query = query.startAfter(cursor.documentId);
    }
  } else {
    query = query.orderBy(FieldPath.documentId());
    if (cursor) {
      query = query.startAfter(cursor.documentId);
    }
  }

  const snapshot = await query.limit(size + 1).get();
  return {
    docs: snapshot.docs.slice(0, size),
    hasMore: snapshot.docs.length > size,
  };
}

async function buildAccountListItem(
  firestore: Firestore,
  actor: ActorAuthority,
  accountId: AccountId,
  data: Record<string, unknown>
): Promise<AdminAccountListItem> {
  const account = parseAccount(data);
  const management = await queryActiveManagementForAccount(firestore, accountId);
  const selfCount = management.filter((item) => item.authority === 'self').length;
  const lifecycle: AdminAccountListItem['lifecycle'] = account
    ? account.lifecycle.status
    : 'uninitialized';
  const diagnostics = diagnoseAccountIdentity({
    profileExists: true,
    ...(account ? { account } : {}),
    activeSelfManagementCount: selfCount,
    activeManagementCount: management.length,
    ownerGuardPresent: false,
    ownerGuardMatchesUniqueSelf: false,
    instructorCatalogExists: true,
    ...(instructorLinkOf(data).instructorId
      ? { linkedInstructorId: instructorLinkOf(data).instructorId }
      : {}),
  });
  return {
    accountId,
    displayName: displayNameOf(data, accountId),
    ...(emailOf(data) ? { email: emailOf(data) } : {}),
    lifecycle,
    role: roleProjection(data),
    managedParticipantCount: management.length,
    instructorLink: instructorLinkOf(data),
    diagnosticCount: diagnostics.length,
    ...(account ? { revision: account.revision, updatedAt: account.updatedAt } : {}),
    authorizedActions: accountActions({
      actor,
      accountId,
      lifecycle,
      ...(account ? { revision: account.revision } : {}),
      ...(roleProjection(data).systemRole === 'owner' ? { targetSystemRole: 'owner' } : {}),
      missingSelf: selfCount === 0,
      hasInstructorLink: Boolean(instructorLinkOf(data).instructorId),
    }),
  };
}

async function buildAccountDetail(
  firestore: Firestore,
  actor: ActorAuthority,
  accountId: AccountId,
  data: Record<string, unknown>
): Promise<AdminAccountDetailReadModel> {
  const listItem = await buildAccountListItem(firestore, actor, accountId, data);
  const management = await queryActiveManagementForAccount(firestore, accountId);
  const selfManagement = management.filter((item) => item.authority === 'self');
  const participants = await Promise.all(
    management.map(async (item) => {
      const snapshot = await firestore.collection('participants').doc(item.participantId).get();
      const participant = parseParticipant(snapshot.data() as Record<string, unknown> | undefined);
      return {
        participantId: item.participantId,
        participantManagementId: item.participantManagementId,
        displayName: participant?.displayName ?? item.participantId,
        authority: item.authority,
        lifecycle: participant?.lifecycle.status === 'archived' ? ('archived' as const) : ('active' as const),
        revision: participant?.revision ?? AggregateRevisionSchema.parse(1),
        ...(participant?.skillLevel ? { skillLevel: participant.skillLevel } : {}),
        ...(participant?.discipline ? { discipline: participant.discipline } : {}),
        ...(participant?.age ? { age: participant.age } : {}),
      };
    })
  );
  const uniqueSelf = selfManagement.length === 1 ? selfManagement[0] : undefined;
  const guardSnapshot = uniqueSelf
    ? await firestore
        .collection('participant_management_active_owner')
        .doc(uniqueSelf.participantId)
        .get()
    : undefined;
  const ownerGuard = parseActiveOwnerGuard(
    guardSnapshot?.exists ? (guardSnapshot.data() as Record<string, unknown>) : undefined
  );
  const linkedInstructorId = listItem.instructorLink.instructorId;
  const catalogExists = linkedInstructorId
    ? (await firestore.collection('instructors').doc(linkedInstructorId).get()).exists
    : true;
  const diagnostics = diagnoseAccountIdentity({
    profileExists: true,
    ...(parseAccount(data) ? { account: parseAccount(data) } : {}),
    activeSelfManagementCount: selfManagement.length,
    activeManagementCount: management.length,
    ownerGuardPresent: ownerGuard !== undefined,
    ownerGuardMatchesUniqueSelf: Boolean(
      uniqueSelf &&
        ownerGuard &&
        ownerGuard.accountId === uniqueSelf.accountId &&
        ownerGuard.participantManagementId === uniqueSelf.participantManagementId
    ),
    instructorCatalogExists: catalogExists,
    ...(linkedInstructorId ? { linkedInstructorId } : {}),
  });
  const ownerGuardRepair = diagnostics.find(
    (item) => item.safeRepairKind === 'repair_participant_management_owner_guard'
  );
  const authorizedActions = [
    ...listItem.authorizedActions.filter(
      (action) => action.kind !== 'repair_participant_management_owner_guard'
    ),
    ...(ownerGuardRepair && uniqueSelf
      ? [
          {
            kind: 'repair_participant_management_owner_guard' as const,
            expectedRevision: AggregateRevisionSchema.parse(uniqueSelf.revision),
          },
        ]
      : []),
  ].slice(0, 8);
  return {
    ...listItem,
    managedParticipants: participants.slice(0, 50),
    diagnostics: diagnostics.slice(0, 32),
    diagnosticCount: diagnostics.length,
    authorizedActions,
    ...(readString(data, 'phoneNumber') ? { phoneNumber: readString(data, 'phoneNumber') } : {}),
  };
}

function classificationOf(
  participant: Participant,
  management: readonly ParticipantManagement[]
): AdminParticipantListItem['classification'] {
  if (participant.management.kind === 'unmanaged_guest') return 'unmanaged_guest';
  const owner = management.find((item) => item.status === 'active');
  return owner?.authority === 'self' ? 'self' : 'dependent';
}

async function countParticipantBlocks(
  firestore: Firestore,
  participantId: ParticipantId
): Promise<number> {
  const snapshot = await firestore
    .collection('participant_blocks')
    .where('participantId', '==', participantId)
    .where('status', '==', 'active')
    .limit(COUNT_SCAN_LIMIT)
    .get();
  return snapshot.docs.filter((doc) => parseParticipantBlock(doc.data() as Record<string, unknown>)).length;
}

async function buildParticipantListItem(
  firestore: Firestore,
  participant: Participant
): Promise<AdminParticipantListItem> {
  const management = await queryActiveManagementForParticipant(firestore, participant.participantId);
  const classification = classificationOf(participant, management);
  const owner = management.find((item) => item.status === 'active');
  const diagnostics = diagnoseParticipantIdentity({
    participantId: participant.participantId,
    managementKind: participant.management.kind,
    activeManagementCount: management.length,
    ownerGuardPresent: false,
    ownerGuardMatchesUniqueOwner: false,
  });
  return {
    participantId: participant.participantId,
    displayName: participant.displayName,
    classification,
    lifecycle: participant.lifecycle.status,
    blockedInstructorCount: await countParticipantBlocks(firestore, participant.participantId),
    managingAccountCount: management.length,
    diagnosticCount: diagnostics.length,
    revision: participant.revision,
    authorizedActions: participantActions({
      lifecycle: participant.lifecycle.status,
      revision: participant.revision,
      classification,
      ...(owner ? { managementRevision: owner.revision } : {}),
      archiveBlockedByCommitments: false,
      ownerGuardRepairable: false,
    }),
    updatedAt: participant.updatedAt,
  };
}

async function buildParticipantDetail(
  firestore: Firestore,
  participant: Participant
): Promise<AdminParticipantDetailReadModel> {
  const management = await queryActiveManagementForParticipant(firestore, participant.participantId);
  const listItem = await buildParticipantListItem(firestore, participant);
  const uniqueOwner = management.length === 1 ? management[0] : undefined;
  const guardSnapshot = await firestore
    .collection('participant_management_active_owner')
    .doc(participant.participantId)
    .get();
  const ownerGuard = parseActiveOwnerGuard(
    guardSnapshot.exists ? (guardSnapshot.data() as Record<string, unknown>) : undefined
  );
  const diagnostics = diagnoseParticipantIdentity({
    participantId: participant.participantId,
    managementKind: participant.management.kind,
    activeManagementCount: management.length,
    ownerGuardPresent: ownerGuard !== undefined,
    ownerGuardMatchesUniqueOwner: Boolean(
      uniqueOwner &&
        ownerGuard &&
        ownerGuard.accountId === uniqueOwner.accountId &&
        ownerGuard.participantManagementId === uniqueOwner.participantManagementId
    ),
  });
  const managers = await Promise.all(
    management.map(async (item) => {
      const accountSnap = await firestore.collection('users').doc(item.accountId).get();
      return {
        accountId: item.accountId,
        participantManagementId: item.participantManagementId,
        displayName: displayNameOf(accountSnap.data() as Record<string, unknown> | undefined, item.accountId),
        authority: item.authority,
        managementRevision: item.revision,
      };
    })
  );
  const relationshipCount = await countQuery(
    firestore.collection('instructor_relationships').where('participantId', '==', participant.participantId)
  );
  const bookingScan = await firestore
    .collection('bookings')
    .where('party.participantIds', 'array-contains', participant.participantId)
    .limit(33)
    .get();
  const enrollmentScan = await firestore
    .collection('course_enrollments')
    .where('participantId', '==', participant.participantId)
    .limit(33)
    .get();
  const archiveBlockedByCommitments =
    bookingScan.size > 32 ||
    enrollmentScan.size > 32 ||
    bookingScan.docs.some((doc) => {
      const status = (doc.data() as { lifecycle?: { status?: string } }).lifecycle?.status;
      return status !== 'cancelled' && status !== 'completed' && status !== 'no_show';
    }) ||
    enrollmentScan.docs.some((doc) => {
      const status = (doc.data() as { lifecycle?: { status?: string } }).lifecycle?.status;
      return (
        status !== 'cancelled' &&
        status !== 'withdrawn' &&
        status !== 'completed' &&
        status !== 'no_show'
      );
    });
  return {
    ...listItem,
    profile: {
      displayName: participant.displayName,
      age: participant.age,
      skillLevel: participant.skillLevel,
      discipline: participant.discipline,
      ...(participant.instructorComment === undefined
        ? {}
        : { instructorComment: participant.instructorComment }),
    },
    managers: managers.slice(0, 8),
    instructorRelationshipCount: relationshipCount,
    diagnostics: diagnostics.slice(0, 32),
    diagnosticCount: diagnostics.length,
    archiveBlockedByCommitments,
    authorizedActions: participantActions({
      lifecycle: participant.lifecycle.status,
      revision: participant.revision,
      classification: listItem.classification,
      ...(uniqueOwner ? { managementRevision: uniqueOwner.revision } : {}),
      archiveBlockedByCommitments,
      ownerGuardRepairable: diagnostics.some(
        (item) => item.safeRepairKind === 'repair_participant_management_owner_guard'
      ),
    }),
  };
}

async function findLinkedAccount(
  firestore: Firestore,
  instructorId: InstructorId
): Promise<{ accountId: AccountId; revision?: number } | undefined> {
  const snapshot = await firestore
    .collection('users')
    .where('instructorId', '==', instructorId)
    .limit(2)
    .get();
  if (snapshot.empty) return undefined;
  const accountId = AccountIdSchema.safeParse(snapshot.docs[0]!.id);
  if (!accountId.success) return undefined;
  const account = parseAccount(snapshot.docs[0]!.data() as Record<string, unknown>);
  return { accountId: accountId.data, ...(account ? { revision: account.revision } : {}) };
}

async function buildInstructorListItem(
  firestore: Firestore,
  instructorId: InstructorId,
  data: Record<string, unknown>
): Promise<AdminInstructorListItem | undefined> {
  const parsed = parseInstructorCatalog(instructorId, data);
  if (!parsed) return undefined;
  const revision = parseInstructorCatalogRevision(data);
  const isAvailable = data.isAvailable !== false;
  const linked = await findLinkedAccount(firestore, instructorId);
  const rosterCount = await countQuery(
    firestore.collection('courses').where('instructorRosterIds', 'array-contains', instructorId)
  );
  const dayCount = await countQuery(
    firestore.collectionGroup('days').where('actualInstructorIds', 'array-contains', instructorId)
  );
  return {
    instructorId,
    name: parsed.name,
    isAvailable,
    ...(linked ? { linkedAccountId: linked.accountId } : {}),
    courseRosterCount: rosterCount,
    courseDayAssignmentCount: dayCount,
    revision,
    authorizedActions: instructorActions({
      revision,
      isAvailable,
      ...(linked ? { linkedAccountId: linked.accountId, linkedAccountRevision: linked.revision } : {}),
    }),
  };
}

async function buildInstructorDetail(
  firestore: Firestore,
  instructorId: InstructorId,
  data: Record<string, unknown>
): Promise<AdminInstructorDetailReadModel | undefined> {
  const listItem = await buildInstructorListItem(firestore, instructorId, data);
  if (!listItem) return undefined;
  const diagnostics: IdentityDiagnostic[] = [];
  if (listItem.linkedAccountId) {
    const accountSnap = await firestore.collection('users').doc(listItem.linkedAccountId).get();
    const linkedId = readString(accountSnap.data() as Record<string, unknown> | undefined, 'instructorId');
    if (linkedId !== instructorId) {
      diagnostics.push({
        diagnosticType: 'account_instructor_link_mismatch',
        severity: 'error',
        subject: `account:${listItem.linkedAccountId}`,
        evidence: 'linked Account.instructorId does not match this catalog entry',
        safeRepairAvailable: false,
      });
    }
  }
  return {
    ...listItem,
    ...(typeof data.specialty === 'string'
      ? { specialty: data.specialty as AdminInstructorDetailReadModel['specialty'] }
      : {}),
    ...(readString(data, 'bio') ? { bio: readString(data, 'bio') } : {}),
    ...(readString(data, 'avatarUrl') ? { avatarUrl: readString(data, 'avatarUrl') } : {}),
    ...(readString(data, 'phoneNumber') ? { phoneNumber: readString(data, 'phoneNumber') } : {}),
    ...(Array.isArray(data.languages)
      ? { languages: data.languages.filter((item): item is string => typeof item === 'string').slice(0, 16) }
      : {}),
    ...(typeof data.experienceYears === 'number' ? { experienceYears: data.experienceYears } : {}),
    diagnostics: diagnostics.slice(0, 32),
  };
}

async function queryEligibleParticipants(
  firestore: Firestore,
  accountId: AccountId
): Promise<AdminEligibleParticipantItem[]> {
  const accountSnapshot = await firestore.collection('users').doc(accountId).get();
  const account = parseAccount(accountSnapshot.data() as Record<string, unknown> | undefined);
  if (!account || account.lifecycle.status !== 'active') {
    return [];
  }
  const management = await queryActiveManagementForAccount(firestore, accountId);
  const items: AdminEligibleParticipantItem[] = [];
  for (const item of management) {
    const snapshot = await firestore.collection('participants').doc(item.participantId).get();
    const participant = parseParticipant(snapshot.data() as Record<string, unknown> | undefined);
    if (!participant || participant.lifecycle.status !== 'active') continue;
    if (participant.management.kind !== 'managed') continue;
    if (participant.management.participantManagementId !== item.participantManagementId) continue;
    items.push({
      participantId: participant.participantId,
      participantManagementId: item.participantManagementId,
      displayName: participant.displayName,
      authority: item.authority,
      revision: participant.revision,
      lifecycle: 'active',
    });
  }
  return items.slice(0, 50);
}

export async function queryAdminIdentityReadModels(
  firestore: Firestore,
  actor: ReadModelAdministratorActor,
  input: QueryAdminIdentityReadModelsInput
): Promise<QueryAdminIdentityReadModelsResult> {
  const authority = await loadActorAuthority(firestore, actor);

  if (input.scope === 'admin_account_list') {
    const page = await paginateCollection(firestore, 'users', input, 'displayName');
    const items = (
      await Promise.all(
        page.docs.map(async (doc) => {
          const accountId = AccountIdSchema.safeParse(doc.id);
          if (!accountId.success) return undefined;
          return buildAccountListItem(
            firestore,
            authority,
            accountId.data,
            doc.data() as Record<string, unknown>
          );
        })
      )
    ).filter((item): item is AdminAccountListItem => item !== undefined);
    const last = page.docs[page.docs.length - 1];
    const result = {
      scope: 'admin_account_list' as const,
      items,
      hasMore: page.hasMore,
      ...(page.hasMore && last
        ? {
            nextCursor: encodeAdminIdentityListCursor({
              documentId: last.id,
              ...(input.search && !input.search.includes('@')
                ? { sortKey: displayNameOf(last.data() as Record<string, unknown>, last.id) }
                : {}),
            }),
          }
        : {}),
    };
    return QueryAdminIdentityReadModelsResultSchema.parse(result);
  }

  if (input.scope === 'admin_account_detail') {
    const snapshot = await firestore.collection('users').doc(input.accountId).get();
    const result = {
      scope: 'admin_account_detail' as const,
      ...(snapshot.exists
        ? {
            item: await buildAccountDetail(
              firestore,
              authority,
              input.accountId,
              snapshot.data() as Record<string, unknown>
            ),
          }
        : {}),
    };
    return QueryAdminIdentityReadModelsResultSchema.parse(result);
  }

  if (input.scope === 'admin_participant_list') {
    const page = await paginateCollection(firestore, 'participants', input, 'displayName');
    const items = (
      await Promise.all(
        page.docs.map(async (doc) => {
          const participant = parseParticipant(doc.data() as Record<string, unknown>);
          if (!participant) return undefined;
          return buildParticipantListItem(firestore, participant);
        })
      )
    ).filter((item): item is AdminParticipantListItem => item !== undefined);
    const last = page.docs[page.docs.length - 1];
    const result = {
      scope: 'admin_participant_list' as const,
      items,
      hasMore: page.hasMore,
      ...(page.hasMore && last
        ? {
            nextCursor: encodeAdminIdentityListCursor({
              documentId: last.id,
              ...(input.search
                ? { sortKey: displayNameOf(last.data() as Record<string, unknown>, last.id) }
                : {}),
            }),
          }
        : {}),
    };
    return QueryAdminIdentityReadModelsResultSchema.parse(result);
  }

  if (input.scope === 'admin_participant_detail') {
    const snapshot = await firestore.collection('participants').doc(input.participantId).get();
    const participant = parseParticipant(snapshot.data() as Record<string, unknown> | undefined);
    const result = {
      scope: 'admin_participant_detail' as const,
      ...(participant ? { item: await buildParticipantDetail(firestore, participant) } : {}),
    };
    return QueryAdminIdentityReadModelsResultSchema.parse(result);
  }

  if (input.scope === 'admin_instructor_list') {
    const page = await paginateCollection(firestore, 'instructors', input, 'name');
    const items = (
      await Promise.all(
        page.docs.map(async (doc) => {
          const instructorId = InstructorIdSchema.safeParse(doc.id);
          if (!instructorId.success) return undefined;
          return buildInstructorListItem(
            firestore,
            instructorId.data,
            doc.data() as Record<string, unknown>
          );
        })
      )
    ).filter((item): item is AdminInstructorListItem => item !== undefined);
    const last = page.docs[page.docs.length - 1];
    const result = {
      scope: 'admin_instructor_list' as const,
      items,
      hasMore: page.hasMore,
      ...(page.hasMore && last
        ? {
            nextCursor: encodeAdminIdentityListCursor({
              documentId: last.id,
              ...(input.search ? { sortKey: displayNameOf(last.data() as Record<string, unknown>, last.id) } : {}),
            }),
          }
        : {}),
    };
    return QueryAdminIdentityReadModelsResultSchema.parse(result);
  }

  if (input.scope === 'admin_instructor_detail') {
    const snapshot = await firestore.collection('instructors').doc(input.instructorId).get();
    const result = {
      scope: 'admin_instructor_detail' as const,
      ...(snapshot.exists
        ? {
            item: await buildInstructorDetail(
              firestore,
              input.instructorId,
              snapshot.data() as Record<string, unknown>
            ),
          }
        : {}),
    };
    return QueryAdminIdentityReadModelsResultSchema.parse(result);
  }

  const items = await queryEligibleParticipants(firestore, input.accountId);
  return QueryAdminIdentityReadModelsResultSchema.parse({
    scope: 'admin_eligible_participants',
    accountId: input.accountId,
    items,
  });
}
