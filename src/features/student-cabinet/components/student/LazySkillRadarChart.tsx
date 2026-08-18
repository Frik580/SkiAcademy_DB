import React from 'react';
import { LazyLoad } from '../../../../ui/LazyLoad';
import type { SkillRadarChartInput } from './studentCabinetContracts';

const SkillRadarChart = React.lazy(() =>
  import('./SkillRadarChart').then(({ SkillRadarChart: Component }) => ({ default: Component }))
);

const SkillRadarLoadingFallback = () => <div className="min-h-56" aria-busy="true" />;

/** Defers the interactive skill visualisation until a cabinet panel renders it. */
export const LazySkillRadarChart: React.FC<SkillRadarChartInput> = (props) => (
  <LazyLoad fallback={<SkillRadarLoadingFallback />}>
    <SkillRadarChart {...props} />
  </LazyLoad>
);
