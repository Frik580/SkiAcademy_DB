export const loadAdminPanel = () =>
  import('./components/AdminPanel').then(({ AdminPanel }) => ({ default: AdminPanel }));
export { SkillConfigManager } from './components/settings/SkillConfigManager';
export { useAdminActions } from './useAdminActions';
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
  ErrorLogsPanel,
  SystemSettings,
} from './components/settings';
