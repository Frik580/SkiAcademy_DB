import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ADMIN_COURSE_READ_MODEL_PAGE_SIZE_MAX,
  CourseCatalogContentInputSchema,
  CourseIdSchema,
  CourseProvisioningManifestSchema,
  InstructorIdSchema,
  IanaTimeZoneSchema,
  intervalsOverlap,
  resolveBookingScheduleFromCalendarInput,
  IdempotencyKeySchema,
  type AdminCourseListItem,
  type AdminCourseReadModel,
  type AdminPlannerReadModel,
  type CommandEnvelope,
  type CommandKind,
  type CourseCatalogContentInput,
  type TimeInterval,
} from '@ski-academy/shared-domain';
import { ZodError, type ZodIssue } from 'zod';
import { executeAuthenticatedCanonicalCommand } from '../../../../lib/canonical/canonicalCommandClient';
import { toCanonicalCommandClientError } from '../../../../lib/canonical/mapCanonicalCommandError';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { AdminLessonDetailTabs } from '../../lesson-bookings/AdminLessonBookingUi';
import { AdminCourseStatusChip, adminFormControls, adminRecordCardClass } from './adminCourseSurface';
import { ActionButton } from '../../../../ui/ActionButton';
import {
  queryAdminCourseReadModels,
  queryAdminPlannerReadModels,
} from '../../../../lib/canonical/canonicalReadModelClient';
import { applyAdminCoursesCommandResult } from '../../courses/adminCoursesLocalSync';
import { applyAdminFinanceCommandResult } from '../../finance/adminFinanceLocalSync';
import { useAdminCoursesRevisionRefresh } from '../../courses/useAdminCoursesRevisionRefresh';
import { useAdminIdentityReadModels } from '../../identity/useAdminIdentityReadModels';
import type { CanonicalCoursesManagerInput } from './adminCourseContracts';
import { useAdminCourseTranslations } from './useAdminCourseTranslations';
import { CanonicalCourseDatabaseList } from './CanonicalCourseDatabaseList';
import { CanonicalCourseDaysEditor } from './CanonicalCourseDaysEditor';
import type { CourseDayDraft } from './CanonicalCourseDayForm';
import { CoursesManagerToolbar } from './form/CoursesManagerToolbar';
import { CourseBackgroundImageField } from './CourseBackgroundImageField';
import {
  catalogContentInputFromCourse,
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

interface CreateFormValidationIssue {
  readonly key: string;
  readonly field: string;
  readonly label: string;
  readonly targetId: string;
  readonly message: string;
}

interface CreateCourseDayRow {
  readonly id: string;
  readonly localDate: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly instructorId: string;
}

interface PlannerAvailabilityForDate {
  readonly item?: AdminPlannerReadModel;
  readonly loading: boolean;
  readonly error?: 'read-failed' | 'incomplete';
}

let courseDayRowSequence = 0;

function newCourseDayRow(input: Partial<Omit<CreateCourseDayRow, 'id'>> = {}): CreateCourseDayRow {
  courseDayRowSequence += 1;
  return {
    id: `course-day-row-${courseDayRowSequence}`,
    localDate: input.localDate ?? '',
    startTime: input.startTime ?? '',
    endTime: input.endTime ?? '',
    instructorId: input.instructorId ?? '',
  };
}

function minutesForDayTimes(startTime: string, endTime: string): number | undefined {
  if (!isValidCourseTime(startTime) || !isValidCourseTime(endTime)) return undefined;
  const toMinutes = (value: string) => {
    const [hour, minute] = value.split(':').map(Number);
    return hour! * 60 + minute!;
  };
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const duration = (end - start + 24 * 60) % (24 * 60);
  return duration === 0 ? 24 * 60 : duration;
}

function endTimeFromDuration(startTime: string, durationMinutes: number): string {
  const [hour, minute] = startTime.split(':').map(Number);
  const end = ((hour! * 60 + minute! + durationMinutes) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

function createCourseDayRowsFromSerialized(value: string): CreateCourseDayRow[] {
  return value
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 4)
    .flatMap((parts) => {
      const [localDate, startTime, durationText, instructorId] = parts as [string, string, string, string];
      const durationMinutes = Number(durationText);
      if (
        !isValidCalendarDate(localDate) ||
        !isValidCourseTime(startTime) ||
        !Number.isInteger(durationMinutes) ||
        durationMinutes < 15 ||
        durationMinutes > 24 * 60
      ) {
        return [];
      }
      return [
        newCourseDayRow({
          localDate,
          startTime,
          endTime: endTimeFromDuration(startTime, durationMinutes),
          instructorId,
        }),
      ];
    });
}

function serializeCreateCourseDayRows(rows: readonly CreateCourseDayRow[]): string {
  return rows
    .flatMap((row) => {
      const durationMinutes = minutesForDayTimes(row.startTime, row.endTime);
      if (
        !isValidCalendarDate(row.localDate) ||
        durationMinutes === undefined ||
        !row.instructorId
      ) {
        return [];
      }
      return [`${row.localDate} ${row.startTime} ${durationMinutes} ${row.instructorId}`];
    })
    .join('\n');
}

function calendarDateOrdinal(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year!, month! - 1, day!);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() / (24 * 60 * 60 * 1_000);
}

function createCourseDayRowsForPeriod(
  startDate: string,
  endDate: string,
  existingRows: readonly CreateCourseDayRow[]
): CreateCourseDayRow[] {
  if (!isValidCalendarDate(startDate) || !isValidCalendarDate(endDate)) return [];
  const startOrdinal = calendarDateOrdinal(startDate);
  const endOrdinal = calendarDateOrdinal(endDate);
  if (endOrdinal < startOrdinal) return [];

  const existingByDate = new Map(existingRows.map((row) => [row.localDate, row]));
  const dayCount = Math.min(endOrdinal - startOrdinal + 1, 65);
  return Array.from({ length: dayCount }, (_, index) => {
    const localDate = new Date((startOrdinal + index) * 24 * 60 * 60 * 1_000)
      .toISOString()
      .slice(0, 10);
    return existingByDate.get(localDate) ?? newCourseDayRow({ localDate });
  });
}

function plannerDateWindows(localDates: readonly string[]) {
  const sortedDates = [...new Set(localDates.filter(isValidCalendarDate))].sort();
  const windows: Array<{ readonly localDate: string; readonly dates: string[]; readonly windowDays: number }> = [];
  let index = 0;
  while (index < sortedDates.length) {
    const localDate = sortedDates[index]!;
    const startOrdinal = calendarDateOrdinal(localDate);
    const dates: string[] = [];
    while (
      index < sortedDates.length &&
      calendarDateOrdinal(sortedDates[index]!) - startOrdinal <= 60
    ) {
      dates.push(sortedDates[index]!);
      index += 1;
    }
    const lastOrdinal = calendarDateOrdinal(dates[dates.length - 1]!);
    windows.push({
      localDate,
      dates,
      // Include the day after the last selected date for sessions that end after midnight.
      windowDays: Math.max(2, lastOrdinal - startOrdinal + 2),
    });
  }
  return windows;
}

function courseDayInterval(row: CreateCourseDayRow, timeZone: string) {
  const durationMinutes = minutesForDayTimes(row.startTime, row.endTime);
  if (!durationMinutes || !isValidCalendarDate(row.localDate)) return undefined;
  try {
    const resolved = resolveBookingScheduleFromCalendarInput(
      { localDate: row.localDate, localTime: row.startTime, durationMinutes },
      IanaTimeZoneSchema.parse(timeZone)
    );
    return { interval: resolved.interval, durationMinutes };
  } catch {
    return undefined;
  }
}

function courseDayDateSummary(rows: readonly CreateCourseDayRow[]): string {
  const dates = rows
    .filter((row) => isValidCalendarDate(row.localDate))
    .map((row) => row.localDate)
    .sort();
  if (dates.length === 0) return '';
  const format = (date: string) => {
    const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)!;
    return `${day}.${month}.${year}`;
  };
  const first = format(dates[0]!);
  const last = format(dates[dates.length - 1]!);
  return first === last ? first : `${first} – ${last}`;
}

function courseDurationSummary(rows: readonly CreateCourseDayRow[], language: 'en' | 'ru'): string {
  const durations = rows
    .map((row) => minutesForDayTimes(row.startTime, row.endTime))
    .filter((value): value is number => value !== undefined);
  if (durations.length === 0) return '';
  const totalMinutes = durations.reduce((sum, value) => sum + value, 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const time = language === 'ru'
    ? `${hours ? `${hours} ч.` : ''}${minutes ? `${hours ? ' ' : ''}${minutes} мин.` : ''}`
    : `${hours ? `${hours} hr${hours === 1 ? '' : 's'}` : ''}${minutes ? `${hours ? ' ' : ''}${minutes} min` : ''}`;
  const dayCount = durations.length;
  if (language === 'ru') {
    const lastTwo = dayCount % 100;
    const last = dayCount % 10;
    const noun = lastTwo >= 11 && lastTwo <= 14 ? 'дней' : last === 1 ? 'день' : last >= 2 && last <= 4 ? 'дня' : 'дней';
    return `${dayCount} ${noun} (${time})`;
  }
  return `${dayCount} ${dayCount === 1 ? 'day' : 'days'} (${time})`;
}

function availableInstructorIdsForCourseDay(
  row: CreateCourseDayRow,
  rows: readonly CreateCourseDayRow[],
  rosterIds: readonly string[],
  availability: PlannerAvailabilityForDate | undefined,
  timeZone: string
): string[] {
  const candidate = courseDayInterval(row, timeZone);
  const model = availability?.item;
  if (!candidate || !model || availability?.loading || availability?.error) return [];
  const availableIds = new Set<string>(
    model.instructors
      .filter((instructor) => instructor.isAvailable)
      .map((instructor) => instructor.instructorId as string)
  );
  return rosterIds.filter((instructorId) => {
    if (!availableIds.has(instructorId)) return false;
    const hasExistingConflict = model.occupancy.some(
      (item) =>
        item.instructorId === instructorId && intervalsOverlap(candidate.interval, item.interval)
    );
    if (hasExistingConflict) return false;
    return !rows.some((other) => {
      if (other.id === row.id || other.instructorId !== instructorId) return false;
      const otherInterval = courseDayInterval(other, timeZone);
      return Boolean(otherInterval && intervalsOverlap(candidate.interval, otherInterval.interval));
    });
  });
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidCourseTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isValidCourseImageUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
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
  discipline: '',
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
    discipline: content.discipline ?? '',
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
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const [createValidationIssues, setCreateValidationIssues] = useState<
    readonly CreateFormValidationIssue[]
  >([]);
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [workspaceSection, setWorkspaceSection] = useState<
    'overview' | 'schedule' | 'instructors' | 'participants' | 'enrollment' | 'settings'
  >('overview');
  const [createMode, setCreateMode] = useState<'create' | 'clone'>('create');
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [createCourseDays, setCreateCourseDays] = useState<CreateCourseDayRow[]>([]);
  const [createPeriodStart, setCreatePeriodStart] = useState('');
  const [createPeriodEnd, setCreatePeriodEnd] = useState('');
  const [plannerAvailabilityByDate, setPlannerAvailabilityByDate] = useState<
    Record<string, PlannerAvailabilityForDate>
  >({});
  const [availabilityRefreshToken, setAvailabilityRefreshToken] = useState(0);
  const [editForm, setEditForm] = useState<CreateFormState | null>(null);
  const [editOriginal, setEditOriginal] = useState<AdminCourseReadModel | null>(null);
  const [editReason, setEditReason] = useState('');
  const [imageUploaderOpen, setImageUploaderOpen] = useState(false);
  const [courseDayDraft, setCourseDayDraft] = useState<CourseDayDraft | null>(null);
  const [courseDayIssue, setCourseDayIssue] = useState<{
    readonly courseDayId?: string;
    readonly message: string;
  } | null>(null);
  const createAttemptRef = useRef<CreateAttempt | null>(null);
  const cloneDraftRef = useRef<CanonicalCourseCloneDraft | null>(null);
  const createPresentationDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const commandInFlightRef = useRef(false);
  const plannerAvailabilityRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const listRequestRef = useRef<Record<CourseLifecycleScope, number>>({ active: 0, archived: 0 });
  const instructorReads = useAdminIdentityReadModels({
    enabled: showCreate || selectedCourseId !== null,
    directory: 'instructors',
    search: '',
    pageSize: 50,
  });

  const loadCoursePage = useCallback(
    async (scope: CourseLifecycleScope, cursor?: string, append = false, quiet = false) => {
      const requestId = ++listRequestRef.current[scope];
      setCourseLists((previous) => ({
        ...previous,
        [scope]: {
          ...previous[scope],
          loadingInitial: !append && !quiet,
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

  useAdminCoursesRevisionRefresh(() => {
    void loadCoursePage(lifecycleScope, undefined, false, true);
    if (selectedCourseId) {
      void loadCourseDetail(selectedCourseId);
    }
  }, true);

  const instructorOptions = useMemo(
    () =>
      new Map(
        instructorReads.instructors.items.map((instructor) => [instructor.instructorId, instructor])
      ),
    [instructorReads.instructors.items]
  );
  const selectedCourseDayDates = useMemo(
    () => [...new Set(createCourseDays.map((row) => row.localDate).filter(isValidCalendarDate))],
    [createCourseDays]
  );

  useEffect(() => {
    const requestId = ++plannerAvailabilityRequestRef.current;
    const dates = selectedCourseDayDates;
    if (!showCreate || dates.length === 0) {
      setPlannerAvailabilityByDate({});
      return () => {
        if (plannerAvailabilityRequestRef.current === requestId) {
          plannerAvailabilityRequestRef.current += 1;
        }
      };
    }

    const timeZone = IanaTimeZoneSchema.safeParse(createForm.timeZone);
    if (!timeZone.success) {
      setPlannerAvailabilityByDate(
        Object.fromEntries(dates.map((date) => [date, { loading: false, error: 'read-failed' }]))
      );
      return;
    }

    setPlannerAvailabilityByDate(
      Object.fromEntries(dates.map((date) => [date, { loading: true }]))
    );
    const windows = plannerDateWindows(dates);
    void Promise.all(
      windows.map(async (window) => {
        try {
          const result = await queryAdminPlannerReadModels({
            scope: 'admin_planner',
            localDate: window.localDate,
            view: 'day',
            timeZone: timeZone.data,
            windowDays: window.windowDays,
          });
          const availability: PlannerAvailabilityForDate = result.item.truncated
            ? { item: result.item, loading: false, error: 'incomplete' }
            : { item: result.item, loading: false };
          return { dates: window.dates, availability };
        } catch {
          return {
            dates: window.dates,
            availability: { loading: false, error: 'read-failed' } satisfies PlannerAvailabilityForDate,
          };
        }
      })
    ).then((results) => {
      if (plannerAvailabilityRequestRef.current !== requestId) return;
      setPlannerAvailabilityByDate(
        Object.fromEntries(
          results.flatMap(({ dates: windowDates, availability }) =>
            windowDates.map((date) => [date, availability] as const)
          )
        )
      );
    });

    return () => {
      if (plannerAvailabilityRequestRef.current === requestId) {
        plannerAvailabilityRequestRef.current += 1;
      }
    };
  }, [availabilityRefreshToken, createForm.timeZone, selectedCourseDayDates, showCreate]);
  const tableCourses = useMemo(() => courses.map(mapAdminCourseToTableCourse), [courses]);
  const visibleTableCourses = useMemo(() => {
    const query = listQuery.trim().toLowerCase();
    if (!query) return tableCourses;
    return tableCourses.filter((course) =>
      `${course.title} ${course.titleRu ?? ''} ${course.dates}`.toLowerCase().includes(query)
    );
  }, [listQuery, tableCourses]);
  const loadedEnrollment = useMemo(() => {
    const active = courseLists.active.items;
    return {
      occupied: active.reduce((sum, course) => sum + course.capacity.occupiedConfirmedSeats, 0),
      seats: active.reduce((sum, course) => sum + course.capacity.totalSeats, 0),
    };
  }, [courseLists.active.items]);
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
      setCourseDayIssue(null);
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
          const message = commandError(result.error.code);
          setMutationError(message);
          if (
            input.kind === 'create_course_day' ||
            input.kind === 'reassign_course_day_instructor' ||
            input.kind === 'reschedule_course_day' ||
            input.kind === 'remove_course_day'
          ) {
            const courseDayId = (input.intent as { readonly courseDayId?: string }).courseDayId;
            setCourseDayIssue({ ...(courseDayId ? { courseDayId } : {}), message });
          }
          if (input.kind === 'apply_canonical_course_provisioning_manifest') {
            setCreateFormError(message);
          }
          return false;
        }
        applyAdminCoursesCommandResult(result);
        applyAdminFinanceCommandResult(result);
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
        const message = commandError(normalized.code);
        setMutationError(message);
        if (
          input.kind === 'create_course_day' ||
          input.kind === 'reassign_course_day_instructor' ||
          input.kind === 'reschedule_course_day' ||
          input.kind === 'remove_course_day'
        ) {
          const courseDayId = (input.intent as { readonly courseDayId?: string }).courseDayId;
          setCourseDayIssue({ ...(courseDayId ? { courseDayId } : {}), message });
        }
        if (input.kind === 'apply_canonical_course_provisioning_manifest') {
          setCreateFormError(message);
        }
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
    setCreateFormError(null);
    setCreateValidationIssues([]);
    setCreateMode('create');
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateCourseDays([]);
    setCreatePeriodStart('');
    setCreatePeriodEnd('');
  };

  const updateCreateField = <Field extends keyof CreateFormState>(
    field: Field,
    value: CreateFormState[Field]
  ) => {
    createAttemptRef.current = null;
    setCreateFormError(null);
    setCreateValidationIssues((issues) =>
      issues.filter((issue) => issue.field !== field && !(field === 'roster' && issue.field === 'days'))
    );
    setCreateForm((state) => ({ ...state, [field]: value }));
  };

  const updateCreateCourseDays = (rows: CreateCourseDayRow[]) => {
    createAttemptRef.current = null;
    setCreateFormError(null);
    setCreateValidationIssues((issues) => issues.filter((issue) => issue.field !== 'days'));
    setCreateCourseDays(rows);
    setCreateForm((state) => ({ ...state, days: serializeCreateCourseDayRows(rows) }));
  };

  const updateCreatePeriod = (field: 'start' | 'end', value: string) => {
    createAttemptRef.current = null;
    setCreateFormError(null);
    setCreateValidationIssues((issues) => issues.filter((issue) => issue.field !== 'days'));
    const startDate = field === 'start' ? value : createPeriodStart;
    const endDate = field === 'end' ? value : createPeriodEnd;
    setCreatePeriodStart(startDate);
    setCreatePeriodEnd(endDate);
    const rows = createCourseDayRowsForPeriod(startDate, endDate, createCourseDays);
    setCreateCourseDays(rows);
    setCreateForm((state) => ({ ...state, days: serializeCreateCourseDayRows(rows) }));
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
    if (commandInFlightRef.current) return;

    setCreateFormError(null);
    setCreateValidationIssues([]);

    const fieldLabels: Record<string, string> = {
      title: language === 'ru' ? 'Название' : 'Title',
      titleRu: language === 'ru' ? 'Название на русском' : 'Russian title',
      price: language === 'ru' ? 'Цена (KZT)' : 'Price (KZT)',
      totalSeats: language === 'ru' ? 'Вместимость' : 'Capacity',
      timeZone: language === 'ru' ? 'Часовой пояс' : 'Time zone',
      roster: language === 'ru' ? 'Состав инструкторов' : 'Instructor roster',
      days: 'CourseDays',
      duration: language === 'ru' ? 'Длительность' : 'Duration',
      description: language === 'ru' ? 'Описание' : 'Description',
      dates: language === 'ru' ? 'Даты' : 'Dates',
      bgImageUrl: language === 'ru' ? 'Ссылка на изображение' : 'Background image URL',
      shortDescription: language === 'ru' ? 'Краткое описание' : 'Short description',
      shortDescriptionRu:
        language === 'ru' ? 'Краткое описание на русском' : 'Russian short description',
      detailedDescription: language === 'ru' ? 'Подробное описание' : 'Detailed description',
      detailedDescriptionRu:
        language === 'ru' ? 'Подробное описание на русском' : 'Russian detailed description',
      badge: language === 'ru' ? 'Метка' : 'Badge',
      badgeRu: language === 'ru' ? 'Метка на русском' : 'Russian badge',
      level: language === 'ru' ? 'Уровень' : 'Level',
      discipline: language === 'ru' ? 'Дисциплина' : 'Discipline',
      levelLabel: language === 'ru' ? 'Подпись уровня' : 'Level label',
      videoUrl: language === 'ru' ? 'Ссылка на видео' : 'Video URL',
      benefits: language === 'ru' ? 'Преимущества' : 'Benefits',
      benefitsRu: language === 'ru' ? 'Преимущества на русском' : 'Russian benefits',
      program: language === 'ru' ? 'Программа' : 'Program',
      programRu: language === 'ru' ? 'Программа на русском' : 'Russian program',
      faq: 'FAQ',
      faqRu: language === 'ru' ? 'FAQ на русском' : 'Russian FAQ',
      galleryPhotos: language === 'ru' ? 'Фотографии галереи' : 'Gallery photos',
    };
    const targetIdForField = (field: string) =>
      field === 'roster' ? 'canonical-course-instructor-roster' : `canonical-course-${field}`;
    const makeIssue = (
      field: string,
      message: string,
      key = field,
      targetId = targetIdForField(field),
      label = fieldLabels[field] ?? field
    ): CreateFormValidationIssue => ({ key, field, label, targetId, message });
    const makeDayIssue = (
      row: CreateCourseDayRow,
      index: number,
      field: 'date' | 'start' | 'end' | 'instructor',
      message: string
    ) =>
      makeIssue(
        'days',
        message,
        `days:${row.id}:${field}`,
        `canonical-course-day-${row.id}-${field}`,
        language === 'ru'
          ? `День ${index + 1} — ${field === 'date' ? 'дата' : field === 'start' ? 'начало' : field === 'end' ? 'окончание' : 'инструктор'}`
          : `Day ${index + 1} ${field === 'date' ? 'date' : field === 'start' ? 'start time' : field === 'end' ? 'end time' : 'instructor'}`
      );
    const reportIssues = (issues: readonly CreateFormValidationIssue[]) => {
      if (issues.length === 0) return;
      setCreateValidationIssues(issues);
      setCreateFormError(null);
      const firstIssue = issues[0]!;
      if (
        [
          'description',
          'shortDescription',
          'shortDescriptionRu',
          'detailedDescription',
          'detailedDescriptionRu',
          'badge',
          'badgeRu',
          'level',
          'discipline',
          'levelLabel',
          'videoUrl',
          'benefits',
          'benefitsRu',
          'program',
          'programRu',
          'faq',
          'faqRu',
          'galleryPhotos',
        ].includes(firstIssue.field)
      ) {
        if (createPresentationDetailsRef.current) createPresentationDetailsRef.current.open = true;
      }
      document.getElementById(firstIssue.targetId)?.focus();
    };
    const messageForZodIssue = (issue: ZodIssue): CreateFormValidationIssue => {
      const path = issue.path.map(String);
      const issueRoot = path[0] === 'presentation' ? path[1] : path[0];
      const field =
        issueRoot === 'instructorRosterIds'
          ? 'roster'
          : issueRoot === 'days' || issueRoot === undefined
            ? 'days'
            : issueRoot;
      const dayIndex = path[0] === 'days' && /^\d+$/.test(path[1] ?? '') ? Number(path[1]) + 1 : 0;
      const dayField = path[dayIndex > 0 ? 2 : 1];
      let message: string;
      if (field === 'days' && dayField === 'localDate') {
        message = language === 'ru'
          ? `Строка ${dayIndex}: укажите существующую дату в формате YYYY-MM-DD.`
          : `Line ${dayIndex}: enter a real date in YYYY-MM-DD format.`;
      } else if (field === 'days' && dayField === 'localTime') {
        message = language === 'ru'
          ? `Строка ${dayIndex}: укажите время в формате HH:mm.`
          : `Line ${dayIndex}: enter a time in HH:mm format.`;
      } else if (field === 'days' && dayField === 'durationMinutes') {
        message = language === 'ru'
          ? `Строка ${dayIndex}: длительность должна быть целым числом от 15 до 1440 минут.`
          : `Line ${dayIndex}: duration must be a whole number from 15 to 1440 minutes.`;
      } else if (field === 'days' && dayField === 'instructorId') {
        message = language === 'ru'
          ? `Строка ${dayIndex}: укажите корректный ID инструктора из состава курса.`
          : `Line ${dayIndex}: enter a valid instructor ID from the course roster.`;
      } else if (field === 'days') {
        message = language === 'ru'
          ? 'Добавьте хотя бы один день; дни должны идти в хронологическом порядке.'
          : 'Add at least one CourseDay and keep days in chronological order.';
      } else if (field === 'roster') {
        message = language === 'ru'
          ? 'Выберите от 1 до 16 корректных инструкторов курса.'
          : 'Select between 1 and 16 valid Course instructors.';
      } else if (field === 'timeZone') {
        message = language === 'ru'
          ? 'Укажите корректный часовой пояс IANA, например Asia/Almaty.'
          : 'Enter a valid IANA time zone, such as Asia/Almaty.';
      } else if (field === 'title') {
        message = language === 'ru'
          ? 'Название обязательно и должно содержать не более 200 символов.'
          : 'Title is required and must be at most 200 characters.';
      } else if (field === 'price') {
        message = language === 'ru'
          ? 'Укажите целую сумму в KZT в допустимом диапазоне.'
          : 'Enter a whole-number KZT price in the allowed range.';
      } else if (field === 'totalSeats') {
        message = text.capacityRange;
      } else if (field === 'duration') {
        message = language === 'ru'
          ? 'Укажите длительность курса (не более 200 символов).'
          : 'Enter a course duration of at most 200 characters.';
      } else if (field === 'bgImageUrl') {
        message = language === 'ru'
          ? 'Укажите корректный URL изображения.'
          : 'Enter a valid image URL.';
      } else if (field === 'titleRu') {
        message = language === 'ru'
          ? 'Название на русском должно содержать не более 200 символов.'
          : 'Russian title must be at most 200 characters.';
      } else if (field === 'description') {
        message = language === 'ru'
          ? 'Описание должно содержать не более 10 000 символов.'
          : 'Description must be at most 10,000 characters.';
      } else {
        message = language === 'ru'
          ? 'Проверьте значение и допустимую длину поля.'
          : 'Check this value and the allowed field length.';
      }
      return makeIssue(field, message, `${path.join('.') || field}:${issue.code}`);
    };

    try {
      const issues: CreateFormValidationIssue[] = [];
      if (!createForm.title.trim()) {
        issues.push(makeIssue('title', language === 'ru' ? 'Укажите название курса.' : 'Enter a course title.'));
      }
      if (!createForm.discipline) {
        issues.push(makeIssue(
          'discipline',
          language === 'ru' ? 'Выберите дисциплину курса.' : 'Select a course discipline.'
        ));
      }
      if (!createForm.price.trim()) {
        issues.push(makeIssue('price', language === 'ru' ? 'Укажите цену в KZT.' : 'Enter a KZT price.'));
      }
      if (!createForm.totalSeats.trim()) {
        issues.push(makeIssue('totalSeats', text.capacityRange));
      }
      if (!createForm.timeZone.trim()) {
        issues.push(makeIssue('timeZone', language === 'ru' ? 'Укажите часовой пояс.' : 'Enter a time zone.'));
      } else if (!IanaTimeZoneSchema.safeParse(createForm.timeZone).success) {
        issues.push(makeIssue(
          'timeZone',
          language === 'ru'
            ? 'Укажите корректный часовой пояс IANA, например Asia/Almaty.'
            : 'Enter a valid IANA time zone, such as Asia/Almaty.'
        ));
      }

      const roster = createForm.roster
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (roster.length === 0) {
        issues.push(makeIssue(
          'roster',
          language === 'ru'
            ? 'Выберите хотя бы одного инструктора курса.'
            : 'Select at least one instructor for this Course.'
        ));
      } else if (roster.length > 16) {
        issues.push(makeIssue(
          'roster',
          language === 'ru'
            ? 'В составе курса может быть не более 16 инструкторов.'
            : 'A Course can have at most 16 instructors in its roster.'
        ));
      }
      const totalSeats = Number(createForm.totalSeats);
      if (createForm.totalSeats.trim() && (!Number.isInteger(totalSeats) || totalSeats < 1 || totalSeats > 64)) {
        issues.push(makeIssue('totalSeats', text.capacityRange));
      }

      if (!createForm.bgImageUrl.trim() || !isValidCourseImageUrl(createForm.bgImageUrl.trim())) {
        issues.push(makeIssue(
          'bgImageUrl',
          language === 'ru'
            ? 'Укажите корректный URL изображения.'
            : 'Enter a valid image URL.'
        ));
      }

      const parsedDayLines: Array<{
        readonly localDate: string;
        readonly localTime: string;
        readonly durationMinutes: number;
        readonly instructorId: string;
        readonly interval: TimeInterval;
      }> = [];
      if (createMode === 'create' && (!isValidCalendarDate(createPeriodStart) || !isValidCalendarDate(createPeriodEnd))) {
        const focusEnd = isValidCalendarDate(createPeriodStart);
        issues.push(makeIssue(
          'days',
          language === 'ru'
            ? 'Выберите начало и окончание периода курса в календаре.'
            : 'Choose the course period start and end dates from the calendar.',
          'period',
          focusEnd ? 'canonical-course-period-end' : 'canonical-course-period-start',
          language === 'ru' ? 'Период курса' : 'Course period'
        ));
      } else if (createMode === 'create' && calendarDateOrdinal(createPeriodEnd) < calendarDateOrdinal(createPeriodStart)) {
        issues.push(makeIssue(
          'days',
          language === 'ru'
            ? 'Окончание периода не может быть раньше его начала.'
            : 'The period end cannot be earlier than its start.',
          'period',
          'canonical-course-period-end',
          language === 'ru' ? 'Период курса' : 'Course period'
        ));
      }
      if (createCourseDays.length === 0 && createMode === 'clone') {
        issues.push(makeIssue(
          'days',
          language === 'ru' ? 'Добавьте хотя бы один день курса.' : 'Add at least one CourseDay.'
        ));
      } else if (createCourseDays.length > 64) {
        issues.push(makeIssue(
          'days',
          language === 'ru'
            ? 'На курс можно добавить не более 64 дней.'
            : 'A Course can have at most 64 CourseDays.'
        ));
      }
      if (createCourseDays.length <= 64) createCourseDays.forEach((row, index) => {
        let valid = true;
        if (!isValidCalendarDate(row.localDate)) {
          valid = false;
          issues.push(makeDayIssue(
            row,
            index,
            'date',
            language === 'ru' ? 'Выберите дату курса в календаре.' : 'Choose a course date from the calendar.'
          ));
        }
        if (!isValidCourseTime(row.startTime)) {
          valid = false;
          issues.push(makeDayIssue(
            row,
            index,
            'start',
            language === 'ru' ? 'Укажите время начала в формате 00:00.' : 'Choose a start time in 00:00 format.'
          ));
        }
        if (!isValidCourseTime(row.endTime)) {
          valid = false;
          issues.push(makeDayIssue(
            row,
            index,
            'end',
            language === 'ru' ? 'Укажите время окончания в формате 00:00.' : 'Choose an end time in 00:00 format.'
          ));
        }
        const durationMinutes = minutesForDayTimes(row.startTime, row.endTime);
        if (durationMinutes === undefined || durationMinutes < 15 || durationMinutes > 24 * 60) {
          valid = false;
          issues.push(makeDayIssue(
            row,
            index,
            'end',
            language === 'ru'
              ? 'Интервал дня должен длиться от 15 минут до 24 часов.'
              : 'The daily time range must be from 15 minutes to 24 hours.'
          ));
        }
        if (!InstructorIdSchema.safeParse(row.instructorId).success) {
          valid = false;
          issues.push(makeDayIssue(
            row,
            index,
            'instructor',
            language === 'ru' ? 'Выберите инструктора.' : 'Choose an instructor.'
          ));
        } else if (!roster.includes(row.instructorId)) {
          valid = false;
          issues.push(makeDayIssue(
            row,
            index,
            'instructor',
            language === 'ru'
              ? 'Инструктор должен входить в выбранный состав курса.'
              : 'The instructor must be selected in the course roster.'
          ));
        }

        const interval = courseDayInterval(row, createForm.timeZone);
        if (interval && InstructorIdSchema.safeParse(row.instructorId).success && roster.includes(row.instructorId)) {
          const availability = plannerAvailabilityByDate[row.localDate];
          if (availability?.loading) {
            valid = false;
            issues.push(makeDayIssue(
              row,
              index,
              'instructor',
              language === 'ru' ? 'Дождитесь проверки доступности инструкторов.' : 'Wait for instructor availability to finish loading.'
            ));
          } else if (!availability?.item || availability.error) {
            valid = false;
            issues.push(makeDayIssue(
              row,
              index,
              'instructor',
              language === 'ru'
                ? availability?.error === 'incomplete'
                  ? 'Слишком много записей для проверки доступности. Уточните расписание и повторите.'
                  : 'Не удалось проверить доступность инструкторов. Повторите попытку.'
                : availability?.error === 'incomplete'
                  ? 'Too many schedule entries to confirm availability. Review the schedule and retry.'
                  : 'Instructor availability could not be checked. Retry the availability check.'
            ));
          } else if (
            !availableInstructorIdsForCourseDay(
              row,
              createCourseDays,
              roster,
              availability,
              createForm.timeZone
            ).includes(row.instructorId)
          ) {
            valid = false;
            issues.push(makeDayIssue(
              row,
              index,
              'instructor',
              language === 'ru'
                ? 'Инструктор занят или недоступен в это время. Выберите другого.'
                : 'This instructor is busy or unavailable at this time. Choose another.'
            ));
          }
        }
        if (valid && interval && durationMinutes !== undefined) {
          parsedDayLines.push({
            localDate: row.localDate,
            localTime: row.startTime,
            durationMinutes,
            instructorId: row.instructorId,
            interval: interval.interval,
          });
        }
      });

      parsedDayLines.sort((left, right) => left.interval.startsAt.seconds - right.interval.startsAt.seconds);
      for (let index = 1; index < parsedDayLines.length; index += 1) {
        if (parsedDayLines[index]!.interval.startsAt.seconds <= parsedDayLines[index - 1]!.interval.startsAt.seconds) {
          issues.push(makeIssue(
            'days',
            language === 'ru'
              ? 'Для каждого CourseDay укажите отдельное время начала; дни должны идти в хронологическом порядке.'
              : 'Give each CourseDay a distinct start time and keep the schedule chronological.'
          ));
          break;
        }
      }

      if (issues.length > 0) {
        reportIssues(issues);
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
      const days = parsedDayLines.map(({ interval: _interval, ...day }, index) => ({
        courseDayId: `course_day_${seed}_${index + 1}`,
        dayOrder: index + 1,
        ...day,
      }));
      const presentationForm: CreateFormState = {
        ...createForm,
        dates: courseDayDateSummary(createCourseDays),
        duration: courseDurationSummary(createCourseDays, language),
      };
      const presentation: CourseCatalogContentInput = catalogContentInputFromCreateForm(
        presentationForm,
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
    } catch (caught) {
      if (caught instanceof ZodError) {
        reportIssues(caught.issues.map(messageForZodIssue));
        return;
      }
      setCreateFormError(caught instanceof Error ? caught.message : text.mutationFailed);
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
    if (editOriginal.catalogContent.content?.discipline && !editForm.discipline) {
      setMutationError(
        language === 'ru' ? 'Выберите дисциплину курса.' : 'Select a course discipline.'
      );
      return;
    }
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
    const durationMinutes = minutesForDayTimes(courseDayDraft.localTime, courseDayDraft.endTime);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(courseDayDraft.localDate) ||
      durationMinutes === undefined ||
      durationMinutes < 15
    ) {
      setMutationError(commandError('validation'));
      return;
    }
    const day = courseDayDraft.courseDayId
      ? selectedCourse.courseDays.find((item) => item.courseDayId === courseDayDraft.courseDayId)
      : undefined;
    const reasonExplanation = editReason.trim() || 'Admin CourseDay edit';
    if (courseDayDraft.kind === 'create_course_day') {
      const action = selectedCourse.authorizedActions.find(
        (candidate) => candidate.kind === 'create_course_day'
      );
      if (!action) {
        setMutationError(text.permissionDenied);
        return;
      }
      if (
        await execute({
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
        })
      )
        setCourseDayDraft(null);
      return;
    }
    if (!day) return;
    const local = localDateTimeFromTimestamp(day.interval.startsAt.seconds, day.timeZone);
    const originalDuration = Math.max(
      15,
      Math.round((day.interval.endsAt.seconds - day.interval.startsAt.seconds) / 60)
    );
    const scheduleChanged =
      courseDayDraft.localDate !== local.date ||
      courseDayDraft.localTime !== local.time ||
      durationMinutes !== originalDuration;
    const instructorChanged = courseDayDraft.instructorId !== (day.actualInstructorIds[0] ?? '');
    if (!scheduleChanged && !instructorChanged) {
      setCourseDayDraft(null);
      return;
    }
    if (scheduleChanged) {
      const action = selectedCourse.authorizedActions.find(
        (candidate) => candidate.kind === 'reschedule_course_day'
      );
      if (!action) {
        setMutationError(text.permissionDenied);
        return;
      }
      const saved = await execute({
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
      });
      if (!saved) return;
    }
    if (instructorChanged) {
      const action = selectedCourse.authorizedActions.find(
        (candidate) => candidate.kind === 'reassign_course_day_instructor'
      );
      if (!action) {
        setMutationError(text.permissionDenied);
        return;
      }
      const saved = await execute({
        kind: 'reassign_course_day_instructor',
        expectedRevision: day.revision,
        intent: {
          courseId: selectedCourse.courseId,
          courseDayId: day.courseDayId,
          instructorId: courseDayDraft.instructorId as never,
          reasonExplanation,
        },
      });
      if (!saved) return;
    }
    setCourseDayDraft(null);
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
    if (showCreate) {
      resetCreateForm();
      setShowCreate(false);
    }
    setWorkspaceSection('overview');
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
      setCreateCourseDays(createCourseDayRowsFromSerialized(draft.form.days));
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

  const catalogHidden =
    selectedCourse?.catalogContent.content?.isHidden === true ||
    selectedCourse?.lifecycle === 'archived';
  const createFieldIssue = (field: string) =>
    createValidationIssues.find((issue) => issue.field === field);
  const createFieldLabel = (field: string) => {
    const labels =
      language === 'ru'
        ? {
            title: 'Название',
            titleRu: 'Название (RU)',
            price: 'Цена (KZT)',
            totalSeats: 'Вместимость',
            timeZone: 'Часовой пояс',
            bgImageUrl: 'URL изображения',
            description: 'Описание',
            shortDescription: 'Краткое описание (EN)',
            shortDescriptionRu: 'Краткое описание (RU)',
            detailedDescription: 'Подробное описание (EN)',
            detailedDescriptionRu: 'Подробное описание (RU)',
            badge: 'Бейдж',
            badgeRu: 'Бейдж (RU)',
            level: 'Уровень',
            discipline: 'Дисциплина',
            levelLabel: 'Подпись уровня',
            videoUrl: 'Ссылка на видео',
            benefits: 'Преимущества (по одному в строке)',
            benefitsRu: 'Преимущества RU (по одному в строке)',
            program: 'Программа EN (день | заголовок | описание)',
            programRu: 'Программа RU (день | заголовок | описание)',
            faq: 'FAQ EN (вопрос | ответ)',
            faqRu: 'FAQ RU (вопрос | ответ)',
            galleryPhotos: 'Галерея (один URL в строке)',
            order: 'Порядок',
          }
        : {
            title: 'Title',
            titleRu: 'Title (RU)',
            price: 'Price (KZT)',
            totalSeats: 'Capacity',
            timeZone: 'Time zone',
            bgImageUrl: 'Image URL',
            description: 'Description',
            shortDescription: 'Short description (EN)',
            shortDescriptionRu: 'Short description (RU)',
            detailedDescription: 'Detailed description (EN)',
            detailedDescriptionRu: 'Detailed description (RU)',
            badge: 'Badge',
            badgeRu: 'Badge (RU)',
            level: 'Level',
            discipline: 'Discipline',
            levelLabel: 'Level label',
            videoUrl: 'Video URL',
            benefits: 'Benefits (one per line)',
            benefitsRu: 'Benefits RU (one per line)',
            program: 'Program EN (day | title | description)',
            programRu: 'Program RU (day | title | description)',
            faq: 'FAQ EN (question | answer)',
            faqRu: 'FAQ RU (question | answer)',
            galleryPhotos: 'Gallery (one URL per line)',
            order: 'Order',
          };
    return labels[field as keyof typeof labels] ?? field;
  };
  const instructorOptionById = (id: string) => {
    const parsedId = InstructorIdSchema.safeParse(id);
    return parsedId.success ? instructorOptions.get(parsedId.data) : undefined;
  };
  const renderCreateFieldError = (field: string) => {
    const issue = createFieldIssue(field);
    return issue ? (
      <p id={`canonical-course-${field}-error`} className="text-xs text-red-700">
        {issue.message}
      </p>
    ) : null;
  };
  const showWorkspace = (
    ...sections: Array<typeof workspaceSection>
  ) => workspaceSection === 'overview' || sections.includes(workspaceSection);
  const courseWorkspaceSections = useMemo(
    () =>
      [
        { id: 'overview' as const, label: language === 'ru' ? 'Обзор' : 'Overview' },
        { id: 'schedule' as const, label: language === 'ru' ? 'Расписание' : 'Schedule' },
        { id: 'instructors' as const, label: language === 'ru' ? 'Инструкторы' : 'Instructors' },
        { id: 'participants' as const, label: language === 'ru' ? 'Участники' : 'Participants' },
        { id: 'enrollment' as const, label: language === 'ru' ? 'Запись' : 'Enrollment' },
        { id: 'settings' as const, label: language === 'ru' ? 'Настройки' : 'Settings' },
      ] satisfies ReadonlyArray<{ id: typeof workspaceSection; label: string }>,
    [language]
  );

  return (
    <div
      className="relative space-y-6"
      aria-busy={pending !== null || currentList.loadingInitial || currentList.loadingMore}
    >
      {mutationError && mutationError !== courseDayIssue?.message ? (
        <div role="alert" className="border border-red-500/30 bg-red-500/5 p-3 text-xs">
          {mutationError}
        </div>
      ) : null}
      {pending ? (
        <div role="status" className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          {text.pending}
        </div>
      ) : null}
      {stale ? (
        <div role="status" className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          {text.stale}
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,38fr)_minmax(0,62fr)]">
        <section
          aria-label={t('adminCourseDatabaseListLabel')}
          className="overflow-hidden rounded-[var(--radius)] bg-[var(--card-bg)] shadow-[var(--shadow-soft)]"
        >
          <div className="space-y-3 border-b border-[var(--border)] p-3">
            <div className="inline-flex rounded-full bg-[var(--profile-bg)] p-1" role="tablist" aria-label={text.lifecycle}>
              {(['active', 'archived'] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  role="tab"
                  aria-selected={lifecycleScope === scope}
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
                    setWorkspaceSection('overview');
                  }}
                  className={`px-4 py-2 text-xs font-semibold transition-colors ${
                    lifecycleScope === scope
                      ? 'bg-[var(--ink)] text-[var(--bg)] shadow-sm'
                      : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                >
                  {scope === 'active' ? text.active : text.archived}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  [
                    'active-loaded',
                    language === 'ru' ? 'Активные' : 'Active',
                    courseLists.active.initialized ? String(courseLists.active.items.length) : '—',
                  ],
                  [
                    'archived-loaded',
                    language === 'ru' ? 'Архив' : 'Archived',
                    courseLists.archived.initialized ? String(courseLists.archived.items.length) : '—',
                  ],
                  [
                    'seats-loaded',
                    language === 'ru' ? 'Места' : 'Seats',
                    courseLists.active.initialized
                      ? `${loadedEnrollment.occupied}/${loadedEnrollment.seats}`
                      : '—',
                  ],
                ] as const
              ).map(([key, label, value]) => (
                <span key={key} className="text-xs text-[var(--ink-dim)]">
                  {label}
                  <span className="ml-1.5 font-mono font-medium text-[var(--ink)]">{value}</span>
                </span>
              ))}
              <input
                aria-label={t('adminCourseSearchLabel')}
                value={listQuery}
                onChange={(event) => setListQuery(event.target.value)}
                placeholder={language === 'ru' ? 'Поиск курсов…' : 'Search courses…'}
                className="min-w-40 flex-1 border border-[var(--border)] bg-[var(--bg)] p-1.5 text-xs"
              />
              {pending ? <span role="status" className="text-xs">{text.pending}</span> : null}
              {stale ? <span role="status" className="text-xs">{text.stale}</span> : null}
              <CoursesManagerToolbar
                t={t}
                showCourseForm={showCreate}
                onToggle={toggleCreate}
                className="flex items-center"
              />
              <button
                type="button"
                className="flex items-center gap-1.5 border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--ink-dim)] hover:text-[var(--ink)]"
                onClick={() => void refresh()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {text.refresh}
              </button>
            </div>
            {currentList.error && courses.length > 0 ? (
              <span role="alert" className="text-xs">
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

          <div className="p-3">
            {(!currentList.initialized || currentList.loadingInitial) && courses.length === 0 ? (
              <div
                role="status"
                className="flex min-h-36 items-center justify-center gap-2 text-xs"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                {text.loading}
              </div>
            ) : currentList.error && courses.length === 0 ? (
              <div role="alert" className="border border-red-500/30 p-4 text-xs">
                <p>{currentList.error}</p>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="mt-3 flex items-center gap-2 border border-[var(--border)] px-3 py-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {text.retry}
                </button>
              </div>
            ) : courses.length === 0 ? (
              <p className="border border-dashed border-[var(--border)] p-8 text-center text-xs text-[var(--ink-dim)]">
                {lifecycleScope === 'active' ? text.activeEmpty : text.archivedEmpty}
              </p>
            ) : (
              <CanonicalCourseDatabaseList
                courses={visibleTableCourses}
          selectedCourseId={selectedCourseId}
          lifecycle={lifecycleScope}
          actionsLabel={language === 'ru' ? 'Действия курса' : 'Course actions'}
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
                className="mt-2 w-full border border-[var(--border)] px-3 py-2 text-xs font-medium disabled:opacity-50"
                disabled={currentList.loadingMore}
                onClick={() => void loadCoursePage(lifecycleScope, currentList.cursor, true)}
              >
                {currentList.loadingMore ? text.loadingMore : text.loadMore}
              </button>
            ) : null}
          </div>
        </section>

        <aside
          className="min-h-[32rem] rounded-[var(--radius)] bg-[var(--card-bg)] shadow-[var(--shadow-soft)] lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
          aria-label={t('adminCourseDatabaseDetailLabel')}
        >
          {showCreate ? (
            <form
          className={`flex min-h-full flex-col ${adminFormControls}`}
          onSubmit={(event) => void createCourse(event)}
          noValidate
          aria-label={text.create}
        >
          <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--card-bg)] px-4 py-3">
            <h3 className="text-sm font-medium text-[var(--ink)]">
              {createMode === 'clone' ? text.createClone : text.create}
            </h3>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)]"
              aria-label={t('closeForm')}
              onClick={toggleCreate}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3 px-4 py-3">
          {createFormError || createValidationIssues.length > 0 ? (
            <div role="alert" className="grid gap-1 border border-red-500/30 bg-red-500/5 p-3 text-xs text-[var(--ink)] md:col-span-2">
              {createFormError ? <p>{createFormError}</p> : null}
              {createValidationIssues.length > 0 ? (
                <ul className="list-inside list-disc">
                  {createValidationIssues.map((issue) => (
                    <li key={issue.key}>
                      <strong>{issue.label}:</strong> {issue.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--ink-dim)] md:col-span-2">
            {language === 'ru' ? 'Основное' : 'Basic information'}
          </p>
          {(
            [
              ['title', 'text'],
              ['titleRu', 'text'],
              ['price', 'number'],
              ['totalSeats', 'number'],
              ['timeZone', 'text'],
              ['bgImageUrl', 'url'],
            ] as const
          ).map(([field, type]) => (
            <label key={field} htmlFor={`canonical-course-${field}`} className="grid gap-1 text-xs">
              <span>
                {createFieldLabel(field)}
                {field === 'titleRu' ? null : (
                  <span aria-hidden="true" className="text-rose-600">
                    {' '}
                    *
                  </span>
                )}
              </span>
              <input
                id={`canonical-course-${field}`}
                aria-label={createFieldLabel(field)}
                required={
                  field === 'title' ||
                  field === 'price' ||
                  field === 'totalSeats' ||
                  field === 'timeZone' ||
                  field === 'bgImageUrl'
                }
                type={type}
                {...(field === 'totalSeats' ? { min: 1, max: 64 } : {})}
                {...(field === 'price' ? { min: 0, step: 1 } : {})}
                value={createForm[field]}
                aria-invalid={createFieldIssue(field) ? true : undefined}
                aria-describedby={
                  createFieldIssue(field) ? `canonical-course-${field}-error` : undefined
                }
                onChange={(event) => updateCreateField(field, event.target.value)}
              />
              {field === 'titleRu' ? (
                <span aria-hidden="true" className="text-[11px] text-[var(--ink-dim)]">
                  {language === 'ru' ? 'Необязательно' : 'Optional'}
                </span>
              ) : null}
              {renderCreateFieldError(field)}
            </label>
          ))}
          <fieldset
            id="canonical-course-instructor-roster"
            tabIndex={-1}
            className="grid gap-2"
            aria-required="true"
            aria-invalid={createFieldIssue('roster') ? true : undefined}
            aria-describedby={createFieldIssue('roster') ? 'canonical-course-roster-error' : undefined}
          >
            <legend className="px-1 text-xs font-medium">
              {language === 'ru' ? 'Инструкторы' : 'Instructors'}
            </legend>
            <p className="text-xs text-[var(--ink-dim)]">
              {language === 'ru' ? 'Состав инструкторов курса' : 'Course instructor roster'}
            </p>
            <div className="grid gap-1.5">
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
            {createFieldIssue('roster') ? (
              <p id="canonical-course-roster-error" className="text-xs text-red-700">
                {createFieldIssue('roster')?.message}
              </p>
            ) : null}
          </fieldset>
          <fieldset
            id="canonical-course-days"
            tabIndex={-1}
            className="grid gap-3"
            aria-required="true"
            aria-invalid={createFieldIssue('days') ? true : undefined}
            aria-describedby={createFieldIssue('days') ? 'canonical-course-days-error' : undefined}
          >
            <legend className="px-1 text-xs font-medium">{language === 'ru' ? 'Дни курса' : 'Course days'}</legend>
            <p className="text-xs text-[var(--ink-dim)]">
              {createMode === 'create'
                ? language === 'ru'
                  ? 'Выберите период курса: форма создаст день для каждой календарной даты. Для каждого дня укажите время начала и окончания; длительность рассчитается автоматически.'
                  : 'Choose the course period: the form adds a day for every calendar date. Enter start and end times for each day; duration is calculated automatically.'
                : language === 'ru'
                  ? 'Для каждого дня выберите дату, время начала и окончания. Длительность рассчитается автоматически.'
                  : 'Choose a date, start and end time for each day. Duration is calculated automatically.'}
            </p>
            {createMode === 'create' ? (
              <div className="grid gap-2">
                <label htmlFor="canonical-course-period-start" className="grid gap-1 text-xs">
                  {language === 'ru' ? 'Период — с' : 'Period starts'}
                  <input
                    id="canonical-course-period-start"
                    type="date"
                    required
                    value={createPeriodStart}
                    aria-invalid={createValidationIssues.some((issue) => issue.targetId === 'canonical-course-period-start') || undefined}
                    aria-describedby={createValidationIssues.some((issue) => issue.key === 'period') ? 'canonical-course-period-error' : undefined}
                    onChange={(event) => updateCreatePeriod('start', event.target.value)}
                  />
                </label>
                <label htmlFor="canonical-course-period-end" className="grid gap-1 text-xs">
                  {language === 'ru' ? 'Период — по' : 'Period ends'}
                  <input
                    id="canonical-course-period-end"
                    type="date"
                    required
                    value={createPeriodEnd}
                    aria-invalid={createValidationIssues.some((issue) => issue.targetId === 'canonical-course-period-end') || undefined}
                    aria-describedby={createValidationIssues.some((issue) => issue.key === 'period') ? 'canonical-course-period-error' : undefined}
                    onChange={(event) => updateCreatePeriod('end', event.target.value)}
                  />
                </label>
                {createValidationIssues.find((issue) => issue.key === 'period') ? (
                  <p id="canonical-course-period-error" className="text-xs text-red-700 col-span-2">
                    {createValidationIssues.find((issue) => issue.key === 'period')?.message}
                  </p>
                ) : null}
              </div>
            ) : null}
            {createCourseDays.map((row, index) => {
              const prefix = `canonical-course-day-${row.id}`;
              const durationMinutes = minutesForDayTimes(row.startTime, row.endTime);
              const availability = plannerAvailabilityByDate[row.localDate];
              const availableIds = availableInstructorIdsForCourseDay(
                row,
                createCourseDays,
                createForm.roster.split(',').map((value) => value.trim()).filter(Boolean),
                availability,
                createForm.timeZone
              );
              const rowFieldIssue = (field: 'date' | 'start' | 'end' | 'instructor') =>
                createValidationIssues.find((issue) => issue.targetId === `${prefix}-${field}`);
              const selectedInstructorIsUnavailable =
                row.instructorId !== '' && !availableIds.includes(row.instructorId);
              const updateRowField = (
                field: 'localDate' | 'startTime' | 'endTime' | 'instructorId',
                value: string
              ) =>
                updateCreateCourseDays(
                  createCourseDays.map((candidate) =>
                    candidate.id === row.id ? { ...candidate, [field]: value } : candidate
                  )
                );
              return (
                <div key={row.id} className={`${adminRecordCardClass} grid gap-2 border-l-transparent`}>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs">
                      {language === 'ru' ? `День ${index + 1}` : `Day ${index + 1}`}
                      {createMode === 'create' ? ` · ${row.localDate}` : ''}
                    </strong>
                    {createMode === 'clone' && createCourseDays.length > 1 ? (
                      <button
                        type="button"
                        className="text-xs text-rose-700 hover:underline dark:text-rose-300"
                        onClick={() => updateCreateCourseDays(createCourseDays.filter((candidate) => candidate.id !== row.id))}
                      >
                        {language === 'ru' ? 'Удалить день' : 'Remove day'}
                      </button>
                    ) : null}
                  </div>
                  {createMode === 'clone' ? (
                    <label htmlFor={`${prefix}-date`} className="grid gap-1 text-xs">
                      {language === 'ru' ? 'Дата' : 'Date'}
                      <input
                        id={`${prefix}-date`}
                        type="date"
                        required
                        value={row.localDate}
                        aria-invalid={rowFieldIssue('date') ? true : undefined}
                        aria-describedby={rowFieldIssue('date') ? `${prefix}-date-error` : undefined}
                        onChange={(event) => updateRowField('localDate', event.target.value)}
                      />
                      {rowFieldIssue('date') ? <span id={`${prefix}-date-error`} className="text-red-700">{rowFieldIssue('date')?.message}</span> : null}
                    </label>
                  ) : null}
                  <div className="grid gap-2">
                    <label htmlFor={`${prefix}-start`} className="grid gap-1 text-xs">
                      {language === 'ru' ? 'Начало' : 'Starts'}
                      <input
                        id={`${prefix}-start`}
                        type="time"
                        step={60}
                        required
                        value={row.startTime}
                        aria-invalid={rowFieldIssue('start') ? true : undefined}
                        aria-describedby={rowFieldIssue('start') ? `${prefix}-start-error` : undefined}
                        onChange={(event) => updateRowField('startTime', event.target.value)}
                      />
                      {rowFieldIssue('start') ? <span id={`${prefix}-start-error`} className="text-red-700">{rowFieldIssue('start')?.message}</span> : null}
                    </label>
                    <label htmlFor={`${prefix}-end`} className="grid gap-1 text-xs">
                      {language === 'ru' ? 'Окончание' : 'Ends'}
                      <input
                        id={`${prefix}-end`}
                        type="time"
                        step={60}
                        required
                        value={row.endTime}
                        aria-invalid={rowFieldIssue('end') ? true : undefined}
                        aria-describedby={rowFieldIssue('end') ? `${prefix}-end-error` : undefined}
                        onChange={(event) => updateRowField('endTime', event.target.value)}
                      />
                      {rowFieldIssue('end') ? <span id={`${prefix}-end-error`} className="text-red-700">{rowFieldIssue('end')?.message}</span> : null}
                    </label>
                  </div>
                  {durationMinutes !== undefined ? (
                    <p className="text-[11px] text-[var(--ink-dim)]">
                      {language === 'ru' ? 'Длительность' : 'Duration'}: {durationMinutes} {language === 'ru' ? 'мин.' : 'min'}
                      {row.endTime < row.startTime
                        ? language === 'ru'
                          ? ' · окончание на следующие сутки'
                          : ' · ends the next day'
                        : row.endTime === row.startTime
                          ? language === 'ru'
                            ? ' · полные сутки'
                            : ' · full day'
                          : ''}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-[var(--ink-dim)]">
                    {language === 'ru'
                      ? 'Если окончание раньше начала, интервал продолжается до следующих суток.'
                      : 'If the end time is earlier than the start, the interval continues into the next day.'}
                  </p>
                  <label htmlFor={`${prefix}-instructor`} className="grid gap-1 text-xs">
                    {language === 'ru' ? 'Доступный инструктор' : 'Available instructor'}
                    <select
                      id={`${prefix}-instructor`}
                      required
                      value={row.instructorId}
                      disabled={!courseDayInterval(row, createForm.timeZone) || availability?.loading || !availability?.item || Boolean(availability.error)}
                      aria-invalid={rowFieldIssue('instructor') ? true : undefined}
                      aria-describedby={rowFieldIssue('instructor') ? `${prefix}-instructor-error` : undefined}
                      onChange={(event) => updateRowField('instructorId', event.target.value)}
                    >
                      <option value="">{language === 'ru' ? 'Выберите инструктора' : 'Choose an instructor'}</option>
                      {row.instructorId && selectedInstructorIsUnavailable ? (
                        <option value={row.instructorId} disabled>
                          {instructorOptionById(row.instructorId)?.name ?? row.instructorId} — {language === 'ru' ? 'недоступен в это время' : 'unavailable at this time'}
                        </option>
                      ) : null}
                      {availableIds.map((id) => (
                        <option key={id} value={id}>{instructorOptionById(id)?.name ?? availability?.item?.instructors.find((instructor) => String(instructor.instructorId) === id)?.name ?? id}</option>
                      ))}
                    </select>
                    {rowFieldIssue('instructor') ? <span id={`${prefix}-instructor-error`} className="text-red-700">{rowFieldIssue('instructor')?.message}</span> : null}
                    {availability?.loading ? (
                      <span className="text-[var(--ink-dim)]">{language === 'ru' ? 'Проверяем расписание…' : 'Checking schedule…'}</span>
                    ) : availability?.error ? (
                      <span className="text-red-700">
                        {language === 'ru' ? 'Не удалось подтвердить доступность.' : 'Availability could not be confirmed.'}{' '}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setAvailabilityRefreshToken((token) => token + 1)}
                        >
                          {language === 'ru' ? 'Повторить проверку' : 'Retry check'}
                        </button>
                      </span>
                    ) : courseDayInterval(row, createForm.timeZone) && availableIds.length === 0 ? (
                      <span className="text-[var(--ink-dim)]">{language === 'ru' ? 'Нет свободных инструкторов на выбранный интервал.' : 'No instructors are free for this time range.'}</span>
                    ) : null}
                  </label>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-xs">
              {createMode === 'clone' ? (
                <ActionButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={createCourseDays.length >= 64}
                  onClick={() => updateCreateCourseDays([...createCourseDays, newCourseDayRow()])}
                >
                  {language === 'ru' ? 'Добавить день' : 'Add day'}
                </ActionButton>
              ) : null}
              <span className="text-[var(--ink-dim)]">
                {courseDayDateSummary(createCourseDays) || (language === 'ru' ? 'Даты курса не выбраны' : 'No course dates selected')}
                {createCourseDays.some((row) => minutesForDayTimes(row.startTime, row.endTime) !== undefined)
                  ? ` · ${courseDurationSummary(createCourseDays, language)}`
                  : ''}
              </span>
            </div>
            {createFieldIssue('days') ? (
              <p id="canonical-course-days-error" className="text-xs text-red-700">
                {createFieldIssue('days')?.message}
              </p>
            ) : null}
          </fieldset>
          <details
            ref={createPresentationDetailsRef}
            className="space-y-3"
          >
            <summary className="cursor-pointer text-xs font-medium">{text.presentation}</summary>
            <div className="mt-3 grid gap-3">
              <label
                htmlFor="canonical-course-description"
                className="grid gap-1 text-xs md:col-span-2"
              >
                {createFieldLabel('description')}
                <textarea
                  id="canonical-course-description"
                  rows={3}
                  value={createForm.description}
                  aria-invalid={createFieldIssue('description') ? true : undefined}
                  aria-describedby={
                    createFieldIssue('description')
                      ? 'canonical-course-description-error'
                      : undefined
                  }
                  onChange={(event) => updateCreateField('description', event.target.value)}
                />
                {renderCreateFieldError('description')}
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
                  {createFieldLabel(field)}
                  <textarea
                    id={`canonical-course-${field}`}
                    rows={field.startsWith('detailed') || field.startsWith('program') ? 4 : 2}
                    value={createForm[field]}
                    aria-invalid={createFieldIssue(field) ? true : undefined}
                    aria-describedby={
                      createFieldIssue(field) ? `canonical-course-${field}-error` : undefined
                    }
                    placeholder={
                      field.startsWith('program')
                        ? language === 'ru'
                          ? 'День 1 | Заголовок | Описание'
                          : 'Day 1 | Title | Description'
                        : field.startsWith('faq')
                          ? language === 'ru'
                            ? 'Вопрос | Ответ'
                            : 'Question | Answer'
                          : field.startsWith('benefits')
                            ? language === 'ru'
                              ? 'Один пункт в строке'
                              : 'One item per line'
                            : field === 'galleryPhotos'
                              ? language === 'ru'
                                ? 'Один URL в строке'
                                : 'One URL per line'
                              : undefined
                    }
                    onChange={(event) => updateCreateField(field, event.target.value)}
                  />
                  {renderCreateFieldError(field)}
                </label>
              ))}
              <label htmlFor="canonical-course-level" className="grid gap-1 text-xs">
                {createFieldLabel('level')}
                <select
                  id="canonical-course-level"
                  value={createForm.level}
                  onChange={(event) =>
                    updateCreateField('level', event.target.value as CreateFormState['level'])
                  }
                >
                  <option value="">—</option>
                  <option value="beginner">{language === 'ru' ? 'Начальный' : 'Beginner'}</option>
                  <option value="intermediate">
                    {language === 'ru' ? 'Средний' : 'Intermediate'}
                  </option>
                  <option value="advanced">
                    {language === 'ru' ? 'Продвинутый' : 'Advanced'}
                  </option>
                  <option value="expert">{language === 'ru' ? 'Экспертный' : 'Expert'}</option>
                </select>
              </label>
              <label htmlFor="canonical-course-discipline" className="grid gap-1 text-xs">
                {createFieldLabel('discipline')} *
                <select
                  id="canonical-course-discipline"
                  required
                  aria-invalid={createFieldIssue('discipline') ? true : undefined}
                  aria-describedby={
                    createFieldIssue('discipline') ? 'canonical-course-discipline-error' : undefined
                  }
                  value={createForm.discipline}
                  onChange={(event) =>
                    updateCreateField(
                      'discipline',
                      event.target.value as CreateFormState['discipline']
                    )
                  }
                >
                  <option value="">—</option>
                  <option value="ski">{language === 'ru' ? 'Лыжи' : 'Ski'}</option>
                  <option value="snowboard">{language === 'ru' ? 'Сноуборд' : 'Snowboard'}</option>
                </select>
                {renderCreateFieldError('discipline')}
              </label>
              <label htmlFor="canonical-course-order" className="grid gap-1 text-xs">
                {createFieldLabel('order')}
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
          </div>
          <div className="sticky bottom-0 z-20 border-t border-[var(--border)] bg-[var(--card-bg)] px-4 py-3">
          <ActionButton
            pending={pending !== null}
            pendingLabel={text.pending}
            variant="primary"
            size="sm"
            className="w-full"
            type="submit"
          >
            {createMode === 'clone' ? text.createClone : text.create}
          </ActionButton>
          </div>
        </form>
          ) : selectedCourse ? (
            <article>
              <div className="sticky top-3 z-20 rounded-t-[var(--radius)] bg-[var(--card-bg)] shadow-[0_8px_20px_-18px_rgba(17,17,17,0.45)] lg:top-0">
                <header className="space-y-3 p-4 pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="break-words text-xl font-medium">{selectedCourse.title}</h3>
                      <p
                        className="mt-1 text-xs text-[var(--ink-dim)]"
                        data-testid="admin-course-detail-dates"
                      >
                        {selectedCourseScheduleDates || selectedCourse.lifecycle}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <AdminCourseStatusChip
                          tone={selectedCourse.lifecycle === 'archived' ? 'archived' : 'active'}
                        >
                          {selectedCourse.lifecycle === 'archived' ? text.archived : text.active}
                        </AdminCourseStatusChip>
                        {selectedCourse.capacity.availableSeats <= 0 ? (
                          <AdminCourseStatusChip tone="attention">
                            {language === 'ru' ? 'Мест нет' : 'Full'}
                          </AdminCourseStatusChip>
                        ) : null}
                        {selectedCourse.catalogContent.content?.isHidden === true &&
                        selectedCourse.lifecycle !== 'archived' ? (
                          <AdminCourseStatusChip tone="neutral">
                            {language === 'ru' ? 'Скрыт' : 'Hidden'}
                          </AdminCourseStatusChip>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={text.closeDetails}
                      onClick={() => {
                        setSelectedCourseId(null);
                        setSelectedCourse(null);
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)]"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </header>
                <AdminLessonDetailTabs
                  sections={courseWorkspaceSections}
                  activeSection={workspaceSection}
                  onChange={(section) => {
                    if (courseWorkspaceSections.some((item) => item.id === section)) {
                      setWorkspaceSection(section as typeof workspaceSection);
                    }
                  }}
                  ariaLabel={language === 'ru' ? 'Разделы курса' : 'Course workspace'}
                  attentionLabel={language === 'ru' ? 'Требует внимания' : 'Needs attention'}
                  idPrefix="admin-course"
                />
              </div>
              <div className="space-y-4 p-4 pt-3">
          <div
            id="course-overview"
            className={
              workspaceSection === 'overview'
                ? 'grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4'
                : 'hidden'
            }
          >
            <div>
              <div className="font-mono text-sm text-[var(--ink)]">
                {selectedCourse.price.toLocaleString()} ₸
              </div>
              <div className="text-[var(--ink-dim)]">{language === 'ru' ? 'Цена' : 'Price'}</div>
            </div>
            <div>
              <div className="font-mono text-sm text-[var(--ink)]">
                {selectedCourse.capacity.totalSeats - selectedCourse.capacity.availableSeats} /{' '}
                {selectedCourse.capacity.totalSeats}
              </div>
              <div className="text-[var(--ink-dim)]">{text.enrollments}</div>
            </div>
            <div>
              <div className="font-mono text-sm text-[var(--ink)]">
                {selectedCourse.catalogContent.content?.duration?.trim() || '—'}
              </div>
              <div className="text-[var(--ink-dim)]">
                {language === 'ru' ? 'Длительность' : 'Duration'}
              </div>
            </div>
            <div>
              <div className="font-mono text-sm text-[var(--ink)]">
                {catalogHidden
                  ? language === 'ru'
                    ? 'Скрыт'
                    : 'Hidden'
                  : language === 'ru'
                    ? 'Публичный'
                    : 'Public'}
              </div>
              <div className="text-[var(--ink-dim)]">{language === 'ru' ? 'Каталог' : 'Catalog'}</div>
            </div>
          </div>

          {selectedCourse.instructors.some((instructor) => instructor.isAvailable === false) ? (
            <p
              role="status"
              className={
                showWorkspace('instructors') ? 'text-xs text-amber-700' : 'hidden'
              }
            >
              {text.unavailableInstructor}
            </p>
          ) : null}

          {editForm ? (
            <form
              className={
                showWorkspace('settings', 'instructors')
                  ? `grid gap-3 md:grid-cols-2 ${adminFormControls}`
                  : 'hidden'
              }
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
                  className="border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--ink)]"
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
              <fieldset id="course-instructors" className="grid gap-2 md:col-span-2">
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
              <details id="course-settings" className="grid gap-2 md:col-span-2">
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
                  <label htmlFor="course-edit-discipline" className="grid gap-1 text-xs">
                    {language === 'ru' ? 'Дисциплина' : 'Discipline'}
                    <select
                      id="course-edit-discipline"
                      required={Boolean(editOriginal?.catalogContent.content?.discipline)}
                      value={editForm.discipline}
                      onChange={(event) =>
                        updateEditField(
                          'discipline',
                          event.target.value as CreateFormState['discipline']
                        )
                      }
                    >
                      <option value="">—</option>
                      <option value="ski">{language === 'ru' ? 'Лыжи' : 'Ski'}</option>
                      <option value="snowboard">{language === 'ru' ? 'Сноуборд' : 'Snowboard'}</option>
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
                variant="primary"
                size="sm"
                pending={pending !== null}
                pendingLabel={text.pending}
                type="submit"
              >
                {language === 'ru' ? 'Сохранить изменения' : 'Save changes'}
              </ActionButton>
            </form>
          ) : null}

          <section
            id="course-schedule"
            className={showWorkspace('schedule') ? 'space-y-3' : 'hidden'}
          >
            <h4 className="text-xs font-bold uppercase tracking-wider">
              {text.operationalSchedule}
            </h4>
            <CanonicalCourseDaysEditor
              course={selectedCourse}
              language={language}
              draft={courseDayDraft}
              pending={pending !== null}
              pendingLabel={text.pending}
              instructors={selectedCourse.instructorRosterIds.map((id) => ({
                id,
                name: instructorOptions.get(id)?.name ?? id,
                inactive: instructorOptions.get(id)?.isAvailable === false,
              }))}
              dayIssue={courseDayIssue}
              emptyLabel={text.noSchedule}
              onDraftChange={setCourseDayDraft}
              onSubmit={(event) => void submitCourseDayDraft(event)}
              onRemove={(day) =>
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
            />
          </section>

            {onOpenEnrollments ? (
            <div
              id="course-enrollment"
              className={showWorkspace('enrollment', 'participants') ? 'space-y-2' : 'hidden'}
            >
              <p id="course-participants" className="text-xs text-[var(--ink-dim)]">
                {text.activeEnrollments}: {selectedCourse.activeEnrollmentCount} ·{' '}
                {text.totalEnrollments}: {selectedCourse.totalEnrollmentCount}
              </p>
              <button
                type="button"
                className="border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--ink)]"
                onClick={() => onOpenEnrollments(selectedCourse.courseId)}
              >
                {text.manageEnrollments}
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {(['archive_course', 'reactivate_course'] as const)
              .filter((kind) =>
                selectedCourse.authorizedActions.some((action) => action.kind === kind)
              )
              .map((kind) => (
                <ActionButton
                  key={kind}
                  type="button"
                  size="sm"
                  variant={kind === 'archive_course' ? 'danger' : 'secondary'}
                  disabled={pending !== null}
                  onClick={() => {
                    if (kind === 'archive_course')
                      handleArchive(mapAdminCourseToTableCourse(selectedCourse));
                    else handleReactivate(mapAdminCourseToTableCourse(selectedCourse));
                  }}
                >
                  {actionLabel(kind)}
                </ActionButton>
              ))}
          </div>
              </div>
            </article>
          ) : (
            <p className="flex min-h-52 items-center justify-center text-center text-xs text-[var(--ink-dim)]">
              {t('adminCourseDatabaseSelectPrompt')}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
};
