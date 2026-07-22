import fs from 'fs';

const adminPath = 'src/components/AdminPanel.tsx';
const lines = fs.readFileSync(adminPath, 'utf8').split(/\r?\n/);

const header = `import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Edit2,
  Upload,
  Camera,
} from 'lucide-react';
import { Booking, Instructor } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';
import { getSpecialtyLabel } from './scheduleUtils';

interface CoachesManagerProps {
  instructors: Instructor[];
  bookings: Booking[];
  onAddInstructor: (ins: Instructor) => Promise<void>;
  onUpdateInstructor: (ins: Instructor) => Promise<void>;
  onDeleteInstructor: (id: string) => Promise<void>;
  onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

`;

const footer = `export const CoachesManager: React.FC<CoachesManagerProps> = ({
  instructors,
  bookings,
  onAddInstructor,
  onUpdateInstructor,
  onDeleteInstructor,
  onRequestConfirm,
}) => {
  const { t, language } = useLanguage();
  const { addNotification } = useNotifications();

`;

const helpers = lines.slice(59, 121).join('\n');
const stateBlock = lines.slice(155, 190).join('\n');
const imageHandlers = lines.slice(192, 247).join('\n');
let handlers = lines.slice(329, 438).join('\n');
handlers = handlers.replace(/setConfirmModal\(\{ message: confirmMsg, onConfirm:/g, 'onRequestConfirm(confirmMsg,');
handlers = handlers.replace(/\}\s*\n\s*\}\);/g, '});');

const jsx = lines.slice(469, 744).join('\n');

const body = [helpers, stateBlock, imageHandlers, handlers].join('\n\n');
const indentedBody = body.split('\n').map((l) => (l ? '  ' + l : l)).join('\n');
const indentedJsx = jsx.split('\n').map((l) => (l ? '    ' + l : l)).join('\n');

const content = header + footer + indentedBody + '\n\n  return (\n' + indentedJsx + '\n  );\n};\n';
fs.writeFileSync('src/components/admin/CoachesManager.tsx', content);

// Patch AdminPanel
let adminLines = [...lines];

// Remove optimizeInstructorImage (lines 60-122 including blank line after)
adminLines.splice(59, 63);

// Find and remove coach state block: from showAddForm to isDragOver (line numbers shifted)
const showAddIdx = adminLines.findIndex((l) => l.includes('const [showAddForm, setShowAddForm]'));
const dragOverEndIdx = adminLines.findIndex((l, i) => i > showAddIdx && l.includes('const [isDragOver, setIsDragOver]'));
if (showAddIdx >= 0 && dragOverEndIdx >= 0) {
  adminLines.splice(showAddIdx, dragOverEndIdx - showAddIdx + 1);
}

// Remove image handlers through processAndOptimizeImage
const fileChangeIdx = adminLines.findIndex((l) => l.includes('const handleFileChange'));
const processImageEnd = adminLines.findIndex((l, i) => i > fileChangeIdx && l.trim() === '};' && adminLines[i + 1]?.includes('User/Admin Management'));
if (fileChangeIdx >= 0 && processImageEnd >= 0) {
  adminLines.splice(fileChangeIdx, processImageEnd - fileChangeIdx + 1);
}

// Remove coach handlers
const handleSubmitIdx = adminLines.findIndex((l) => l.includes('const handleSubmit = async'));
const handleDeleteEnd = adminLines.findIndex((l, i) => i > handleSubmitIdx && l.includes('const handleDeleteCoach'));
if (handleSubmitIdx >= 0 && handleDeleteEnd >= 0) {
  // find closing }; of handleDeleteCoach
  let endIdx = handleDeleteEnd;
  for (let i = handleDeleteEnd; i < adminLines.length; i++) {
    if (adminLines[i].trim() === '};' && adminLines[i + 1]?.trim() === '') {
      endIdx = i;
      break;
    }
  }
  adminLines.splice(handleSubmitIdx, endIdx - handleSubmitIdx + 1);
}

// Replace coaches JSX with component
const gridStart = adminLines.findIndex((l) => l.includes('grid lg:grid-cols-12') && l.includes('overflow-hidden'));
const bookingsLogIdx = adminLines.findIndex((l) => l.trim().startsWith('<BookingsLog'));
if (gridStart >= 0 && bookingsLogIdx >= 0) {
  const component = `      <CoachesManager
        instructors={instructors}
        bookings={bookings}
        onAddInstructor={onAddInstructor}
        onUpdateInstructor={onUpdateInstructor}
        onDeleteInstructor={onDeleteInstructor}
        onRequestConfirm={(message, onConfirm) => setConfirmModal({ message, onConfirm })}
      />`;
  adminLines.splice(gridStart, bookingsLogIdx - gridStart, component, '');
}

if (!adminLines.some((l) => l.includes("import { CoachesManager }"))) {
  const idx = adminLines.findIndex((l) => l.includes("import { CoursesManager }"));
  adminLines.splice(idx, 0, "import { CoachesManager } from './admin/CoachesManager';");
}

fs.writeFileSync(adminPath, adminLines.join('\n'));
console.log('Extracted CoachesManager');
