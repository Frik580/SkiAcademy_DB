export const loadInstructorWorkspace = () =>
  import('./InstructorWorkspace').then(({ InstructorWorkspace }) => ({
    default: InstructorWorkspace,
  }));
export type { InstructorWorkspaceProps } from './InstructorWorkspace';
