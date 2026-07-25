import React from 'react';
import { Award } from 'lucide-react';
import { useInstructorWorkspace } from './useInstructorWorkspace';

interface InstructorStudentsProps {
  workspace: ReturnType<typeof useInstructorWorkspace>;
}

export const InstructorStudents: React.FC<InstructorStudentsProps> = ({ workspace }) => {
  const { t, theme, myStudents, usersList, handleUpdateStudentLevel } = workspace;

  return (
    <div className="space-y-4">
      <h4 className="text-lg font-serif font-light text-[var(--ink)] tracking-tight border-b border-slate-200/80 dark:border-slate-800/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-accent" />
          <span>
            {t('instructorStudentsTitle')} ({myStudents.length})
          </span>
        </div>
        <span className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider font-normal">
          {t('instructorStudentsHint')}
        </span>
      </h4>

      {myStudents.length === 0 ? (
        <div className="py-8 border border-dashed border-slate-200 dark:border-slate-800 text-center bg-[var(--card-bg)] rounded-xs font-mono text-xs text-[var(--ink-dim)]">
          {t('instructorNoStudents')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {myStudents.map((student) => {
            const studentUser = usersList.find((u) => u.uid === student.uid);
            const studentLevel = studentUser?.level || 1;
            return (
              <div
                key={student.uid}
                className="border border-slate-200/70 dark:border-slate-800/70 p-3 space-y-2 bg-[var(--card-bg)] rounded-xs shadow-xs flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors duration-200"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
                    {student.avatar ? (
                      <img
                        src={student.avatar}
                        alt={student.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs">
                        👤
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h5 className="font-serif text-xs text-[var(--ink)] font-bold truncate">
                      {student.name}
                    </h5>
                    <span className="text-[9px] font-mono text-[var(--ink-dim)] block">
                      {student.lessonsCount} {t('instructorLessonsWord')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <img
                    key={`${theme}-${studentLevel}`}
                    src={`https://storage.yandexcloud.net/carve/level/${theme === 'light' ? 'b' : 'w'}/${studentLevel}.png`}
                    alt={`Level ${studentLevel}`}
                    className="w-7 h-7 object-contain shrink-0"
                    referrerPolicy="no-referrer"
                    onLoad={(e) => {
                      e.currentTarget.style.display = 'block';
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <select
                    value={studentLevel}
                    onChange={(e) =>
                      handleUpdateStudentLevel(student.uid, student.name, Number(e.target.value))
                    }
                    className="text-[9px] font-mono uppercase bg-white dark:bg-slate-900 text-[var(--ink)] border border-slate-200 dark:border-slate-700 rounded-xs px-1.5 py-1 focus:outline-none focus:ring-1 ring-accent cursor-pointer"
                  >
                    <option value={1}>{t('instructorLevelShort')} 1</option>
                    <option value={2}>{t('instructorLevelShort')} 2</option>
                    <option value={3}>{t('instructorLevelShort')} 3</option>
                    <option value={4}>{t('instructorLevelShort')} 4</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
