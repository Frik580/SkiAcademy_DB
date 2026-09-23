import {
  AccountIdSchema,
  CourseCatalogContentInputSchema,
  resolveManifestDayInterval,
  CourseProvisioningManifestSchema,
  parsePersistedCanonicalScope,
  type CourseProvisioningManifest,
} from '@ski-academy/shared-domain';
import { parseAccount } from '../canonical/finance/financeStore';
import { parseCourse, parseCourseDay } from '../canonical/courses/courseStore';
import { parseCourseCatalogContent } from '../canonical/courses/courseCatalogContentStore';
import { parseInstructorCatalog } from '../canonical/bookings/bookingStore';
import { parseLessonPricingSettings } from '../canonical/pricing/lessonPricingSettingsStore';
import {
  buildOperation,
  changedFields,
  sortOperations,
  stableHash,
  validateSourcePayload,
  type ConfigPromotionManifest,
  type PromotionMediaReference,
  type PromotionOperation,
  type PromotionSourceDocument,
} from './configPromotionContract';

export interface PromotionTargetState {
  readonly documents: Readonly<Record<string, Record<string, unknown> | undefined>>;
  readonly courseDaysById: Readonly<Record<string, readonly Record<string, unknown>[] | undefined>>;
  readonly mediaHashes: Readonly<Record<string, string | undefined>>;
  readonly mediaVersions?: Readonly<Record<string, string | undefined>>;
  readonly mediaUrlReady?: Readonly<Record<string, boolean | undefined>>;
}

export interface PromotionPlan {
  readonly operations: readonly PromotionOperation[];
  readonly manifestHash: string;
  readonly hasConflicts: boolean;
}

export function planConfigPromotion(
  manifest: ConfigPromotionManifest,
  target: PromotionTargetState
): PromotionPlan {
  const operations: PromotionOperation[] = [];
  const instructors = new Map(manifest.mappings.instructors.map((item) => [item.stagingInstructorId, item]));
  const courses = new Map(manifest.mappings.courses.map((item) => [item.stagingCourseId, item]));
  for (const record of manifest.sourceDocuments) {
    if (record.kind !== 'instructor') continue;
    if (!record.selected) {
      operations.push(buildOperation({
        kind: 'instructor', logicalKey: record.logicalKey, targetPath: record.sourcePath,
        status: 'SKIP', changedFields: [], sourceHash: record.sourceHash,
        reason: 'not_selected', dependencyOrder: 30,
      }));
      continue;
    }
    const mapping = instructors.get(record.sourceId);
    const productionInstructorId = mapping?.productionInstructorId;
    const productionAccountId = mapping?.productionAccountId;
    const targetInstructorPath = productionInstructorId ? `instructors/${productionInstructorId}` : `instructors/${record.logicalKey}`;
    const targetCatalog = productionInstructorId
      ? target.documents[targetInstructorPath]
      : undefined;
    const accountPath = productionAccountId ? `users/${productionAccountId}` : undefined;
    const targetAccount = accountPath ? target.documents[accountPath] : undefined;
    let identityConflict: string | undefined;
    if (record.issues?.length) identityConflict = record.issues.join(',');
    else if (!mapping?.productionInstructorId || !mapping.productionAccountId) {
      identityConflict = 'production_identity_mapping_required';
    } else if (!targetCatalog || !targetAccount) {
      identityConflict = 'production_identity_bootstrap_required';
    } else if (
      !productionInstructorId ||
      !productionAccountId ||
      !targetCatalog ||
      !targetAccount ||
      !isCompatibleProductionIdentity(targetCatalog, targetAccount, productionInstructorId, productionAccountId)
    ) {
      identityConflict = 'production_identity_mapping_conflict';
    }

    if (mapping && mapping.logicalKey !== record.logicalKey) identityConflict = 'instructor_logical_mapping_conflict';
    if (identityConflict || !mapping || !productionInstructorId || !productionAccountId || !targetCatalog) {
      operations.push(buildOperation({
        kind: 'instructor',
        logicalKey: record.logicalKey,
        targetPath: targetInstructorPath,
        status: 'CONFLICT',
        changedFields: [],
        sourceHash: record.sourceHash,
        ...(targetCatalog ? { targetHash: stableHash(publicInstructorProjection(targetCatalog)) } : {}),
        targetPreconditionHash: stableHash({ instructor: targetCatalog ?? null, account: targetAccount ?? null }),
        reason: identityConflict ?? 'production_identity_mapping_required',
        dependencyOrder: 2,
      }));
      continue;
    }

    const sourceProfile = record.payload as Record<string, unknown>;
    const targetProfile = publicInstructorProjection(targetCatalog);
    const normalizedTarget = normalizeTargetMedia(
      targetProfile,
      sourceProfile,
      manifest.media,
      'instructor',
      record.logicalKey,
      productionInstructorId,
      undefined,
      target.mediaHashes
    );
    const profileFields = changedFields(sourceProfile, normalizedTarget);
    const profileStatus = profileFields.length ? 'UPDATE' : 'UNCHANGED';
    operations.push(buildOperation({
      kind: 'instructor',
      logicalKey: record.logicalKey,
      targetPath: targetInstructorPath,
      status: profileStatus,
      changedFields: profileFields,
      sourceHash: stableHash(sourceProfile),
      targetHash: stableHash(normalizedTarget),
      targetPreconditionHash: stableHash({ instructor: targetCatalog, account: targetAccount }),
      dependencyOrder: 2,
    }));

    const currentLinkedAccount = stringField(targetCatalog, 'linkedAccountId');
    const currentReverseInstructor = stringField(targetAccount, 'instructorId');
    const isLinked = currentLinkedAccount === productionAccountId && currentReverseInstructor === productionInstructorId;
    const isUnlinked = !currentLinkedAccount && !currentReverseInstructor;
    operations.push(buildOperation({
      kind: 'instructor_link',
      logicalKey: record.logicalKey,
      targetPath: targetInstructorPath,
      status: isLinked ? 'UNCHANGED' : isUnlinked ? 'UPDATE' : 'CONFLICT',
      changedFields: isLinked ? [] : ['Account.instructorId', 'Instructor.linkedAccountId'],
      sourceHash: stableHash({ productionInstructorId, productionAccountId }),
      targetHash: stableHash({ currentLinkedAccount, currentReverseInstructor }),
      targetPreconditionHash: stableHash({ instructor: targetCatalog, account: targetAccount }),
      ...(!isLinked && !isUnlinked ? { reason: 'production_identity_mapping_conflict' } : {}),
      dependencyOrder: 1,
    }));
  }

  for (const record of manifest.sourceDocuments) {
    if (record.kind !== 'course') continue;
    if (!record.selected) {
      operations.push(buildOperation({
        kind: 'course', logicalKey: record.logicalKey, targetPath: record.sourcePath,
        status: 'SKIP', changedFields: [], sourceHash: record.sourceHash,
        reason: 'not_selected', dependencyOrder: 10,
      }));
      continue;
    }
    const mapping = courses.get(record.sourceId);
    const targetCourseId = mapping?.productionCourseId ?? mapping?.stagingCourseId;
    const targetPath = targetCourseId ? `courses/${targetCourseId}` : `courses/${record.logicalKey}`;
    let conflictReason = record.issues?.join(',');
    if (!mapping || mapping.logicalKey !== record.logicalKey) conflictReason = 'course_logical_mapping_required';
    const sourceManifest = record.payload as CourseProvisioningManifest;
    const mappedManifest = targetCourseId
      ? mapCourseManifest(sourceManifest, targetCourseId, instructors)
      : undefined;
    if (!conflictReason && !mappedManifest) conflictReason = 'instructor_identity_mapping_required';
    if (!conflictReason) {
      const roster = sourceManifest.instructorRosterIds;
      for (const sourceInstructorId of roster) {
        const instructorMapping = instructors.get(sourceInstructorId);
        const prodInstructorId = instructorMapping?.productionInstructorId;
        const prodAccountId = instructorMapping?.productionAccountId;
        const instructorData = prodInstructorId ? target.documents[`instructors/${prodInstructorId}`] : undefined;
        const accountData = prodAccountId ? target.documents[`users/${prodAccountId}`] : undefined;
        if (!prodInstructorId || !prodAccountId || !instructorData || !accountData ||
            !isCompatibleProductionIdentity(instructorData, accountData, prodInstructorId, prodAccountId)) {
          conflictReason = 'production_instructor_identity_bootstrap_required';
          break;
        }
        if (instructorData.isAvailable === false) {
          conflictReason = 'production_instructor_unavailable';
          break;
        }
      }
    }

    const existingRaw = targetCourseId ? target.documents[targetPath] : undefined;
    const existingCourse = parseCourse(existingRaw);
    if (existingRaw && isTestOrMalformedScope(existingRaw)) conflictReason = 'target_course_not_live_or_invalid';
    if (existingRaw && !existingCourse) conflictReason = 'target_course_shape_conflict';
    const targetDaysRaw = targetCourseId ? target.courseDaysById[targetCourseId] ?? [] : [];
    const currentCore = existingCourse
      ? courseCoreFromTarget(existingCourse, targetDaysRaw)
      : undefined;
    const expectedCore = mappedManifest ? courseCoreFromManifest(mappedManifest) : undefined;
    const coreTargetHash = currentCore ? stableHash(currentCore) : undefined;

    if (!conflictReason && existingCourse && existingCourse.lifecycle !== 'active') {
      conflictReason = 'target_course_not_active';
    }
    if (!conflictReason && existingCourse && (!currentCore || !expectedCore)) {
      conflictReason = 'course_schedule_projection_conflict';
    }
    if (!conflictReason && existingCourse && currentCore && expectedCore && stableHash(currentCore) !== stableHash(expectedCore)) {
      conflictReason = 'existing_course_core_change_requires_separate_workflow';
    }
    if (!conflictReason && !existingCourse && targetDaysRaw.length > 0) {
      conflictReason = 'orphan_production_course_days';
    }

    operations.push(buildOperation({
      kind: 'course',
      logicalKey: record.logicalKey,
      targetPath,
      status: conflictReason ? 'CONFLICT' : existingCourse ? 'UNCHANGED' : 'CREATE',
      changedFields: conflictReason ? [] : existingCourse ? [] : ['course', 'days', 'resource_claims'],
      sourceHash: expectedCore ? stableHash(expectedCore) : record.sourceHash,
      ...(coreTargetHash ? { targetHash: coreTargetHash } : {}),
      targetPreconditionHash: stableHash({ course: existingRaw ?? null, days: targetDaysRaw }),
      ...(conflictReason ? { reason: conflictReason } : {}),
      dependencyOrder: 10,
    }));
  }

  for (const record of manifest.sourceDocuments) {
    if (record.kind === 'course' || record.kind === 'instructor') continue;
    if (!record.selected) {
      operations.push(buildOperation({
        kind: record.kind, logicalKey: record.logicalKey, targetPath: record.sourcePath,
        status: 'SKIP', changedFields: [], sourceHash: record.sourceHash,
        reason: 'not_selected', dependencyOrder: 50,
      }));
      continue;
    }
    if (record.kind === 'course_catalog_content') {
      const mapping = courses.get(record.sourceId);
      const targetCourseId = mapping?.productionCourseId ?? mapping?.stagingCourseId;
      const targetCourse = targetCourseId ? target.documents[`courses/${targetCourseId}`] : undefined;
      const targetPath = targetCourseId
        ? `course_catalog_content/${targetCourseId}`
        : `course_catalog_content/${record.logicalKey}`;
      const targetRaw = targetPath ? target.documents[targetPath] : undefined;
      const issues = record.issues?.join(',');
      const payload = record.payload as Record<string, unknown>;
      let reason = issues;
      if (!mapping || mapping.logicalKey !== record.logicalKey) reason = 'course_logical_mapping_required';
      else if (!targetCourse && !operations.some((operation) =>
        operation.kind === 'course' && operation.logicalKey === mapping.logicalKey && operation.status === 'CREATE')) {
        reason = 'production_course_required_before_catalog_content';
      }
      else if (targetCourse && isTestOrMalformedScope(targetCourse)) reason = 'target_course_not_live_or_invalid';
      else if (targetCourse && targetCourse.lifecycle !== 'active') reason = 'target_course_not_active';
      else if (targetRaw && isTestOrMalformedScope(targetRaw)) reason = 'target_catalog_content_not_live';
      else if (targetRaw && !parseCourseCatalogContent(targetRaw, targetCourseId)) reason = 'target_catalog_content_shape_conflict';
      else if (targetRaw && !CourseCatalogContentInputSchema.safeParse(catalogContentProjection(targetRaw)).success) reason = 'target_catalog_content_shape_conflict';
      const expected = normalizeCourseContentForTarget(payload, targetCourseId);
      const current = targetRaw ? catalogContentProjection(targetRaw) : undefined;
      const normalizedCurrent = current
        ? normalizeTargetMedia(current, expected, manifest.media, 'course', mapping?.logicalKey ?? '', targetCourseId, undefined, target.mediaHashes)
        : undefined;
      const fields = changedFields(expected, normalizedCurrent);
      operations.push(buildOperation({
        kind: 'course_catalog_content',
        logicalKey: record.logicalKey,
        targetPath,
        status: reason ? 'CONFLICT' : fields.length ? (targetRaw ? 'UPDATE' : 'CREATE') : 'UNCHANGED',
        changedFields: reason ? [] : fields,
        sourceHash: stableHash(expected),
        ...(normalizedCurrent ? { targetHash: stableHash(normalizedCurrent) } : {}),
        targetPreconditionHash: stableHash(targetRaw ?? null),
        ...(reason ? { reason } : {}),
        dependencyOrder: 40,
      }));
      continue;
    }

    if (record.issues?.length) {
      operations.push(buildOperation({
        kind: record.kind,
        logicalKey: record.logicalKey,
        targetPath: record.sourcePath,
        status: 'CONFLICT',
        changedFields: [],
        sourceHash: record.sourceHash,
        reason: record.issues.join(','),
        dependencyOrder: 50,
      }));
      continue;
    }
    const source = record.payload as Record<string, unknown>;
    const targetPath = record.sourcePath;
    const raw = target.documents[targetPath];
    if (raw && isTestOrMalformedScope(raw)) {
      operations.push(buildOperation({
        kind: record.kind,
        logicalKey: record.logicalKey,
        targetPath,
        status: 'CONFLICT',
        changedFields: [],
        sourceHash: stableHash(source),
        reason: 'target_config_not_live',
        dependencyOrder: 50,
      }));
      continue;
    }
    const current = raw ? configProjection(record.kind, raw) : undefined;
    let targetShapeConflict = false;
    if (raw && current) {
      try {
        validateSourcePayload({ ...record, payload: current, sourceHash: stableHash(current) } as PromotionSourceDocument);
      } catch {
        targetShapeConflict = true;
      }
    }
    const comparable = current
      ? normalizeTargetMedia(current, source, manifest.media, record.kind === 'resort_slides' ? 'resort' : 'course', record.logicalKey, undefined, undefined, target.mediaHashes)
      : undefined;
    const fields = changedFields(source, comparable);
    operations.push(buildOperation({
      kind: record.kind,
      logicalKey: record.logicalKey,
      targetPath,
      status: targetShapeConflict ? 'CONFLICT' : fields.length ? (raw ? 'UPDATE' : 'CREATE') : 'UNCHANGED',
      changedFields: targetShapeConflict ? [] : fields,
      sourceHash: stableHash(source),
      ...(comparable ? { targetHash: stableHash(comparable) } : {}),
      targetPreconditionHash: stableHash(raw ?? null),
      ...(targetShapeConflict ? { reason: 'target_config_shape_conflict' } : {}),
      dependencyOrder: 50,
    }));
  }

  for (const media of manifest.media) {
    const ownerRecord = manifest.sourceDocuments.find((item) =>
      item.logicalKey === media.ownerLogicalKey &&
      (media.ownerKind === 'resort' ? item.kind === 'resort_slides' : item.kind === media.ownerKind || (media.ownerKind === 'course' && item.kind === 'course_catalog_content'))
    );
    if (!ownerRecord?.selected || ownerRecord.issues?.length) {
      operations.push(buildOperation({
        kind: 'media', logicalKey: media.mediaKey, targetPath: `media/${media.mediaKey}`,
        status: 'SKIP', changedFields: [], sourceHash: media.sha256,
        reason: ownerRecord?.issues?.length ? 'owner_source_conflict' : 'owner_not_selected', dependencyOrder: 5,
      }));
      continue;
    }
    const targetPath = destinationMediaPath(media, manifest);
    if (!targetPath) {
      operations.push(buildOperation({
        kind: 'media',
        logicalKey: media.mediaKey,
        targetPath: `media/${media.mediaKey}`,
        status: 'CONFLICT',
        changedFields: [],
        sourceHash: media.sha256,
        reason: 'target_media_mapping_required',
        dependencyOrder: 5,
      }));
      continue;
    }
    const targetHash = target.mediaHashes[targetPath];
    const ready = target.mediaUrlReady?.[targetPath] !== false;
    const status = targetHash === undefined ? 'CREATE' : targetHash === media.sha256 && ready ? 'UNCHANGED' : 'UPDATE';
    operations.push(buildOperation({
      kind: 'media',
      logicalKey: media.mediaKey,
      targetPath,
      status,
      changedFields: status === 'UNCHANGED' ? [] : targetHash === media.sha256 ? ['download_token'] : ['binary'],
      sourceHash: media.sha256,
      ...(targetHash ? { targetHash } : {}),
      targetPreconditionHash: stableHash({ hash: targetHash ?? null, generation: target.mediaVersions?.[targetPath] ?? null, ready }),
      dependencyOrder: media.ownerKind === 'instructor' ? 0 : 5,
    }));
  }

  const ordered = sortOperations(operations);
  return {
    operations: ordered,
    manifestHash: stableHash({
      schemaVersion: manifest.schemaVersion,
      sourceProjectId: manifest.sourceProjectId,
      sourceDocuments: manifest.sourceDocuments.map(({ sourcePath, sourceHash }) => ({ sourcePath, sourceHash })),
      mappings: manifest.mappings,
      media: manifest.media.map(({ mediaKey, sha256 }) => ({ mediaKey, sha256 })),
    }),
    hasConflicts: ordered.some((item) => item.status === 'CONFLICT'),
  };
}

export function configProjection(kind: PromotionSourceDocument['kind'], raw: Record<string, unknown>): Record<string, unknown> {
  switch (kind) {
    case 'lesson_pricing_settings': {
      const parsed = parseLessonPricingSettings(raw);
      return parsed
        ? {
            additionalParticipantSurchargePerHourKzt: parsed.additionalParticipantSurchargePerHourKzt,
            maxParticipantsPerLesson: parsed.maxParticipantsPerLesson,
          }
        : {};
    }
    case 'skill_config':
      return pick(raw, ['passPercentage', 'items']);
    case 'achievements_config':
      return pick(raw, ['items']);
    case 'instructor_filters':
      return pick(raw, ['enabled']);
    case 'resort_slides':
      return pick(raw, ['slides', 'slideIntervalSeconds', 'slidesRandomOrder']);
    case 'instructor':
      return publicInstructorProjection(raw);
    case 'course':
      return raw;
    case 'course_catalog_content':
      return catalogContentProjection(raw);
  }
}

export function publicInstructorProjection(raw: Record<string, unknown>): Record<string, unknown> {
  return pick(raw, [
    'name', 'specialty', 'languages', 'experienceYears', 'bio', 'avatarUrl', 'pricePerHourKZT',
  ]);
}

export function catalogContentProjection(raw: Record<string, unknown>): Record<string, unknown> {
  return pick(raw, [
    'duration', 'description', 'dates', 'bgImageUrl', 'isHidden', 'order', 'titleRu',
    'shortDescription', 'shortDescriptionRu', 'detailedDescription', 'detailedDescriptionRu',
    'badge', 'badgeRu', 'level', 'levelLabel', 'videoUrl', 'benefits', 'benefitsRu',
    'program', 'programRu', 'faq', 'faqRu', 'galleryPhotos',
  ]);
}

function pick(raw: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(raw, key)).map((key) => [key, raw[key]]));
}

function isTestOrMalformedScope(raw: Record<string, unknown>): boolean {
  if (raw.testSessionId !== undefined) return true;
  try {
    return parsePersistedCanonicalScope(raw, { allowLegacyLive: true }).dataScope !== 'live';
  } catch {
    return true;
  }
}

function stringField(raw: Record<string, unknown> | undefined, field: string): string | undefined {
  return typeof raw?.[field] === 'string' ? raw[field] as string : undefined;
}

function isCompatibleProductionIdentity(
  instructor: Record<string, unknown>,
  accountData: Record<string, unknown>,
  instructorId: string,
  accountId: string
): boolean {
  const instructorParsed = parseInstructorCatalog(instructorId, instructor);
  const account = parseAccount(accountData);
  if (!instructorParsed || !account || account.accountId !== AccountIdSchema.parse(accountId)) return false;
  if (isTestOrMalformedScope(instructor)) return false;
  if (account.lifecycle.status !== 'active' || isTestOrMalformedScope(accountData)) return false;
  const catalogLink = stringField(instructor, 'linkedAccountId');
  const reverseLink = stringField(accountData, 'instructorId');
  return (!catalogLink || catalogLink === accountId) && (!reverseLink || reverseLink === instructorId);
}

function mapCourseManifest(
  source: CourseProvisioningManifest,
  targetCourseId: string,
  mappings: ReadonlyMap<string, ConfigPromotionManifest['mappings']['instructors'][number]>
): CourseProvisioningManifest | undefined {
  const mappedInstructorId = (sourceId: string): string | undefined => mappings.get(sourceId)?.productionInstructorId;
  const instructorRosterIds = source.instructorRosterIds.map(mappedInstructorId);
  const days = source.days.map((day) => ({ ...day, instructorId: mappedInstructorId(day.instructorId) }));
  if (instructorRosterIds.some((id) => !id) || days.some((day) => !day.instructorId)) return undefined;
  const mapped = {
    ...source,
    courseId: targetCourseId,
    instructorRosterIds,
    days,
    presentation: undefined,
  };
  const cleaned = Object.fromEntries(Object.entries(mapped).filter(([, value]) => value !== undefined));
  const parsed = CourseProvisioningManifestSchema.safeParse(cleaned);
  return parsed.success ? parsed.data : undefined;
}

function courseCoreFromManifest(manifest: CourseProvisioningManifest): Record<string, unknown> {
  return {
    courseId: manifest.courseId,
    title: manifest.title,
    price: manifest.price,
    totalSeats: manifest.totalSeats,
    instructorRosterIds: [...manifest.instructorRosterIds],
    timeZone: manifest.timeZone,
    days: [...manifest.days]
      .sort((left, right) => left.dayOrder - right.dayOrder)
      .map((day) => ({
        courseDayId: day.courseDayId,
        dayOrder: day.dayOrder,
        localDate: day.localDate,
        localTime: day.localTime,
        durationMinutes: day.durationMinutes,
        instructorId: day.instructorId,
      })),
  };
}

export function courseCoreFromTarget(
  course: NonNullable<ReturnType<typeof parseCourse>>,
  rawDays: readonly Record<string, unknown>[]
): Record<string, unknown> | undefined {
  const days = rawDays.map((raw) => parseCourseDay(raw));
  if (days.some((day) => !day || day.dataScope === 'test' || day.testSessionId)) return undefined;
  const typedDays = days.filter((day): day is NonNullable<typeof day> => day !== undefined);
  if (typedDays.length !== course.scheduleProjection.courseDayCount) return undefined;
  if (typedDays.some((day) => day.timeZone !== typedDays[0]?.timeZone)) return undefined;
  const normalizedDays = typedDays
    .sort((left, right) => left.dayOrder - right.dayOrder)
    .map((day) => {
      if (day.actualInstructorIds.length !== 1) return undefined;
      const start = localTimeParts(day.interval.startsAt.seconds, day.timeZone);
      const durationMs =
        (day.interval.endsAt.seconds - day.interval.startsAt.seconds) * 1000 +
        (day.interval.endsAt.nanoseconds - day.interval.startsAt.nanoseconds) / 1_000_000;
      const durationMinutes = durationMs / 60_000;
      if (!Number.isInteger(durationMinutes)) return undefined;
      const manifestDay = {
        courseDayId: day.courseDayId,
        dayOrder: day.dayOrder,
        localDate: start.date,
        localTime: start.time,
        durationMinutes,
        instructorId: day.actualInstructorIds[0],
      };
      const resolved = resolveManifestDayInterval(manifestDay, day.timeZone).interval;
      if (
        resolved.startsAt.seconds !== day.interval.startsAt.seconds ||
        resolved.startsAt.nanoseconds !== day.interval.startsAt.nanoseconds ||
        resolved.endsAt.seconds !== day.interval.endsAt.seconds ||
        resolved.endsAt.nanoseconds !== day.interval.endsAt.nanoseconds
      ) return undefined;
      return manifestDay;
    });
  if (normalizedDays.some((day) => !day)) return undefined;
  return {
    courseId: course.courseId,
    title: course.title,
    price: course.price,
    totalSeats: course.capacity.totalSeats,
    instructorRosterIds: [...course.instructorRosterIds],
    timeZone: typedDays[0]?.timeZone,
    days: normalizedDays,
  };
}

function localTimeParts(epochSeconds: number, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochSeconds * 1000));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const hour = value('hour');
  const minute = value('minute');
  if (!year || !month || !day || !hour || !minute) throw new Error('PROMOTION: cannot normalize CourseDay time');
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

function normalizeCourseContentForTarget(payload: Record<string, unknown>, targetCourseId: string | undefined): Record<string, unknown> {
  void targetCourseId;
  return { ...payload };
}

export function destinationMediaPath(
  media: PromotionMediaReference,
  manifest: ConfigPromotionManifest
): string | undefined {
  if (media.ownerKind === 'instructor') {
    const mapping = manifest.mappings.instructors.find((item) => item.logicalKey === media.ownerLogicalKey);
    return mapping?.productionInstructorId ? `instructors/${mapping.productionInstructorId}.jpg` : undefined;
  }
  if (media.ownerKind === 'course') {
    const mapping = manifest.mappings.courses.find((item) => item.logicalKey === media.ownerLogicalKey);
    const courseId = mapping?.productionCourseId ?? mapping?.stagingCourseId;
    return courseId ? `courses/${courseId}.webp` : undefined;
  }
  return destinationResortMediaPath(media);
}

function destinationResortMediaPath(media: PromotionMediaReference): string {
  const extension = media.contentType === 'image/png' ? 'png' : media.contentType === 'image/jpeg' ? 'jpg' : 'webp';
  return `promotion-assets/config/${media.sha256}-${stableHash(media.mediaKey)}.${extension}`;
}

function normalizeTargetMedia(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  mediaReferences: readonly PromotionMediaReference[],
  ownerKind: PromotionMediaReference['ownerKind'],
  ownerLogicalKey: string,
  productionInstructorId: string | undefined,
  productionCourseId: string | undefined,
  targetMediaHashes: Readonly<Record<string, string | undefined>>
): Record<string, unknown> {
  const normalized = { ...target };
  for (const media of mediaReferences) {
    if (media.ownerKind !== ownerKind || media.ownerLogicalKey !== ownerLogicalKey) continue;
    const expected = getPathValue(source, media.fieldPath);
    const current = getPathValue(target, media.fieldPath);
    if (typeof expected !== 'string' || !expected.startsWith('promotion-media://') || typeof current !== 'string') continue;
    const destPath = ownerKind === 'instructor' && productionInstructorId
      ? `instructors/${productionInstructorId}.jpg`
      : ownerKind === 'course' && productionCourseId
        ? `courses/${productionCourseId}.webp`
        : ownerKind === 'resort'
          ? destinationResortMediaPath(media)
          : undefined;
    if (!destPath) continue;
    const parsed = parseFirebaseStorageUrl(current);
    if (parsed?.objectPath === destPath && targetMediaHashes[destPath] === media.sha256) {
      setPathValue(normalized, media.fieldPath, expected);
    }
  }
  return normalized;
}

function parseFirebaseStorageUrl(value: string): { bucket: string; objectPath: string } | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== 'firebasestorage.googleapis.com') return undefined;
    const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(parsed.pathname);
    if (!match) return undefined;
    return { bucket: decodeURIComponent(match[1]!), objectPath: decodeURIComponent(match[2]!) };
  } catch {
    return undefined;
  }
}

function getPathValue(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (Array.isArray(current)) return current[Number(key)];
    return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined;
  }, value);
}

function setPathValue(value: Record<string, unknown>, path: string, replacement: unknown): void {
  const keys = path.split('.');
  let cursor: Record<string, unknown> | unknown[] = value;
  for (const key of keys.slice(0, -1)) {
    const next = Array.isArray(cursor) ? cursor[Number(key)] : cursor[key];
    if (!next || typeof next !== 'object') return;
    cursor = next as Record<string, unknown> | unknown[];
  }
  const key = keys[keys.length - 1]!;
  if (Array.isArray(cursor)) cursor[Number(key)] = replacement;
  else cursor[key] = replacement;
}
