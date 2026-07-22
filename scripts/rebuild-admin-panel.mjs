import fs from 'fs';

const adminPath = 'src/components/AdminPanel.tsx';
let content = fs.readFileSync(adminPath, 'utf8');

// Fix broken onRequestConfirm object syntax -> setConfirmModal
content = content.replace(
  /onRequestConfirm\(\s*\n\s*message: ([^,]+),\s*\n\s*onConfirm: async \(\) => \{/g,
  'setConfirmModal({ message: $1, onConfirm: async () => {'
);
content = content.replace(
  /onRequestConfirm\(\s*\n\s*message: ([^,]+),\s*\n\s*onConfirm: async \(\) => \{\s*\n\s*try \{/g,
  'setConfirmModal({ message: $1, onConfirm: async () => {\n        try {'
);

// Remove client management state (moved to ClientsManager)
content = content.replace(
  /\n  \/\/ Client Management States[\s\S]*?\n  const \[isSubmittingClient, setIsSubmittingClient\] = useState\(false\);\n/,
  '\n'
);

// Remove handleClientSubmit through end of handleDeleteClient (first occurrence before courses handlers)
content = content.replace(
  /\n  const handleClientSubmit = async \(e: React\.FormEvent\) => \{[\s\S]*?\n  \};\n\n  const resetCourseForm/,
  '\n\n  const resetCourseForm'
);

// Remove startEditClient and handleDeleteClient duplicates
content = content.replace(
  /\n  const startEditClient = \(u: UserProfile\) => \{[\s\S]*?\n  \};\n\n  const handleDeleteClient = \(u: UserProfile\) => \{[\s\S]*?\n  \};\n\n  const isSuperAdmin/,
  '\n\n  const isSuperAdmin'
);

// Remove monitor filter comment stub
content = content.replace(/\n  \/\/ Active Bookings Monitor filter states\n\n/, '\n');

const instructorsSection = fs.readFileSync('scripts/_instructors-section.txt', 'utf8');

const returnBlock = `  return (
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

// Remove misplaced components and add proper return opening before courses
content = content.replace(
  /\n\n\n      <BookingsLog[\s\S]*?<\/ClientsManager>\n\n      \{\/\* 🎓 Courses Database Management \*\/\}/,
  `\n\n${returnBlock.replace(/\n$/, '')}\n\n      {/* 🎓 Courses Database Management */}`
);

// Fix inline onRequestConfirm in admin section
content = content.replace(
  /onRequestConfirm\(\s*\n\s*message: confirmMsg,\s*\n\s*onConfirm: async \(\) => \{\s*\n\s*try \{\s*\n\s*await onUpdateUserRole/g,
  'setConfirmModal({ message: confirmMsg, onConfirm: async () => {\n                              try {\n                                await onUpdateUserRole'
);

fs.writeFileSync(adminPath, content);
console.log('Rebuilt AdminPanel');
