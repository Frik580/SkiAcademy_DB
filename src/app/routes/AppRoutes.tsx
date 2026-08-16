import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRouteContainer } from './AdminRouteContainer';
import { CabinetRouteContainer } from './CabinetRouteContainer';
import { HomeRouteContainer } from './HomeRouteContainer';
import { InstructorRouteContainer } from './InstructorRouteContainer';
import type { AppRoutesProps } from './routeTypes';

export type { AppRoutesProps, ResortData } from './routeTypes';

/** Route table. Each screen owns its own feature-level container. */
export const AppRoutes: React.FC<AppRoutesProps> = (props) => (
  <Routes>
    <Route path="/admin" element={<AdminRouteContainer />} />
    <Route path="/cabinet" element={<CabinetRouteContainer {...props} />} />
    <Route path="/cabinet/:tab" element={<CabinetRouteContainer {...props} />} />
    <Route path="/instructor" element={<InstructorRouteContainer />} />
    <Route path="/" element={<HomeRouteContainer {...props} />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
