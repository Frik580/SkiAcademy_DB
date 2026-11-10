import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { lessonContextSkillGroups } from '../instructorLessonContextPresentation';

export function InstructorLessonSkillGroup({
  name,
  skills,
  defaultExpanded,
}: ReturnType<typeof lessonContextSkillGroups>[number]) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="min-w-0">
      <h4>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((open) => !open)}
          className="lesson-skill-toggle type-button flex w-full items-center gap-2 rounded-lg bg-[var(--card-bg)] px-3 py-2 text-left text-[var(--ink)]"
        >
          <span className="min-w-0 flex-1">{name}</span>
          <span className="type-caption text-[var(--ink-dim)]">{skills.length}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        </button>
      </h4>
      <ul id={panelId} hidden={!expanded} className="px-3 py-1">
        {skills.map((skill) => (
          <li key={skill.id} className="lesson-skill-row py-1">
            <span className="type-body">{skill.title}</span>
            <span className="type-caption text-[var(--ink-dim)]">{skill.scoreLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
