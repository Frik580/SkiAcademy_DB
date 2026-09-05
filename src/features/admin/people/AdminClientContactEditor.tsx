import type { AdminClientContactDraft } from './adminClientContracts';
import type { useAdminClientTranslations } from './useAdminClientTranslations';

interface AdminClientContactEditorProps {
  readonly draft: AdminClientContactDraft;
  readonly email?: string;
  readonly pending: boolean;
  readonly text: ReturnType<typeof useAdminClientTranslations>['text'];
  readonly onChange: (draft: AdminClientContactDraft) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}

export function AdminClientContactEditor({
  draft,
  email,
  pending,
  text,
  onChange,
  onSave,
  onCancel,
}: AdminClientContactEditorProps) {
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="space-y-1.5">
        <label
          className="block text-[10px] font-mono uppercase text-[var(--ink-dim)]"
          htmlFor="admin-client-display-name"
        >
          {text.displayName}
        </label>
        <input
          id="admin-client-display-name"
          aria-label={text.displayName}
          value={draft.displayName}
          onChange={(event) => onChange({ ...draft, displayName: event.target.value })}
          className="w-full border border-[var(--border)] bg-transparent px-3.5 py-2 font-mono text-xs text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
          required
        />
      </div>
      <div className="space-y-1.5">
        <label
          className="block text-[10px] font-mono uppercase text-[var(--ink-dim)]"
          htmlFor="admin-client-email"
        >
          {text.email}
        </label>
        <input
          id="admin-client-email"
          aria-label={text.email}
          value={email ?? ''}
          disabled
          className="w-full cursor-not-allowed border border-[var(--border)] bg-transparent px-3.5 py-2 font-mono text-xs text-[var(--ink)] opacity-60"
        />
        <p className="text-[10px] font-mono leading-relaxed text-[var(--ink-dim)]">
          {text.emailReadOnly}
        </p>
      </div>
      <div className="space-y-1.5">
        <label
          className="block text-[10px] font-mono uppercase text-[var(--ink-dim)]"
          htmlFor="admin-client-phone"
        >
          {text.phone}
        </label>
        <input
          id="admin-client-phone"
          aria-label={text.phone}
          type="tel"
          value={draft.phoneNumber}
          onChange={(event) => onChange({ ...draft, phoneNumber: event.target.value })}
          className="w-full border border-[var(--border)] bg-transparent px-3.5 py-2 font-mono text-xs text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !draft.displayName.trim()}
          className="border border-[var(--border)] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-50"
        >
          {pending ? text.pending : text.saveContact}
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
