import fs from 'fs';

const adminPath = 'src/components/AdminPanel.tsx';
const lines = fs.readFileSync(adminPath, 'utf8').split(/\r?\n/);

const start = lines.findIndex((l) => l.trim().startsWith('<BookingsLog'));
const coursesStart = lines.findIndex((l) => l.includes('Courses Database Management'));

if (start < 0 || coursesStart < 0) {
  console.error('Could not find insertion points', { start, coursesStart });
  process.exit(1);
}

const instructorsSection = fs.readFileSync('scripts/_instructors-section.txt', 'utf8');

const block = `  return (
    <div className="space-y-6 animate-fade-in">
      <FinancialOverview
        totalRevenue={totalRevenue}
        activeBookings={activeBookings}
        completedBookings={completedBookings}
        instructorsCount={instructors.length}
      />

      <SystemSettings
        filtersEnabled={filtersEnabled}
        onToggleFilters={onToggleFilters}
        skillConfig={skillConfig}
        onUpdateSkillConfig={onUpdateSkillConfig}
      />

      <ScheduleCalendar
        instructors={instructors}
        bookings={bookings}
        courses={courses}
        usersList={usersList}
        adminProfile={adminProfile}
        onAddBooking={onAddBooking}
        onRescheduleBooking={onRescheduleBooking}
        onDeleteBooking={onDeleteBooking}
        onCancelBooking={onCancelBooking}
        onCompleteBooking={onCompleteBooking}
      />

${instructorsSection}

      <BookingsLog
        bookings={bookings}
        usersList={usersList}
        instructors={instructors}
        onConfirmBooking={onConfirmBooking}
        onCompleteBooking={onCompleteBooking}
        onCancelBooking={onCancelBooking}
        onRequestConfirm={(message, onConfirm) => setConfirmModal({ message, onConfirm })}
      />

      <ClientsManager
        usersList={usersList}
        instructors={instructors}
        currentUserEmail={currentUserEmail}
        onAddUser={onAddUser}
        onUpdateUser={onUpdateUser}
        onDeleteUser={onDeleteUser}
        onAddInstructor={onAddInstructor}
        onUpdateInstructor={onUpdateInstructor}
        onDeleteInstructor={onDeleteInstructor}
        onRequestConfirm={(message, onConfirm) => setConfirmModal({ message, onConfirm })}
      />

`;

const newLines = [...lines.slice(0, start), ...block.split('\n'), ...lines.slice(coursesStart)];
fs.writeFileSync(adminPath, newLines.join('\n'));
console.log('Patched AdminPanel return block');
