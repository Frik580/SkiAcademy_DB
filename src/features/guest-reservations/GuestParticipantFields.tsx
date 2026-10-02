import React, { useId } from 'react';
import type { GuestParticipantFormInput } from './guestParticipantForm';

interface GuestParticipantFieldsInput {
  readonly ageYears: string;
  readonly onAgeYearsChange: (value: string) => void;
  readonly discipline: GuestParticipantFormInput['discipline'];
  readonly onDisciplineChange: (value: GuestParticipantFormInput['discipline']) => void;
  readonly labels: {
    readonly age: string;
    readonly discipline: string;
    readonly ski: string;
    readonly snowboard: string;
  };
  readonly skill?: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly label: string;
    readonly options: readonly { readonly value: string; readonly label: string }[];
  };
}

export const GuestParticipantFields: React.FC<GuestParticipantFieldsInput> = ({
  ageYears,
  onAgeYearsChange,
  discipline,
  onDisciplineChange,
  labels,
  skill,
}) => {
  const fieldId = useId();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label htmlFor={`${fieldId}-age`} className="space-y-1 text-xs text-[var(--ink-dim)]">
        <span>{labels.age} *</span>
        <input
          id={`${fieldId}-age`}
          type="number"
          required
          min={0}
          max={125}
          step={1}
          value={ageYears}
          onChange={(event) => onAgeYearsChange(event.target.value)}
          className="ui-field-plain"
        />
      </label>
      <label htmlFor={`${fieldId}-discipline`} className="space-y-1 text-xs text-[var(--ink-dim)]">
        <span>{labels.discipline} *</span>
        <select
          id={`${fieldId}-discipline`}
          required
          value={discipline}
          onChange={(event) =>
            onDisciplineChange(event.target.value as GuestParticipantFormInput['discipline'])
          }
          className="ui-field-plain"
        >
          <option value="" disabled>
            —
          </option>
          <option value="ski">{labels.ski}</option>
          <option value="snowboard">{labels.snowboard}</option>
        </select>
      </label>
      {skill && (
        <label htmlFor={`${fieldId}-skill`} className="space-y-1 text-xs text-[var(--ink-dim)]">
          <span>{skill.label} *</span>
          <select
            id={`${fieldId}-skill`}
            required
            value={skill.value}
            onChange={(event) => skill.onChange(event.target.value)}
            className="ui-field-plain"
          >
            <option value="" disabled>
              —
            </option>
            {skill.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
};
