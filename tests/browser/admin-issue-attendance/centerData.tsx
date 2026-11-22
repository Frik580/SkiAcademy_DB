import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// Only remote reads/commands are replaced. The center, panel, modal hooks and CSS are real.
const stamp = { seconds: 1_788_250_000, nanoseconds: 0 };
const items = ['missing_attendance', 'attendance_payment_conflict'].map((kind, index) => ({
  issueId: `admin_issue_browser_fixture_0${index}`,
  revision: 1,
  kind,
  severity: 'urgent',
  lifecycle: { status: 'open', openedAt: stamp, lastDetectedAt: stamp },
  subjectRef: { subjectKind: 'booking', bookingId: 'booking_browser_fixture_01' },
  summaryCode: kind,
  actionRequirement: 'action_required',
  blockingCondition: 'outcome',
  subjectDisplayName: 'Александр Константинопольский',
  courseTitle: 'Alpine Foundations',
  lessonStartsAt: stamp,
  createdAt: stamp,
  updatedAt: stamp,
  resolutionGuidance: 'record_attendance',
  attendance: [],
  references: {},
  authorizedActions: { canResolveDirectly: false, actions: [] },
}));
export function useAdminIssueReadModels() {
  const [params] = useSearchParams();
  return {
    list: { items, loading: false, hasMore: false },
    detail: { item: items.find((item) => item.issueId === params.get('issue')), loading: false },
    retryList: async () => ({ status: 'success' }),
    retryDetail: async () => ({ status: 'success' }),
  };
}
export function useAdminIssueAttendance() {
  const [pending, setPending] = useState(false);
  return {
    pending,
    loading: false,
    panel: {
      lessonTime: '14.10.2026, 10:00',
      participants: [
        { id: 'alex', displayName: 'Александр Константинопольский', status: undefined },
        { id: 'maria', displayName: 'Мария', status: undefined },
        { id: 'anna', displayName: 'Анна', status: 'absent' },
      ],
      missingCount: 2,
    },
    submit: () => setPending(true),
  };
}
export function useAdminAttentionChangeRequests() {
  return { list: { items: [], loading: false }, detail: { loading: false } };
}
export function AdminLevelRequests() {
  return null;
}
