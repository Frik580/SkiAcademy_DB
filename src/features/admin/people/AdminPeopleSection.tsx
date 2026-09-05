import { AdminClientDirectory } from './AdminClientDirectory';
import { AdminInstructorDirectory } from './AdminInstructorDirectory';
import { AdminRoleDirectory } from './AdminRoleDirectory';

interface AdminPeopleSectionProps {
  readonly adminAccountId: string;
  readonly onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
  readonly surface: 'clients' | 'instructors' | 'admins';
}

export function AdminPeopleSection({
  adminAccountId,
  onRequestConfirm,
  surface,
}: AdminPeopleSectionProps) {
  return (
    <>
      {surface === 'clients' ? <AdminClientDirectory adminAccountId={adminAccountId} /> : null}
      {surface === 'instructors' ? (
        <AdminInstructorDirectory adminAccountId={adminAccountId} />
      ) : null}
      {surface === 'admins' ? (
        <AdminRoleDirectory
          adminAccountId={adminAccountId}
          onRequestConfirm={onRequestConfirm}
        />
      ) : null}
    </>
  );
}
