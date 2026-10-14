import { useLevelProgressionTranslations } from '../../participant-progress/useLevelProgressionTranslations';
import { calculateParticipantStage } from '@ski-academy/shared-domain/canonical/participantLevelProgression';
import { DEFAULT_SKILL_CONFIG } from '../../../domain/achievements';
import React from 'react';
import { Award } from 'lucide-react';
import { useInstructorWorkspace } from './useInstructorWorkspace';

interface InstructorStudentsProps {
  workspace: ReturnType<typeof useInstructorWorkspace>;
}

export const InstructorStudents: React.FC<InstructorStudentsProps> = ({ workspace }) => {
  const { text } = useLevelProgressionTranslations();
  const { t, theme, myStudents, progressById, handleUpdateStudentLevel, skillConfig } = workspace;

  return (
    <div className="space-y-4">
      <h4 className="type-card-title text-[var(--ink)] border-b border-slate-200/80 dark:border-slate-800/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-accent" />
          <span>
            {t('instructorStudentsTitle')} ({myStudents.length})
          </span>
        </div>
        <span className="type-caption text-[var(--ink-dim)] uppercase">
          {t('instructorStudentsHint')}
        </span>
      </h4>

      {myStudents.length === 0 ? (
        <div className="py-8 border border-dashed border-slate-200 dark:border-slate-800 text-center bg-[var(--card-bg)] rounded-xs type-caption text-[var(--ink-dim)]">
          {t('instructorNoStudents')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {myStudents.map((student) => {
            const progress = progressById[student.participantId];
            const ready =
              progress &&
              calculateParticipantStage(
                progress.level,
                progress.skillScores,
                skillConfig ?? DEFAULT_SKILL_CONFIG
              ).ready;
            const review = progress?.levelState?.qualifications.some((q) => q.status === 'review');
            const studentLevel = progressById[student.participantId]?.level || 1;
            return (
              <div
                key={student.participantId}
                className="border border-slate-200/70 dark:border-slate-800/70 p-3 space-y-2 bg-[var(--card-bg)] rounded-xs shadow-xs flex flex-col items-stretch justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors duration-200"
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
                      <div className="w-full h-full flex items-center justify-center type-caption">
                        👤
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h5 className="type-compact text-[var(--ink)] truncate font-medium">
                      {student.name}
                    </h5>
                    <span className="type-caption text-[var(--ink-dim)] block">
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
                  <span>
                    {t('instructorLevelShort')} {studentLevel}
                  </span>
                </div>
                {ready && <p className="type-caption">{text.ready}</p>}
                {review && <p className="type-caption">{text.review}</p>}
                <button
                  className="border border-[var(--border)] rounded-lg p-2 type-button"
                  onClick={() => handleUpdateStudentLevel(student.participantId, student.name)}
                >
                  {ready ? text.confirm : text.request}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
