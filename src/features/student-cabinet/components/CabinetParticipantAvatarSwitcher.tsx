import React from 'react';
import {
  firstNameOf,
  formatSwitchToParticipantLabel,
  type CabinetParticipantAvatarItem,
  type CabinetParticipantAvatarSwitcherProps,
} from '../cabinetParticipantAvatarSwitcherContract';

function AvatarFace({
  url,
  name,
  active,
}: {
  readonly url?: string;
  readonly name: string;
  readonly active: boolean;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        draggable={false}
        data-participant-avatar-face={active ? 'active' : 'inactive'}
        className={`h-full w-full object-cover transition-[filter,opacity] duration-150 ${
          active ? 'grayscale-0 opacity-100' : 'grayscale opacity-80'
        }`}
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      data-participant-avatar-face={active ? 'active' : 'inactive'}
      className={`flex h-full w-full items-center justify-center rounded-full bg-[var(--profile-bg)] text-[10px] font-semibold uppercase text-[var(--ink)] transition-[filter,opacity] duration-150 ${
        active ? 'grayscale-0 opacity-100' : 'grayscale opacity-80'
      }`}
    >
      {initial}
    </span>
  );
}

function AvatarCircle({
  item,
  active,
}: {
  readonly item: CabinetParticipantAvatarItem;
  readonly active: boolean;
}) {
  return (
    <span
      data-participant-avatar={active ? 'active' : 'inactive'}
      className={`ui-avatar inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-full transition-[box-shadow,opacity] duration-150 ${
        active
          ? 'shadow-[0_0_0_2px_var(--accent)]'
          : 'shadow-none opacity-90 group-hover:opacity-100 group-focus-visible:opacity-100'
      }`}
    >
      <AvatarFace url={item.avatarUrl} name={item.displayName} active={active} />
    </span>
  );
}

export const CabinetParticipantAvatarSwitcher: React.FC<CabinetParticipantAvatarSwitcherProps> = ({
  items,
  selectedParticipantId,
  onSelect,
  fallbackDisplayName,
  fallbackAvatarUrl,
  groupLabel,
  switchToParticipantLabel,
  showName = false,
}) => {
  const selected = items.find((item) => item.participantId === selectedParticipantId);
  const displayName = firstNameOf(selected?.displayName ?? fallbackDisplayName);
  const interactive = items.length > 1;
  const visibleItems: readonly CabinetParticipantAvatarItem[] =
    items.length > 0
      ? items
      : [
          {
            participantId: 'fallback',
            displayName: fallbackDisplayName,
            authority: 'self',
            ...(fallbackAvatarUrl ? { avatarUrl: fallbackAvatarUrl } : {}),
          },
        ];

  return (
    <div
      className="flex min-w-0 items-center gap-2"
      data-testid="navbar-participant-switcher"
      role={interactive ? 'group' : undefined}
      aria-label={interactive ? groupLabel : undefined}
    >
      <div className="flex items-center gap-2">
        {visibleItems.map((item) => {
          if (!interactive) {
            return <AvatarCircle key={item.participantId} item={item} active />;
          }
          const isSelected = item.participantId === selectedParticipantId;
          const switchLabel = formatSwitchToParticipantLabel(
            switchToParticipantLabel,
            item.displayName
          );
          return (
            <button
              key={item.participantId}
              type="button"
              onClick={() => onSelect(item.participantId)}
              aria-label={switchLabel}
              aria-current={isSelected ? 'true' : undefined}
              aria-pressed={isSelected}
              title={item.displayName}
              data-participant-id={item.participantId}
              className="group shrink-0 rounded-full p-0 leading-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] hover:brightness-110"
            >
              <AvatarCircle item={item} active={isSelected} />
            </button>
          );
        })}
      </div>
      {showName ? (
        <span className="hidden truncate text-sm font-normal text-[var(--ink)] 2xl:inline">
          {displayName}
        </span>
      ) : null}
    </div>
  );
};
