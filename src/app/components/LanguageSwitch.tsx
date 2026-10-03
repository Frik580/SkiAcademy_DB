interface LanguageSwitchInput {
  language: 'ru' | 'en';
  onChange: (language: 'ru' | 'en') => void;
  label: string;
}

/** Pill styling from SkillRadarChart's segmented control; thumb motion from ToggleSwitch. */
export function LanguageSwitch({ language, onChange, label }: LanguageSwitchInput) {
  return (
    <div
      role="group"
      aria-label={label}
      className="relative isolate inline-grid grid-cols-2 items-center p-0.5 rounded-full bg-[var(--border-subtle)]/70 shrink-0 font-sans normal-case tracking-normal"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full bg-[var(--card-bg)] shadow-sm transition-transform duration-200 ease-in-out motion-reduce:transition-none ${
          language === 'en' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      {(['ru', 'en'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={language === option}
          onClick={() => onChange(option)}
          className={`relative px-2.5 py-1.5 text-xs font-medium rounded-full transition-colors duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 ${
            language === option
              ? 'text-[var(--ink)]'
              : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
