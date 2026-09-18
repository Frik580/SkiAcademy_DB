import React from 'react';
import { useLanguage } from '../../../../app/providers/LanguageContext';

type CourseChatClient = { participantId: string; name: string; bookingId: string };

interface HomeworkPanelProps {
  fromInstructorPanel: boolean;
  sendAsHomework: boolean;
  showHomeworkTargetPicker: boolean;
  homeworkAllStudents: boolean;
  homeworkTargetParticipantIds: string[];
  courseParticipants: CourseChatClient[];
  isSending: boolean;
  isCompressing: boolean;
  onSendAsHomeworkChange: (checked: boolean) => void;
  onHomeworkAllChange: (checked: boolean) => void;
  onToggleHomeworkTargetParticipantId: (participantId: string, checked: boolean) => void;
}

export const HomeworkPanel: React.FC<HomeworkPanelProps> = ({
  fromInstructorPanel,
  sendAsHomework,
  showHomeworkTargetPicker,
  homeworkAllStudents,
  homeworkTargetParticipantIds,
  courseParticipants,
  isSending,
  isCompressing,
  onSendAsHomeworkChange,
  onHomeworkAllChange,
  onToggleHomeworkTargetParticipantId,
}) => {
  const { t } = useLanguage();

  if (!fromInstructorPanel) return null;

  return (
    <div className="px-4 py-2 border-t border-[var(--border)] bg-black/5 flex flex-col gap-2 shrink-0">
      <label className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)] cursor-pointer">
        <input
          type="checkbox"
          checked={sendAsHomework}
          onChange={(e) => onSendAsHomeworkChange(e.target.checked)}
          disabled={isSending || isCompressing}
          className="accent-[var(--accent)]"
        />
        {t('chatMarkHomework')}
      </label>
      {showHomeworkTargetPicker && (
        <div className="space-y-1.5 pl-1">
          <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
            {t('chatHomeworkSelectStudent')}
          </p>
          <label className="flex items-center gap-2 text-[10px] font-mono text-[var(--ink)] cursor-pointer">
            <input
              type="checkbox"
              checked={homeworkAllStudents}
              onChange={(e) => onHomeworkAllChange(e.target.checked)}
              disabled={isSending || isCompressing}
              className="accent-[var(--accent)]"
            />
            {t('chatHomeworkAllStudents')}
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {courseParticipants.map((p) => (
              <label
                key={p.participantId}
                className="flex items-center gap-2 text-[10px] font-mono text-[var(--ink)] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={
                    !homeworkAllStudents && homeworkTargetParticipantIds.includes(p.participantId)
                  }
                  disabled={isSending || isCompressing || homeworkAllStudents}
                  onChange={(e) =>
                    onToggleHomeworkTargetParticipantId(p.participantId, e.target.checked)
                  }
                  className="accent-[var(--accent)]"
                />
                <span className="truncate max-w-[140px]">{p.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
