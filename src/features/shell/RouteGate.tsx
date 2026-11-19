import React from 'react';
import { Navigate } from 'react-router-dom';
import { UserProfile } from '../../types';
import { isInstructorWorkspaceUser } from '../../lib/workspaceRoutes';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../profile/profileStore';
import { RouteContentLoading } from '../../ui/RouteContentLoading';
import { ActionButton } from '../../ui/ActionButton';
import { useLanguage } from '../../app/providers/LanguageContext';

export type RouteGateRole = 'auth' | 'admin' | 'instructor';

export interface RouteGateProps {
  userProfile: UserProfile | null;
  gateType?: RouteGateRole;
  fallbackPath?: string;
  children: React.ReactNode;
}

export const RouteGate: React.FC<RouteGateProps> = ({
  userProfile,
  gateType = 'auth',
  fallbackPath = '/',
  children,
}) => {
  const authLoading = useAuthStore((s) => s.authLoading);
  const profileLoading = useProfileStore((s) => s.profileLoading);
  const profileLoadError = useProfileStore((s) => s.profileLoadError);
  const retryProfileLoad = useProfileStore((s) => s.retryProfileLoad);
  const { t } = useLanguage();

  // Wait for auth + profile before redirecting — avoids /cabinet → / → /cabinet on reload.
  if (authLoading || profileLoading) {
    return <RouteContentLoading />;
  }

  if (profileLoadError) {
    return (
      <div role="alert" className="space-y-2 p-6">
        <p>{t('profileLoadError')}</p>
        <ActionButton onClick={retryProfileLoad}>{t('retry')}</ActionButton>
      </div>
    );
  }

  if (!userProfile) {
    return <Navigate to={fallbackPath} replace />;
  }

  if (gateType === 'admin' && userProfile.role !== 'admin') {
    return <Navigate to={fallbackPath} replace />;
  }

  if (gateType === 'instructor' && !isInstructorWorkspaceUser(userProfile)) {
    return <Navigate to="/cabinet" replace />;
  }

  return <>{children}</>;
};

export const AuthRoute: React.FC<{ userProfile: UserProfile | null; children: React.ReactNode }> = (
  props
) => <RouteGate {...props} gateType="auth" />;

export const AdminRoute: React.FC<{
  userProfile: UserProfile | null;
  children: React.ReactNode;
}> = (props) => <RouteGate {...props} gateType="admin" />;

export const InstructorRoute: React.FC<{
  userProfile: UserProfile | null;
  children: React.ReactNode;
}> = (props) => <RouteGate {...props} gateType="instructor" />;
