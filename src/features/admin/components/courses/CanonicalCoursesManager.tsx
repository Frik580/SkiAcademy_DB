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
import { queryAdminCourseReadModels } from '../../../../lib/canonical/canonicalReadModelClient';
import type { CanonicalCoursesManagerInput } from './adminCourseContracts';
import { useAdminCourseTranslations } from './useAdminCourseTranslations';
import { CoursesManagerToolbar } from './form/CoursesManagerToolbar';
import { CoursesTable } from './form/CoursesTable';
import {
  catalogContentInputFromCourse,
  mapAdminCourseToTableCourse,
} from './adminCourseTableMapping';
import { buildArchiveCourseCommandFromListItem } from './adminCourseArchiveCommand';
import {
  buildCanonicalCourseCloneDraft,
  mergeClonePresentationWithForm,
  type CanonicalCourseCloneDraft,
  type CanonicalCourseCreateFormState,
} from './adminCourseCloneDraft';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import type { Instructor } from '../../../../types';

function newIdentity(prefix: string): ReturnType<typeof IdempotencyKeySchema.parse> {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return IdempotencyKeySchema.parse(`${prefix}:${suffix}`);
}

function commandErrorMessage(result: { status: string; error?: { code?: string } }): string {
  return result.error?.code ?? 'unknown_error';
}

type CreateFormState = CanonicalCourseCreateFormState;

interface CreateAttempt {
  readonly idempotencyKey: ReturnType<typeof IdempotencyKeySchema.parse>;
  readonly seed: string;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  title: '',
  price: '',
  totalSeats: '10',
  timeZone: 'Asia/Almaty',
  roster: '',
  days: '',
  duration: '',
  description: '',
  dates: '',
  bgImageUrl: '',
};

export const CanonicalCoursesManager: React.FC<CanonicalCoursesManagerInput> = ({
  currentAccountId,
  instructors,
  onRequestConfirm,
}) => {
  const { language, text } = useAdminCourseTranslations();
  const { t } = useLanguage();
  const [courses, setCourses] = useState<AdminCourseListItem[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<AdminCourseReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<'create' | 'clone'>('create');
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const createAttemptRef = useRef<CreateAttempt | null>(null);
  const cloneDraftRef = useRef<CanonicalCourseCloneDraft | null>(null);
  const commandInFlightRef = useRef(false);
  const detailRequestRef = useRef(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Course list only — one page. Roster UX lives in AdminCourseEnrollmentPanel
      // (paginated Load more). Do not drain enrollment roster pages here.
      const courseResult = await queryAdminCourseReadModels({
        scope: 'admin_course_list',
        pageSize: ADMIN_COURSE_READ_MODEL_PAGE_SIZE_MAX,
        readModelVersion: 2,
      });
      if (courseResult.scope === 'admin_course_list') {
        setCourses(courseResult.items);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : text.mutationFailed;
      setError(message.includes('permission') ? text.permissionDenied : message);
    } finally {
      setLoading(false);
    }
  }, [text.mutationFailed, text.permissionDenied]);

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
          setError(message.includes('permission') ? text.permissionDenied : message);
        }
        return undefined;
      }
    },
    [text.mutationFailed, text.permissionDenied]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const instructorOptions = useMemo(
    () => new Map(instructors.map((instructor) => [instructor.instructorId, instructor.name])),
    [instructors]
  );
  const tableCourses = useMemo(() => courses.map(mapAdminCourseToTableCourse), [courses]);
  const tableInstructors = useMemo<Instructor[]>(() => {
    const byId = new Map<string, Instructor>();
    const remember = (id: string, name: string, avatarUrl = '', isAvailable = true) => {
      byId.set(id, {
        id,
        name,
        specialty: 'ski',
        rating: 0,
        reviewsCount: 0,
        languages: [],
        experienceYears: 0,
        bio: '',
        avatarUrl,
        pricePerHour: 0,
        isAvailable,
      });
    };
    for (const instructor of instructors) remember(instructor.instructorId, instructor.name);
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
  }, [courses, instructors]);

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
      setError(null);
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
          }
          setError(commandErrorMessage(result));
          return false;
        }
        await refresh();
        if (selectedCourseId) await loadCourseDetail(selectedCourseId);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : text.mutationFailed);
        return false;
      } finally {
        commandInFlightRef.current = false;
        setPending(null);
      }
    },
    [currentAccountId, loadCourseDetail, refresh, selectedCourseId, text.mutationFailed]
  );

  const promptReason = () => window.prompt(text.reason, '')?.trim() ?? '';

  const resetCreateForm = () => {
    createAttemptRef.current = null;
    cloneDraftRef.current = null;
    setCreateMode('create');
    setCreateForm(EMPTY_CREATE_FORM);
  };

  const updateCreateField = (field: keyof CreateFormState, value: string) => {
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
    const reasonExplanation = promptReason();
    if (!reasonExplanation) return;
    const expectedRevision = course.revision;
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
      if (Number.isInteger(totalSeats) && totalSeats > 0)
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
      const presentation: CourseCatalogContentInput = cloneDraftRef.current
        ? mergeClonePresentationWithForm(cloneDraftRef.current.presentation, createForm)
        : {
            duration: createForm.duration,
            description: createForm.description,
            dates: createForm.dates,
            bgImageUrl: createForm.bgImageUrl,
          };
      const manifest = CourseProvisioningManifestSchema.parse({
        courseId,
        title: createForm.title,
        price: Number(createForm.price),
        totalSeats: Number(createForm.totalSeats),
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.mutationFailed);
    }
  };

  const courseDayAction = async (
    course: AdminCourseReadModel,
    kind:
      | 'create_course_day'
      | 'reassign_course_day_instructor'
      | 'reschedule_course_day'
      | 'remove_course_day'
  ) => {
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
        expectedRevision: course.revision,
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
      const durationMinutes = Number(window.prompt('Duration minutes', '120'));
      if (localDate && localTime)
        await execute({
          kind,
          expectedRevision: course.revision,
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
        expectedRevision: course.revision,
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
      const content = CourseCatalogContentInputSchema.parse(JSON.parse(rawContent));
      const action = course.authorizedActions.find(
        (candidate) => candidate.kind === 'update_course_catalog_content'
      );
      if (!action) {
        setError(text.permissionDenied);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.mutationFailed);
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
      setError(text.permissionDenied);
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
  };

  const handleToggleVisibility = async (
    tableCourse: ReturnType<typeof mapAdminCourseToTableCourse>
  ) => {
    const course = courses.find((candidate) => candidate.courseId === tableCourse.id);
    if (!course) return;
    const content = catalogContentInputFromCourse(course);
    await updateCatalog(
      course,
      { ...content, isHidden: !content.isHidden },
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
      setError(caught instanceof Error ? caught.message : text.mutationFailed);
      return;
    }
    onRequestConfirm(`${t('archiveCourseConfirmPrefix')} "${course.title}"?`, async () => {
      await execute({
        kind: submission.kind,
        expectedRevision: submission.expectedRevision,
        intent: submission.intent,
      });
    });
  };

  const handleClone = async (tableCourse: ReturnType<typeof mapAdminCourseToTableCourse>) => {
    setError(null);
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
      setError(caught instanceof Error ? caught.message : text.mutationFailed);
    }
  };

  if (loading && courses.length === 0) return <p>{text.loading}</p>;
  if (error && courses.length === 0) {
    return (
      <div role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => void refresh()}>
          {text.retry}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-busy={pending !== null}>
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[var(--border)] pb-3">
        <CoursesManagerToolbar t={t} showCourseForm={showCreate} onToggle={toggleCreate} />
        <button type="button" className="ui-btn" onClick={() => void refresh()}>
          {text.refresh}
        </button>
        {pending && <span role="status">{text.pending}</span>}
        {stale && <span role="status">{text.stale}</span>}
        {error && <span role="alert">{error}</span>}
      </div>

      {showCreate && (
        <form
          className="grid gap-2 rounded border border-[var(--border)] p-3 md:grid-cols-2"
          onSubmit={(event) => void createCourse(event)}
        >
          {(
            [
              'title',
              'price',
              'totalSeats',
              'timeZone',
              'roster',
              'duration',
              'dates',
              'bgImageUrl',
            ] as const
          ).map((field) => (
            <label key={field} className="grid gap-1 text-sm">
              {field}
              <input
                required
                value={createForm[field]}
                onChange={(event) => updateCreateField(field, event.target.value)}
              />
            </label>
          ))}
          <label className="grid gap-1 text-sm md:col-span-2">
            description
            <textarea
              required
              value={createForm.description}
              onChange={(event) => updateCreateField('description', event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            CourseDays: one line = YYYY-MM-DD HH:mm minutes instructorId
            <textarea
              required
              rows={4}
              value={createForm.days}
              onChange={(event) => updateCreateField('days', event.target.value)}
            />
          </label>
          <p className="text-xs md:col-span-2">
            Instructors:{' '}
            {[...instructorOptions.entries()].map(([id, name]) => `${name} (${id})`).join(', ')}
          </p>
          {createMode === 'clone' ? (
            <p className="text-xs md:col-span-2 text-[var(--ink-dim)]" role="status">
              {text.cloneDraftReady}
            </p>
          ) : null}
          <button disabled={pending !== null} className="ui-btn ui-btn-primary" type="submit">
            {createMode === 'clone' ? text.createClone : text.create}
          </button>
        </form>
      )}

      {courses.length === 0 ? (
        <p>{text.empty}</p>
      ) : (
        <CoursesTable
          courses={tableCourses}
          bookings={[]}
          usersList={[]}
          instructors={tableInstructors}
          language={language}
          t={t}
          onToggleVisibility={(course) => void handleToggleVisibility(course)}
          onEdit={(course) => {
            setSelectedCourseId(course.id);
            setSelectedCourse(null);
            const canonical = courses.find((candidate) => candidate.courseId === course.id);
            if (canonical) {
              void loadCourseDetail(course.id);
              void editCatalogContent(canonical);
            }
          }}
          onDelete={handleArchive}
          onClone={(course) => void handleClone(course)}
          onMove={(course, direction) => void handleMove(course, direction)}
          archiveInsteadOfDelete
        />
      )}

      {selectedCourse ? (
        <article className="space-y-3 rounded border border-[var(--border)] p-3">
          <p className="text-xs text-[var(--ink-dim)]">
            {selectedCourse.courseId} В· {selectedCourse.lifecycle} В·{' '}
            {selectedCourse.activeEnrollmentCount} active / {selectedCourse.totalEnrollmentCount}{' '}
            total enrollments В· {selectedCourse.courseDays.length} days
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                'change_course_title',
                'change_course_price',
                'change_course_capacity',
                'archive_course',
                'reactivate_course',
                'add_course_roster_instructor',
                'remove_course_roster_instructor',
              ] as const
            )
              .filter((kind) =>
                selectedCourse.authorizedActions.some((action) => action.kind === kind)
              )
              .map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void runCourseAction(selectedCourse, kind)}
                >
                  {kind.replaceAll('_', ' ')}
                </button>
              ))}
            {(
              [
                'create_course_day',
                'reassign_course_day_instructor',
                'reschedule_course_day',
                'remove_course_day',
              ] as const
            )
              .filter((kind) =>
                selectedCourse.authorizedActions.some((action) => action.kind === kind)
              )
              .map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void courseDayAction(selectedCourse, kind)}
                >
                  {kind.replaceAll('_', ' ')}
                </button>
              ))}
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void editCatalogContent(selectedCourse)}
            >
              catalog content
            </button>
          </div>
        </article>
      ) : null}
    </div>
  );
};
