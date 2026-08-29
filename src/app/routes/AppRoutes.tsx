import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { HomeRouteContainer } from './HomeRouteContainer';
import type { AppRoutesProps } from './routeTypes';

export type { AppRoutesProps, ResortData } from './routeTypes';

const AdminRouteContainer = React.lazy(() =>
  import('./AdminRouteContainer').then(({ AdminRouteContainer: Component }) => ({
    default: Component,
  }))
);
const CabinetRouteContainer = React.lazy(() =>
  import('./CabinetRouteContainer').then(({ CabinetRouteContainer: Component }) => ({
    default: Component,
  }))
);
const InstructorRouteContainer = React.lazy(() =>
  import('./InstructorRouteContainer').then(({ InstructorRouteContainer: Component }) => ({
    default: Component,
  }))
);

const T31bCoursePilotPage = import.meta.env.DEV
  ? React.lazy(() =>
      import('../../dev/t31b-pilot/T31bCoursePilotPage').then(
        ({ T31bCoursePilotPage: Component }) => ({
          default: Component,
        })
      )
    )
  : null;

const RouteLoadingFallback = () => <div className="min-h-[16rem]" aria-busy="true" />;

/** Route table. Each screen owns its own feature-level container. */
export const AppRoutes: React.FC<AppRoutesProps> = (props) => (
  <React.Suspense fallback={<RouteLoadingFallback />}>
    <Routes>
      <Route path="/admin" element={<AdminRouteContainer />} />
      <Route path="/cabinet" element={<CabinetRouteContainer {...props} />} />
      <Route path="/cabinet/:tab" element={<CabinetRouteContainer {...props} />} />
      <Route path="/instructor" element={<InstructorRouteContainer />} />
      {import.meta.env.DEV && T31bCoursePilotPage ? (
        <Route path="/__dev/t31b-course-pilot" element={<T31bCoursePilotPage />} />
      ) : null}
      <Route path="/" element={<HomeRouteContainer {...props} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </React.Suspense>
);
