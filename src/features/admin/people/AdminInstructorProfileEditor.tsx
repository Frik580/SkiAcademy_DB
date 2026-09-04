import type { AdminInstructorProfileDraft } from './adminInstructorContracts';
import type { useAdminInstructorTranslations } from './useAdminInstructorTranslations';

interface AdminInstructorProfileEditorProps {
  readonly draft: AdminInstructorProfileDraft;
  readonly pending: boolean;
  readonly uploading?: boolean;
  readonly text: ReturnType<typeof useAdminInstructorTranslations>['text'];
  readonly submitLabel: string;
  readonly onChange: (draft: AdminInstructorProfileDraft) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly onUploadPhoto?: (file: File) => void;
}

export function AdminInstructorProfileEditor({
  draft,
  pending,
  uploading = false,
  text,
  submitLabel,
  onChange,
  onSave,
  onCancel,
  onUploadPhoto,
}: AdminInstructorProfileEditorProps) {
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label
        className="block space-y-1.5 text-[10px] font-mono uppercase text-[var(--ink-dim)]"
        htmlFor="admin-instructor-name"
      >
        {text.displayName}
        <input
          id="admin-instructor-name"
          aria-label={text.displayName}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          className="w-full border border-[var(--border)] bg-transparent px-3.5 py-2 font-mono text-xs normal-case text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
          required
        />
      </label>
      <label
        className="block space-y-1.5 text-[10px] font-mono uppercase text-[var(--ink-dim)]"
        htmlFor="admin-instructor-specialty"
      >
        {text.specialty}
        <select
          id="admin-instructor-specialty"
          aria-label={text.specialty}
          value={draft.specialty}
          onChange={(event) =>
            onChange({
              ...draft,
              specialty: event.target.value as AdminInstructorProfileDraft['specialty'],
            })
          }
          className="w-full border border-[var(--border)] bg-transparent px-3.5 py-2 font-mono text-xs normal-case text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
        >
          <option value="ski">{text.specialtySki}</option>
          <option value="snowboard">{text.specialtySnowboard}</option>
          <option value="both">{text.specialtyBoth}</option>
        </select>
      </label>
      <label
        className="block space-y-1.5 text-[10px] font-mono uppercase text-[var(--ink-dim)]"
        htmlFor="admin-instructor-price"
      >
        {text.pricePerHourKZT}
        <input
          id="admin-instructor-price"
          aria-label={text.pricePerHourKZT}
          type="number"
          min={1}
          step={1}
          value={draft.pricePerHourKZT}
          onChange={(event) => onChange({ ...draft, pricePerHourKZT: event.target.value })}
          className="w-full border border-[var(--border)] bg-transparent px-3.5 py-2 font-mono text-xs normal-case text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
          required
        />
      </label>
      <label
        className="block space-y-1.5 text-[10px] font-mono uppercase text-[var(--ink-dim)]"
        htmlFor="admin-instructor-languages"
      >
        {text.languages}
        <input
          id="admin-instructor-languages"
          aria-label={text.languages}
          value={draft.languages}
          onChange={(event) => onChange({ ...draft, languages: event.target.value })}
          placeholder={text.languagesHint}
          className="w-full border border-[var(--border)] bg-transparent px-3.5 py-2 font-mono text-xs normal-case text-[var(--ink)] placeholder-[var(--ink-dim)] focus:border-[var(--ink)] focus:outline-none"
        />
      </label>
      <label
        className="block space-y-1.5 text-[10px] font-mono uppercase text-[var(--ink-dim)]"
        htmlFor="admin-instructor-experience"
      >
        {text.experienceYears}
        <input
          id="admin-instructor-experience"
          aria-label={text.experienceYears}
          type="number"
          min={0}
          max={80}
          step={1}
          value={draft.experienceYears}
          onChange={(event) => onChange({ ...draft, experienceYears: event.target.value })}
          className="w-full border border-[var(--border)] bg-transparent px-3.5 py-2 font-mono text-xs normal-case text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
        />
      </label>
      <label
        className="block space-y-1.5 text-[10px] font-mono uppercase text-[var(--ink-dim)]"
        htmlFor="admin-instructor-phone"
      >
        {text.phone}
        <input
          id="admin-instructor-phone"
          aria-label={text.phone}
          type="tel"
          value={draft.phoneNumber}
          onChange={(event) => onChange({ ...draft, phoneNumber: event.target.value })}
          className="w-full border border-[var(--border)] bg-transparent px-3.5 py-2 font-mono text-xs normal-case text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
        />
      </label>
      <label
        className="block space-y-1.5 text-[10px] font-mono uppercase text-[var(--ink-dim)]"
        htmlFor="admin-instructor-bio"
      >
        {text.bio}
        <textarea
          id="admin-instructor-bio"
          aria-label={text.bio}
          value={draft.bio}
          onChange={(event) => onChange({ ...draft, bio: event.target.value })}
          rows={3}
          className="w-full border border-[var(--border)] bg-transparent px-3.5 py-2 font-mono text-xs normal-case text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
        />
      </label>
      <div className="space-y-1.5">
        <label
          className="block space-y-1.5 text-[10px] font-mono uppercase text-[var(--ink-dim)]"
          htmlFor="admin-instructor-avatar"
        >
          {text.avatarUrl}
          <input
            id="admin-instructor-avatar"
            aria-label={text.avatarUrl}
            value={draft.avatarUrl}
            onChange={(event) => onChange({ ...draft, avatarUrl: event.target.value })}
            className="w-full border border-[var(--border)] bg-transparent px-3.5 py-2 font-mono text-xs normal-case text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
          />
        </label>
        {onUploadPhoto ? (
          <label
            className="inline-flex cursor-pointer items-center border border-[var(--border)] px-3 py-2 text-[10px] font-mono uppercase tracking-wider"
            htmlFor="admin-instructor-avatar-file"
          >
            <input
              id="admin-instructor-avatar-file"
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={pending || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUploadPhoto(file);
                event.target.value = '';
              }}
            />
            {uploading ? text.uploading : text.uploadPhoto}
          </label>
        ) : null}
        {draft.avatarUrl ? (
          <img src={draft.avatarUrl} alt="" className="mt-2 h-16 w-16 object-cover" />
        ) : null}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || uploading || !draft.name.trim() || !draft.pricePerHourKZT.trim()}
          className="border border-[var(--border)] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-50"
        >
          {pending ? text.pending : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
        >
          {text.cancel}
        </button>
      </div>
    </form>
  );
}
