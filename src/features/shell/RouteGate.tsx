import React from 'react';
import { Navigate } from 'react-router-dom';
import { UserProfile } from '../../types';
import { isInstructorWorkspaceUser } from '../../lib/workspaceRoutes';
import { useAuthStore } from '../auth';
import { useLanguage } from '../../app/providers/LanguageContext';
import { AppInitSkeleton } from '../../ui/Skeleton';

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
  const { t } = useLanguage();
  const authLoading = useAuthStore((s) => s.authLoading);

  // Wait for auth before redirecting — avoids bouncing signed-in users to `/`.
  if (authLoading) {
    return <AppInitSkeleton label={t('checkingCredentials')} />;
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
