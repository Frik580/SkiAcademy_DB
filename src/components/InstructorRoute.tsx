import React from 'react';
import { Navigate } from 'react-router-dom';
import { UserProfile } from '../types';
import { isInstructorWorkspaceUser } from '../lib/workspaceRoutes';

interface InstructorRouteProps {
  userProfile: UserProfile | null;
  children: React.ReactNode;
}

export const InstructorRoute: React.FC<InstructorRouteProps> = ({ userProfile, children }) => {
  if (!userProfile) {
    return <Navigate to="/" replace />;
  }

  if (!isInstructorWorkspaceUser(userProfile)) {
    return <Navigate to="/cabinet" replace />;
  }

  return <>{children}</>;
};
