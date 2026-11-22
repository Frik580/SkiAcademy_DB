// Fake canonical transport. The UI, attendance command path and local inbox patch are real.
const stamp = { seconds: 1_788_250_000, nanoseconds: 0 };
const bookingId = 'booking_browser_fixture_01';
const params = new URLSearchParams(location.search);
let saved = false;
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
export async function queryAdminIssueReadModels({
  scope,
  issueId,
}: {
  scope: string;
  issueId?: string;
}) {
  if (saved) {
    const response = await fetch('/__attendance_refresh');
    if (!response.ok) throw new Error('Fixture inbox refresh unavailable');
  }
  const visible = saved ? items.slice(1) : items;
  return scope === 'admin_detail'
    ? { scope, item: visible.find((item) => item.issueId === issueId) }
    : { scope, items: visible, hasMore: false };
}

export async function queryLessonBookingReadModels() {
  const roster = [
    { participantId: 'participant_browser_alex', displayName: 'Александр Константинопольский' },
    ...(params.get('roster') === 'single'
      ? []
      : [
          { participantId: 'participant_browser_maria', displayName: 'Мария' },
          { participantId: 'participant_browser_anna', displayName: 'Анна' },
        ]),
  ];
  const participantIds = roster.map((person) => person.participantId);
  return {
    scope: 'admin_detail',
    items: [
      {
        bookingId,
        revision: 1,
        participantIds,
        lifecycle: { status: 'confirmed' },
        occurrence: { startsAt: stamp, timeZone: 'Asia/Almaty' },
        admin: {
          participants: roster,
          serviceParticipantIds: participantIds,
          authorizedActions: { canFinalizeAttendance: true },
          attendance: roster.map(({ participantId }, index) => ({
            participantId,
            ...(index === 2 ? { attendanceStatus: 'absent', revision: 3 } : {}),
            authorizedActions: { canRecordPresent: true },
          })),
        },
      },
    ],
  };
}

export async function executeAuthenticatedCanonicalCommand(_account: string, command: unknown) {
  const response = await fetch('/__attendance_command', {
    method: 'POST',
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error('Fixture command unavailable');
  saved = true;
  return { status: 'success', payload: { resolvedAdminIssueIds: [items[0].issueId] } };
}

export const registerAdminIssueInboxRevisionListener = () => () => {};
export const registerAdminIssueInboxRevisionFromCommand = () => {};
export const registerAdminLessonBookingsRevisionListener = () => () => {};
export const registerAdminLessonBookingsRevisionFromCommand = () => {};
export const registerAdminFinanceRevisionListener = () => () => {};
export const registerAdminFinanceRevisionFromCommand = () => {};
export const queryAdminFinanceReadModels = () => {
  throw new Error('Unexpected fixture finance query');
};

export function useAdminAttentionChangeRequests() {
  return { list: { items: [], loading: false }, detail: { loading: false } };
}
export function AdminLevelRequests() {
  return null;
}
