import fs from 'fs';

const adminPath = 'src/components/AdminPanel.tsx';
const lines = fs.readFileSync(adminPath, 'utf8').split(/\r?\n/);

const header = `import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  BookOpenCheck,
  Edit2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Upload,
  Camera,
} from 'lucide-react';
import { Booking, Course, Instructor, UserProfile } from '../../types';
import {
  useLanguage,
  translateInstructorName,
  translateCourse,
  parseCourseDates,
  formatCourseDates,
} from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';
import { formatDateLocalYMD } from './scheduleUtils';

interface CoursesManagerProps {
  courses: Course[];
  bookings: Booking[];
  usersList: UserProfile[];
  instructors: Instructor[];
  onAddCourse?: (course: Course) => Promise<void>;
  onUpdateCourse?: (course: Course) => Promise<void>;
  onDeleteCourse?: (courseId: string) => Promise<void>;
  onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

`;

const footer = `
export const CoursesManager: React.FC<CoursesManagerProps> = ({
  courses,
  bookings,
  usersList,
  instructors,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
  onRequestConfirm,
}) => {
  const { t, language } = useLanguage();
  const { addNotification } = useNotifications();

`;

// 1-indexed line numbers -> 0-indexed slices
const helpers = lines.slice(132, 222).join('\n');
const stateAndLogic = lines.slice(291, 453).join('\n');
let handlers = lines.slice(583, 914).join('\n');
const jsx = lines.slice(1369, 2368).join('\n');

handlers = handlers.replace(
  /setConfirmModal\(\{ message: confirmMsg, onConfirm:/g,
  'onRequestConfirm(confirmMsg,'
);

let body =
  helpers + '\n\n' + stateAndLogic + '\n\n' + handlers + '\n\n  return (\n' + jsx + '\n  );\n};\n';

const coursesManager =
  header +
  footer +
  body
    .replace(/^/gm, (m, offset, str) => {
      // Don't double-indent header parts - footer already has component start
      return '';
    })
    .split('\n')
    .map((line, i) => {
      if (i < header.split('\n').length + footer.split('\n').length - 1) return line;
      if (line === '') return line;
      if (line.startsWith('  ') || line.startsWith('function ') || line.startsWith('interface '))
        return line.startsWith('  ') ? line : '  ' + line;
      return '  ' + line;
    })
    .join('\n');

// Fix botched indent pass - rebuild cleanly
const componentBody = helpers + '\n\n' + stateAndLogic + '\n\n' + handlers;
const indentedBody = componentBody
  .split('\n')
  .map((l) => (l ? '  ' + l : l))
  .join('\n');
const indentedJsx = jsx
  .split('\n')
  .map((l) => (l ? '    ' + l : l))
  .join('\n');

const finalContent =
  header +
  footer.trimEnd() +
  '\n' +
  indentedBody +
  '\n\n  return (\n' +
  indentedJsx +
  '\n  );\n};\n';

fs.writeFileSync('src/components/admin/CoursesManager.tsx', finalContent);

// Patch AdminPanel: remove extracted sections (0-indexed, end exclusive)
const removeRanges = [
  [132, 222],
  [291, 453],
  [583, 914],
  [1369, 2368],
];

let adminLines = [...lines];
let offset = 0;
for (const [start, end] of removeRanges) {
  adminLines.splice(start - offset, end - start);
  offset += end - start;
}

const coursesComponent = `      <CoursesManager
        courses={courses}
        bookings={bookings}
        usersList={usersList}
        instructors={instructors}
        onAddCourse={onAddCourse}
        onUpdateCourse={onUpdateCourse}
        onDeleteCourse={onDeleteCourse}
        onRequestConfirm={(message, onConfirm) => setConfirmModal({ message, onConfirm })}
      />`;

const clientsEnd = adminLines.findIndex((l) => l.trim().startsWith('<ClientsManager'));
const insertAt = adminLines.findIndex(
  (l, i) => i > clientsEnd && l.includes('ClientsManager') && l.includes('/>')
);
const insertLine =
  insertAt >= 0
    ? insertAt + 1
    : adminLines.findIndex((l) => l.includes('Administrator Management'));

adminLines.splice(insertLine, 0, '', coursesComponent, '');

if (!adminLines.some((l) => l.includes('import { CoursesManager }'))) {
  const importIdx = adminLines.findIndex((l) => l.includes('import { ClientsManager }'));
  adminLines.splice(importIdx + 1, 0, "import { CoursesManager } from './admin/CoursesManager';");
}

fs.writeFileSync(adminPath, adminLines.join('\n'));
console.log('Extracted CoursesManager, patched AdminPanel');
