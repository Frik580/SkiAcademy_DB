export const loadAdminPanel = () =>
  import('./components/AdminPanel').then(({ AdminPanel }) => ({ default: AdminPanel }));
export { SkillConfigManager } from './components/settings/SkillConfigManager';
export { useAdminActions } from './useAdminActions';
export { AdminLessonBookingPanel } from './lesson-bookings';
export { CoursesManager } from './components/courses';
export {
  getAvailableMoveTimeSlots,
  getAvailableScheduleDurations,
  hasScheduleOverlap,
  ScheduleCalendar,
  ScheduleSlotActionModal,
  SCHEDULE_CLOSING_TIME_MINUTES,
  SCHEDULE_TIME_SLOTS,
} from './components/schedule';
export { FALLBACK_SLIDES, ResortConfigForm } from './components/resort';
export { AdminRoleManager, ClientsManager, CoachesManager } from './components/users';
export { BookingsLog, LinkGuestBookingModal } from './components/bookings';
export { FinancialOverview, CashFlowPanel } from './components/finance';
export {
  AchievementsManager,
  AdminCollapsibleSection,
  AdminProductSettings,
  AdminSystemSettings,
  ErrorLogsPanel,
  SystemSettings,
} from './components/settings';
export {
  ADMIN_TAB_IDS,
  ADMIN_TAB_LABEL_KEYS,
  ADMIN_TAB_QUERY_KEY,
  ADMIN_LESSON_BOOKING_QUERY_KEY,
  ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY,
  DEFAULT_ADMIN_TAB,
  isAdminTabId,
  parseAdminTabId,
  type AdminTabId,
} from './adminNavigation';
