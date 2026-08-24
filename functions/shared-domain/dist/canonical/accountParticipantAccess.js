"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParticipantAccessTopologySchema = exports.BookingScopedParticipantAccessEvidenceSchema = exports.ParticipantBlockSchema = exports.InstructorRelationshipSchema = exports.ParticipantManagementActiveOwnerGuardSchema = exports.ParticipantManagementSchema = exports.ParticipantSchema = exports.AccountSchema = exports.CanonicalRecordMetadataSchema = void 0;
exports.participantBlockActorKey = participantBlockActorKey;
exports.evaluateParticipantManagementAccess = evaluateParticipantManagementAccess;
exports.addCanonicalMonths = addCanonicalMonths;
exports.instructorRelationshipExpiresAt = instructorRelationshipExpiresAt;
exports.isParticipantInstructorPairBlockedForNewService = isParticipantInstructorPairBlockedForNewService;
exports.sanitizeParticipantProfileForInstructor = sanitizeParticipantProfileForInstructor;
exports.evaluateInstructorParticipantAccess = evaluateInstructorParticipantAccess;
const zod_1 = require("zod");
const identifiers_1 = require("./identifiers");
const primitives_1 = require("./primitives");
const PersistedAggregateRevisionSchema = primitives_1.AggregateRevisionSchema.refine((revision) => revision >= 1, 'Persisted aggregate revision must be at least one');
const RevisionAuditLinkSchema = zod_1.z
    .object({
    createdByCommandId: identifiers_1.CommandIdSchema,
    lastChangedByCommandId: identifiers_1.CommandIdSchema,
    correlationId: identifiers_1.CorrelationIdSchema,
})
    .strict();
const revisionedRecordFields = {
    revision: PersistedAggregateRevisionSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    audit: RevisionAuditLinkSchema,
};
exports.CanonicalRecordMetadataSchema = zod_1.z
    .object(revisionedRecordFields)
    .strict()
    .superRefine((metadata, context) => {
    if ((0, primitives_1.compareCanonicalTimestamps)(metadata.updatedAt, metadata.createdAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['updatedAt'],
            message: 'updatedAt must not precede createdAt',
        });
    }
});
function addRecordChronologyIssue(record, context) {
    if ((0, primitives_1.compareCanonicalTimestamps)(record.updatedAt, record.createdAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['updatedAt'],
            message: 'updatedAt must not precede createdAt',
        });
    }
}
function addEventChronologyIssue(eventAt, path, record, context) {
    if ((0, primitives_1.compareCanonicalTimestamps)(eventAt, record.createdAt) < 0 ||
        (0, primitives_1.compareCanonicalTimestamps)(eventAt, record.updatedAt) > 0) {
        context.addIssue({
            code: 'custom',
            path,
            message: 'Lifecycle timestamp must fall between createdAt and updatedAt',
        });
    }
}
const AccountLifecycleSchema = zod_1.z.discriminatedUnion('status', [
    zod_1.z.object({ status: zod_1.z.literal('active') }).strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('disabled'),
        disabledAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
]);
exports.AccountSchema = zod_1.z
    .object({
    accountId: identifiers_1.AccountIdSchema,
    lifecycle: AccountLifecycleSchema,
    ...revisionedRecordFields,
})
    .strict()
    .superRefine((account, context) => {
    addRecordChronologyIssue(account, context);
    if (account.lifecycle.status === 'disabled' &&
        ((0, primitives_1.compareCanonicalTimestamps)(account.lifecycle.disabledAt, account.createdAt) < 0 ||
            (0, primitives_1.compareCanonicalTimestamps)(account.lifecycle.disabledAt, account.updatedAt) > 0)) {
        context.addIssue({
            code: 'custom',
            path: ['lifecycle', 'disabledAt'],
            message: 'disabledAt must not precede createdAt',
        });
    }
});
function isCalendarDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match)
        return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day);
}
const ParticipantAgeSchema = zod_1.z.discriminatedUnion('kind', [
    zod_1.z
        .object({
        kind: zod_1.z.literal('birth_date'),
        birthDate: zod_1.z.string().refine(isCalendarDate, 'birthDate must be a calendar date'),
    })
        .strict(),
    zod_1.z
        .object({
        kind: zod_1.z.literal('age_years'),
        years: zod_1.z.number().finite().int().min(0).max(125),
    })
        .strict(),
]);
const ParticipantManagementStateSchema = zod_1.z.discriminatedUnion('kind', [
    zod_1.z.object({ kind: zod_1.z.literal('unmanaged_guest') }).strict(),
    zod_1.z
        .object({
        kind: zod_1.z.literal('managed'),
        participantManagementId: identifiers_1.ParticipantManagementIdSchema,
    })
        .strict(),
]);
const ParticipantLifecycleSchema = zod_1.z.discriminatedUnion('status', [
    zod_1.z.object({ status: zod_1.z.literal('active') }).strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('archived'),
        archivedAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
]);
exports.ParticipantSchema = zod_1.z
    .object({
    participantId: identifiers_1.ParticipantIdSchema,
    displayName: zod_1.z.string().trim().min(1).max(200),
    age: ParticipantAgeSchema,
    skillLevel: zod_1.z.string().trim().min(1).max(64),
    discipline: zod_1.z.enum(['ski', 'snowboard']),
    instructorComment: zod_1.z.string().trim().min(1).max(2_000).optional(),
    management: ParticipantManagementStateSchema,
    lifecycle: ParticipantLifecycleSchema,
    ...revisionedRecordFields,
})
    .strict()
    .superRefine((participant, context) => {
    addRecordChronologyIssue(participant, context);
    if (participant.lifecycle.status === 'archived' &&
        ((0, primitives_1.compareCanonicalTimestamps)(participant.lifecycle.archivedAt, participant.createdAt) < 0 ||
            (0, primitives_1.compareCanonicalTimestamps)(participant.lifecycle.archivedAt, participant.updatedAt) > 0)) {
        context.addIssue({
            code: 'custom',
            path: ['lifecycle', 'archivedAt'],
            message: 'archivedAt must not precede createdAt',
        });
    }
});
const participantManagementBaseFields = {
    participantManagementId: identifiers_1.ParticipantManagementIdSchema,
    accountId: identifiers_1.AccountIdSchema,
    participantId: identifiers_1.ParticipantIdSchema,
    role: zod_1.z.literal('owner'),
    authority: zod_1.z.enum(['self', 'parent_guardian']),
    ...revisionedRecordFields,
};
exports.ParticipantManagementSchema = zod_1.z
    .discriminatedUnion('status', [
    zod_1.z
        .object({
        ...participantManagementBaseFields,
        status: zod_1.z.literal('active'),
    })
        .strict(),
    zod_1.z
        .object({
        ...participantManagementBaseFields,
        status: zod_1.z.literal('ended'),
        endedAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
])
    .superRefine((management, context) => {
    addRecordChronologyIssue(management, context);
    if (management.status === 'ended') {
        addEventChronologyIssue(management.endedAt, ['endedAt'], management, context);
    }
});
exports.ParticipantManagementActiveOwnerGuardSchema = zod_1.z
    .object({
    participantId: identifiers_1.ParticipantIdSchema,
    accountId: identifiers_1.AccountIdSchema,
    participantManagementId: identifiers_1.ParticipantManagementIdSchema,
    managementRevision: PersistedAggregateRevisionSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    lastChangedByCommandId: identifiers_1.CommandIdSchema,
    correlationId: identifiers_1.CorrelationIdSchema,
})
    .strict();
const InstructorRelationshipBasisSchema = zod_1.z.discriminatedUnion('kind', [
    zod_1.z
        .object({
        kind: zod_1.z.literal('confirmed_booking'),
        bookingId: identifiers_1.BookingIdSchema,
    })
        .strict(),
    zod_1.z
        .object({
        kind: zod_1.z.literal('confirmed_course_enrollment'),
        courseEnrollmentId: identifiers_1.CourseEnrollmentIdSchema,
    })
        .strict(),
    zod_1.z
        .object({
        kind: zod_1.z.literal('administration_assignment'),
        assignedByAccountId: identifiers_1.AccountIdSchema,
    })
        .strict(),
    zod_1.z
        .object({
        kind: zod_1.z.literal('guardian_permission'),
        participantManagementId: identifiers_1.ParticipantManagementIdSchema,
        grantedByAccountId: identifiers_1.AccountIdSchema,
    })
        .strict(),
]);
const ParticipantManagerActorSchema = zod_1.z
    .object({
    kind: zod_1.z.literal('participant_manager'),
    accountId: identifiers_1.AccountIdSchema,
    participantManagementId: identifiers_1.ParticipantManagementIdSchema,
})
    .strict();
const InstructorRelationshipRevokerSchema = zod_1.z.discriminatedUnion('kind', [
    ParticipantManagerActorSchema,
    zod_1.z
        .object({
        kind: zod_1.z.literal('administrator'),
        accountId: identifiers_1.AccountIdSchema,
    })
        .strict(),
]);
const instructorRelationshipBaseFields = {
    instructorRelationshipId: identifiers_1.InstructorRelationshipIdSchema,
    participantId: identifiers_1.ParticipantIdSchema,
    instructorId: identifiers_1.InstructorIdSchema,
    basis: InstructorRelationshipBasisSchema,
    validFrom: primitives_1.CanonicalTimestampSchema,
    expiresAt: primitives_1.CanonicalTimestampSchema,
    ...revisionedRecordFields,
};
exports.InstructorRelationshipSchema = zod_1.z
    .discriminatedUnion('status', [
    zod_1.z
        .object({
        ...instructorRelationshipBaseFields,
        status: zod_1.z.literal('active'),
    })
        .strict(),
    zod_1.z
        .object({
        ...instructorRelationshipBaseFields,
        status: zod_1.z.literal('revoked'),
        revokedAt: primitives_1.CanonicalTimestampSchema,
        revokedBy: InstructorRelationshipRevokerSchema,
    })
        .strict(),
    zod_1.z
        .object({
        ...instructorRelationshipBaseFields,
        status: zod_1.z.literal('expired'),
        expiredAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
])
    .superRefine((relationship, context) => {
    addRecordChronologyIssue(relationship, context);
    addEventChronologyIssue(relationship.validFrom, ['validFrom'], relationship, context);
    if ((0, primitives_1.compareCanonicalTimestamps)(relationship.validFrom, relationship.expiresAt) >= 0) {
        context.addIssue({
            code: 'custom',
            path: ['expiresAt'],
            message: 'expiresAt must be later than validFrom',
        });
    }
    if (relationship.status === 'revoked') {
        addEventChronologyIssue(relationship.revokedAt, ['revokedAt'], relationship, context);
        if ((0, primitives_1.compareCanonicalTimestamps)(relationship.revokedAt, relationship.validFrom) < 0) {
            context.addIssue({
                code: 'custom',
                path: ['revokedAt'],
                message: 'revokedAt must not precede validFrom',
            });
        }
    }
    if (relationship.status === 'expired') {
        addEventChronologyIssue(relationship.expiredAt, ['expiredAt'], relationship, context);
        if ((0, primitives_1.compareCanonicalTimestamps)(relationship.expiredAt, relationship.expiresAt) < 0) {
            context.addIssue({
                code: 'custom',
                path: ['expiredAt'],
                message: 'expiredAt must not precede expiresAt',
            });
        }
    }
});
const ParticipantBlockCreatorSchema = zod_1.z.discriminatedUnion('kind', [
    ParticipantManagerActorSchema,
    zod_1.z
        .object({
        kind: zod_1.z.literal('instructor'),
        instructorId: identifiers_1.InstructorIdSchema,
    })
        .strict(),
]);
const participantBlockBaseFields = {
    participantBlockId: identifiers_1.ParticipantBlockIdSchema,
    participantId: identifiers_1.ParticipantIdSchema,
    instructorId: identifiers_1.InstructorIdSchema,
    createdBy: ParticipantBlockCreatorSchema,
    reason: zod_1.z.string().trim().min(1).max(1_000),
    ...revisionedRecordFields,
};
function participantBlockActorKey(actor) {
    return actor.kind === 'instructor'
        ? `instructor:${actor.instructorId}`
        : `participant_manager:${actor.accountId}:${actor.participantManagementId}`;
}
exports.ParticipantBlockSchema = zod_1.z
    .discriminatedUnion('status', [
    zod_1.z
        .object({
        ...participantBlockBaseFields,
        status: zod_1.z.literal('active'),
    })
        .strict(),
    zod_1.z
        .object({
        ...participantBlockBaseFields,
        status: zod_1.z.literal('removed'),
        removedAt: primitives_1.CanonicalTimestampSchema,
        removedBy: ParticipantBlockCreatorSchema,
    })
        .strict(),
])
    .superRefine((block, context) => {
    addRecordChronologyIssue(block, context);
    if (block.createdBy.kind === 'instructor' &&
        block.createdBy.instructorId !== block.instructorId) {
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
const BookingScopedParticipantAccessSourceSchema = zod_1.z.discriminatedUnion('kind', [
    zod_1.z
        .object({
        kind: zod_1.z.literal('booking'),
        bookingId: identifiers_1.BookingIdSchema,
    })
        .strict(),
    zod_1.z
        .object({
        kind: zod_1.z.literal('course_day'),
        courseEnrollmentId: identifiers_1.CourseEnrollmentIdSchema,
        courseDayId: identifiers_1.CourseDayIdSchema,
    })
        .strict(),
]);
exports.BookingScopedParticipantAccessEvidenceSchema = zod_1.z
    .object({
    source: BookingScopedParticipantAccessSourceSchema,
    participantId: identifiers_1.ParticipantIdSchema,
    instructorId: identifiers_1.InstructorIdSchema,
    validFrom: primitives_1.CanonicalTimestampSchema,
    validUntil: primitives_1.CanonicalTimestampSchema,
})
    .strict()
    .superRefine((evidence, context) => {
    if ((0, primitives_1.compareCanonicalTimestamps)(evidence.validFrom, evidence.validUntil) >= 0) {
        context.addIssue({
            code: 'custom',
            path: ['validUntil'],
            message: 'validUntil must be later than validFrom',
        });
    }
});
function addTopologyIssue(context, path, message) {
    context.addIssue({ code: 'custom', path, message });
}
function duplicateIndexes(values, keyOf) {
    const firstIndexByKey = new Map();
    const duplicates = [];
    values.forEach((value, index) => {
        const key = keyOf(value);
        if (firstIndexByKey.has(key))
            duplicates.push(index);
        else
            firstIndexByKey.set(key, index);
    });
    return duplicates;
}
exports.ParticipantAccessTopologySchema = zod_1.z
    .object({
    accounts: zod_1.z.array(exports.AccountSchema),
    participants: zod_1.z.array(exports.ParticipantSchema),
    participantManagement: zod_1.z.array(exports.ParticipantManagementSchema),
    activeOwnerGuards: zod_1.z.array(exports.ParticipantManagementActiveOwnerGuardSchema),
    instructorRelationships: zod_1.z.array(exports.InstructorRelationshipSchema),
    participantBlocks: zod_1.z.array(exports.ParticipantBlockSchema),
})
    .strict()
    .superRefine((topology, context) => {
    for (const index of duplicateIndexes(topology.accounts, (account) => account.accountId)) {
        addTopologyIssue(context, ['accounts', index, 'accountId'], 'Duplicate Account identity');
    }
    for (const index of duplicateIndexes(topology.participants, (participant) => participant.participantId)) {
        addTopologyIssue(context, ['participants', index, 'participantId'], 'Duplicate Participant identity');
    }
    for (const index of duplicateIndexes(topology.participantManagement, (management) => management.participantManagementId)) {
        addTopologyIssue(context, ['participantManagement', index, 'participantManagementId'], 'Duplicate Participant management identity');
    }
    for (const index of duplicateIndexes(topology.activeOwnerGuards, (guard) => guard.participantId)) {
        addTopologyIssue(context, ['activeOwnerGuards', index, 'participantId'], 'A Participant can have only one active owner guard');
    }
    for (const index of duplicateIndexes(topology.instructorRelationships, (relationship) => relationship.instructorRelationshipId)) {
        addTopologyIssue(context, ['instructorRelationships', index, 'instructorRelationshipId'], 'Duplicate Instructor Relationship identity');
    }
    for (const index of duplicateIndexes(topology.participantBlocks, (block) => block.participantBlockId)) {
        addTopologyIssue(context, ['participantBlocks', index, 'participantBlockId'], 'Duplicate Participant Block identity');
    }
    const accountIds = new Set(topology.accounts.map((account) => account.accountId));
    const participantIds = new Set(topology.participants.map((participant) => participant.participantId));
    const managementById = new Map(topology.participantManagement.map((management) => [management.participantManagementId, management]));
    const activeManagementById = new Map([...managementById].filter(([, management]) => management.status === 'active'));
    topology.participantManagement.forEach((management, index) => {
        if (!accountIds.has(management.accountId)) {
            addTopologyIssue(context, ['participantManagement', index, 'accountId'], 'Participant management references an unknown Account');
        }
        if (!participantIds.has(management.participantId)) {
            addTopologyIssue(context, ['participantManagement', index, 'participantId'], 'Participant management references an unknown Participant');
        }
    });
    const activeByParticipant = new Map();
    for (const management of activeManagementById.values()) {
        const current = activeByParticipant.get(management.participantId) ?? [];
        current.push(management);
        activeByParticipant.set(management.participantId, current);
    }
    topology.participants.forEach((participant, index) => {
        const activeManagement = activeByParticipant.get(participant.participantId) ?? [];
        if (participant.management.kind === 'unmanaged_guest') {
            if (activeManagement.length > 0) {
                addTopologyIssue(context, ['participants', index, 'management'], 'An unmanaged guest cannot have active Participant management');
            }
            return;
        }
        const selected = activeManagementById.get(participant.management.participantManagementId);
        if (!selected || selected.participantId !== participant.participantId) {
            addTopologyIssue(context, ['participants', index, 'management', 'participantManagementId'], 'A managed Participant must reference its active management relationship');
        }
        if (activeManagement.length !== 1) {
            addTopologyIssue(context, ['participants', index, 'management'], 'A managed Participant must have exactly one active owner relationship');
        }
    });
    topology.activeOwnerGuards.forEach((guard, index) => {
        const management = activeManagementById.get(guard.participantManagementId);
        if (!management ||
            management.participantId !== guard.participantId ||
            management.accountId !== guard.accountId ||
            management.revision !== guard.managementRevision) {
            addTopologyIssue(context, ['activeOwnerGuards', index], 'Active owner guard must match one active management relationship and revision');
        }
    });
    for (const management of activeManagementById.values()) {
        const matchingGuards = topology.activeOwnerGuards.filter((guard) => guard.participantManagementId === management.participantManagementId);
        if (matchingGuards.length !== 1) {
            const index = topology.participantManagement.indexOf(management);
            addTopologyIssue(context, ['participantManagement', index], 'Every active management relationship must have exactly one active owner guard');
        }
    }
    const activeRelationshipPairs = new Set();
    topology.instructorRelationships.forEach((relationship, index) => {
        if (!participantIds.has(relationship.participantId)) {
            addTopologyIssue(context, ['instructorRelationships', index, 'participantId'], 'Instructor Relationship references an unknown Participant');
        }
        if (relationship.basis.kind === 'guardian_permission') {
            const management = managementById.get(relationship.basis.participantManagementId);
            if (!management ||
                management.participantId !== relationship.participantId ||
                management.accountId !== relationship.basis.grantedByAccountId ||
                (relationship.status === 'active' && management.status !== 'active')) {
                addTopologyIssue(context, ['instructorRelationships', index, 'basis'], 'Guardian permission must name the matching Participant manager and Account');
            }
        }
        if (relationship.basis.kind === 'administration_assignment' &&
            !accountIds.has(relationship.basis.assignedByAccountId)) {
            addTopologyIssue(context, ['instructorRelationships', index, 'basis', 'assignedByAccountId'], 'Administration assignment references an unknown Account actor');
        }
        if (relationship.status === 'revoked') {
            if (relationship.revokedBy.kind === 'administrator' &&
                !accountIds.has(relationship.revokedBy.accountId)) {
                addTopologyIssue(context, ['instructorRelationships', index, 'revokedBy', 'accountId'], 'Relationship revocation references an unknown Administrator Account actor');
            }
            if (relationship.revokedBy.kind === 'participant_manager') {
                const management = managementById.get(relationship.revokedBy.participantManagementId);
                if (!management ||
                    management.participantId !== relationship.participantId ||
                    management.accountId !== relationship.revokedBy.accountId) {
                    addTopologyIssue(context, ['instructorRelationships', index, 'revokedBy'], 'Relationship revocation must name the Participant manager and Account actor');
                }
            }
        }
        if (relationship.status === 'active') {
            const pair = `${relationship.participantId}\u0000${relationship.instructorId}`;
            if (activeRelationshipPairs.has(pair)) {
                addTopologyIssue(context, ['instructorRelationships', index], 'A Participant and Instructor can have only one active relationship');
            }
            activeRelationshipPairs.add(pair);
        }
    });
    const activeBlockKeys = new Set();
    topology.participantBlocks.forEach((block, index) => {
        if (!participantIds.has(block.participantId)) {
            addTopologyIssue(context, ['participantBlocks', index, 'participantId'], 'Participant Block references an unknown Participant');
        }
        if (block.createdBy.kind === 'participant_manager') {
            const management = managementById.get(block.createdBy.participantManagementId);
            if (!management ||
                management.participantId !== block.participantId ||
                management.accountId !== block.createdBy.accountId ||
                (block.status === 'active' && management.status !== 'active')) {
                addTopologyIssue(context, ['participantBlocks', index, 'createdBy'], 'Manager block creator must match the Participant management relationship and Account');
            }
        }
        if (block.status === 'active') {
            const key = `${block.createdBy.kind}\u0000${block.participantId}\u0000${block.instructorId}`;
            if (activeBlockKeys.has(key)) {
                addTopologyIssue(context, ['participantBlocks', index], 'Duplicate active Participant Block direction and subjects');
            }
            activeBlockKeys.add(key);
        }
    });
});
function evaluateParticipantManagementAccess(topology, request) {
    const account = topology.accounts.find((candidate) => candidate.accountId === request.accountId);
    if (!account)
        return { allowed: false, reason: 'unauthorized' };
    if (account.lifecycle.status !== 'active') {
        return { allowed: false, reason: 'account_inactive' };
    }
    const participant = topology.participants.find((candidate) => candidate.participantId === request.participantId);
    if (!participant)
        return { allowed: false, reason: 'unauthorized' };
    if (participant.lifecycle.status !== 'active') {
        return { allowed: false, reason: 'participant_inactive' };
    }
    if (participant.management.kind !== 'managed') {
        return { allowed: false, reason: 'unauthorized' };
    }
    const participantManagementId = participant.management.participantManagementId;
    const management = topology.participantManagement.find((candidate) => candidate.status === 'active' &&
        candidate.participantManagementId === participantManagementId &&
        candidate.accountId === request.accountId &&
        candidate.participantId === request.participantId);
    if (!management)
        return { allowed: false, reason: 'unauthorized' };
    return {
        allowed: true,
        authority: management.authority,
        participantManagementId: management.participantManagementId,
    };
}
function addCanonicalMonths(timestamp, months) {
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
    return (0, primitives_1.timestampFromDate)(new Date(Date.UTC(targetYear, normalizedMonth, targetDay, utcHours, utcMinutes, utcSeconds, utcMilliseconds)));
}
function instructorRelationshipExpiresAt(validFrom) {
    return addCanonicalMonths(validFrom, 12);
}
function isParticipantInstructorPairBlockedForNewService(topology, request) {
    return topology.participantBlocks.some((block) => block.status === 'active' &&
        block.participantId === request.participantId &&
        block.instructorId === request.instructorId);
}
function sanitizeParticipantProfileForInstructor(participant) {
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
function evaluateInstructorParticipantAccess(topology, request) {
    const participant = topology.participants.find((candidate) => candidate.participantId === request.participantId);
    if (!participant)
        return { allowed: false, reason: 'unauthorized' };
    if (participant.lifecycle.status !== 'active') {
        return { allowed: false, reason: 'participant_inactive' };
    }
    const relationship = topology.instructorRelationships.find((candidate) => candidate.status === 'active' &&
        candidate.participantId === request.participantId &&
        candidate.instructorId === request.instructorId &&
        (0, primitives_1.compareCanonicalTimestamps)(candidate.validFrom, request.at) <= 0 &&
        (0, primitives_1.compareCanonicalTimestamps)(request.at, candidate.expiresAt) < 0);
    const blocked = topology.participantBlocks.some((block) => block.status === 'active' &&
        block.participantId === request.participantId &&
        block.instructorId === request.instructorId);
    if (relationship && !blocked)
        return { allowed: true, scope: 'relationship' };
    const scopedEvidence = request.bookingScopedEvidence.find((evidence) => evidence.participantId === request.participantId &&
        evidence.instructorId === request.instructorId &&
        (0, primitives_1.compareCanonicalTimestamps)(evidence.validFrom, request.at) <= 0 &&
        (0, primitives_1.compareCanonicalTimestamps)(request.at, evidence.validUntil) < 0);
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
