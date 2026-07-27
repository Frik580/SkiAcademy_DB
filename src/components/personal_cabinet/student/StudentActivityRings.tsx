import React, { useId } from 'react';

export interface ActivityRingMetric {
  label: string;
  percent: number;
  color: string;
}

interface RingSpec {
  radius: number;
  stroke: number;
  metric: ActivityRingMetric;
}

interface StudentActivityRingsProps {
  rings: ActivityRingMetric[];
  size?: number;
  layout?: 'row' | 'stacked';
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

export const StudentActivityRings: React.FC<StudentActivityRingsProps> = ({
  rings,
  size = 132,
  layout = 'row',
}) => {
  const gradientPrefix = useId().replace(/:/g, '');

  const specs: RingSpec[] = [
    { radius: 52, stroke: 11, metric: rings[0] },
    { radius: 38, stroke: 11, metric: rings[1] },
    { radius: 24, stroke: 11, metric: rings[2] },
  ];

  const center = 60;

  const legend = (
    <ul
      className={`space-y-2 ${layout === 'stacked' ? 'w-full' : 'min-w-[125px] sm:min-w-[135px] w-auto'}`}
    >
      {rings.map((ring) => (
        <li key={ring.label} className="leading-tight">
          <span className="block text-sm font-medium text-[var(--ink)] whitespace-nowrap">
            {ring.label}{' '}
            <span className="font-semibold tabular-nums" style={{ color: ring.color }}>
              {clamp(ring.percent)}%
            </span>
          </span>
        </li>
      ))}
    </ul>
  );

  const ringsSvg = (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="block -rotate-90"
        aria-hidden
      >
        <defs>
          {specs.map(({ metric }, index) => {
            const id = `${gradientPrefix}-ring-${index}`;
            return (
              <linearGradient key={id} id={id} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={metric.color} stopOpacity="1" />
                <stop offset="100%" stopColor={metric.color} stopOpacity="0.72" />
              </linearGradient>
            );
          })}
        </defs>

        {specs.map(({ radius, stroke, metric }, index) => {
          const circumference = 2 * Math.PI * radius;
          const offset = circumference - (circumference * clamp(metric.percent)) / 100;
          const gradientId = `${gradientPrefix}-ring-${index}`;

          return (
            <g key={metric.label}>
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={metric.color}
                strokeWidth={stroke}
                strokeOpacity={0.14}
              />
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-[stroke-dashoffset] duration-1000 ease-out"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );

  return (
    <div
      className={`flex items-center shrink-0 ${layout === 'stacked' ? 'flex-col gap-3 w-full max-w-[9.5rem]' : 'gap-3 sm:gap-4 min-w-[215px] sm:min-w-[235px]'}`}
    >
      {ringsSvg}
      {legend}
    </div>
  );
};
