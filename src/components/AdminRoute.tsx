import React from 'react';
import { Navigate } from 'react-router-dom';
import { UserProfile } from '../types';

interface AdminRouteProps {
  userProfile: UserProfile | null;
  children: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ userProfile, children }) => {
  if (!userProfile || userProfile.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
