import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ADMIN_COURSE_READ_MODEL_PAGE_SIZE_MAX,
  CourseCatalogContentInputSchema,
  CourseIdSchema,
  CourseProvisioningManifestSchema,
  IdempotencyKeySchema,
  type AdminCourseListItem,
  type AdminCourseReadModel,
  type CommandEnvelope,
  type CommandKind,
  type CourseCatalogContentInput,
} from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from '../../../../lib/canonical/canonicalCommandClient';
import { toCanonicalCommandClientError } from '../../../../lib/canonical/mapCanonicalCommandError';
import { ActionButton } from '../../../../ui/ActionButton';
import { queryAdminCourseReadModels } from '../../../../lib/canonical/canonicalReadModelClient';
import { useAdminIdentityReadModels } from '../../identity/useAdminIdentityReadModels';
import type { CanonicalCoursesManagerInput } from './adminCourseContracts';
import { useAdminCourseTranslations } from './useAdminCourseTranslations';
import { CoursesManagerToolbar } from './form/CoursesManagerToolbar';
import { CoursesTable } from './form/CoursesTable';
import { CourseBackgroundImageField } from './CourseBackgroundImageField';
import {
  catalogContentInputFromCourse,
  formatAdminCourseDayLocalDate,
  formatAdminCourseDaysScheduleDates,
  mapAdminCourseToTableCourse,
} from './adminCourseTableMapping';
import {
  buildArchiveCourseCommandFromListItem,
  buildReactivateCourseCommandFromListItem,
} from './adminCourseArchiveCommand';
import {
  buildCanonicalCourseCloneDraft,
  catalogContentInputFromCreateForm,
  type CanonicalCourseCloneDraft,
  type CanonicalCourseCreateFormState,
} from './adminCourseCloneDraft';
import {
  catalogContentInputsEqual,
  compactCourseCatalogContentInput,
} from './adminCourseCatalogWrite';
import type { Instructor } from '../../../../types';
import { localDateTimeFromTimestamp } from '../../operations/adminTimeZone';

function newIdentity(prefix: string): ReturnType<typeof IdempotencyKeySchema.parse> {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return IdempotencyKeySchema.parse(`${prefix}:${suffix}`);
}

type CreateFormState = CanonicalCourseCreateFormState;
type CourseLifecycleScope = AdminCourseListItem['lifecycle'];

interface CourseListState {
  readonly items: readonly AdminCourseListItem[];
  readonly cursor?: string;
  readonly hasMore: boolean;
  readonly loadingInitial: boolean;
  readonly loadingMore: boolean;
  readonly initialized: boolean;
  readonly error?: string;
}

const EMPTY_COURSE_LIST_STATE: CourseListState = {
  items: [],
  hasMore: false,
  loadingInitial: false,
  loadingMore: false,
  initialized: false,
};

function mergeCoursePages(
  previous: readonly AdminCourseListItem[],
  incoming: readonly AdminCourseListItem[]
): readonly AdminCourseListItem[] {
  const byId = new Map(previous.map((course) => [course.courseId, course]));
  for (const course of incoming) byId.set(course.courseId, course);
  return [...byId.values()];
}

interface CreateAttempt {
  readonly idempotencyKey: ReturnType<typeof IdempotencyKeySchema.parse>;
  readonly seed: string;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  title: '',
  titleRu: '',
  price: '',
  totalSeats: '10',
  timeZone: 'Asia/Almaty',
  roster: '',
  days: '',
  duration: '',
  description: '',
  dates: '',
  bgImageUrl: '',
  isHidden: false,
  order: '',
  shortDescription: '',
  shortDescriptionRu: '',
  detailedDescription: '',
  detailedDescriptionRu: '',
  badge: '',
  badgeRu: '',
  level: '',
  levelLabel: '',
  videoUrl: '',
  benefits: '',
  benefitsRu: '',
  program: '',
  programRu: '',
  faq: '',
  faqRu: '',
  galleryPhotos: '',
};

function formFromAuthoritativeDetail(course: AdminCourseReadModel): CreateFormState {
  const content = catalogContentInputFromCourse(course);
  const days = [...course.courseDays]
    .sort((left, right) => left.dayOrder - right.dayOrder)
    .map((day) => {
      const local = localDateTimeFromTimestamp(day.interval.startsAt.seconds, day.timeZone);
      const durationMinutes = Math.max(
        15,
        Math.round((day.interval.endsAt.seconds - day.interval.startsAt.seconds) / 60)
      );
      return `${local.date} ${local.time} ${durationMinutes} ${day.actualInstructorIds[0] ?? ''}`.trim();
    })
    .join('\n');
  return {
    ...EMPTY_CREATE_FORM,
    title: course.title,
    titleRu: content.titleRu ?? '',
    price: String(course.price),
    totalSeats: String(course.capacity.totalSeats),
    timeZone: course.courseDays[0]?.timeZone ?? EMPTY_CREATE_FORM.timeZone,
    roster: course.instructorRosterIds.join(','),
    days,
    duration: content.duration,
    description: content.description,
    dates: content.dates,
    bgImageUrl: content.bgImageUrl,
    isHidden: content.isHidden === true,
    order: content.order === undefined ? '' : String(content.order),
    shortDescription: content.shortDescription ?? '',
    shortDescriptionRu: content.shortDescriptionRu ?? '',
    detailedDescription: content.detailedDescription ?? '',
    detailedDescriptionRu: content.detailedDescriptionRu ?? '',
    badge: content.badge ?? '',
    badgeRu: content.badgeRu ?? '',
    level: content.level ?? '',
    levelLabel: content.levelLabel ?? '',
    videoUrl: content.videoUrl ?? '',
    benefits: content.benefits?.join('\n') ?? '',
    benefitsRu: content.benefitsRu?.join('\n') ?? '',
    program:
      content.program?.map((item) => `${item.day} | ${item.title} | ${item.desc}`).join('\n') ?? '',
    programRu:
      content.programRu?.map((item) => `${item.day} | ${item.title} | ${item.desc}`).join('\n') ??
      '',
    faq: content.faq?.map((item) => `${item.q} | ${item.a}`).join('\n') ?? '',
    faqRu: content.faqRu?.map((item) => `${item.q} | ${item.a}`).join('\n') ?? '',
    galleryPhotos: content.galleryPhotos?.join('\n') ?? '',
  };
}

export const CanonicalCoursesManager: React.FC<CanonicalCoursesManagerInput> = ({
  currentAccountId,
  onRequestConfirm,
  onOpenEnrollments,
}) => {
  const { language, t, text, actionLabel, commandError } = useAdminCourseTranslations();
  const [lifecycleScope, setLifecycleScope] = useState<CourseLifecycleScope>('active');
  const [courseLists, setCourseLists] = useState<Record<CourseLifecycleScope, CourseListState>>({
    active: EMPTY_COURSE_LIST_STATE,
    archived: EMPTY_COURSE_LIST_STATE,
  });
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<AdminCourseReadModel | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<'create' | 'clone'>('create');
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [editForm, setEditForm] = useState<CreateFormState | null>(null);
  const [editOriginal, setEditOriginal] = useState<AdminCourseReadModel | null>(null);
  const [editReason, setEditReason] = useState('');
  const [imageUploaderOpen, setImageUploaderOpen] = useState(false);
  const [courseDayDraft, setCourseDayDraft] = useState<{
    readonly kind: 'create_course_day' | 'reassign_course_day_instructor' | 'reschedule_course_day';
    readonly courseDayId?: string;
    readonly localDate: string;
    readonly localTime: string;
    readonly durationMinutes: string;
    readonly instructorId: string;
  } | null>(null);
  const createAttemptRef = useRef<CreateAttempt | null>(null);
  const cloneDraftRef = useRef<CanonicalCourseCloneDraft | null>(null);
  const commandInFlightRef = useRef(false);
  const detailRequestRef = useRef(0);
  const listRequestRef = useRef<Record<CourseLifecycleScope, number>>({ active: 0, archived: 0 });
  const instructorReads = useAdminIdentityReadModels({
    enabled: showCreate || selectedCourseId !== null,
    directory: 'instructors',
    search: '',
    pageSize: 50,
  });

  const loadCoursePage = useCallback(
    async (scope: CourseLifecycleScope, cursor?: string, append = false) => {
      const requestId = ++listRequestRef.current[scope];
      setCourseLists((previous) => ({
        ...previous,
        [scope]: {
          ...previous[scope],
          loadingInitial: !append,
          loadingMore: append,
          error: undefined,
        },
      }));
      try {
        // One bounded lifecycle page only. Never drain either Course list or enrollment rosters.
        const result = await queryAdminCourseReadModels({
          scope: 'admin_course_list',
          pageSize: ADMIN_COURSE_READ_MODEL_PAGE_SIZE_MAX,
          readModelVersion: 2,
          lifecycle: scope,
          ...(cursor ? { cursor } : {}),
        });
        if (requestId !== listRequestRef.current[scope]) return;
        if (result.scope !== 'admin_course_list') return;
        setCourseLists((previous) => ({
          ...previous,
          [scope]: {
            items: append ? mergeCoursePages(previous[scope].items, result.items) : result.items,
            loadingInitial: false,
            loadingMore: false,
            initialized: true,
            hasMore: result.hasMore === true,
            ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
          },
        }));
      } catch (caught) {
        if (requestId !== listRequestRef.current[scope]) return;
        const message = caught instanceof Error ? caught.message : text.mutationFailed;
        setCourseLists((previous) => ({
          ...previous,
          [scope]: {
            ...previous[scope],
            loadingInitial: false,
            loadingMore: false,
            initialized: true,
            error: message.includes('permission') ? text.permissionDenied : message,
          },
        }));
      }
    },
    [text.mutationFailed, text.permissionDenied]
  );

  const refresh = useCallback(
    () => loadCoursePage(lifecycleScope),
    [lifecycleScope, loadCoursePage]
  );

  const loadCourseDetail = useCallback(
    async (courseId: string): Promise<AdminCourseReadModel | undefined> => {
      const requestId = ++detailRequestRef.current;
      try {
        const result = await queryAdminCourseReadModels({
          scope: 'admin_course_detail',
          courseId: CourseIdSchema.parse(courseId),
        });
        if (result.scope !== 'admin_course_detail') return undefined;
        const item = result.item;
        if (requestId === detailRequestRef.current) setSelectedCourse(item ?? null);
        return item;
      } catch (caught) {
        if (requestId === detailRequestRef.current) {
          const message = caught instanceof Error ? caught.message : text.mutationFailed;
          setMutationError(message.includes('permission') ? text.permissionDenied : message);
        }
        return undefined;
      }
    },
    [text.mutationFailed, text.permissionDenied]
  );

  const currentList = courseLists[lifecycleScope];
  const courses = currentList.items;

  useEffect(() => {
    if (!currentList.initialized && !currentList.loadingInitial) {
      void loadCoursePage(lifecycleScope);
    }
  }, [currentList.initialized, currentList.loadingInitial, lifecycleScope, loadCoursePage]);

  const instructorOptions = useMemo(
    () =>
      new Map(
        instructorReads.instructors.items.map((instructor) => [instructor.instructorId, instructor])
      ),
    [instructorReads.instructors.items]
  );
  const tableCourses = useMemo(() => courses.map(mapAdminCourseToTableCourse), [courses]);
  const tableInstructors = useMemo<Instructor[]>(() => {
    const byId = new Map<string, Instructor>();
    const remember = (id: string, name: string, avatarUrl = '', isAvailable = true) => {
      byId.set(id, {
        id,
        name,
        specialty: 'ski',
        rating: null,
        reviewsCount: 0,
        languages: [],
        experienceYears: 0,
        bio: '',
        avatarUrl,
        pricePerHour: 0,
        isAvailable,
      });
    };
    for (const course of courses) {
      for (const instructor of course.instructors) {
        remember(
          instructor.instructorId,
          instructor.name,
          instructor.avatarUrl,
          instructor.isAvailable ?? true
        );
      }
    }
    return [...byId.values()];
  }, [courses]);

  const execute = useCallback(
    async <Kind extends CommandKind>(input: {
      kind: Kind;
      intent: CommandEnvelope<Kind>['intent'];
      expectedRevision?: number;
      idempotencyKey?: ReturnType<typeof IdempotencyKeySchema.parse>;
      calendarInput?: CommandEnvelope<Kind>['context']['calendarInput'];
      timezone?: CommandEnvelope<Kind>['context']['timezone'];
    }) => {
      if (commandInFlightRef.current) return false;
      commandInFlightRef.current = true;
      setPending(input.kind);
      setMutationError(null);
      setStale(false);
      try {
        const result = await executeAuthenticatedCanonicalCommand(currentAccountId, {
          kind: input.kind,
          intent: input.intent,
          idempotencyKey: input.idempotencyKey ?? newIdentity(`admin-course:${input.kind}`),
          ...(input.expectedRevision === undefined
            ? {}
            : { expectedRevision: input.expectedRevision as never }),
          ...(input.calendarInput ? { calendarInput: input.calendarInput } : {}),
          ...(input.timezone ? { timezone: input.timezone } : {}),
        });
        if (result.status !== 'success') {
          if (result.error.code === 'stale_version') {
            setStale(true);
            await refresh();
            if (selectedCourseId) await loadCourseDetail(selectedCourseId);
          }
          setMutationError(commandError(result.error.code));
          return false;
        }
        if (input.kind === 'archive_course' || input.kind === 'reactivate_course') {
          const courseId = (input.intent as { readonly courseId: string }).courseId;
          const source: CourseLifecycleScope =
            input.kind === 'archive_course' ? 'active' : 'archived';
          const target: CourseLifecycleScope =
            input.kind === 'archive_course' ? 'archived' : 'active';
          ++listRequestRef.current[source];
          ++listRequestRef.current[target];
          setCourseLists((previous) => ({
            ...previous,
            [source]: {
              ...previous[source],
              items: previous[source].items.filter((course) => course.courseId !== courseId),
              loadingInitial: false,
              loadingMore: false,
              error: undefined,
            },
            // The opposite scope is invalidated, but remains lazy until its tab is opened.
            [target]: EMPTY_COURSE_LIST_STATE,
          }));
          if (selectedCourseId === courseId) {
            ++detailRequestRef.current;
            setSelectedCourseId(null);
            setSelectedCourse(null);
            setEditForm(null);
            setEditOriginal(null);
          }
          return true;
        }
        await refresh();
        if (selectedCourseId) await loadCourseDetail(selectedCourseId);
        return true;
      } catch (caught) {
        const normalized = toCanonicalCommandClientError(
          caught,
          'correlation_admin_course_command'
        );
        setMutationError(commandError(normalized.code));
        return false;
      } finally {
        commandInFlightRef.current = false;
        setPending(null);
      }
    },
    [commandError, currentAccountId, loadCourseDetail, refresh, selectedCourseId]
  );

  const promptReason = () => window.prompt(text.reason, '')?.trim() ?? '';

  const resetCreateForm = () => {
    createAttemptRef.current = null;
    cloneDraftRef.current = null;
    setCreateMode('create');
    setCreateForm(EMPTY_CREATE_FORM);
  };

  const updateCreateField = <Field extends keyof CreateFormState>(
    field: Field,
    value: CreateFormState[Field]
  ) => {
    createAttemptRef.current = null;
    setCreateForm((state) => ({ ...state, [field]: value }));
  };

  const toggleCreate = () => {
    if (showCreate) {
      resetCreateForm();
      setShowCreate(false);
      return;
    }
    resetCreateForm();
    setShowCreate(true);
  };

  const runCourseAction = async (course: AdminCourseReadModel, kind: CommandKind) => {
    const action = course.authorizedActions.find((candidate) => candidate.kind === kind);
    if (!action) {
      setMutationError(text.permissionDenied);
      return;
    }
    const reasonExplanation = promptReason();
    if (!reasonExplanation) return;
    const expectedRevision = action.expectedRevision;
    if (kind === 'change_course_title') {
      const title = window.prompt('Operational title', course.title)?.trim();
      if (title)
        await execute({
          kind,
          expectedRevision,
          intent: { courseId: course.courseId, title, reasonExplanation },
        });
      return;
    }
    if (kind === 'change_course_price') {
      const price = Number(window.prompt('Whole KZT price', String(course.price)));
      if (Number.isInteger(price) && price >= 0)
        await execute({
          kind,
          expectedRevision,
          intent: { courseId: course.courseId, price: price as never, reasonExplanation },
        });
      return;
    }
    if (kind === 'change_course_capacity') {
      const totalSeats = Number(
        window.prompt('Total capacity', String(course.capacity.totalSeats))
      );
      if (!Number.isInteger(totalSeats) || totalSeats < 1 || totalSeats > 64) {
        setMutationError(text.capacityRange);
        return;
      }
      await execute({
        kind,
        expectedRevision,
        intent: { courseId: course.courseId, totalSeats, reasonExplanation },
      });
      return;
    }
    if (kind === 'add_course_roster_instructor' || kind === 'remove_course_roster_instructor') {
      const instructorId = window.prompt('Instructor ID', '')?.trim();
      if (instructorId)
        await execute({
          kind,
          expectedRevision,
          intent: {
            courseId: course.courseId,
            instructorId: instructorId as never,
            reasonExplanation,
          } as never,
        });
      return;
    }
    if (kind === 'archive_course' || kind === 'reactivate_course') {
      onRequestConfirm(`${kind.replaceAll('_', ' ')}: ${course.title}?`, async () => {
        await execute({
          kind,
          expectedRevision,
          intent: { courseId: course.courseId, reasonExplanation } as never,
        });
      });
    }
  };

  const createCourse = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const roster = createForm.roster
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const totalSeats = Number(createForm.totalSeats);
      if (!Number.isInteger(totalSeats) || totalSeats < 1 || totalSeats > 64) {
        setMutationError(text.capacityRange);
        return;
      }
      const attemptPrefix = createMode === 'clone' ? 'admin-course:clone' : 'admin-course:create';
      const attempt =
        createAttemptRef.current ??
        (() => {
          const idempotencyKey = newIdentity(attemptPrefix);
          return {
            idempotencyKey,
            seed: idempotencyKey.split(':').at(-1)!,
          };
        })();
      createAttemptRef.current = attempt;
      const { seed } = attempt;
      const courseId = `course_${seed}`;
      const days = createForm.days
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          const [localDate, localTime, duration, instructorId] = line.split(/\s+/);
          return {
            courseDayId: `course_day_${seed}_${index + 1}`,
            dayOrder: index + 1,
            localDate,
            localTime,
            durationMinutes: Number(duration),
            instructorId,
          };
        });
      const presentation: CourseCatalogContentInput = catalogContentInputFromCreateForm(
        createForm,
        cloneDraftRef.current?.presentation
      );
      const manifest = CourseProvisioningManifestSchema.parse({
        courseId,
        title: createForm.title,
        price: Number(createForm.price),
        totalSeats,
        capacityPolicy: { kind: 'seed_full' },
        instructorRosterIds: roster,
        timeZone: createForm.timeZone,
        days,
        presentation,
      });
      const succeeded = await execute({
        kind: 'apply_canonical_course_provisioning_manifest',
        intent: { manifest, dryRun: false },
        idempotencyKey: attempt.idempotencyKey,
      });
      if (!succeeded) return;
      resetCreateForm();
      setShowCreate(false);
    } catch {
      setMutationError(commandError('validation'));
    }
  };

  const updateEditField = <Field extends keyof CreateFormState>(
    field: Field,
    value: CreateFormState[Field]
  ) => setEditForm((current) => (current ? { ...current, [field]: value } : current));

  const refreshEditDetail = async (courseId: string) => {
    const detail = await loadCourseDetail(courseId);
    if (!detail) return undefined;
    return detail;
  };

  const saveStructuredEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editForm || !editOriginal) return;
    const reasonExplanation = editReason.trim();
    if (!reasonExplanation) {
      setMutationError(
        language === 'ru' ? 'Укажите причину изменения.' : 'Provide a reason for the change.'
      );
      return;
    }
    const totalSeats = Number(editForm.totalSeats);
    const price = Number(editForm.price);
    if (!Number.isInteger(totalSeats) || totalSeats < 1 || totalSeats > 64) {
      setMutationError(text.capacityRange);
      return;
    }
    if (!Number.isInteger(price) || price < 0) {
      setMutationError(commandError('validation'));
      return;
    }
    let authoritative = editOriginal;
    const run = async <Kind extends CommandKind>(
      kind: Kind,
      intent: CommandEnvelope<Kind>['intent']
    ) => {
      const action = authoritative.authorizedActions.find((candidate) => candidate.kind === kind);
      if (!action) {
        setMutationError(text.permissionDenied);
        return false;
      }
      const succeeded = await execute({ kind, expectedRevision: action.expectedRevision, intent });
      if (!succeeded) return false;
      const refreshed = await refreshEditDetail(authoritative.courseId);
      if (!refreshed) return false;
      authoritative = refreshed;
      // Keep baseline in sync after each success so a later failure does not
      // re-queue already-persisted commands, and authoritative title remains visible.
      setEditOriginal(refreshed);
      return true;
    };
    try {
      if (
        editForm.title.trim() !== editOriginal.title &&
        !(await run('change_course_title', {
          courseId: editOriginal.courseId,
          title: editForm.title.trim(),
          reasonExplanation,
        }))
      )
        return;
      if (
        price !== editOriginal.price &&
        !(await run('change_course_price', {
          courseId: editOriginal.courseId,
          price: price as never,
          reasonExplanation,
        }))
      )
        return;
      if (
        totalSeats !== editOriginal.capacity.totalSeats &&
        !(await run('change_course_capacity', {
          courseId: editOriginal.courseId,
          totalSeats,
          reasonExplanation,
        }))
      )
        return;
      const wantedRoster = editForm.roster
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      for (const instructorId of authoritative.instructorRosterIds.filter(
        (id) => !wantedRoster.includes(id)
      )) {
        if (
          !(await run('remove_course_roster_instructor', {
            courseId: authoritative.courseId,
            instructorId: instructorId as never,
            reasonExplanation,
          }))
        )
          return;
      }
      for (const instructorId of wantedRoster.filter(
        (id) => !authoritative.instructorRosterIds.includes(id as never)
      )) {
        if (
          !(await run('add_course_roster_instructor', {
            courseId: authoritative.courseId,
            instructorId: instructorId as never,
            reasonExplanation,
          }))
        )
          return;
      }
      const content = catalogContentInputFromCreateForm(editForm);
      const originalContent = catalogContentInputFromCourse(editOriginal);
      if (
        !catalogContentInputsEqual(content, originalContent) &&
        !(await run('update_course_catalog_content', {
          courseId: authoritative.courseId,
          content,
          reasonExplanation,
        }))
      )
        return;
      setEditOriginal(authoritative);
      setEditForm(formFromAuthoritativeDetail(authoritative));
      setEditReason('');
    } catch {
      setMutationError(commandError('validation'));
    }
  };

  const submitCourseDayDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCourse || !courseDayDraft) return;
    const durationMinutes = Number(courseDayDraft.durationMinutes);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(courseDayDraft.localDate) ||
      !/^\d{2}:\d{2}$/.test(courseDayDraft.localTime) ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 15
    ) {
      setMutationError(commandError('validation'));
      return;
    }
    const action = selectedCourse.authorizedActions.find(
      (candidate) => candidate.kind === courseDayDraft.kind
    );
    if (!action) {
      setMutationError(text.permissionDenied);
      return;
    }
    const day = courseDayDraft.courseDayId
      ? selectedCourse.courseDays.find((item) => item.courseDayId === courseDayDraft.courseDayId)
      : undefined;
    const reasonExplanation = editReason.trim() || 'Admin CourseDay edit';
    let input: Parameters<typeof execute>[0];
    if (courseDayDraft.kind === 'create_course_day') {
      input = {
        kind: 'create_course_day',
        expectedRevision: action.expectedRevision,
        calendarInput: {
          localDate: courseDayDraft.localDate,
          localTime: courseDayDraft.localTime,
          durationMinutes,
        },
        timezone: selectedCourse.courseDays[0]?.timeZone ?? ('Asia/Almaty' as never),
        intent: {
          courseId: selectedCourse.courseId,
          courseDayId: `course_day_${newIdentity('day').split(':').at(-1)}` as never,
          instructorId: courseDayDraft.instructorId as never,
        },
      };
    } else if (courseDayDraft.kind === 'reassign_course_day_instructor' && day) {
      input = {
        kind: 'reassign_course_day_instructor',
        expectedRevision: day.revision,
        intent: {
          courseId: selectedCourse.courseId,
          courseDayId: day.courseDayId,
          instructorId: courseDayDraft.instructorId as never,
          reasonExplanation,
        },
      };
    } else if (courseDayDraft.kind === 'reschedule_course_day' && day) {
      input = {
        kind: 'reschedule_course_day',
        expectedRevision: action.expectedRevision,
        calendarInput: {
          localDate: courseDayDraft.localDate,
          localTime: courseDayDraft.localTime,
          durationMinutes,
        },
        timezone: day.timeZone,
        intent: {
          courseId: selectedCourse.courseId,
          courseDayId: day.courseDayId,
          expectedCourseDayRevision: day.revision,
          reasonExplanation,
        },
      };
    } else return;
    if (await execute(input as never)) setCourseDayDraft(null);
  };

  const courseDayAction = async (
    course: AdminCourseReadModel,
    kind:
      | 'create_course_day'
      | 'reassign_course_day_instructor'
      | 'reschedule_course_day'
      | 'remove_course_day'
  ) => {
    const action = course.authorizedActions.find((candidate) => candidate.kind === kind);
    if (!action) {
      setMutationError(text.permissionDenied);
      return;
    }
    const reasonExplanation = kind === 'create_course_day' ? '' : promptReason();
    if (kind !== 'create_course_day' && !reasonExplanation) return;
    if (kind === 'create_course_day') {
      const localDate = window.prompt('Date YYYY-MM-DD')?.trim();
      const localTime = window.prompt('Time HH:mm')?.trim();
      const durationMinutes = Number(window.prompt('Duration minutes', '120'));
      const instructorId = window.prompt('Instructor ID', course.instructorRosterIds[0])?.trim();
      if (!localDate || !localTime || !instructorId) return;
      await execute({
        kind,
        expectedRevision: action.expectedRevision,
        calendarInput: { localDate, localTime, durationMinutes },
        timezone: course.courseDays[0]?.timeZone ?? ('Asia/Almaty' as never),
        intent: {
          courseId: course.courseId,
          courseDayId: `course_day_${Date.now()}` as never,
          instructorId: instructorId as never,
        },
      });
      return;
    }
    const courseDayId = window.prompt('CourseDay ID', course.courseDays[0]?.courseDayId)?.trim();
    const day = course.courseDays.find((candidate) => candidate.courseDayId === courseDayId);
    if (!day) return;
    if (kind === 'reassign_course_day_instructor') {
      const instructorId = window
        .prompt('New instructor ID', course.instructorRosterIds[0])
        ?.trim();
      if (instructorId)
        await execute({
          kind,
          expectedRevision: day.revision,
          intent: {
            courseId: course.courseId,
            courseDayId: day.courseDayId,
            instructorId: instructorId as never,
            reasonExplanation,
          },
        });
      return;
    }
    if (kind === 'reschedule_course_day') {
      const localDate = window.prompt('New date YYYY-MM-DD')?.trim();
      const localTime = window.prompt('New time HH:mm')?.trim();
      const durationMinutes = Number(
        window.prompt(
          'Duration minutes',
          String(
            Math.max(
              15,
              Math.round((day.interval.endsAt.seconds - day.interval.startsAt.seconds) / 60)
            )
          )
        )
      );
      if (localDate && localTime)
        await execute({
          kind,
          expectedRevision: action.expectedRevision,
          calendarInput: { localDate, localTime, durationMinutes },
          timezone: day.timeZone,
          intent: {
            courseId: course.courseId,
            courseDayId: day.courseDayId,
            expectedCourseDayRevision: day.revision,
            reasonExplanation,
          },
        });
      return;
    }
    onRequestConfirm(`remove CourseDay ${day.courseDayId}?`, async () => {
      await execute({
        kind,
        expectedRevision: action.expectedRevision,
        intent: {
          courseId: course.courseId,
          courseDayId: day.courseDayId,
          expectedCourseDayRevision: day.revision,
          reasonExplanation,
        },
      });
    });
  };

  const editCatalogContent = async (course: AdminCourseListItem | AdminCourseReadModel) => {
    const current = course.catalogContent.content;
    const reasonExplanation = promptReason();
    if (!reasonExplanation) return;
    try {
      const editableContent = current
        ? Object.fromEntries(
            Object.entries(current).filter(([key]) => key !== 'courseId' && key !== 'revision')
          )
        : {
            duration: '',
            description: '',
            dates: '',
            bgImageUrl: '',
          };
      const rawContent = window.prompt(
        'Catalog content JSON (translated copy, marketing, media and visibility)',
        JSON.stringify(editableContent, null, 2)
      );
      if (rawContent === null) return;
      const content = compactCourseCatalogContentInput(
        CourseCatalogContentInputSchema.parse(JSON.parse(rawContent))
      );
      const action = course.authorizedActions.find(
        (candidate) => candidate.kind === 'update_course_catalog_content'
      );
      if (!action) {
        setMutationError(text.permissionDenied);
        return;
      }
      await execute({
        kind: 'update_course_catalog_content',
        expectedRevision: action.expectedRevision,
        intent: {
          courseId: course.courseId,
          content,
          reasonExplanation,
        },
      });
    } catch {
      setMutationError(commandError('validation'));
    }
  };

  const updateCatalog = async (
    course: AdminCourseListItem | AdminCourseReadModel,
    content: CourseCatalogContentInput,
    reasonExplanation: string
  ) => {
    const action = course.authorizedActions.find(
      (candidate) => candidate.kind === 'update_course_catalog_content'
    );
    if (!action) {
      setMutationError(text.permissionDenied);
      return;
    }
    await execute({
      kind: 'update_course_catalog_content',
      expectedRevision: action.expectedRevision,
      intent: {
        courseId: course.courseId,
        content: compactCourseCatalogContentInput(content),
        reasonExplanation,
      },
    });
  };

  const handleToggleVisibility = async (
    tableCourse: ReturnType<typeof mapAdminCourseToTableCourse>
  ) => {
    const course = courses.find((candidate) => candidate.courseId === tableCourse.id);
    if (!course) return;
    const content = catalogContentInputFromCourse(course);
    const nextHidden = content.isHidden !== true;
    const nextContent: CourseCatalogContentInput = nextHidden
      ? { ...content, isHidden: true }
      : (({ isHidden: _hidden, ...rest }) => rest)(content);
    await updateCatalog(
      course,
      compactCourseCatalogContentInput(nextContent),
      'Admin course visibility'
    );
  };

  const handleMove = async (
    tableCourse: ReturnType<typeof mapAdminCourseToTableCourse>,
    direction: 'up' | 'down'
  ) => {
    const sorted = [...tableCourses].sort((left, right) => {
      const leftOrder = left.order ?? 999;
      const rightOrder = right.order ?? 999;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.title.localeCompare(right.title);
    });
    const index = sorted.findIndex((candidate) => candidate.id === tableCourse.id);
    const swapWith = sorted[direction === 'up' ? index - 1 : index + 1];
    if (index < 0 || !swapWith) return;
    const left = courses.find((candidate) => candidate.courseId === tableCourse.id);
    const right = courses.find((candidate) => candidate.courseId === swapWith.id);
    if (!left || !right) return;
    const leftContent = catalogContentInputFromCourse(left);
    const rightContent = catalogContentInputFromCourse(right);
    const leftOrder = leftContent.order ?? index;
    const rightOrder = rightContent.order ?? (direction === 'up' ? index - 1 : index + 1);
    await updateCatalog(left, { ...leftContent, order: rightOrder }, 'Admin course order');
    await updateCatalog(right, { ...rightContent, order: leftOrder }, 'Admin course order');
  };

  const handleArchive = (tableCourse: ReturnType<typeof mapAdminCourseToTableCourse>) => {
    const course = courses.find((candidate) => candidate.courseId === tableCourse.id);
    if (!course) return;
    let submission: ReturnType<typeof buildArchiveCourseCommandFromListItem>;
    try {
      submission = buildArchiveCourseCommandFromListItem(course);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : text.mutationFailed);
      return;
    }
    onRequestConfirm(
      `${t('archiveCourseConfirmPrefix')} "${course.title}"? ${text.archiveHistoryPreserved}`,
      async () => {
        await execute({
          kind: submission.kind,
          expectedRevision: submission.expectedRevision,
          intent: submission.intent,
        });
      }
    );
  };

  const handleReactivate = (tableCourse: ReturnType<typeof mapAdminCourseToTableCourse>) => {
    const course = courses.find((candidate) => candidate.courseId === tableCourse.id);
    if (!course) return;
    let submission: ReturnType<typeof buildReactivateCourseCommandFromListItem>;
    try {
      submission = buildReactivateCourseCommandFromListItem(course);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : text.mutationFailed);
      return;
    }
    onRequestConfirm(
      `${text.restoreConfirmPrefix} "${course.title}"? ${text.restoreExplanation}`,
      async () => {
        await execute({
          kind: submission.kind,
          expectedRevision: submission.expectedRevision,
          intent: submission.intent,
        });
      }
    );
  };

  const openCourseDetail = (courseId: string, edit: boolean) => {
    setSelectedCourseId(courseId);
    setSelectedCourse(null);
    setEditForm(null);
    setEditOriginal(null);
    void loadCourseDetail(courseId).then((detail) => {
      if (!detail || !edit) return;
      setEditOriginal(detail);
      setEditForm(formFromAuthoritativeDetail(detail));
    });
  };

  const handleClone = async (tableCourse: ReturnType<typeof mapAdminCourseToTableCourse>) => {
    setMutationError(null);
    const course = await loadCourseDetail(tableCourse.id);
    if (!course) return;
    try {
      const draft = buildCanonicalCourseCloneDraft(course);
      createAttemptRef.current = null;
      cloneDraftRef.current = draft;
      setCreateMode('clone');
      setCreateForm(draft.form);
      setShowCreate(true);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : text.mutationFailed);
    }
  };

  // Kept temporarily as inactive legacy helpers for T32.9B cleanup. All active
  // edit and CourseDay controls below use the structured form paths instead.
  void runCourseAction;
  void courseDayAction;
  void editCatalogContent;

  const selectedCourseScheduleDates = selectedCourse
    ? formatAdminCourseDaysScheduleDates(selectedCourse.courseDays)
    : '';

  return (
    <div
      className="space-y-4"
      aria-busy={pending !== null || currentList.loadingInitial || currentList.loadingMore}
    >
      <div className="flex gap-2" role="tablist" aria-label={text.lifecycle}>
        {(['active', 'archived'] as const).map((scope) => (
          <button
            key={scope}
            type="button"
            role="tab"
            aria-selected={lifecycleScope === scope}
            className={`ui-btn ${lifecycleScope === scope ? 'ui-btn-primary' : ''}`}
            onClick={() => {
              if (scope === lifecycleScope) return;
              setLifecycleScope(scope);
              setSelectedCourseId(null);
              setSelectedCourse(null);
              setEditForm(null);
              setEditOriginal(null);
              setCourseDayDraft(null);
              setMutationError(null);
              setStale(false);
            }}
          >
            {scope === 'active' ? text.active : text.archived}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[var(--border)] pb-3">
        <CoursesManagerToolbar t={t} showCourseForm={showCreate} onToggle={toggleCreate} />
        <button type="button" className="ui-btn" onClick={() => void refresh()}>
          {text.refresh}
        </button>
        {pending && <span role="status">{text.pending}</span>}
        {stale && <span role="status">{text.stale}</span>}
        {mutationError && <span role="alert">{mutationError}</span>}
        {currentList.error && courses.length > 0 ? (
          <span role="alert">
            {currentList.error}{' '}
            <button
              type="button"
              className="underline"
              onClick={() =>
                void loadCoursePage(
                  lifecycleScope,
                  courses.length > 0 ? currentList.cursor : undefined,
                  courses.length > 0
                )
              }
            >
              {text.retry}
            </button>
          </span>
        ) : null}
      </div>

      {showCreate && (
        <form
          className="grid gap-2 rounded border border-[var(--border)] p-3 md:grid-cols-2"
          onSubmit={(event) => void createCourse(event)}
        >
          {(
            [
              ['title', 'text'],
              ['titleRu', 'text'],
              ['price', 'number'],
              ['totalSeats', 'number'],
              ['timeZone', 'text'],
              ['duration', 'text'],
              ['dates', 'text'],
              ['bgImageUrl', 'url'],
            ] as const
          ).map(([field, type]) => (
            <label key={field} htmlFor={`canonical-course-${field}`} className="grid gap-1 text-sm">
              {field === 'price' ? `${field} (KZT)` : field}
              <input
                id={`canonical-course-${field}`}
                required
                type={type}
                {...(field === 'totalSeats' ? { min: 1, max: 64 } : {})}
                {...(field === 'price' ? { min: 0, step: 1 } : {})}
                value={createForm[field]}
                onChange={(event) => updateCreateField(field, event.target.value)}
              />
            </label>
          ))}
          <fieldset className="grid gap-2 border border-[var(--border)] p-3 md:col-span-2">
            <legend className="px-1 text-sm">
              {language === 'ru' ? 'Состав инструкторов курса' : 'Course instructor roster'}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[...instructorOptions.entries()].map(([id, instructor]) => {
                const selected = createForm.roster
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean);
                return (
                  <label
                    key={id}
                    htmlFor={`canonical-course-instructor-${id}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <input
                      id={`canonical-course-instructor-${id}`}
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={() =>
                        updateCreateField(
                          'roster',
                          (selected.includes(id)
                            ? selected.filter((value) => value !== id)
                            : [...selected, id]
                          ).join(',')
                        )
                      }
                    />
                    {instructor.name}
                    {!instructor.isAvailable ? ` (${text.unavailableInstructor})` : ''}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label htmlFor="canonical-course-days" className="grid gap-1 text-sm md:col-span-2">
            CourseDays: one line = YYYY-MM-DD HH:mm minutes instructorId
            <textarea
              id="canonical-course-days"
              required
              rows={4}
              value={createForm.days}
              onChange={(event) => updateCreateField('days', event.target.value)}
            />
          </label>
          <p className="text-xs md:col-span-2">
            Instructors:{' '}
            {[...instructorOptions.entries()]
              .map(([id, instructor]) => `${instructor.name} (${id})`)
              .join(', ')}
          </p>
          <details className="space-y-3 border border-[var(--border)] p-3 md:col-span-2">
            <summary className="cursor-pointer text-sm font-bold">{text.presentation}</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label
                htmlFor="canonical-course-description"
                className="grid gap-1 text-xs md:col-span-2"
              >
                description
                <textarea
                  id="canonical-course-description"
                  rows={3}
                  value={createForm.description}
                  onChange={(event) => updateCreateField('description', event.target.value)}
                />
              </label>
              {(
                [
                  'shortDescription',
                  'shortDescriptionRu',
                  'detailedDescription',
                  'detailedDescriptionRu',
                  'badge',
                  'badgeRu',
                  'levelLabel',
                  'videoUrl',
                  'benefits',
                  'benefitsRu',
                  'program',
                  'programRu',
                  'faq',
                  'faqRu',
                  'galleryPhotos',
                ] as const
              ).map((field) => (
                <label
                  key={field}
                  htmlFor={`canonical-course-${field}`}
                  className="grid gap-1 text-xs"
                >
                  {field}
                  <textarea
                    id={`canonical-course-${field}`}
                    rows={field.startsWith('detailed') || field.startsWith('program') ? 4 : 2}
                    value={createForm[field]}
                    placeholder={
                      field.startsWith('program')
                        ? 'Day 1 | Title | Description'
                        : field.startsWith('faq')
                          ? 'Question | Answer'
                          : undefined
                    }
                    onChange={(event) => updateCreateField(field, event.target.value)}
                  />
                </label>
              ))}
              <label htmlFor="canonical-course-level" className="grid gap-1 text-xs">
                level
                <select
                  id="canonical-course-level"
                  value={createForm.level}
                  onChange={(event) =>
                    updateCreateField('level', event.target.value as CreateFormState['level'])
                  }
                >
                  <option value="">—</option>
                  <option value="beginner">beginner</option>
                  <option value="intermediate">intermediate</option>
                  <option value="advanced">advanced</option>
                  <option value="expert">expert</option>
                </select>
              </label>
              <label htmlFor="canonical-course-order" className="grid gap-1 text-xs">
                order
                <input
                  id="canonical-course-order"
                  type="number"
                  min="0"
                  max="10000"
                  value={createForm.order}
                  onChange={(event) => updateCreateField('order', event.target.value)}
                />
              </label>
              <label
                htmlFor="canonical-course-is-hidden"
                className="flex items-center gap-2 text-xs"
              >
                <input
                  id="canonical-course-is-hidden"
                  type="checkbox"
                  checked={createForm.isHidden}
                  onChange={(event) => updateCreateField('isHidden', event.target.checked)}
                />
                {language === 'ru' ? 'Скрыть из публичного каталога' : 'Hide from public catalog'}
              </label>
            </div>
          </details>
          {createMode === 'clone' ? (
            <p className="text-xs md:col-span-2 text-[var(--ink-dim)]" role="status">
              {text.cloneDraftReady}
            </p>
          ) : null}
          <ActionButton
            pending={pending !== null}
            pendingLabel={text.pending}
            unstyled
            className="ui-btn ui-btn-primary"
            type="submit"
          >
            {createMode === 'clone' ? text.createClone : text.create}
          </ActionButton>
        </form>
      )}

      {(!currentList.initialized || currentList.loadingInitial) && courses.length === 0 ? (
        <p>{text.loading}</p>
      ) : currentList.error && courses.length === 0 ? (
        <div role="alert">
          <p>{currentList.error}</p>
          <button type="button" onClick={() => void refresh()}>
            {text.retry}
          </button>
        </div>
      ) : courses.length === 0 ? (
        <p>{lifecycleScope === 'active' ? text.activeEmpty : text.archivedEmpty}</p>
      ) : (
        <CoursesTable
          courses={tableCourses}
          bookings={[]}
          usersList={[]}
          instructors={tableInstructors}
          language={language}
          t={t}
          onToggleVisibility={(course) => void handleToggleVisibility(course)}
          onEdit={(course) => openCourseDetail(course.id, true)}
          onView={(course) => openCourseDetail(course.id, false)}
          onDelete={handleArchive}
          onReactivate={handleReactivate}
          onClone={(course) => void handleClone(course)}
          onMove={(course, direction) => void handleMove(course, direction)}
          canToggleVisibility={(course) =>
            lifecycleScope === 'active' &&
            courses
              .find((candidate) => candidate.courseId === course.id)
              ?.authorizedActions.some(
                (action) => action.kind === 'update_course_catalog_content'
              ) === true
          }
          canEdit={(course) =>
            (() => {
              const item = courses.find((candidate) => candidate.courseId === course.id);
              if (!item) return false;
              // Compact active v2 rows intentionally carry only list-grade actions;
              // detail authoritatively resolves the complete edit action set.
              if (item.lifecycle === 'active') return item.authorizedActions.length > 0;
              return item.authorizedActions.some((action) =>
                [
                  'change_course_title',
                  'change_course_price',
                  'change_course_capacity',
                  'add_course_roster_instructor',
                  'remove_course_roster_instructor',
                  'update_course_catalog_content',
                ].includes(action.kind)
              );
            })()
          }
          canView={() => true}
          canArchive={(course) =>
            courses
              .find((candidate) => candidate.courseId === course.id)
              ?.authorizedActions.some((action) => action.kind === 'archive_course') === true
          }
          canReactivate={(course) =>
            courses
              .find((candidate) => candidate.courseId === course.id)
              ?.authorizedActions.some((action) => action.kind === 'reactivate_course') === true
          }
          canClone={() => lifecycleScope === 'active'}
          canMove={(course) =>
            lifecycleScope === 'active' &&
            courses
              .find((candidate) => candidate.courseId === course.id)
              ?.authorizedActions.some(
                (action) => action.kind === 'update_course_catalog_content'
              ) === true
          }
          archiveInsteadOfDelete
          detailsLabel={text.details}
          reactivateLabel={text.restore}
        />
      )}

      {currentList.hasMore && currentList.cursor ? (
        <button
          type="button"
          className="ui-btn"
          disabled={currentList.loadingMore}
          onClick={() => void loadCoursePage(lifecycleScope, currentList.cursor, true)}
        >
          {currentList.loadingMore ? text.loadingMore : text.loadMore}
        </button>
      ) : null}

      {selectedCourse ? (
        <article className="space-y-4 rounded border border-[var(--border)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg">{selectedCourse.title}</h3>
              <p className="text-xs text-[var(--ink-dim)]">
                {selectedCourse.courseId} · {text.lifecycle}: {selectedCourse.lifecycle} ·{' '}
                {selectedCourse.capacity.availableSeats}/{selectedCourse.capacity.totalSeats} ·{' '}
                {selectedCourse.price.toLocaleString()} ₸
              </p>
              {selectedCourseScheduleDates ? (
                <p
                  className="text-xs font-bold text-[var(--ink)]"
                  data-testid="admin-course-detail-dates"
                >
                  {language === 'ru' ? 'Даты проведения' : 'Schedule dates'}:{' '}
                  {selectedCourseScheduleDates}
                </p>
              ) : null}
              <p className="text-xs text-[var(--ink-dim)]">
                {text.activeEnrollments}: {selectedCourse.activeEnrollmentCount} ·{' '}
                {text.totalEnrollments}: {selectedCourse.totalEnrollmentCount}
              </p>
            </div>
            <button
              type="button"
              className="ui-btn"
              onClick={() => {
                setSelectedCourseId(null);
                setSelectedCourse(null);
              }}
            >
              {text.closeDetails}
            </button>
          </div>

          {selectedCourse.instructors.some((instructor) => instructor.isAvailable === false) ? (
            <p role="status" className="text-xs text-amber-700">
              {text.unavailableInstructor}
            </p>
          ) : null}

          {editForm ? (
            <form
              className="grid gap-3 border border-[var(--border)] p-3 md:grid-cols-2"
              onSubmit={(event) => void saveStructuredEdit(event)}
            >
              <h4 className="text-sm font-bold md:col-span-2">
                {language === 'ru' ? 'Редактирование курса' : 'Edit course'}
              </h4>
              <label htmlFor="course-edit-title" className="grid gap-1 text-xs">
                {language === 'ru' ? 'Название' : 'Title'}
                <input
                  id="course-edit-title"
                  required
                  value={editForm.title}
                  onChange={(event) => updateEditField('title', event.target.value)}
                />
              </label>
              <label htmlFor="course-edit-title-ru" className="grid gap-1 text-xs">
                {language === 'ru' ? 'Название (RU)' : 'Title (RU)'}
                <input
                  id="course-edit-title-ru"
                  value={editForm.titleRu}
                  onChange={(event) => updateEditField('titleRu', event.target.value)}
                />
              </label>
              <label htmlFor="course-edit-price" className="grid gap-1 text-xs">
                {language === 'ru' ? 'Цена (KZT)' : 'Price (KZT)'}
                <input
                  id="course-edit-price"
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.price}
                  onChange={(event) => updateEditField('price', event.target.value)}
                />
              </label>
              <label htmlFor="course-edit-capacity" className="grid gap-1 text-xs">
                {language === 'ru' ? 'Вместимость' : 'Capacity'}
                <input
                  id="course-edit-capacity"
                  required
                  type="number"
                  min="1"
                  max="64"
                  value={editForm.totalSeats}
                  onChange={(event) => updateEditField('totalSeats', event.target.value)}
                />
              </label>
              <div className="grid gap-1 text-xs">
                {language === 'ru' ? 'Изображение курса' : 'Course image'}
                <input
                  aria-label={language === 'ru' ? 'URL изображения' : 'Image URL'}
                  type="url"
                  value={editForm.bgImageUrl}
                  onChange={(event) => updateEditField('bgImageUrl', event.target.value)}
                />
                <button
                  type="button"
                  className="ui-btn"
                  onClick={() => setImageUploaderOpen((value) => !value)}
                >
                  {language === 'ru' ? 'Загрузить изображение' : 'Upload image'}
                </button>
                {imageUploaderOpen ? (
                  <CourseBackgroundImageField
                    value={editForm.bgImageUrl}
                    courseId={selectedCourse.courseId}
                    onChange={(value) => updateEditField('bgImageUrl', value)}
                  />
                ) : null}
                {editForm.bgImageUrl ? (
                  <img src={editForm.bgImageUrl} alt="" className="h-20 w-32 object-cover" />
                ) : null}
              </div>
              <label htmlFor="course-edit-video" className="grid gap-1 text-xs">
                {language === 'ru' ? 'Видео (URL)' : 'Video URL'}
                <input
                  id="course-edit-video"
                  type="url"
                  value={editForm.videoUrl}
                  onChange={(event) => updateEditField('videoUrl', event.target.value)}
                />
              </label>
              <fieldset className="grid gap-2 md:col-span-2">
                <legend className="text-xs font-bold">
                  {language === 'ru' ? 'Состав инструкторов курса' : 'Course instructor roster'}
                </legend>
                {instructorReads.instructors.loading ? (
                  <p className="text-xs">{text.loading}</p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {instructorReads.instructors.items.map((instructor) => {
                    const selected = editForm.roster
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean);
                    return (
                      <label
                        htmlFor={`course-roster-${instructor.instructorId}`}
                        key={instructor.instructorId}
                        className="flex gap-2 text-xs"
                      >
                        <input
                          id={`course-roster-${instructor.instructorId}`}
                          type="checkbox"
                          disabled={
                            !instructor.isAvailable && !selected.includes(instructor.instructorId)
                          }
                          checked={selected.includes(instructor.instructorId)}
                          onChange={() =>
                            updateEditField(
                              'roster',
                              (selected.includes(instructor.instructorId)
                                ? selected.filter((id) => id !== instructor.instructorId)
                                : [...selected, instructor.instructorId]
                              ).join(',')
                            )
                          }
                        />
                        {instructor.name}
                        {!instructor.isAvailable
                          ? ` — ${language === 'ru' ? 'деактивирован' : 'inactive'}`
                          : ''}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <details className="grid gap-2 md:col-span-2">
                <summary className="cursor-pointer text-xs font-bold">{text.presentation}</summary>
                <div className="grid gap-2 md:grid-cols-2">
                  <label
                    htmlFor="course-edit-description"
                    className="grid gap-1 text-xs md:col-span-2"
                  >
                    {language === 'ru' ? 'Описание' : 'Description'}
                    <textarea
                      id="course-edit-description"
                      rows={3}
                      value={editForm.description}
                      onChange={(event) => updateEditField('description', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-short-en" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'Краткое описание (EN)' : 'Short description (EN)'}
                    <textarea
                      id="course-edit-short-en"
                      value={editForm.shortDescription}
                      onChange={(event) => updateEditField('shortDescription', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-short-ru" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'Краткое описание (RU)' : 'Short description (RU)'}
                    <textarea
                      id="course-edit-short-ru"
                      value={editForm.shortDescriptionRu}
                      onChange={(event) =>
                        updateEditField('shortDescriptionRu', event.target.value)
                      }
                    />
                  </label>
                  <label htmlFor="course-edit-detail-en" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'Подробное описание (EN)' : 'Detailed description (EN)'}
                    <textarea
                      id="course-edit-detail-en"
                      value={editForm.detailedDescription}
                      onChange={(event) =>
                        updateEditField('detailedDescription', event.target.value)
                      }
                    />
                  </label>
                  <label htmlFor="course-edit-detail-ru" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'Подробное описание (RU)' : 'Detailed description (RU)'}
                    <textarea
                      id="course-edit-detail-ru"
                      value={editForm.detailedDescriptionRu}
                      onChange={(event) =>
                        updateEditField('detailedDescriptionRu', event.target.value)
                      }
                    />
                  </label>
                  <label htmlFor="course-edit-benefits-en" className="grid gap-1 text-xs">
                    {language === 'ru'
                      ? 'Преимущества (по одному в строке)'
                      : 'Benefits (one per line)'}
                    <textarea
                      id="course-edit-benefits-en"
                      value={editForm.benefits}
                      onChange={(event) => updateEditField('benefits', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-benefits-ru" className="grid gap-1 text-xs">
                    {language === 'ru'
                      ? 'Преимущества RU (по одному в строке)'
                      : 'Benefits RU (one per line)'}
                    <textarea
                      id="course-edit-benefits-ru"
                      value={editForm.benefitsRu}
                      onChange={(event) => updateEditField('benefitsRu', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-badge-en" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'Бейдж' : 'Badge'}
                    <input
                      id="course-edit-badge-en"
                      value={editForm.badge}
                      onChange={(event) => updateEditField('badge', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-badge-ru" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'Бейдж (RU)' : 'Badge (RU)'}
                    <input
                      id="course-edit-badge-ru"
                      value={editForm.badgeRu}
                      onChange={(event) => updateEditField('badgeRu', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-level" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'Уровень' : 'Level'}
                    <select
                      id="course-edit-level"
                      value={editForm.level}
                      onChange={(event) =>
                        updateEditField('level', event.target.value as CreateFormState['level'])
                      }
                    >
                      <option value="">—</option>
                      <option value="beginner">
                        {language === 'ru' ? 'Начальный' : 'Beginner'}
                      </option>
                      <option value="intermediate">
                        {language === 'ru' ? 'Средний' : 'Intermediate'}
                      </option>
                      <option value="advanced">
                        {language === 'ru' ? 'Продвинутый' : 'Advanced'}
                      </option>
                      <option value="expert">{language === 'ru' ? 'Экспертный' : 'Expert'}</option>
                    </select>
                  </label>
                  <label htmlFor="course-edit-level-label" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'Подпись уровня' : 'Level label'}
                    <input
                      id="course-edit-level-label"
                      value={editForm.levelLabel}
                      onChange={(event) => updateEditField('levelLabel', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-program-en" className="grid gap-1 text-xs">
                    {language === 'ru'
                      ? 'Программа EN (день | заголовок | описание)'
                      : 'Program EN (day | title | description)'}
                    <textarea
                      id="course-edit-program-en"
                      value={editForm.program}
                      onChange={(event) => updateEditField('program', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-program-ru" className="grid gap-1 text-xs">
                    {language === 'ru'
                      ? 'Программа RU (день | заголовок | описание)'
                      : 'Program RU (day | title | description)'}
                    <textarea
                      id="course-edit-program-ru"
                      value={editForm.programRu}
                      onChange={(event) => updateEditField('programRu', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-faq-en" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'FAQ EN (вопрос | ответ)' : 'FAQ EN (question | answer)'}
                    <textarea
                      id="course-edit-faq-en"
                      value={editForm.faq}
                      onChange={(event) => updateEditField('faq', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-faq-ru" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'FAQ RU (вопрос | ответ)' : 'FAQ RU (question | answer)'}
                    <textarea
                      id="course-edit-faq-ru"
                      value={editForm.faqRu}
                      onChange={(event) => updateEditField('faqRu', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-gallery" className="grid gap-1 text-xs md:col-span-2">
                    {language === 'ru'
                      ? 'Галерея (один URL в строке)'
                      : 'Gallery (one URL per line)'}
                    <textarea
                      id="course-edit-gallery"
                      value={editForm.galleryPhotos}
                      onChange={(event) => updateEditField('galleryPhotos', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-order" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'Порядок' : 'Order'}
                    <input
                      id="course-edit-order"
                      type="number"
                      min="0"
                      value={editForm.order}
                      onChange={(event) => updateEditField('order', event.target.value)}
                    />
                  </label>
                  <label htmlFor="course-edit-hidden" className="flex gap-2 text-xs">
                    <input
                      id="course-edit-hidden"
                      type="checkbox"
                      checked={editForm.isHidden}
                      onChange={(event) => updateEditField('isHidden', event.target.checked)}
                    />
                    {language === 'ru' ? 'Скрыть из каталога' : 'Hide from catalog'}
                  </label>
                </div>
              </details>
              <label htmlFor="course-edit-reason" className="grid gap-1 text-xs md:col-span-2">
                {language === 'ru' ? 'Причина изменения' : 'Reason for change'}
                <input
                  id="course-edit-reason"
                  required
                  value={editReason}
                  onChange={(event) => setEditReason(event.target.value)}
                />
              </label>
              <ActionButton
                className="ui-btn ui-btn-primary"
                unstyled
                pending={pending !== null}
                pendingLabel={text.pending}
                type="submit"
              >
                {language === 'ru' ? 'Сохранить изменения' : 'Save changes'}
              </ActionButton>
            </form>
          ) : null}

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider">
              {text.operationalSchedule}
            </h4>
            {selectedCourse.courseDays.length === 0 ? (
              <p className="text-xs text-[var(--ink-dim)]">{text.noSchedule}</p>
            ) : (
              <div className="overflow-x-auto border border-[var(--border)]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[var(--surface)] text-[var(--ink-dim)]">
                      <th className="p-2">#</th>
                      <th className="p-2">CourseDay</th>
                      <th className="p-2">{language === 'ru' ? 'Дата' : 'Date'}</th>
                      <th className="p-2">{language === 'ru' ? 'Время' : 'Time'}</th>
                      <th className="p-2">{language === 'ru' ? 'Минуты' : 'Minutes'}</th>
                      <th className="p-2">{language === 'ru' ? 'Инструктор' : 'Instructor'}</th>
                      <th className="p-2">Rev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCourse.courseDays.map((day) => {
                      const local = localDateTimeFromTimestamp(
                        day.interval.startsAt.seconds,
                        day.timeZone
                      );
                      const durationMinutes = Math.max(
                        15,
                        Math.round(
                          (day.interval.endsAt.seconds - day.interval.startsAt.seconds) / 60
                        )
                      );
                      return (
                        <tr key={day.courseDayId} className="border-t border-[var(--border)]">
                          <td className="p-2">{day.dayOrder}</td>
                          <td className="p-2 font-mono">{day.courseDayId}</td>
                          <td className="p-2">{formatAdminCourseDayLocalDate(day)}</td>
                          <td className="p-2">{local.time}</td>
                          <td className="p-2">{durationMinutes}</td>
                          <td className="p-2">
                            {day.actualInstructorIds
                              .map((id) => instructorOptions.get(id)?.name ?? id)
                              .join(', ')}
                          </td>
                          <td className="p-2">{day.revision}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2 border border-[var(--border)] p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase">
                {language === 'ru' ? 'Редактор дней курса' : 'Course day editor'}
              </h4>
              {selectedCourse.authorizedActions.some(
                (action) => action.kind === 'create_course_day'
              ) ? (
                <button
                  type="button"
                  className="ui-btn"
                  onClick={() =>
                    setCourseDayDraft({
                      kind: 'create_course_day',
                      localDate: '',
                      localTime: '',
                      durationMinutes: '120',
                      instructorId: selectedCourse.instructorRosterIds[0] ?? '',
                    })
                  }
                >
                  {language === 'ru' ? 'Добавить день' : 'Add day'}
                </button>
              ) : null}
            </div>
            {courseDayDraft ? (
              <form
                className="grid gap-2 md:grid-cols-2"
                onSubmit={(event) => void submitCourseDayDraft(event)}
              >
                <label htmlFor="course-day-date" className="grid gap-1 text-xs">
                  {language === 'ru' ? 'Дата' : 'Date'}
                  <input
                    id="course-day-date"
                    required
                    type="date"
                    value={courseDayDraft.localDate}
                    onChange={(event) =>
                      setCourseDayDraft({ ...courseDayDraft, localDate: event.target.value })
                    }
                  />
                </label>
                <label htmlFor="course-day-time" className="grid gap-1 text-xs">
                  {language === 'ru' ? 'Время' : 'Time'}
                  <input
                    id="course-day-time"
                    required
                    type="time"
                    value={courseDayDraft.localTime}
                    onChange={(event) =>
                      setCourseDayDraft({ ...courseDayDraft, localTime: event.target.value })
                    }
                  />
                </label>
                <label htmlFor="course-day-duration" className="grid gap-1 text-xs">
                  {language === 'ru' ? 'Длительность (мин.)' : 'Duration (minutes)'}
                  <input
                    id="course-day-duration"
                    required
                    type="number"
                    min="15"
                    value={courseDayDraft.durationMinutes}
                    onChange={(event) =>
                      setCourseDayDraft({ ...courseDayDraft, durationMinutes: event.target.value })
                    }
                  />
                </label>
                <label htmlFor="course-day-instructor" className="grid gap-1 text-xs">
                  {language === 'ru' ? 'Фактический инструктор дня' : 'Actual day instructor'}
                  <select
                    id="course-day-instructor"
                    required
                    value={courseDayDraft.instructorId}
                    onChange={(event) =>
                      setCourseDayDraft({ ...courseDayDraft, instructorId: event.target.value })
                    }
                  >
                    {selectedCourse.instructorRosterIds.map((id) => (
                      <option
                        key={id}
                        value={id}
                        disabled={instructorOptions.get(id)?.isAvailable === false}
                      >
                        {instructorOptions.get(id)?.name ?? id}
                        {instructorOptions.get(id)?.isAvailable === false
                          ? ` (${language === 'ru' ? 'деактивирован' : 'inactive'})`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2">
                  <ActionButton
                    className="ui-btn ui-btn-primary"
                    unstyled
                    pending={pending !== null}
                    pendingLabel={text.pending}
                    type="submit"
                  >
                    {language === 'ru' ? 'Сохранить день' : 'Save day'}
                  </ActionButton>
                  <button
                    className="ui-btn"
                    type="button"
                    disabled={pending !== null}
                    onClick={() => setCourseDayDraft(null)}
                  >
                    {language === 'ru' ? 'Отмена' : 'Cancel'}
                  </button>
                </div>
              </form>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {selectedCourse.courseDays.map((day) => (
                <React.Fragment key={day.courseDayId}>
                  {selectedCourse.authorizedActions.some(
                    (action) => action.kind === 'reschedule_course_day'
                  ) ? (
                    <button
                      type="button"
                      className="ui-btn"
                      onClick={() => {
                        const local = localDateTimeFromTimestamp(
                          day.interval.startsAt.seconds,
                          day.timeZone
                        );
                        setCourseDayDraft({
                          kind: 'reschedule_course_day',
                          courseDayId: day.courseDayId,
                          localDate: local.date,
                          localTime: local.time,
                          durationMinutes: String(
                            Math.max(
                              15,
                              Math.round(
                                (day.interval.endsAt.seconds - day.interval.startsAt.seconds) / 60
                              )
                            )
                          ),
                          instructorId: day.actualInstructorIds[0] ?? '',
                        });
                      }}
                    >
                      {language === 'ru'
                        ? `Перенести день ${day.dayOrder}`
                        : `Reschedule day ${day.dayOrder}`}
                    </button>
                  ) : null}
                  {selectedCourse.authorizedActions.some(
                    (action) => action.kind === 'reassign_course_day_instructor'
                  ) ? (
                    <button
                      type="button"
                      className="ui-btn"
                      onClick={() => {
                        const local = localDateTimeFromTimestamp(
                          day.interval.startsAt.seconds,
                          day.timeZone
                        );
                        setCourseDayDraft({
                          kind: 'reassign_course_day_instructor',
                          courseDayId: day.courseDayId,
                          localDate: local.date,
                          localTime: local.time,
                          durationMinutes: String(
                            Math.max(
                              15,
                              Math.round(
                                (day.interval.endsAt.seconds - day.interval.startsAt.seconds) / 60
                              )
                            )
                          ),
                          instructorId: day.actualInstructorIds[0] ?? '',
                        });
                      }}
                    >
                      {language === 'ru'
                        ? `Инструктор дня ${day.dayOrder}`
                        : `Day ${day.dayOrder} instructor`}
                    </button>
                  ) : null}
                  {selectedCourse.authorizedActions.some(
                    (action) => action.kind === 'remove_course_day'
                  ) ? (
                    <button
                      type="button"
                      className="ui-btn"
                      disabled={pending !== null}
                      onClick={() =>
                        onRequestConfirm(
                          language === 'ru'
                            ? `Удалить день курса ${day.dayOrder}?`
                            : `Remove course day ${day.dayOrder}?`,
                          async () => {
                            const action = selectedCourse.authorizedActions.find(
                              (item) => item.kind === 'remove_course_day'
                            );
                            if (action)
                              await execute({
                                kind: 'remove_course_day',
                                expectedRevision: action.expectedRevision,
                                intent: {
                                  courseId: selectedCourse.courseId,
                                  courseDayId: day.courseDayId,
                                  expectedCourseDayRevision: day.revision,
                                  reasonExplanation: editReason.trim() || 'Admin CourseDay removal',
                                },
                              });
                          }
                        )
                      }
                    >
                      {language === 'ru'
                        ? `Удалить день ${day.dayOrder}`
                        : `Remove day ${day.dayOrder}`}
                    </button>
                  ) : null}
                </React.Fragment>
              ))}
            </div>
          </section>

          {onOpenEnrollments ? (
            <button
              type="button"
              className="ui-btn"
              onClick={() => onOpenEnrollments(selectedCourse.courseId)}
            >
              {text.manageEnrollments}
            </button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {(['archive_course', 'reactivate_course'] as const)
              .filter((kind) =>
                selectedCourse.authorizedActions.some((action) => action.kind === kind)
              )
              .map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={pending !== null}
                  onClick={() => {
                    if (kind === 'archive_course')
                      handleArchive(mapAdminCourseToTableCourse(selectedCourse));
                    else handleReactivate(mapAdminCourseToTableCourse(selectedCourse));
                  }}
                >
                  {actionLabel(kind)}
                </button>
              ))}
          </div>
        </article>
      ) : null}
    </div>
  );
};
