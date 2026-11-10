import { createRoot } from 'react-dom/client';
import { AdminModal } from '../../../src/features/admin/components/AdminModal';
import { InstructorLessonSkillGroup } from '../../../src/features/instructor-workspace/components/InstructorLessonSkillGroup';
import '../../../src/features/instructor-workspace/components/instructorLessonContext.css';
import '../../../src/index.css';

const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');
createRoot(document.getElementById('root')!).render(
  <AdminModal
    title="Lesson"
    closeLabel="Close"
    onClose={() => undefined}
    width="xl"
    data-testid="instructor-lesson-context"
  >
    <InstructorLessonSkillGroup
      level={1}
      name="Beginner"
      defaultExpanded={false}
      skills={[{ id: 'beginner', title: 'Basic stance', scoreLabel: '0 / 10 · 0%' }]}
    />
    <InstructorLessonSkillGroup
      level={2}
      name="Carve"
      defaultExpanded
      skills={[
        {
          id: 'carve',
          title: 'Длинноеназваниенавыкабезпробелов'.repeat(5),
          scoreLabel: '8 / 10 · 80%',
        },
      ]}
    />
  </AdminModal>
);
