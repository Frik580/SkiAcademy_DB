import React from 'react';
import { Navigate } from 'react-router-dom';
import { UserProfile } from '../types';

interface AuthRouteProps {
  userProfile: UserProfile | null;
  children: React.ReactNode;
}

export const AuthRoute: React.FC<AuthRouteProps> = ({ userProfile, children }) => {
  if (!userProfile) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
