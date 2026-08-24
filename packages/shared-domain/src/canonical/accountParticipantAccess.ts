import { z } from 'zod';
import {
  AccountIdSchema,
  BookingIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  InstructorIdSchema,
  InstructorRelationshipIdSchema,
  ParticipantBlockIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  type AccountId,
  type InstructorId,
  type ParticipantId,
  type ParticipantManagementId,
} from './identifiers';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  compareCanonicalTimestamps,
  timestampFromDate,
  type CanonicalTimestamp,
} from './primitives';

const PersistedAggregateRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 1,
  'Persisted aggregate revision must be at least one'
);

const RevisionAuditLinkSchema = z
  .object({
    createdByCommandId: CommandIdSchema,
    lastChangedByCommandId: CommandIdSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict();

const revisionedRecordFields = {
  revision: PersistedAggregateRevisionSchema,
  createdAt: CanonicalTimestampSchema,
  updatedAt: CanonicalTimestampSchema,
  audit: RevisionAuditLinkSchema,
} as const;

export const CanonicalRecordMetadataSchema = z
  .object(revisionedRecordFields)
  .strict()
  .superRefine((metadata, context) => {
    if (compareCanonicalTimestamps(metadata.updatedAt, metadata.createdAt) < 0) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'updatedAt must not precede createdAt',
      });
    }
  });

export type CanonicalRecordMetadata = z.output<typeof CanonicalRecordMetadataSchema>;

function addRecordChronologyIssue(
  record: { readonly createdAt: CanonicalTimestamp; readonly updatedAt: CanonicalTimestamp },
  context: z.RefinementCtx
): void {
  if (compareCanonicalTimestamps(record.updatedAt, record.createdAt) < 0) {
    context.addIssue({
      code: 'custom',
      path: ['updatedAt'],
      message: 'updatedAt must not precede createdAt',
    });
  }
}

function addEventChronologyIssue(
  eventAt: CanonicalTimestamp,
  path: (string | number)[],
  record: { readonly createdAt: CanonicalTimestamp; readonly updatedAt: CanonicalTimestamp },
  context: z.RefinementCtx
): void {
  if (
    compareCanonicalTimestamps(eventAt, record.createdAt) < 0 ||
    compareCanonicalTimestamps(eventAt, record.updatedAt) > 0
  ) {
    context.addIssue({
      code: 'custom',
      path,
      message: 'Lifecycle timestamp must fall between createdAt and updatedAt',
    });
  }
}

const AccountLifecycleSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('active') }).strict(),
  z
    .object({
      status: z.literal('disabled'),
      disabledAt: CanonicalTimestampSchema,
    })
    .strict(),
]);

export const AccountSchema = z
  .object({
    accountId: AccountIdSchema,
    lifecycle: AccountLifecycleSchema,
    ...revisionedRecordFields,
  })
  .strict()
  .superRefine((account, context) => {
    addRecordChronologyIssue(account, context);
    if (
      account.lifecycle.status === 'disabled' &&
      (compareCanonicalTimestamps(account.lifecycle.disabledAt, account.createdAt) < 0 ||
        compareCanonicalTimestamps(account.lifecycle.disabledAt, account.updatedAt) > 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['lifecycle', 'disabledAt'],
        message: 'disabledAt must not precede createdAt',
      });
    }
  });

export type Account = Readonly<z.output<typeof AccountSchema>>;

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const ParticipantAgeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('birth_date'),
      birthDate: z.string().refine(isCalendarDate, 'birthDate must be a calendar date'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('age_years'),
      years: z.number().finite().int().min(0).max(125),
    })
    .strict(),
]);

const ParticipantManagementStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unmanaged_guest') }).strict(),
  z
    .object({
      kind: z.literal('managed'),
      participantManagementId: ParticipantManagementIdSchema,
    })
    .strict(),
]);

const ParticipantLifecycleSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('active') }).strict(),
  z
    .object({
      status: z.literal('archived'),
      archivedAt: CanonicalTimestampSchema,
    })
    .strict(),
]);

export const ParticipantSchema = z
  .object({
    participantId: ParticipantIdSchema,
    displayName: z.string().trim().min(1).max(200),
    age: ParticipantAgeSchema,
    skillLevel: z.string().trim().min(1).max(64),
    discipline: z.enum(['ski', 'snowboard']),
    instructorComment: z.string().trim().min(1).max(2_000).optional(),
    management: ParticipantManagementStateSchema,
    lifecycle: ParticipantLifecycleSchema,
    ...revisionedRecordFields,
  })
  .strict()
  .superRefine((participant, context) => {
    addRecordChronologyIssue(participant, context);
    if (
      participant.lifecycle.status === 'archived' &&
      (compareCanonicalTimestamps(participant.lifecycle.archivedAt, participant.createdAt) < 0 ||
        compareCanonicalTimestamps(participant.lifecycle.archivedAt, participant.updatedAt) > 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['lifecycle', 'archivedAt'],
        message: 'archivedAt must not precede createdAt',
      });
    }
  });

export type Participant = Readonly<z.output<typeof ParticipantSchema>>;

const participantManagementBaseFields = {
  participantManagementId: ParticipantManagementIdSchema,
  accountId: AccountIdSchema,
  participantId: ParticipantIdSchema,
  role: z.literal('owner'),
  authority: z.enum(['self', 'parent_guardian']),
  ...revisionedRecordFields,
} as const;

export const ParticipantManagementSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        ...participantManagementBaseFields,
        status: z.literal('active'),
      })
      .strict(),
    z
      .object({
        ...participantManagementBaseFields,
        status: z.literal('ended'),
        endedAt: CanonicalTimestampSchema,
      })
      .strict(),
  ])
  .superRefine((management, context) => {
    addRecordChronologyIssue(management, context);
    if (management.status === 'ended') {
      addEventChronologyIssue(management.endedAt, ['endedAt'], management, context);
    }
  });

export type ParticipantManagement = Readonly<z.output<typeof ParticipantManagementSchema>>;

export const ParticipantManagementActiveOwnerGuardSchema = z
  .object({
    participantId: ParticipantIdSchema,
    accountId: AccountIdSchema,
    participantManagementId: ParticipantManagementIdSchema,
    managementRevision: PersistedAggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema,
    lastChangedByCommandId: CommandIdSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict();

export type ParticipantManagementActiveOwnerGuard = Readonly<
  z.output<typeof ParticipantManagementActiveOwnerGuardSchema>
>;

const InstructorRelationshipBasisSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('confirmed_booking'),
      bookingId: BookingIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('confirmed_course_enrollment'),
      courseEnrollmentId: CourseEnrollmentIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('administration_assignment'),
      assignedByAccountId: AccountIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('guardian_permission'),
      participantManagementId: ParticipantManagementIdSchema,
      grantedByAccountId: AccountIdSchema,
    })
    .strict(),
]);

const ParticipantManagerActorSchema = z
  .object({
    kind: z.literal('participant_manager'),
    accountId: AccountIdSchema,
    participantManagementId: ParticipantManagementIdSchema,
  })
  .strict();

const InstructorRelationshipRevokerSchema = z.discriminatedUnion('kind', [
  ParticipantManagerActorSchema,
  z
    .object({
      kind: z.literal('administrator'),
      accountId: AccountIdSchema,
    })
    .strict(),
]);

const instructorRelationshipBaseFields = {
  instructorRelationshipId: InstructorRelationshipIdSchema,
  participantId: ParticipantIdSchema,
  instructorId: InstructorIdSchema,
  basis: InstructorRelationshipBasisSchema,
  validFrom: CanonicalTimestampSchema,
  expiresAt: CanonicalTimestampSchema,
  ...revisionedRecordFields,
} as const;

export const InstructorRelationshipSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        ...instructorRelationshipBaseFields,
        status: z.literal('active'),
      })
      .strict(),
    z
      .object({
        ...instructorRelationshipBaseFields,
        status: z.literal('revoked'),
        revokedAt: CanonicalTimestampSchema,
        revokedBy: InstructorRelationshipRevokerSchema,
      })
      .strict(),
    z
      .object({
        ...instructorRelationshipBaseFields,
        status: z.literal('expired'),
        expiredAt: CanonicalTimestampSchema,
      })
      .strict(),
  ])
  .superRefine((relationship, context) => {
    addRecordChronologyIssue(relationship, context);
    addEventChronologyIssue(relationship.validFrom, ['validFrom'], relationship, context);
    if (compareCanonicalTimestamps(relationship.validFrom, relationship.expiresAt) >= 0) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'expiresAt must be later than validFrom',
      });
    }
    if (relationship.status === 'revoked') {
      addEventChronologyIssue(relationship.revokedAt, ['revokedAt'], relationship, context);
      if (compareCanonicalTimestamps(relationship.revokedAt, relationship.validFrom) < 0) {
        context.addIssue({
          code: 'custom',
          path: ['revokedAt'],
          message: 'revokedAt must not precede validFrom',
        });
      }
    }
    if (relationship.status === 'expired') {
      addEventChronologyIssue(relationship.expiredAt, ['expiredAt'], relationship, context);
      if (compareCanonicalTimestamps(relationship.expiredAt, relationship.expiresAt) < 0) {
        context.addIssue({
          code: 'custom',
          path: ['expiredAt'],
          message: 'expiredAt must not precede expiresAt',
        });
      }
    }
  });

export type InstructorRelationship = Readonly<z.output<typeof InstructorRelationshipSchema>>;

const ParticipantBlockCreatorSchema = z.discriminatedUnion('kind', [
  ParticipantManagerActorSchema,
  z
    .object({
      kind: z.literal('instructor'),
      instructorId: InstructorIdSchema,
    })
    .strict(),
]);

const participantBlockBaseFields = {
  participantBlockId: ParticipantBlockIdSchema,
  participantId: ParticipantIdSchema,
  instructorId: InstructorIdSchema,
  createdBy: ParticipantBlockCreatorSchema,
  reason: z.string().trim().min(1).max(1_000),
  ...revisionedRecordFields,
} as const;

export function participantBlockActorKey(
  actor: z.output<typeof ParticipantBlockCreatorSchema>
): string {
  return actor.kind === 'instructor'
    ? `instructor:${actor.instructorId}`
    : `participant_manager:${actor.accountId}:${actor.participantManagementId}`;
}

export type ParticipantBlockCreator = Readonly<z.output<typeof ParticipantBlockCreatorSchema>>;

export const ParticipantBlockSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        ...participantBlockBaseFields,
        status: z.literal('active'),
      })
      .strict(),
    z
      .object({
        ...participantBlockBaseFields,
        status: z.literal('removed'),
        removedAt: CanonicalTimestampSchema,
        removedBy: ParticipantBlockCreatorSchema,
      })
      .strict(),
  ])
  .superRefine((block, context) => {
    addRecordChronologyIssue(block, context);
    if (
      block.createdBy.kind === 'instructor' &&
      block.createdBy.instructorId !== block.instructorId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['createdBy', 'instructorId'],
        message: 'An Instructor block must be created by the named Instructor',
      });
    }
    if (block.status === 'removed') {
      addEventChronologyIssue(block.removedAt, ['removedAt'], block, context);
      if (participantBlockActorKey(block.removedBy) !== participantBlockActorKey(block.createdBy)) {
        context.addIssue({
          code: 'custom',
          path: ['removedBy'],
          message: 'Only the block creator can remove the block',
        });
      }
    }
  });

export type ParticipantBlock = Readonly<z.output<typeof ParticipantBlockSchema>>;

const BookingScopedParticipantAccessSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('booking'),
      bookingId: BookingIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('course_day'),
      courseEnrollmentId: CourseEnrollmentIdSchema,
      courseDayId: CourseDayIdSchema,
    })
    .strict(),
]);

export const BookingScopedParticipantAccessEvidenceSchema = z
  .object({
    source: BookingScopedParticipantAccessSourceSchema,
    participantId: ParticipantIdSchema,
    instructorId: InstructorIdSchema,
    validFrom: CanonicalTimestampSchema,
    validUntil: CanonicalTimestampSchema,
  })
  .strict()
  .superRefine((evidence, context) => {
    if (compareCanonicalTimestamps(evidence.validFrom, evidence.validUntil) >= 0) {
      context.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'validUntil must be later than validFrom',
      });
    }
  });

export type BookingScopedParticipantAccessEvidence = Readonly<
  z.output<typeof BookingScopedParticipantAccessEvidenceSchema>
>;

function addTopologyIssue(context: z.RefinementCtx, path: (string | number)[], message: string) {
  context.addIssue({ code: 'custom', path, message });
}

function duplicateIndexes<Value>(
  values: readonly Value[],
  keyOf: (value: Value) => string
): readonly number[] {
  const firstIndexByKey = new Map<string, number>();
  const duplicates: number[] = [];
  values.forEach((value, index) => {
    const key = keyOf(value);
    if (firstIndexByKey.has(key)) duplicates.push(index);
    else firstIndexByKey.set(key, index);
  });
  return duplicates;
}

export const ParticipantAccessTopologySchema = z
  .object({
    accounts: z.array(AccountSchema),
    participants: z.array(ParticipantSchema),
    participantManagement: z.array(ParticipantManagementSchema),
    activeOwnerGuards: z.array(ParticipantManagementActiveOwnerGuardSchema),
    instructorRelationships: z.array(InstructorRelationshipSchema),
    participantBlocks: z.array(ParticipantBlockSchema),
  })
  .strict()
  .superRefine((topology, context) => {
    for (const index of duplicateIndexes(topology.accounts, (account) => account.accountId)) {
      addTopologyIssue(context, ['accounts', index, 'accountId'], 'Duplicate Account identity');
    }
    for (const index of duplicateIndexes(
      topology.participants,
      (participant) => participant.participantId
    )) {
      addTopologyIssue(
        context,
        ['participants', index, 'participantId'],
        'Duplicate Participant identity'
      );
    }
    for (const index of duplicateIndexes(
      topology.participantManagement,
      (management) => management.participantManagementId
    )) {
      addTopologyIssue(
        context,
        ['participantManagement', index, 'participantManagementId'],
        'Duplicate Participant management identity'
      );
    }
    for (const index of duplicateIndexes(
      topology.activeOwnerGuards,
      (guard) => guard.participantId
    )) {
      addTopologyIssue(
        context,
        ['activeOwnerGuards', index, 'participantId'],
        'A Participant can have only one active owner guard'
      );
    }
    for (const index of duplicateIndexes(
      topology.instructorRelationships,
      (relationship) => relationship.instructorRelationshipId
    )) {
      addTopologyIssue(
        context,
        ['instructorRelationships', index, 'instructorRelationshipId'],
        'Duplicate Instructor Relationship identity'
      );
    }
    for (const index of duplicateIndexes(
      topology.participantBlocks,
      (block) => block.participantBlockId
    )) {
      addTopologyIssue(
        context,
        ['participantBlocks', index, 'participantBlockId'],
        'Duplicate Participant Block identity'
      );
    }

    const accountIds = new Set(topology.accounts.map((account) => account.accountId));
    const participantIds = new Set(
      topology.participants.map((participant) => participant.participantId)
    );
    const managementById = new Map(
      topology.participantManagement.map(
        (management) => [management.participantManagementId, management] as const
      )
    );
    const activeManagementById = new Map(
      [...managementById].filter(([, management]) => management.status === 'active')
    );

    topology.participantManagement.forEach((management, index) => {
      if (!accountIds.has(management.accountId)) {
        addTopologyIssue(
          context,
          ['participantManagement', index, 'accountId'],
          'Participant management references an unknown Account'
        );
      }
      if (!participantIds.has(management.participantId)) {
        addTopologyIssue(
          context,
          ['participantManagement', index, 'participantId'],
          'Participant management references an unknown Participant'
        );
      }
    });

    const activeByParticipant = new Map<string, ParticipantManagement[]>();
    for (const management of activeManagementById.values()) {
      const current = activeByParticipant.get(management.participantId) ?? [];
      current.push(management);
      activeByParticipant.set(management.participantId, current);
    }

    topology.participants.forEach((participant, index) => {
      const activeManagement = activeByParticipant.get(participant.participantId) ?? [];
      if (participant.management.kind === 'unmanaged_guest') {
        if (activeManagement.length > 0) {
          addTopologyIssue(
            context,
            ['participants', index, 'management'],
            'An unmanaged guest cannot have active Participant management'
          );
        }
        return;
      }

      const selected = activeManagementById.get(participant.management.participantManagementId);
      if (!selected || selected.participantId !== participant.participantId) {
        addTopologyIssue(
          context,
          ['participants', index, 'management', 'participantManagementId'],
          'A managed Participant must reference its active management relationship'
        );
      }
      if (activeManagement.length !== 1) {
        addTopologyIssue(
          context,
          ['participants', index, 'management'],
          'A managed Participant must have exactly one active owner relationship'
        );
      }
    });

    topology.activeOwnerGuards.forEach((guard, index) => {
      const management = activeManagementById.get(guard.participantManagementId);
      if (
        !management ||
        management.participantId !== guard.participantId ||
        management.accountId !== guard.accountId ||
        management.revision !== guard.managementRevision
      ) {
        addTopologyIssue(
          context,
          ['activeOwnerGuards', index],
          'Active owner guard must match one active management relationship and revision'
        );
      }
    });

    for (const management of activeManagementById.values()) {
      const matchingGuards = topology.activeOwnerGuards.filter(
        (guard) => guard.participantManagementId === management.participantManagementId
      );
      if (matchingGuards.length !== 1) {
        const index = topology.participantManagement.indexOf(management);
        addTopologyIssue(
          context,
          ['participantManagement', index],
          'Every active management relationship must have exactly one active owner guard'
        );
      }
    }

    const activeRelationshipPairs = new Set<string>();
    topology.instructorRelationships.forEach((relationship, index) => {
      if (!participantIds.has(relationship.participantId)) {
        addTopologyIssue(
          context,
          ['instructorRelationships', index, 'participantId'],
          'Instructor Relationship references an unknown Participant'
        );
      }

      if (relationship.basis.kind === 'guardian_permission') {
        const management = managementById.get(relationship.basis.participantManagementId);
        if (
          !management ||
          management.participantId !== relationship.participantId ||
          management.accountId !== relationship.basis.grantedByAccountId ||
          (relationship.status === 'active' && management.status !== 'active')
        ) {
          addTopologyIssue(
            context,
            ['instructorRelationships', index, 'basis'],
            'Guardian permission must name the matching Participant manager and Account'
          );
        }
      }
      if (
        relationship.basis.kind === 'administration_assignment' &&
        !accountIds.has(relationship.basis.assignedByAccountId)
      ) {
        addTopologyIssue(
          context,
          ['instructorRelationships', index, 'basis', 'assignedByAccountId'],
          'Administration assignment references an unknown Account actor'
        );
      }

      if (relationship.status === 'revoked') {
        if (
          relationship.revokedBy.kind === 'administrator' &&
          !accountIds.has(relationship.revokedBy.accountId)
        ) {
          addTopologyIssue(
            context,
            ['instructorRelationships', index, 'revokedBy', 'accountId'],
            'Relationship revocation references an unknown Administrator Account actor'
          );
        }
        if (relationship.revokedBy.kind === 'participant_manager') {
          const management = managementById.get(relationship.revokedBy.participantManagementId);
          if (
            !management ||
            management.participantId !== relationship.participantId ||
            management.accountId !== relationship.revokedBy.accountId
          ) {
            addTopologyIssue(
              context,
              ['instructorRelationships', index, 'revokedBy'],
              'Relationship revocation must name the Participant manager and Account actor'
            );
          }
        }
      }

      if (relationship.status === 'active') {
        const pair = `${relationship.participantId}\u0000${relationship.instructorId}`;
        if (activeRelationshipPairs.has(pair)) {
          addTopologyIssue(
            context,
            ['instructorRelationships', index],
            'A Participant and Instructor can have only one active relationship'
          );
        }
        activeRelationshipPairs.add(pair);
      }
    });

    const activeBlockKeys = new Set<string>();
    topology.participantBlocks.forEach((block, index) => {
      if (!participantIds.has(block.participantId)) {
        addTopologyIssue(
          context,
          ['participantBlocks', index, 'participantId'],
          'Participant Block references an unknown Participant'
        );
      }

      if (block.createdBy.kind === 'participant_manager') {
        const management = managementById.get(block.createdBy.participantManagementId);
        if (
          !management ||
          management.participantId !== block.participantId ||
          management.accountId !== block.createdBy.accountId ||
          (block.status === 'active' && management.status !== 'active')
        ) {
          addTopologyIssue(
            context,
            ['participantBlocks', index, 'createdBy'],
            'Manager block creator must match the Participant management relationship and Account'
          );
        }
      }

      if (block.status === 'active') {
        const key = `${block.createdBy.kind}\u0000${block.participantId}\u0000${block.instructorId}`;
        if (activeBlockKeys.has(key)) {
          addTopologyIssue(
            context,
            ['participantBlocks', index],
            'Duplicate active Participant Block direction and subjects'
          );
        }
        activeBlockKeys.add(key);
      }
    });
  });

export type ParticipantAccessTopology = Readonly<z.output<typeof ParticipantAccessTopologySchema>>;

export type ParticipantManagementAccessDecision =
  | Readonly<{
      allowed: true;
      authority: 'self' | 'parent_guardian';
      participantManagementId: ParticipantManagementId;
    }>
  | Readonly<{
      allowed: false;
      reason: 'unauthorized' | 'account_inactive' | 'participant_inactive';
    }>;

export function evaluateParticipantManagementAccess(
  topology: ParticipantAccessTopology,
  request: Readonly<{ accountId: AccountId; participantId: ParticipantId }>
): ParticipantManagementAccessDecision {
  const account = topology.accounts.find((candidate) => candidate.accountId === request.accountId);
  if (!account) return { allowed: false, reason: 'unauthorized' };
  if (account.lifecycle.status !== 'active') {
    return { allowed: false, reason: 'account_inactive' };
  }

  const participant = topology.participants.find(
    (candidate) => candidate.participantId === request.participantId
  );
  if (!participant) return { allowed: false, reason: 'unauthorized' };
  if (participant.lifecycle.status !== 'active') {
    return { allowed: false, reason: 'participant_inactive' };
  }
  if (participant.management.kind !== 'managed') {
    return { allowed: false, reason: 'unauthorized' };
  }
  const participantManagementId = participant.management.participantManagementId;

  const management = topology.participantManagement.find(
    (candidate) =>
      candidate.status === 'active' &&
      candidate.participantManagementId === participantManagementId &&
      candidate.accountId === request.accountId &&
      candidate.participantId === request.participantId
  );
  if (!management) return { allowed: false, reason: 'unauthorized' };

  return {
    allowed: true,
    authority: management.authority,
    participantManagementId: management.participantManagementId,
  };
}

export type InstructorParticipantAccessDecision =
  | Readonly<{ allowed: true; scope: 'relationship' }>
  | Readonly<{
      allowed: true;
      scope: 'booking_scoped';
      blockedForNewActivity: boolean;
      source: BookingScopedParticipantAccessEvidence['source'];
    }>
  | Readonly<{
      allowed: false;
      reason: 'unauthorized' | 'participant_inactive' | 'blocked';
    }>;

export function addCanonicalMonths(
  timestamp: CanonicalTimestamp,
  months: number
): CanonicalTimestamp {
  const date = new Date(timestamp.seconds * 1_000 + timestamp.nanoseconds / 1_000_000);
  const utcYear = date.getUTCFullYear();
  const utcMonth = date.getUTCMonth();
  const utcDay = date.getUTCDate();
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const utcSeconds = date.getUTCSeconds();
  const utcMilliseconds = date.getUTCMilliseconds();

  const targetMonthIndex = utcMonth + months;
  const targetYear = utcYear + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(utcDay, daysInTargetMonth);

  return timestampFromDate(
    new Date(
      Date.UTC(
        targetYear,
        normalizedMonth,
        targetDay,
        utcHours,
        utcMinutes,
        utcSeconds,
        utcMilliseconds
      )
    )
  );
}

export function instructorRelationshipExpiresAt(validFrom: CanonicalTimestamp): CanonicalTimestamp {
  return addCanonicalMonths(validFrom, 12);
}

export function isParticipantInstructorPairBlockedForNewService(
  topology: ParticipantAccessTopology,
  request: Readonly<{ participantId: ParticipantId; instructorId: InstructorId }>
): boolean {
  return topology.participantBlocks.some(
    (block) =>
      block.status === 'active' &&
      block.participantId === request.participantId &&
      block.instructorId === request.instructorId
  );
}

export function sanitizeParticipantProfileForInstructor(
  participant: Participant
): Readonly<{
  participantId: ParticipantId;
  displayName: string;
  age: Participant['age'];
  skillLevel: string;
  discipline: Participant['discipline'];
  instructorComment?: string;
}> {
  return {
    participantId: participant.participantId,
    displayName: participant.displayName,
    age: participant.age,
    skillLevel: participant.skillLevel,
    discipline: participant.discipline,
    ...(participant.instructorComment === undefined
      ? {}
      : { instructorComment: participant.instructorComment }),
  };
}

export function evaluateInstructorParticipantAccess(
  topology: ParticipantAccessTopology,
  request: Readonly<{
    instructorId: InstructorId;
    participantId: ParticipantId;
    at: CanonicalTimestamp;
    bookingScopedEvidence: readonly BookingScopedParticipantAccessEvidence[];
  }>
): InstructorParticipantAccessDecision {
  const participant = topology.participants.find(
    (candidate) => candidate.participantId === request.participantId
  );
  if (!participant) return { allowed: false, reason: 'unauthorized' };
  if (participant.lifecycle.status !== 'active') {
    return { allowed: false, reason: 'participant_inactive' };
  }

  const relationship = topology.instructorRelationships.find(
    (candidate) =>
      candidate.status === 'active' &&
      candidate.participantId === request.participantId &&
      candidate.instructorId === request.instructorId &&
      compareCanonicalTimestamps(candidate.validFrom, request.at) <= 0 &&
      compareCanonicalTimestamps(request.at, candidate.expiresAt) < 0
  );
  const blocked = topology.participantBlocks.some(
    (block) =>
      block.status === 'active' &&
      block.participantId === request.participantId &&
      block.instructorId === request.instructorId
  );
  if (relationship && !blocked) return { allowed: true, scope: 'relationship' };

  const scopedEvidence = request.bookingScopedEvidence.find(
    (evidence) =>
      evidence.participantId === request.participantId &&
      evidence.instructorId === request.instructorId &&
      compareCanonicalTimestamps(evidence.validFrom, request.at) <= 0 &&
      compareCanonicalTimestamps(request.at, evidence.validUntil) < 0
  );
  if (scopedEvidence) {
    return {
      allowed: true,
      scope: 'booking_scoped',
      blockedForNewActivity: blocked,
      source: scopedEvidence.source,
    };
  }

  return blocked
    ? { allowed: false, reason: 'blocked' }
    : { allowed: false, reason: 'unauthorized' };
}
