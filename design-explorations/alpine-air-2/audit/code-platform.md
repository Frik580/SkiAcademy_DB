# Carve Academy — Platform Inventory (routes, auth, i18n, theme, a11y, infra, staging)

Repo root: `D:\SkiAcademy_DB`. Stack from `package.json`: React 18 + Vite 5 + TypeScript + **Tailwind CSS v4**
(`@tailwindcss/vite`, no classic `tailwind.config.js` — theming lives in `src/index.css`) + Firebase 12.16.0
(`firebase` 12.16.0), `react-router-dom` 7.18.2, `zustand` 5, `zod` 4, `motion` 12 (Framer Motion successor),
`lucide-react` icons, `canvas-confetti`. Node `>=22`.

> **Headline fact — interface languages:** the UI ships **exactly two languages: English (`en`) and Russian
> (`ru`)**. It is **RU/EN, two languages — not RU/KZ, and not three.** Kazakh does not exist anywhere in the
> UI layer (see §3).

---

## 1. Route table and guards

Route table: `src/app/routes/AppRoutes.tsx` (51 lines). Containers are lazy-loaded via `React.lazy` and
suspended under one `<React.Suspense fallback={<RouteLoadingFallback />}>`; the fallback is
`<div className="min-h-[16rem]" aria-busy="true" />` (`AppRoutes.tsx:34`).

| Path | Element | Guard | Notes |
|---|---|---|---|
| `/` | `HomeRouteContainer` (`src/app/routes/HomeRouteContainer.tsx`) | none — public, **but with a bounce** | receives `resortData` + auth callbacks via `AppRoutesProps` (`src/app/routes/routeTypes.ts`). Signed-in **non-admin** users are redirected off `/` to `getDefaultWorkspacePath(userProfile)` — `/instructor` for instructors/admins, else `/cabinet` (`HomeRouteContainer.tsx:101-103`). Admins and anonymous visitors stay on the landing page. |
| `/admin` | `AdminRouteContainer` (lazy) | `AdminRoute` → `RouteGate gateType="admin"` (`AdminRouteContainer.tsx:45`) | requires `userProfile.role === 'admin'` |
| `/cabinet` | `CabinetRouteContainer` | `AuthRoute` → `RouteGate gateType="auth"` (`CabinetRouteContainer.tsx:263`) | any signed-in account |
| `/cabinet/:tab` | `CabinetRouteContainer` | `AuthRoute` + tab whitelist | unknown tab ⇒ `<Navigate to="/cabinet" replace />` (`CabinetRouteContainer.tsx:258-260`) |
| `/instructor` | `InstructorRouteContainer` (lazy) | `InstructorRoute` → `RouteGate gateType="instructor"` (`InstructorRouteContainer.tsx:47`) | failure redirects to `/cabinet`, not `/` |
| `/__dev/t31b-course-pilot` | `T31bCoursePilotPage` (`src/dev/t31b-pilot/`) | **DEV only** — route is registered only when `import.meta.env.DEV` (`AppRoutes.tsx:24-46`) | course pilot sandbox, absent in production builds |
| `*` | `<Navigate to="/" replace />` | — | catch-all redirect |

### 1.1 The guard primitive

`src/features/shell/RouteGate.tsx` (61 lines). Exports `RouteGate`, `RouteGateRole`, and the three thin
wrappers `AuthRoute`, `AdminRoute`, `InstructorRoute`.

```ts
export type RouteGateRole = 'auth' | 'admin' | 'instructor';   // RouteGate.tsx:10
```

Guard algorithm:

1. If `authLoading || profileLoading` → render `<AppInitSkeleton label={t('checkingCredentials')} />`
   (`src/ui/Skeleton.tsx`). The comment at `RouteGate.tsx:29` explains why: waiting avoids a
   `/cabinet → / → /cabinet` redirect loop on reload.
2. If `!userProfile` → `<Navigate to={fallbackPath} replace />`, `fallbackPath` defaults to `'/'`.
3. `gateType === 'admin'` and `userProfile.role !== 'admin'` → `<Navigate to={fallbackPath} replace />`.
4. `gateType === 'instructor'` and `!isInstructorWorkspaceUser(userProfile)` → `<Navigate to="/cabinet" replace />`.

So guards are **redirect-only** — there is no "you are not authorised" screen; unauthorized users are silently
sent to `/` (admin) or `/cabinet` (instructor). Guards read `userProfile`, a Firestore-derived value, so they
are **client-side presentation only**; real authorization is Firestore Rules / callable enforcement.
Also note `AppShell` renders `<Navbar>` *above* `AppRoutes` (`AppShell.tsx:108-125`), so the navbar and the
notification bell are visible on gated routes even while the gate is still resolving.

### 1.2 Cabinet tabs (the `/cabinet/:tab` whitelist)

`src/lib/workspaceRoutes.ts:4-24` — `CABINET_TABS` (19 values, in nav order):

`home`, `training`, `coach`, `development`, `calendar`, `courses`, `instructors`, `settings`,
`profile_personal`, `profile_participants`, `profile_wallet`, `profile_journey`, `profile_skills`,
**`profile_certificates`**, `profile_achievements`, `profile_season`, `profile_videos`,
`profile_preferences`, `history`.

Note: **`profile_certificates` is a live UI tab while no canonical Certificate model exists** (see
`code-domain-mechanics.md` §7.4) — that screen is design-only / NEW BUILD territory.

Helpers in the same file: `isInstructorWorkspaceUser(profile)` =
`profile.role === 'admin' || !!profile.isInstructor`; `getDefaultWorkspacePath(profile)` returns
`/instructor` for instructors/admins else `/cabinet`; `parseCabinetTabParam` falls back to `'home'`;
`cabinetPathForTab` maps `home` → `/cabinet`, otherwise `/cabinet/{tab}`.

### 1.3 Shell composition

`src/app/AppShell.tsx`: `Navbar` → `FeaturePageShell` (wraps `AppRoutes`, receives
`isPaddedWorkspace` / `isHomeRoute` / `isAuthenticated` / `dbStatusWarning`) → `<ModalHost />`
(`src/features/shell/ModalHost.tsx`, driven by `src/features/shell/modalRegistry.ts`).
`isPaddedWorkspaceRoute = pathname === '/admin' || pathname === '/instructor'` (`AppShell.tsx:71-72`).
The navbar badge count is `unreadNotificationCount + unreviewedCompletedCount` (`AppShell.tsx:89`).

---

## 2. Auth model and roles

### 2.1 Canonical vs legacy role model

Canonical (`packages/shared-domain/src/canonical/identityAdministration.ts:21-22`,
`packages/shared-domain/src/canonical/commands/capabilities.ts`):

- `ACCOUNT_ROLES = ['user', 'admin']` — **only two roles**.
- `AccountLifecycle` = `active` | `disabled`.
- **Instructor is NOT a role.** It is `/instructors` catalog membership plus an `instructor` *capability*.
- Capabilities: `account_owner`, `parent_guardian`, `instructor`, `administrator`, plus non-account actors
  `guest`, `system`, `provider_callback`.

The client may only declare a **subset**: `ClientCallableCapability` = `account_owner` | `parent_guardian` |
`instructor`; admin is signalled by a separate boolean `administratorContext`.

`ACTOR_CAPABILITY_MATRIX`: `account → [account_owner, parent_guardian, administrator, instructor]`,
`guest → [guest]`, `system → [system]`, `provider → [provider_callback]`.

### 2.2 Legacy profile projection actually used by the UI

`src/types/user.ts:32-71` — `UserProfile` on `/users/{accountId}` carries `role` (`'user' | 'admin'`),
`systemRole` (`'owner'` optional legacy super-admin), `isInstructor` boolean, `instructorId`, plus legacy
money/progress fields. Guards branch on `userProfile.role === 'admin'` (`RouteGate.tsx:38`) and
`isInstructorWorkspaceUser` = `role === 'admin' || !!isInstructor` (`workspaceRoutes.ts:26-27`) — i.e. the
practical rule is **(role === 'admin') || isInstructor**, never `role === 'instructor'`.

Navbar labels are role-derived from the dictionary: `manager` / `skier` (`src/lib/i18n/translations.ts:25-26`).

### 2.3 Stores

`useAuthStore` (`src/features/auth/`, `src/features/auth/authSelectors.ts`) and `useProfileStore`
(`src/features/profile/profileStore.ts`) are **zustand** stores; `AppShell` subscribes with selectors
(`s.userProfile`, `s.authLoading`, `s.handleSignOut`, `s.profileLoading`). Loading flags drive the
`RouteGate` skeleton. Guest transport lives in
`src/features/course-enrollments/guestCourseEnrollmentCredentialStorage.ts` and
`src/lib/canonical/canonicalCommandClient.ts` (`executeGuestCanonicalCommand`).

Other feature stores (zustand) visible in `src/features/*`: `bookingsStore`, `coursesStore`, `walletStore`,
`notificationsStore`, `participantLessonFeedbackStore`, `participantProgressStore`, `uiStore`.

---

## 3. Interface languages — exactly EN and RU

### 3.1 The authoritative list

`src/lib/i18n/translations.ts:1-15`:

```ts
/** Supported UI locales — the app only exposes English and Russian. */
export const UI_LANGUAGES = ['en', 'ru'] as const;
export type Language = (typeof UI_LANGUAGES)[number];
export function isUiLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'ru';
}
export function resolveUiLanguage(saved?: string | null): Language {
  if (isUiLanguage(saved)) return saved;
  const browserLang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : '';
  return browserLang.startsWith('ru') ? 'ru' : 'en';
}
```

`src/app/providers/LanguageContext.tsx` re-exports `translations`, `Language`, `TranslationKey`,
`isUiLanguage`, `resolveUiLanguage`, `UI_LANGUAGES` — it defines no additional languages.

**Kazakh does not exist in the product.** A repo-wide search for `kz`, `Kazakh`, `казах` returns only:
`src/hooks/useResortStats.ts:15` (`subNameEn: 'Resort in Kazakhstan'`), two test comments about the
`Asia/Almaty` timezone, and `normalizeInstructorSpokenLanguages(['Kazakh','ru'])` in a shared-domain unit
test. There is **no `kk` locale, no Kazakh dictionary, no Kazakh selector option.**
(Instructor *spoken* languages are a separate domain enum with 6 codes — `ru, en, de, fr, it, es`,
`src/lib/i18n/instructorLanguages.ts` — a teaching attribute, not a UI locale.)

### 3.2 Language selector behaviour

A **binary toggle button, not a dropdown**, rendered as a `ui-icon-btn` labelled `EN` / `RU`:

- `src/app/components/Navbar.tsx:168-174` — desktop header (`hidden lg:flex`), anonymous users.
- `src/app/components/Navbar.tsx:447-452` — mobile hamburger menu row, labelled `t('languageLabel')`.
- A third instance at `Navbar.tsx:264`.

Handler is identical everywhere: `onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}`.
Tooltip `title={t('switchLanguage')}`. There is **no language picker list and no KZ option**.

### 3.3 Persistence and resolution

`LanguageContext.tsx:30-44`:

- Initial state = `resolveUiLanguage(localStorage.getItem('alpine_glide_lang'))`.
- `setLanguage` ignores non-members (`if (!isUiLanguage(lang)) return;`), persists to `localStorage`
  key **`alpine_glide_lang`**.
- Resolution order: saved value → browser locale (`navigator.language.startsWith('ru')`) → `en` default.
  There is no `document.documentElement.lang` sync.

### 3.4 Translation key patterns

- One dictionary file: `src/lib/i18n/translations.ts` (4,728 lines). `en` block starts line 18, `ru` block
  starts line 2366, object closes line 4726 with `} as const;`.
- `export type TranslationKey = keyof (typeof translations)['en'];` (line 4728) — **the `en` object is the
  schema**; the `ru` object must match it structurally.
- Access via the context hook: `const { t, language, setLanguage } = useLanguage();`
  (`t: (key: TranslationKey) => string`). ~110 components call it directly; per `AGENTS.md` §7, new
  presentational children must use a feature-level translation hook instead of importing `useLanguage()`.
- Fallback chain inside `t` (line 43): `translations[language][key] || translations['en'][key] || String(key)`
  — a missing RU string silently degrades to English, then to the raw key.
- Parity is CI-enforced: `npm run i18n:check` → `scripts/check-translations.mjs` → runs
  `tests/unit/translationsParity.test.ts`, documented as *"Validates en/ru translation key parity"*.
- Other i18n helpers in `src/lib/i18n/`: `pluralize.ts` (RU plural rules — used by
  `CanonicalCoursesManager.tsx:302` for день/дня/дней), `bookingLabels.ts`, `courseDates.ts`, `duration.ts`,
  `contentTranslation.ts`, `instructorBio.ts`. Plus `src/lib/useTranslatedBookings.ts`
  (`useTranslatedBookings`).

### 3.5 Hardcoded strings — a real, sizeable debt

A Cyrillic scan across `src/**/*.tsx` returns **250 matching lines across 304 matches** (full list in the
grep spill). Two dominant anti-patterns:

1. **Inline ternary bypass of the dictionary** — `language === 'ru' ? 'Текст' : 'Text'`. Worst offenders:
   `src/features/admin/components/courses/CanonicalCoursesManager.tsx` (hundreds of lines: column labels,
   tab labels, all validation messages, placeholders, filter labels), `CanonicalCourseDayForm.tsx`,
   `CanonicalCourseDaysEditor.tsx`, `src/features/admin/components/settings/SkillConfigManager.tsx`,
   `src/features/admin/components/resort/sections/ResortSliderSection.tsx`,
   `src/features/admin/components/resort/sections/ResortDataSection.tsx`,
   `src/ui/ApplePagination.tsx` (Russian only, no `en` branch: lines 74, 80, 83, 114, 172).
2. **`t(key) || 'Русский фолбэк'`** — treats the dictionary as optional and hardcodes a Russian fallback
   with no English arm at all: `LinkGuestBookingModal.tsx:60,71,133,164,177,244`,
   `FinancialOverview.tsx:51`, `AdminOperationalMetrics.tsx:23`, `AdminDisplayChrome.tsx:15`,
   `AdminProductSettings.tsx:26-38`, `AdminSystemSettings.tsx:234-238`.

Russian-only **data field** suffixes (`…Ru`) are a separate, legitimate pattern for admin-authored bilingual
catalog content: `title`/`titleRu`, `shortDescription`/`shortDescriptionRu`, `detailedDescription`/
`detailedDescriptionRu`, `badge`/`badgeRu`, `benefits`/`benefitsRu`, `program`/`programRu`, `faq`/`faqRu`
(`CanonicalCoursesManager.tsx:970-998`, `resortConfig.nameRu/subNameRu/liftsStatusRu`). Note the admin course
editor hardcodes a **Russian column header set** at lines 1951-1974 even in EN mode.

Design consequence: a redesign cannot assume a clean 100%-dictionary app; there are three coexisting
copy strategies (dictionary, inline ternary, `Ru`-suffixed content field).

---

## 4. Theme tokens — "Alpine Air" (light/dark)

`src/index.css`. Tailwind v4, no `tailwind.config.js`.

### 4.1 Framework wiring

- `@theme { }` at line 3 defines the font families:
  - `--font-sans: 'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;`
  - `--font-serif: 'Cormorant Garamond', Georgia, Cambria, 'Times New Roman', Times, serif;`
  - `--font-mono: 'Space Mono', ui-monospace, SFMono-Regular, monospace;`
- Line 9: `@variant dark (&:where(.dark, .dark *));` — Tailwind `dark:` utilities are bound to a `.dark`
  **class**, not a media query.

### 4.2 The Alpine Air token block (comment on line 11: *"Alpine Air — sole design theme"*)

Declared once on the root (light, lines 13-62) and overridden in the `.dark,` block (lines 65-99).

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#ffffff` | `#0a0a0a` |
| `--card-bg` | `#ffffff` | `#141414` |
| `--ink` | `#111111` | `#f3f3f1` |
| `--ink-dim` | `rgba(17,17,17,0.5)` | `rgba(243,243,241,0.52)` |
| `--border` | `rgba(17,17,17,0.07)` | `rgba(243,243,241,0.08)` |
| `--border-subtle` | `rgba(17,17,17,0.035)` | `rgba(243,243,241,0.04)` |
| `--profile-bg` | `#f6f6f4` | `#111111` |
| `--accent` | `#1a6578` (deep teal) | `#5ec8e8` (ice blue) |
| `--accent-hover` | `#134e5e` | `#8dd8ef` |
| `--accent-muted` | `rgba(26,101,120,0.08)` | `rgba(94,200,232,0.1)` |
| `--accent-foreground` | `#ffffff` | `#0a0a0a` |
| `--hero-ink` | `#111111` | `#f3f3f1` |
| `--hero-ink-dim` | `rgba(17,17,17,0.5)` | `rgba(243,243,241,0.7)` |
| `--hero-cta-bg` / `--hero-cta-bg-hover` | `#1a6578` / `#134e5e` | same (unchanged) |
| `--hero-scrim` | `255, 255, 255` | — |
| `--hero-scrim-dark` | `10, 10, 10` | — |
| `--radius` | `20px` | (inherited) |
| `--radius-sm` | `9999px` (pill) | inherited |
| `--radius-md` | `14px` | inherited |
| `--shadow-card` | `0 8px 40px rgba(17,17,17,0.07)` | `0 8px 40px rgba(17,17,17,0.35)` |
| `--shadow-soft` | `0 2px 16px rgba(17,17,17,0.05)` | `0 2px 16px rgba(17,17,17,0.25)` |
| `--fab-book-bg` / `-hover` | `#15803d` / `#166534` (green) | `#4ade80` / `#86efac` |
| `--fab-book-fg` | `#ffffff` | `#052e16` |
| `--fab-book-shadow` | `0 10px 28px rgba(21,128,61,0.38), 0 2px 8px rgba(0,0,0,0.1)` | `0 10px 32px rgba(17,17,17,0.48), 0 0 0 1px rgba(74,222,128,0.22)` |

Theme-invariant (root only, not overridden in `.dark`):
`--hero-secondary-*` (all `transparent` / `none` — the secondary CTA is deliberately invisible),
`--hero-title-shadow: none`, `--hero-body-shadow: none`, `--layout-divider: transparent`,
`--ui-border-width: 0px`, `--ui-border-color: transparent`, `--ui-radius: var(--radius)`,
`--ui-shadow: var(--shadow-card)`, `--section-gap: 4rem`,
`--app-navbar-height: 4.5rem`, `--app-student-tab-pill-height: 3.25rem`,
`--site-footer-height: calc(var(--app-student-tab-pill-height) + 40px)`,
`--app-student-tab-bar-stack: calc(3.25rem + 2 * 1.25rem + env(safe-area-inset-bottom, 0px))`.

**Design note:** the "Alpine Air" aesthetic is *borderless and shadow-based* — `--ui-border-width: 0px` and
transparent borders mean component separation comes from `--shadow-card` and background tint, not outlines.

### 4.3 Theme switching

`src/hooks/useTheme.ts`: `type Theme = 'light' | 'dark'`. Default is **`dark`** when nothing is stored
(`getInitialTheme` returns `'dark'`, line 22). Persisted to `localStorage` key **`theme`**. Applied by
adding/removing the `dark` class on `document.documentElement`. Synchronization is via a `MutationObserver` on
`documentElement` attributes + `window` `storage` and `theme-change` events. Exposes
`{ theme, toggleTheme }`; `Navbar` calls `onToggleTheme` and labels via `t('switchLanguage')` /
`t('lightTheme')` / `t('darkTheme')`.

### 4.4 Responsive breakpoints

No `tailwind.config.*` and no `@theme { --breakpoint-* }`, so breakpoints are **Tailwind v4 defaults only**:
`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px. **No custom screens are declared.**
`src/index.css` adds hand-written media queries: `:690` `min-width:640px`, `:832`/`:916`/`:922`
`max-width:767px`, `:887` `max-width:639px`, `:893` `min-width:640px`, and `:941`
`(orientation: landscape) and (max-height: 520px)` for short-viewport hero compaction.

**There is no `useMediaQuery` hook.** Only two files use `matchMedia`:
`src/app/components/HeroCarousel.tsx:113-126` (reactive `isMobile`, `(max-width: 767px)`) and
`src/features/admin/lesson-bookings/AdminLessonBookingPanel.tsx:147,166` (one-shot, `(max-width: 1023px)`).
One arbitrary breakpoint appears in markup: `max-[1199px]:hidden` (`src/app/FeaturePageShell.tsx:48`).

Responsive conditional-render sites (13): `ResortConditionsSidebar.tsx:48` (`flex w-full lg:hidden`) and
`:84` (`hidden lg:flex`); `Navbar.tsx:153` (`hidden lg:flex`), `:297` (`lg:hidden`);
`HeroCarousel.tsx:448` (`hero-pagination-shell md:hidden`, mobile dots only);
`CourseEnrollmentModal.tsx:392` and `ScheduleSlotActionModal.tsx:614` (`sm:hidden` mobile drag handle);
`InstructorCard.tsx:173/185`; `ScheduleCalendar.tsx:161` (`space-y-3 sm:hidden` mobile fallback list);
`Skeleton.tsx:184-185`.

**Mobile-first pieces that exist:**

- `src/features/student-cabinet/components/student/StudentBookNextFab.tsx` — portaled viewport-fixed circular
  FAB, `right-4 sm:right-6`, bottom offset by safe-area + tab-bar height (`:21-24`).
- **iOS-style bottom tab bar, inline** in
  `src/features/student-cabinet/components/student/StudentCabinetUI.tsx:118-169` (not a separate file):
  portaled fixed `<nav>`, `touch-pan-y`, `env(safe-area-inset-bottom)`, glass blur,
  `aria-label={t('scNavHome')}`, `data-student-tab-bar="true"`, with an inline green booking button.
  CSS `.sc-tab-bar` at `index.css:1011`.
- **Hand-rolled swipe navigation** — `StudentCabinetShell.tsx:372-468`: touchstart/touchend horizontal swipe
  (≥35px, ≤800ms, `absX > absY*1.1`) changes the cabinet tab, skipping when inside a modal overlay, an input,
  or a horizontal scroller.
- Mobile nav drawer — `Navbar.tsx:358` (`.ui-navbar-panel lg:hidden absolute top-full`), with
  `aria-expanded`/`aria-haspopup="menu"` on the trigger (`:194-195`).
- Mobile bottom-sheet idiom (hand-rolled per modal, no primitive): `BookingModal.tsx:50`
  (`items-end … sm:items-center sm:p-6`), `BookInstructorPickerModal.tsx:71`,
  `ScheduleSlotActionModal.tsx:606,611`, plus `100svh`/`100dvh` usage in `HeroCarousel.tsx:293,357` and
  `Navbar.tsx:358`.

**No `*Drawer*`, `*BottomSheet*`, `*Sidebar*`, or `*Sheet*` component file exists** — sheets are inlined into
each modal.

### 4.5 Component classes and known CSS bugs

`src/index.css:158-791` defines a hand-written `@layer components` design system: `.btn-primary` (`:159`),
`.btn-secondary` (`:221`), `.btn-secondary-hero` (`:252`), `.btn-primary-hero` (`:282`),
`.student-book-fab` (`:190`), accent helpers (`.text-accent` `:310` … `.border-accent-soft` `:351`),
surfaces (`.ui-card` `:382`, `.ui-panel` `:389`, `.ui-field` `:401`, `.ui-select` `:448`, `.ui-icon-btn`
`:467`, `.ui-empty-state` `:529`, `.ui-modal-overlay` `:542`, `.ui-modal` `:560`, `.ui-chip` `:588`,
`.ui-avatar` `:629`, `.ui-list-row` `:641`, `.ui-navbar` `:654`, `.ui-footer` `:696`, `.ui-hero` `:714`).

Two defects worth carrying into a redesign:

- **`.rounded-none` is silently overridden** — `@layer utilities { .rounded-none { border-radius: var(--radius-md) } }`
  at `index.css:152-156` makes Tailwind's `rounded-none` mean **14px**. Every component using `rounded-none`
  for sharp corners renders rounded (`ConfirmActionModal.tsx:45,54,62`,
  `BannerBackgroundModeControl.tsx:24`).
- **~13 component classes are declared twice** (`.ui-panel`, `.ui-field`, `.ui-field-plain`, `.ui-select`,
  `.ui-chip-group`, `.ui-chip`, `.ui-empty-state`, `.ui-list-row`, `.ui-footer`, `.ui-hero`, `.ui-label`,
  `.ui-section-eyebrow`, `.ui-modal-overlay`) plus `.btn-*` and `.sc-tab-bar` — the second block silently
  wins. Leftover pre-"Alpine Air" CSS.

### 4.6 Motion & focus

- `@media (prefers-reduced-motion: reduce)` at `index.css:1004-1008` — but it disables only
  `.journey-marker-pulse`. **Not global**: `.animate-fade-in` (`:983`), `animate-pulse`, `animate-ping`,
  every `animate-spin` loader, and the inline keyframes in `LevelUpModal.tsx:22-33` remain unguarded.
- Focus styles are authored but weak: `.student-book-fab:focus-visible` (`:216`),
  `.focus-accent:focus-visible` (`:360`), `--tw-ring-color: var(--accent)` (`:327`).
  `.ui-field:focus` (`:422`) uses `box-shadow: 0 0 0 3px var(--accent-muted)`
  (`rgba(26,101,120,0.08)`) — effectively invisible.

---

## 5. Accessibility

Honest inventory — what exists is better than average, what is missing is systematic.

### 5.1 What exists

- **Lint gate exists but is demoted:** `eslint-plugin-jsx-a11y` `^6.10.2` is a devDependency and
  `eslint.config.mjs:6` imports it — but `:218-221` sets **every** `jsxA11y.flatConfigs.recommended` rule to
  `'warn'`, so a11y violations do **not** fail `npm run lint` or the build. Nothing is enforced.
- **`aria-*` attributes are heavy and widespread** — ~331 matches across `src/**/*.ts(x)` in ~90+ files.
  Notable patterns: `aria-pressed` toggle semantics (`AdminTrainingRecordsPanel.tsx:437,458`,
  `AdminIssueCenter.tsx:263,279`, `CabinetParticipantAvatarSwitcher.tsx:114`), `aria-current="page"`
  (`ApplePagination.tsx:149`, `AdminTabNav.tsx:28`, `StudentCabinetUI.tsx:88`), and the **best example in
  the codebase** — consistent `aria-invalid` + `aria-describedby` form-error pairing across ~12 fields in
  `CanonicalCoursesManager.tsx` (2342-2343, 2361-2362, 2413-2414, 2435-2436, 2447-2448, 2508-2509, 2524-2525,
  2538-2539, 2571-2572, 2646-2647, 2685-2686). `aria-hidden` is consistently applied to decorative lucide icons.
  Representative `aria-label` sites: attendance toggles (`InstructorBookingCard.tsx:149,166`,
  `InstructorCourseSection.tsx:565`), the person switcher (`CabinetParticipantAvatarSwitcher.tsx:95,112`),
  the issue inbox (`AdminIssueCenter.tsx:258,298,326,350`), the finance panel
  (`CanonicalFinancePanel.tsx:422,488,496,565`), and ~15 in `AdminLessonBookingDetail.tsx`.
- **`role=` is used properly where it appears**: `switch` (`ToggleSwitch.tsx:50`),
  `listbox`/`option` (`BookingAppleSelect.tsx:92,106`), `tablist`/`tab`/`tabpanel` (`AuthModeSliderSwitch.tsx:26`,
  `ScheduleCalendar.tsx:165,175`, `SkillRadarChart.tsx:47,55`, `CanonicalCoursesManager.tsx:2059,2064`,
  `AdminLessonBookingUi.tsx:252,260`), `alert` (~25), `status` (~15), `progressbar` (`StudentCabinetUI.tsx:329,354`),
  `menu`/`menuitem` (`Navbar.tsx:330,335`), `separator` (`InstructorCard.tsx:180`).
- **Landmarks exist**: `<main>` (`src/app/FeaturePageShell.tsx:23`), `<footer>` (same file `:46`),
  `<header>` (`src/app/components/Navbar.tsx:137`), `<nav aria-label>` (`AdminTabNav.tsx:16-17`,
  `StudentCabinetUI.tsx:119-123`). ~55 `<section>` elements exist but most have no accessible name.
- **Live region:** `aria-live="polite"` on today's session block
  (`src/features/student-cabinet/components/student/StudentTodaySessionBlocks.tsx:62`) — the only one in the app.
- **Roving tabindex implemented once, correctly:** `src/features/admin/lesson-bookings/AdminLessonBookingUi.tsx:232-267`
  — Arrow/Home/End keys, `tabIndex={active ? 0 : -1}`, `.focus()` on the tab (`:245-247`), `aria-controls` (`:263`).
- **Programmatic focus on validation failure:** `CanonicalCoursesManager.tsx:1052`
  `document.getElementById(firstIssue.targetId)?.focus()` — the only "focus the problem" pattern in the app.
- **Escape-to-close** exists in exactly three primitives: `BookingAppleSelect.tsx:54`,
  `BookingAppleWheelPicker.tsx:56`, `BookingAppleDatePicker.tsx:177`.
- **`tabIndex={-1}`** on programmatically-focusable containers: `BannerMedia.tsx:355`,
  `AdminTrainingRecordsPanel.tsx:698`, `AdminLessonBookingPanel.tsx:346`,
  `CanonicalCoursesManager.tsx:2358,2410`.
- **Busy state:** `aria-busy` on 5 elements — `AppRoutes.tsx:34`, `LazySkillRadarChart.tsx:9`,
  `ActionButton.tsx:60`, `InstructorCourseSection.tsx:459`, `CanonicalCoursesManager.tsx:2035`.
- **Scroll lock is the one thing done consistently**: `src/lib/bodyScrollLock.ts` is ref-counted, supports
  nesting, restores scroll position on last release (`:29-33`, `:40-48`); CSS at `index.css:548-552`
  (`html.modal-scroll-lock`). 22 call sites.
- **Reduced motion is partially honoured:** one CSS rule (`index.css:1004-1008`, disabling
  `.journey-marker-pulse` only) plus `motion`'s `useReducedMotion()` in 5 files
  (`AnimatedNumber.tsx:24`, `BannerMedia.tsx:126`, `HeroCarousel.tsx:97`, `InstructorCard.tsx:23`,
  `GroupCoursesSection.tsx:39`) and raw `matchMedia` in 2 (`YourJourneySection.tsx:208`,
  `SkillRadarChart.tsx:208`).

### 5.2 What is missing (design-relevant)

1. **No focus trap on any dialog.** No `focus-trap`, `react-focus-lock`, or hand-rolled trap exists
   (grep `focusTrap|focus-trap` = 0), and there is no headless dialog library — no `@headlessui/react`, no
   `@radix-ui`, no `react-aria` in `package.json`.
2. **No focus restore on close.** Grep `document.activeElement|previousFocus|returnFocus|initialFocus` → **0 matches**.
3. **No `autoFocus` anywhere** (0 matches) — screen readers land on the document body when a dialog opens.
4. **Zero of ~29 dialogs close on Escape.** The only 3 `Escape` handlers in `src/**` are the booking
   dropdown pickers.
5. **No skip-to-content link** (`skipToContent|skip-link` → 0 matches).
6. **`aria-live` is used exactly once** (`StudentTodaySessionBlocks.tsx:62`). Notably the **toast viewport has
   no `aria-live`/`role="status"`** (`PushNotificationHub.tsx:75-117`), so toasts are visible but never
   announced.
7. **`src/ui/Skeleton.tsx` has no ARIA attributes at all**, and the four route-level `*LoadingFallback`
   components (`AdminLoadingFallback`, `CabinetLoadingFallback`, `InstructorLoadingFallback`,
   `ModalLoadingFallback`) carry no `role="status"`. Loading semantics are inconsistent overall:
   `role="status"` is the de-facto convention on canonical read-model surfaces
   (`AdminIssueCenter.tsx:390,562,659`, `CanonicalCoursesManager.tsx:2043`, `CanonicalFinancePanel.tsx:446,537`,
   `AdminLessonBookingPanel.tsx:321`, `AdminTrainingRecordsPanel.tsx:421,558`,
   `AdminCourseEnrollmentPanel.tsx:210`, `GuestReservationStatus.tsx:82` and ~10 more), `aria-busy` on only
   5 elements, and plain store-list surfaces (notification badge, wallet ledger, activity logs, users list,
   chat, settings) have **neither** — they render empty until the first snapshot arrives.
8. **`aria-labelledby` missing on ~24 of ~29 dialogs**, `role="dialog"`/`aria-modal` missing on 16 of ~29.
   Five dialogs have no backdrop-click dismiss either (`ConfirmActionModal`, `LinkGuestBookingModal`, the
   `AdminPanel` confirm, `CreateProposalModal`, `RescheduleBookingModal`).
9. **Contrast: light-theme `--ink-dim` fails WCAG AA.** `rgba(17,17,17,0.5)` on `#ffffff` ≈ `#808080` ≈
   **3.95:1**, below the 4.5:1 requirement, and it is the body-secondary text token
   (`.ui-label`, `.ui-section-eyebrow`, `.btn-secondary`). The dark value (`rgba(243,243,241,0.52)` ≈ 5.2:1)
   passes, so light mode is the outlier. Accent pairs pass (`#1a6578` on white ≈ 6.6:1;
   `#5ec8e8` on `#0a0a0a` ≈ 10.3:1).
10. **Focus indicators are often removed rather than styled.** `.ui-field:focus` uses
    `box-shadow: 0 0 0 3px var(--accent-muted)` = `rgba(26,101,120,0.08)` — effectively invisible
    (`index.css:422`, fails the 3:1 non-text-contrast requirement). And
    `AdminLessonBookingUi.tsx:267` sets `focus-visible:outline-none focus-visible:ring-0` on the admin tabs,
    deleting the indicator outright.
11. **`prefers-reduced-motion` is only partly honoured**: `.animate-fade-in` (`index.css:983`),
    `.animate-pulse` (`ConfirmActionModal.tsx:31`), `animate-ping` (`JourneyProgress.tsx:184`), every
    `animate-spin` loader, and the inline `@keyframes popBadgeAnimation`/`floatPulse`
    (`LevelUpModal.tsx:22-33`) are all unguarded.
12. **Hardcoded (un-translated) accessible names** — these ship in the wrong language for EN users:
    `ApplePagination.tsx:115,173` (`"Previous page"`, `"Next page"`), `ScheduleToolbar.tsx:53,83`
    (`"Previous date"`, `"Next date"`), `TodayChecklist.tsx:141,178` (`"Remove task"`),
    `AdminLessonBookingPanel.tsx:345` (`"Booking detail"`),
    `AdminLessonBookingMasterList.tsx:81` (`"Canonical lesson bookings"`),
    `AdminLessonBookingDetail.tsx:811,918` (`"Cancellation refund"`, `"Link reason"`),
    `AdminCourseEnrollmentDetail.tsx:618` (`"Link reason"`),
    `AuthModeSliderSwitch.tsx:27` (`"Режим записи"` — **Russian only, no EN arm**).
13. **Error surface has no live region** — `src/app/components/ErrorBoundary.tsx:50-62` renders
    "Something went wrong" / "Try again" as static **hardcoded English** with no `role="alert"`.
14. **`aria-errormessage`, `aria-roledescription`, `aria-owns` are absent** (0 matches), and `aria-controls`
    appears exactly once (`AdminLessonBookingUi.tsx:263`).
15. **Two CSS bugs with visible design consequences:** `.rounded-none` is overridden to
    `border-radius: var(--radius-md)` (14px) in `@layer utilities` (`index.css:152-156`), so every component
    using `rounded-none` for sharp corners renders rounded (`ConfirmActionModal.tsx:45,54,62`,
    `BannerBackgroundModeControl.tsx:24`); and `.no-scrollbar` is used at
    `StudentTodaySessionBlocks.tsx:262` but **defined nowhere**, so that scrollbar is not hidden.

### 5.3 Dialog primitives — inventory

**There is no dialog primitive.** ~29 files render a `.ui-modal-overlay`; each is copy-pasted markup.
The breakdown that matters:

| Capability | Coverage |
|---|---|
| `role="dialog"` + `aria-modal="true"` | 13 of ~29 |
| `aria-labelledby` | 5 of ~29 |
| backdrop-click dismiss | ~21 of ~29 |
| body scroll lock | ~22 of ~29 |
| Escape-to-close | **0 of ~29** |
| focus trap / focus restore / `autoFocus` | **0 of ~29** |

Dialogs that do declare `role="dialog"` + `aria-modal`:

| Dialog | File:line |
|---|---|
| Booking modal | `src/features/bookings/components/BookingModal.tsx:61-62` |
| Booking auth shell | `src/features/bookings/components/booking_modal/BookingAuthShell.tsx:29-31` |
| Course enrollment | `src/features/courses/components/CourseEnrollmentModal.tsx:385-387` (has `aria-labelledby`) |
| Instructor picker | `src/features/student-cabinet/components/student/BookInstructorPickerModal.tsx:78-80` (has `aria-labelledby`) |
| Lesson details | `src/features/student-cabinet/components/LessonDetailsModal.tsx:90-91` |
| Lesson-feedback editor | `src/features/instructor-workspace/components/InstructorParticipantLessonFeedbackEditor.tsx:61-63` (has `aria-labelledby`) |
| Slot action | `src/features/admin/components/schedule/ScheduleSlotActionModal.tsx:609-610` |
| Admin lesson bookings | `.../lesson-bookings/AdminLessonBookingPanel.tsx:412-413`, `AdminLessonBookingDetail.tsx:1075-1076` |
| Admin course enrollments | `.../course-enrollments/AdminCourseEnrollmentPanel.tsx:427-428` |
| Admin training records | `.../training-records/AdminTrainingRecordsPanel.tsx:848-849` |
| Test-session reset | `.../testing/TestSessionResetSection.tsx:410-412` (has `aria-labelledby`) |

Dialogs **missing** `role="dialog"` entirely include: `CourseDetailsModal.tsx:88`,
`ConfirmActionModal.tsx:27`, `LevelUpModal.tsx:18`, `ReviewModal.tsx:36`,
`StudentSkillEvaluationModal.tsx:146`, `InstructorReviewsModal.tsx:54`, `AuthModal.tsx:26`,
`ChatWindow.tsx:17`, `PaymentGateway.tsx:114`, `LinkGuestBookingModal.tsx:79`,
`PushNotificationHub.tsx:224`, `CreateProposalModal.tsx:181` and `RescheduleBookingModal.tsx:83`
(the last two also bypass `.ui-modal-overlay`/`.ui-modal` entirely with raw `bg-black/40`).

Supporting infrastructure:

- `src/features/shell/ModalHost.tsx` + `src/features/shell/modalRegistry.ts` — a **global modal registry**
  with `ModalType = 'booking' | 'courseEnrollment' | 'courseDetails' | 'instructorReviews' | 'notifications' | 'auth'`
  (`modalRegistry.ts:3-5`). It orchestrates 6 modal kinds but provides no Dialog primitive.
- `src/ui/BodyScrollLock.tsx` + `src/lib/bodyScrollLock.ts` + `src/lib/useBodyScrollLock.ts` — scroll lock.
- `src/features/student-cabinet/components/student/StudentCabinetShell.tsx:387` resolves click-outside via
  `closest('.ui-modal-overlay, [role="dialog"], [data-modal-open]')` — dialogs are identified at runtime by CSS
  class and role attribute.
- Only two dialogs animate (`LessonDetailsModal.tsx:3`, `BookInstructorPickerModal.tsx:3` import
  `AnimatePresence, motion` from `framer-motion`); the rest are instant.

**Redesign implication:** one dialog primitive with focus trap + Escape + focus restore + labelled `aria-modal`
would replace 13 hand-rolled implementations and close the largest accessibility gap at once.

---

## 6. Shared UI component inventory

`src/ui/` — 12 components, all generic (no domain imports):

| File | Exports | Role |
|---|---|---|
| `ActionButton.tsx` | `ActionButtonProps`, `ActionButton` | Button primitive; `btn-primary` / `btn-primary-hero` variants that "skip chrome automatically" |
| `Skeleton.tsx` | `Skeleton`, `CardSkeleton`, `ListSkeleton`, `TableSkeleton`, `FormSkeleton`, `ModalSkeleton`, `AppInitSkeleton` | The whole loading-placeholder system; `AppInitSkeleton` is what `RouteGate` renders while auth/profile resolve |
| `StatusBadge.tsx` | `BadgeVariant = 'success' \| 'warning' \| 'danger' \| 'info' \| 'accent' \| 'neutral'`, `StatusBadgeProps`, `StatusBadge` | The status-chip primitive; language-aware (`useLanguage()` at line 111) |
| `StateCard.tsx` | `StateCardProps`, `StateCard` | Generic empty/error/placeholder card |
| `LazyLoad.tsx` | `LazyLoadProps`, `LazyLoad` | `<ErrorBoundary><Suspense fallback>…</Suspense></ErrorBoundary>` — the standard per-screen async wrapper |
| `ApplePagination.tsx` | `ApplePaginationProps`, `ApplePagination` | iOS-style pagination control |
| `AnimatedNumber.tsx` | `AnimatedNumber` | Count-up numeric display |
| `ToggleSwitch.tsx` | `ToggleSwitchProps`, `ToggleSwitch` | Switch primitive |
| `BannerMedia.tsx` | `BannerMediaProps`, `BannerVideoRole = 'ACTIVE' \| 'NEXT_PRELOAD' \| 'OUTGOING'`, `BANNER_VIDEO_STARTUP_WATCHDOG_MS = 8000`, `BannerMedia` | Hero banner image/video renderer with a video-preload role machine and an 8 s startup watchdog |
| `BannerBackgroundModeControl.tsx` | `BannerBackgroundModeControlProps`, `BannerBackgroundModeControl` | Admin control for the banner's background mode |
| `GuestReservationLimitAlert.tsx` | `GuestReservationLimitAlert` | `role="alert"` rose-tinted notice — **domain-specific** (guest reservations) despite living in `src/ui/` |

Notes: `StatusBadge` is a **hybrid** — it imports `BookingStatus` from `../types` and
`getBookingStatusLabel` from `lib/i18n/bookingLabels`, mixing generic badge chrome with booking domain
vocabulary. `ActionButton` sets `aria-busy={isPending || undefined}` and auto-disables while pending.
**`ListSkeleton` (`Skeleton.tsx:70`) is dead code** — exported but imported nowhere.

`src/app/components/` — 5 files, shell-level: `Navbar.tsx` (481 lines: header, desktop links `hidden lg:flex`
`:153`, mobile controls `lg:hidden` `:297`, mobile drawer `:358`, workspace `role="menu"` `:330-335`,
notification bell, theme/language toggles, sign-in/out), `HeroCarousel.tsx` (slide autoplay, touch swipe,
mobile-only dots `md:hidden` `:448`), `ResortConditionsSidebar.tsx` (mobile stacked `lg:hidden` `:48` vs
desktop rail `hidden lg:flex` `:84`), `Logo.tsx` (eager active-theme webp + lazy inactive pair for LCP),
`ErrorBoundary.tsx`. Plus `src/app/FeaturePageShell.tsx` (app frame: `<main>` + `<footer>` + db-status banner).

**Feature-local component families** (by convention, per `AGENTS.md` §7): `src/features/<feature>/components/…`
with narrow contracts such as `instructorCourseContracts.ts`, `changeRequestViewModel.ts`,
`proposalViewModel.ts`. Feature stores/hooks/selectors live beside the components
(e.g. `features/lesson-bookings/lessonBookingViewModel.ts`,
`features/booking-collaboration/useBookingCollaborationCommands.ts`).

One feature acts as a **de-facto second UI kit**:
`src/features/student-cabinet/components/student/StudentCabinetUI.tsx` (398 lines) exports
`STUDENT_BOTTOM_TABS`, `STUDENT_TAB_BAR_HEIGHT`/`FOOTER_PADDING`, `studentCabinetFooterHeight`,
`StudentPanelBackLink`, `ScDivider`, `ScPageTitle`, `ScPageHeader`, `ScPageIntro`,
`ScEditorialHubList`, tint maps and `role="progressbar"` rings — largely generic primitives that arguably
belong in `src/ui/` but are cabinet-scoped.

Note there is **no shared toast component in `src/ui/`** — toasts live in
`src/features/notifications/PushNotificationHub.tsx` (§7.4), so notifications are a *feature*, not a primitive.

---

## 7. Realtime / loading / error / toast infrastructure

### 7.1 Realtime — Firestore-native, bounded, almost no polling

**No react-query, no SWR.** All data freshness is Firestore `onSnapshot` + callable read models.

Every one of the **19 `onSnapshot` call sites** in `src/` (36 grep hits; the rest are the re-export barrel at
`src/infrastructure/firebase/firebase.ts:19,356`):

| Area | Listener | Bounded? |
|---|---|---|
| `error_logs` | `src/features/admin/adminService.ts:22` — `orderBy timestamp desc` | yes, `limit(pageSize+1)`, `QUERY_LIMITS.errorLogs = 100` |
| admin revision signal | `src/lib/admin/subscribeAdminRealtimeRevision.ts:41` — one doc | n/a (doc listener) |
| canonical wallet | `src/features/wallet/sync/useWalletSync.ts:47` — doc `users/{uid}/wallet/state` | n/a (doc) |
| legacy wallet ledger | `useWalletSync.ts:110` — `where userId == uid` | yes, 100 |
| chat | `src/features/chat/chatService.ts:27` — `bookings/{threadId}/messages`, newest-first | yes, `QUERY_LIMITS.chatMessages = 100` |
| notifications | `src/features/notifications/sync/useNotificationsSync.ts:60` | yes, 50 |
| instructor catalogue | `useBookingsSync.ts:69` (doc), `:105` (collection) | collection capped at 100 |
| courses | `src/features/courses/sync/useCoursesSync.ts:89` + catalog content `:102` | yes, 200 each |
| resort config | `src/features/settings/resortService.ts:49` — doc | n/a (doc) |
| profile | `useCurrentUserProfileSync.ts:19` (doc `users/{uid}`), `useProfileActivitySync.ts:40` (activity logs) | activity logs capped at 100 |
| users list | `src/features/profile/sync/useUsersSync.ts:35` | yes, 100 — **admin-only + admin-route-only** |
| settings | `src/features/settings/sync/useSettingsSync.ts:25,40,52,64,80` — 5 docs under `settings/` | n/a (docs); #16–19 deferred via `requestIdleCallback` |

**Every collection-level listener is `limit()`-bounded; no unbounded full-collection listener exists.**
All limits are centralised in `src/shared/queryLimits.ts:5-19` (`as const`):
`bookingsHistory:20, notifications:50, activityLogs:100, reviews:200, users:100, courses:200,
instructors:100, walletLedger:100, errorLogs:100, chatMessages:100, recentDaysForAutoComplete:7,
recentDaysForRealtimeBookings:7`.

**Polling is essentially absent.** The only `setInterval` calls are UI clocks:
`HeroCarousel.tsx:195` (slide rotation), `useCabinetSessionNow.ts:14` (1 s clock),
`StudentTodaySessionBlocks.tsx:49`, and `TestSessionResetSection.tsx:87` (30 s reset countdown). There are zero
`refetchInterval` / `refetchOnWindowFocus` references.

**Admin reads use an invalidation-counter pattern, not row listeners.** A single-doc listener on
`admin_runtime/admin_planner` (`src/features/admin/operations/subscribeAdminPlannerRevision.ts:11`) fires
listeners registered in `adminPlannerRevisionCoordinator.ts:36`, which re-issue the callable
`queryAdminPlannerReadModels(...)` (`useAdminPlannerReadModels.ts:28,59-64`). The same pattern repeats for
`admin_people`, `admin_finance`, `admin_courses`, `admin_issue_inbox`, `admin_lesson_bookings`, and
booking-change-requests, all on the `admin_runtime` collection. Coordinators also accept a revision returned
directly by a command so the same actor doesn't wait for a listener round-trip.

**Listener resilience:** an `onSnapshot` error callback is terminal for that listener, so
`subscribeAdminRealtimeRevision.ts:49-77` re-creates it with exponential backoff 1 s → 30 s, retrying only
Firestore retryable codes (`cancelled, unknown, deadline-exceeded, resource-exhausted, internal, unavailable,
unauthenticated`).

**Sync is route-scoped** (`src/store/useDataSyncScope.ts:4-19`): `shouldSyncUsersList` only on `/admin`;
activity logs on `/admin|/instructor|/cabinet*`; reviews on `/cabinet*|/instructor`. Cabinet data goes through
callable read models with a freshness TTL — `ACCOUNT_LESSON_BOOKING_FRESH_MS = 30_000`
(`src/features/lesson-bookings/syncAccountLessonBookings.ts:21`) refreshed on `visibilitychange`
(`useLessonBookingReadSync.ts:133-142`), with the file header explicitly stating
*"No 30s polling. Mutations invalidate via deliberate refetch."*

**Chat is the notable fan-out:** `src/features/student-cabinet/useBookingChatUnread.ts:106-122` opens **one
listener per thread across all non-cancelled bookings**.

### 7.2 Loading

No shared `useAsync`; loading is declared at four levels.

- **Route level:** one `<React.Suspense fallback={<RouteLoadingFallback />}>` wrapping all routes
  (`AppRoutes.tsx:38`); fallback is `<div className="min-h-[16rem]" aria-busy="true" />` (`:34`).
- **Panel level:** `src/ui/LazyLoad.tsx` = `<ErrorBoundary><Suspense fallback>…</Suspense></ErrorBoundary>`,
  used by all three protected route containers (`AdminRouteContainer.tsx:46`,
  `CabinetRouteContainer.tsx:266`, `InstructorRouteContainer.tsx:50`) and 4 modals in
  `src/features/shell/ModalHost.tsx:111,123,136,156`.
- **Section level:** `AdminPanel.tsx` wraps **20 admin sections** in individual
  `<Suspense fallback={<SectionLoadingFallback label={t('…')} />}>` (lines 190–448).
- **Local fallbacks** all take a `label: string`: `AdminLoadingFallback` (`AdminRouteContainer.tsx:13`),
  `CabinetLoadingFallback` (`:44`), `InstructorLoadingFallback` (`:20`),
  `ModalLoadingFallback` (`ModalHost.tsx:45`), `SectionLoadingFallback` (`AdminPanel.tsx:119`).
- **Skeleton system:** `src/ui/Skeleton.tsx` exports `Skeleton`, `CardSkeleton`, `ListSkeleton`,
  `TableSkeleton`, `FormSkeleton`, `ModalSkeleton`, `AppInitSkeleton` (the last is what `RouteGate` shows).
- **Store booleans** are declared per feature store, not centrally: `authStore.authLoading`,
  `profileStore.profileLoading`, `courseEnrollmentStore.{hotLoading, historyLoading, catalogLoading}`,
  `instructorCourseStore.{discoveryLoading, rosterLoading}`, `bookingCollaborationStore.loading`,
  `bookingsStore.{bookingHistoryLoading, instructorReviewPageLoading}`.
- **Idiom — disable, don't swap:** buttons are disabled rather than replaced —
  `disabled={isLoadingBookings || occupancyLoadFailed || availableSlots.length === 0}`
  (`BookingSelectors.tsx:117`, `RescheduleBookingModal.tsx:108`, `CreateProposalModal.tsx:249`).
- Inline spinners use lucide-react `Loader2`: `<Loader2 className="h-4 w-4 animate-spin" />`
  (`AdminTrainingRecordsPanel.tsx:561`), paired with a dictionary key (`t('adminLessonLoading')`).
- Loading copy is fully in the dictionary (e.g. `translations.ts:758,760,944,1033,1154,1421,2283` + RU twins).

### 7.3 Error

Errors **are logged to Firestore**, collection `error_logs`, by
`src/infrastructure/firebase/firebase.ts`.

- `logErrorToFirestore(message, stack?, source, operation?, path?)` — `firebase.ts:176-205`. Document:
  `id` (`err_${crypto.randomUUID()}_${Date.now()}`), `message` (≤5 000 chars), `stack` (≤20 000 chars),
  `timestamp` (ISO string), `userId`, `userEmail`, `url`, `userAgent`, `source`, `operation`, `path`.
- **Backpressure:** `ERROR_LOG_SESSION_LIMIT = 50`, `ERROR_LOG_BATCH_SIZE = 10`, localStorage buffer key
  `ski-academy:error-log-buffer:v1`, throttled flush (`ERROR_LOG_THROTTLE_MS = 5_000`), offline deferral with
  an `online` listener, `writeBatch` commits of 10, re-queue on failure.
- **Anonymous users are dropped** (`firebase.ts:183-185`) — "Firestore rules intentionally reject anonymous
  error logs", so guest-side errors go nowhere.
- **Recursion guard:** `handleFirestoreError` skips logging when the failing path itself contains
  `error_logs` (`firebase.ts:245`).
- Error `source` union includes `'custom' | 'firestore' | 'global_error' | 'unhandled_rejection' |
  'error_boundary' | 'cloud_function'`.
- **Auto-registered global handlers** (`firebase.ts:208-239`): `window.error` and `unhandledrejection`, both
  filtering benign `ResizeObserver` / `websocket` / `HMR` noise.
- **Admin UI:** `src/features/admin/components/settings/ErrorLogsPanel.tsx`, fed by `subscribeErrorLogs` /
  `deleteErrorLog(s)` (`src/features/admin/adminService.ts:17,36,45`).
- **Global UI surfacing:** `registerFirestoreErrorListener` (`firebase.ts:172`), consumed once in
  `src/app/AppBootstrap.tsx:40-47`, raising a persistent dismissible page banner with `t('dbRestricted')` +
  operation + path, rendered by `FeaturePageShell` (`AppShell.tsx:122-123`, `uiStore.dbStatusWarning`).
  With no listener registered it degrades to `logger.warn` only.
- **Error boundary:** `src/app/components/ErrorBoundary.tsx` — the app's only boundary (no
  `react-error-boundary` dependency). Chunk-load errors get special recovery
  (`isChunkLoadError` → `reloadForStaleChunk()`, returning *before* logging). Default fallback is a
  hardcoded-English red panel with the raw `error.message` and a "Try again" reset button; **no `role="alert"`**.
- **Coverage gap:** the boundary is mounted by `LazyLoad` only, so `/`, the Navbar, `ModalHost`, and
  `AppBootstrap` are **not** inside any boundary — `src/main.tsx:11-17` and `src/App.tsx:12-23` render
  `<StrictMode><BrowserRouter><App/></BrowserRouter></StrictMode>` with no boundary above the routes.
  Worse: `src/features/admin/components/AdminPanel.tsx` lazy-loads 15 admin sections behind **17 bare
  `<Suspense>` blocks** (lines 190, 194, 219, 231, 252, 288, 292, 304, 329, 346, 364, 380, 400, 421, 429,
  444, 448) with **no `ErrorBoundary`** — a throw inside any admin section escapes past
  `AdminRouteContainer`'s `LazyLoad` boundary to the root and blanks the app. Chunk-load recovery is
  registered separately at `src/main.tsx:9` (`registerChunkLoadRecovery()`, listening to Vite's
  `vite:preloadError`; implementation `src/lib/chunkLoadRecovery.ts:4,19`).
- Auth error-code → i18n mapping: `src/features/auth/components/Auth.tsx:153-189`
  (`auth/email-already-in-use`, `auth/weak-password`, `auth/invalid-credential|wrong-password|user-not-found`,
  `auth/operation-not-allowed`, `auth/network-request-failed`) plus Google codes at `:249-264`.

### 7.3.1 Canonical-command error mapping (the one well-built mapper)

`src/lib/canonical/mapCanonicalCommandError.ts`:

- `class CanonicalCommandClientError extends Error` (`:17`) carrying `code: CommandErrorCode`,
  `correlationId`, `currentRevision`, `details`, `retryable`, `cause` (`:18-34`).
- `mapCanonicalErrorMessage(code)` (`:37-74`) — English fallbacks for the whole code union:
  `unauthorized, forbidden, validation, stale_version, idempotency_conflict, concurrent_modification,
  invalid_transition, resource_conflict, participant_conflict, instructor_conflict, insufficient_funds,
  payment_required, expired, unavailable, guest_reservation_limit, duplicate_active_enrollment, internal`.
- `mapFunctionsCodeToCanonical` (`:125-155`) — `functions/unauthenticated→unauthorized`,
  `permission-denied→forbidden`, `invalid-argument→validation`, `already-exists→idempotency_conflict`,
  `aborted→concurrent_modification`, `not-found→unavailable`, default `internal`; the server's structured
  `details.code` wins first (`:129-135`).
- Retry policy: `retryable: code === 'internal' || code === 'concurrent_modification'` (`:189`).

Translated presentation: `src/features/lesson-bookings/presentCanonicalCommandError.ts` —
`presentCanonicalCommandErrorWithContext(error, {t})` (`:41-67`) maps codes to dictionary keys
(`insufficient_funds→insufficientFunds`, `payment_required→bookingBalanceTooLow`,
`participant_conflict|instructor_conflict|resource_conflict→slotUnavailable`,
`blocked_relationship→instructorNotAccepting`, `guest_reservation_limit→guestReservationLimit`, …) and
computes `shouldRefresh` for
`stale_version | concurrent_modification | idempotency_conflict | *_conflict` (`:24-30`).
**That flag drives the retry UX**: `CabinetRouteContainer.tsx:164-173` refetches and toasts `'warning'` on
`shouldRefresh`, otherwise toasts `'error'` (same pattern at `:204-214`, `:237-246`).

Callable transport policy: `src/lib/functions/functionsClient.ts` — retryable codes are
`functions/unavailable, functions/deadline-exceeded, functions/internal, functions/unknown, 'unknown'`
(`:45-53`); `shouldLogFailure` (`:73-82`) **suppresses** `aborted, already-exists, failed-precondition,
invalid-argument, not-found, permission-denied, unauthenticated` as expected business outcomes.
`callFunction(name, input, {idempotencyKey, maxAttempts = 2})` retries only retryable codes, then logs +
rethrows (`:104-116`); default `logFailure` (`:87`) = `logCallableFailure`.

Per-feature read-error classifiers (uniform pattern, 7 sites) reduce permission failures to
`'permission-denied'` and everything else to `'read-failed'` (`useAdminFinanceReadModels.ts:19`,
`useAdminLessonBookingReadModels.ts:30`, `useAdminIssueReadModels.ts:48`,
`useAdminIdentityReadModels.ts:31`, `useAdminPlannerReadModels.ts:40`,
`useAdminCourseEnrollmentReadModels.ts:26`, `presentInstructorCourseReadError.ts:4`).

**Known error-log gaps:** the `code` is **not persisted** to `error_logs` (`firebase.ts:189-201`), so admins
cannot triage by code; and the `ErrorLogsPanel` source filter (`:129-132`) offers only
`firestore | global_error | unhandled_rejection | custom` — **omitting the `error_boundary` and
`cloud_function` sources that are actually written.** Its "Load more" also raises `pageSize` by 100 and
re-subscribes (`:102`), a growing-window read.

### 7.4 Toast & notifications

**No toast library** (no react-hot-toast / sonner / react-toastify anywhere). Fully hand-rolled in
`src/features/notifications/PushNotificationHub.tsx`.

- API: `useNotifications()` (`:29`), `NotificationProvider` (`:37`), `addNotification(type, title, message)`
  (`:40`), `removeNotification(id)` (`:61`), `clearAll()` (`:65`). Mounted at `src/App.tsx:16`.
- Severity union: **`'success' | 'warning' | 'info' | 'error'`** (`:14`).
- Limits: max **10** stored (`:51`), max **4** visible (`:76`), auto-dismiss **6 000 ms** (`:53-56`).
  Viewport: `fixed bottom-4 sm:bottom-6 z-50 flex flex-col gap-3 max-w-sm` (`:75-117`).
- Icons/colours: success `#10b981`/CheckCircle, warning `#f59e0b`/AlertTriangle, error `#ef4444`/ShieldAlert,
  info `#3b82f6`/Info (`:82-96`).
- Non-React bridge: `notify(type, title, message)` in `src/store/storeContext.ts:23-25`, wired in
  `AppBootstrap.tsx:24-31`.

**Three disagreeing notification type unions**, bridged by an untyped `string`
(`useNotificationsSync.ts:82`, then cast in `AppBootstrap`):

| Union | Values | File |
|---|---|---|
| toast severity | `success \| warning \| info \| error` | `PushNotificationHub.tsx:14` |
| domain write-side `NotificationType` | `info \| warning \| success` (**no `error`**) | `src/domain/notifications/notifications.ts:6` |
| stored document `type?` | `success \| error \| info \| warning` | `src/domain/notifications/notificationText.ts:23` |

**Document model** (`src/domain/notifications/notificationText.ts:3-25`) — bilingual EN/RU server text:
`DbNotification { id, userId, timestamp (ISO string), type?, isRead?, title?, message?, titleEn?, titleRu?,
messageEn?, messageRu? }`. `resolveNotificationText` picks `…Ru ?? …En` for RU and `…En ?? …Ru` for EN
(`:43-58`); `buildNotification` writes both languages at creation (`:31-41`). **More evidence that the
product is strictly two-language.**

- Collection: **`notifications`** only. Query: `where('userId','==',uid), orderBy timestamp desc,
  limit(pageSize+1)` (`useNotificationsSync.ts:53-58`).
- Status: **only `isRead?: boolean`** — no `archived` / `dismissed` / `delivered`. Delete is a hard
  `deleteDoc` (`notificationService.ts:7`), not an archive.
- Retention: `settings/notification_retention` doc, field `days`; store key `notificationRetentionDays`;
  `DEFAULT_NOTIFICATION_RETENTION_DAYS = 14`, `MIN = 1`, `MAX = 365`
  (`src/domain/notifications/notificationConfig.ts:1-5`); `purgeExpiredNotificationsForUser` batches at 200
  (`notificationCleanup.ts:48-84`).
- Freshness toast window: a new notification toasts only if younger than **15 000 ms**
  (`useNotificationsSync.ts:76-84`).
- Badge chain: `useUnreadNotificationCount()` (`notificationsSelectors.ts:31-32`) **+**
  `unreviewedCompletedCount` (`AppShell.tsx:75-87`) → `notificationBadgeCount` (`:89`) → Navbar (`:111`);
  `Navbar.tsx:52-53` caps the label at `9+`.
- Mark-as-read fires when the notification centre is **opened** (`AppShell.tsx:91-94`).

**Push / FCM is not implemented at all.** Repo-wide greps for `getMessaging`, `onMessage`,
`firebase-messaging`, `vapidKey`, `admin.messaging`, `sendEachForMulticast` return **0 matches**. There is no
`public/` directory and no service worker; `vite.config.ts` has no PWA plugin. The only trace is
`messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID` in the Firebase config
(`firebase.ts:55`) — configured but unconsumed. Despite its name, `PushNotificationHub.tsx` is
**in-app toasts + in-app notification centre only**.

**Known dead/fragile code:** `src/features/notifications/service.tsx` (372 lines) is an unimported
byte-level duplicate of `PushNotificationHub.tsx`; and `tests/unit/notificationUnreadBadge.test.ts:25-26`
asserts against strings that exist only in a doc comment.

---

## 8. Staging fixture seeding scripts (`functions/src/staging/`)

11 source modules + 11 tests. Two project guards, a pure declarative fixture-definition module, a
seed/reset CLI, an owner-bootstrap module + CLI, and a 5-module config-promotion pipeline
(contract → plan → export → executor → CLI).

### 8.1 Modules

| Module | Lines | Purpose |
|---|---|---|
| `stagingProjectGuard.ts` | 96 | Single hard gate for any staging write. `STAGING_FIREBASE_PROJECT_ID = 'ski-school-staging'`; `assertStagingMutationEnvironment()` cross-checks CLI project, Admin SDK app project, `FIREBASE_CONFIG.projectId`, `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT` and refuses on any disagreement or on emulator routing |
| `stagingOwnerBootstrap.ts` | 119 | `grantStagingOwner()` promotes an existing **Google-linked** Firebase Auth user to `role:'admin'` + `systemRole:'owner'` in a transaction on `users/{uid}` |
| `stagingOwnerCli.ts` | 51 | CLI for the above; requires `STAGING_OWNER_EMAIL` |
| `stagingFixturesCli.ts` | 539 | CLI + implementation for `seed` / `reset`; executes canonical command envelopes with `scope: { dataScope: 'live' }` |
| `stagingFixtureDefinitions.ts` | 517 | Pure declarative definition of fixture **v1 (legacy)** and **v2 (current)** |
| `configPromotionContract.ts` | 436 | Zod contract + hashing (`PROMOTION_MANIFEST_VERSION = 2`, 5 source-document kinds, media allowlist, forbidden-field scrub) |
| `configPromotionPlan.ts` | 232 | `planConfigPromotion(manifest, target)` → `CREATE \| UPDATE \| UNCHANGED \| CONFLICT \| SKIP` operations |
| `configPromotionExport.ts` | 500 | `exportStagingConfigManifest()` — reads the 5 allowlisted global config singletons, **counts** (never reads) every excluded collection |
| `configPromotionProjectGuard.ts` | 66 | Two-sided guard: source must be `ski-school-staging`, target must be `ski-school-8f3ca` |
| `configPromotionExecutor.ts` | 22 | `executePromotionPlan(plan, mode, mutate)` — returns 0 immediately in `dry-run` |
| `configPromotionCli.ts` | 533 | CLI `export \| promote` |

### 8.2 Fixtures — two generations

Identity constants (`stagingFixtureDefinitions.ts`):

```ts
STAGING_FIXTURE_ID   = 'carve_academy_staging_v2'   STAGING_FIXTURE_VERSION   = 2
LEGACY_STAGING_FIXTURE_ID = 'carve_academy_staging_v1'  LEGACY_STAGING_FIXTURE_VERSION = 1
STAGING_FIXTURE_MANIFEST_PATH = 'staging_fixture_manifests/carve_academy_staging_v2'
```

**v2 (current) — deliberately narrow, "only synthetic client smoke data":**

| uid | email | displayName | password env |
|---|---|---|---|
| `staging-admin` | `staging-admin@carveacademy.local` | `Staging Admin (internal fixture actor)` | `STAGING_ADMIN_PASSWORD` |
| `staging-parent` | `staging-parent@carveacademy.local` | `Staging Parent` | `STAGING_PARENT_PASSWORD` |

Exactly **4 canonical command envelopes**: `provision_self_participant` (for `staging-parent`,
`exercisedCapability:'account_owner'`), 2× `create_managed_dependent_participant` (`administrator`),
and `record_manual_wallet_funding` of **1,000,000 KZT** (`KztMinorUnitsSchema.parse(1_000_000)`).

Two managed dependents:

| participantId | displayName | birthDate | skill | discipline |
|---|---|---|---|---|
| `staging-participant-alex` | `Alex Staging` | 2014-02-10 | `beginner` | `ski` |
| `staging-participant-mia` | `Mia Staging` | 2016-07-18 | `beginner` | `snowboard` |

Result: **21 owned Firestore paths**, 1 monetary event (`eventKind:'wallet_credit'`,
`walletBalanceDelta: 1_000_000`), wallet doc `users/staging-parent/wallet/state` with
`balance: 1_000_000, eventRevision: 1`. **No instructor, course, course day, catalog content, booking,
enrollment, resource claim, or Storage object** (`courseManifests: []`, `storagePrefixes: []`).
`staging-admin` gets `role:'admin'` with **no `systemRole`** and **no self Participant**.

**v1 (legacy, reset-only) — broader:**

- Third account `staging-instructor` (`role:'user'`, password `STAGING_INSTRUCTOR_PASSWORD`).
- Instructor catalog entry `staging-instructor-catalog` — `name:'Staging Instructor'`, `specialty:'both'`,
  `languages:['ru','en']`, `experienceYears: 8`, **`pricePerHourKZT: 25_000`**.
- Course `staging-course-ski-foundations` — `price: 120_000 KZT`, `totalSeats: 8`,
  `capacityPolicy:{kind:'seed_full'}`, `timeZone:'Asia/Almaty'`, 3 days at `09:00` × 120 min,
  `level:'beginner'`, `order: 10`, badge `STAGING`.
- Course `staging-course-snowboard-progress` — `price: 150_000 KZT`, `totalSeats: 6`, 3 days at `14:00`
  × 120 min, `level:'intermediate'`, `order: 20`.
- Dates are anchored to a **required `scheduleAnchorDate`** on the v1 manifest (tests/export use
  `'2026-10-12'`); passing one for v2 throws `Invalid current staging fixture manifest schedule anchor`.
- Result: **55 owned Firestore paths**, **6 resource-claim ownership entries** (each with expanded UTC
  guard buckets).

**Neither generation seeds bookings, payments, attendance, enrollments, guest contacts, or
notifications. There is no guest fixture at all.**

### 8.3 Roles exercised

`account_owner` (via `client_callable`) and `administrator` (via `admin_callable`) only. The real staging
owner is **not a fixture**: `staging:grant-owner` grants `role:'admin'` + `systemRole:'owner'` to a
pre-existing `google.com`-linked Auth user. `guest_contacts` is on the promotion exclusion list.

### 8.4 Guards (exact deny strings)

`stagingProjectGuard.ts` — every message is prefixed **`STAGING ONLY:`**: refusing missing / conflicting /
non-staging project ids, malformed `FIREBASE_CONFIG`, and any of `FIRESTORE_EMULATOR_HOST`,
`FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`.

`stagingOwnerBootstrap.ts` — also all `STAGING ONLY:`: missing/invalid `STAGING_OWNER_EMAIL`,
`auth/user-not-found`, email mismatch, **user not linked to Google**, uid not a canonical Account ID,
Account missing/invalid/inactive/test-scoped, conflicting `uid` field, invalid `role`, unexpected
`systemRole`.

`configPromotionProjectGuard.ts` / `configPromotionCli.ts` — all prefixed **`PROMOTION:`**: wrong source/
target project, conflicting ids, malformed `FIREBASE_CONFIG`, emulator routing, wrong Storage bucket name,
missing `CONFIG_PROMOTION_ADMIN_ACCOUNT_ID`, non-active/non-admin operator, staleness detected after export
or planning, `CONFLICT` operations present under `--apply`.

Fixture-manifest guards (`stagingFixturesCli.ts` / `configPromotionExport.ts`): multiple manifests,
`v1 fixtures are still owned; run staging:reset before v2 seed`, manifest stored at an unexpected path,
ownership not matching the definition version, existing Auth uid/email not owned by the fixture, and
fixture documents existing without manifest ownership.

### 8.5 Config promotion

**Exactly 5 promotable global config singletons** (`configPromotionExport.PROMOTION_CONFIG_DOCUMENT_PATHS`):

| kind | sourcePath | payload |
|---|---|---|
| `lesson_pricing_settings` | `lesson_pricing_settings/lesson_booking` | `additionalParticipantSurchargePerHourKzt`, `maxParticipantsPerLesson` |
| `skill_config` | `settings/skill_config` | `passPercentage` (0–100), `items[]` (1..512) with `levelTarget` 1–4, `section`/`sectionEn`, `maxPoints`, `controlPoints`, `speedPoints`, `techniquePoints`, `radarDimension?` |
| `achievements_config` | `settings/achievements_config` | `items[]` (≤512) `labelRu`/`labelEn`, `icon`, `order`, `rule.type` ∈ `lessons_completed, hours_completed, streak_weeks, exercises_mastered, level_up, feedback_given, homework_done, course_graduate, skill_items_max` |
| `instructor_filters` | `settings/instructor_filters` | `enabled: boolean` only |
| `resort_slides` | `resort_data/config` | `slides[]` with `line1En/Ru`, `line2En/Ru`, `line3En/Ru`, `backgroundImage`, `backgroundMediaMode` `image\|video`, `mobileFocalPointX` 0–100, `hidden?`; `slideIntervalSeconds` 1–600, `slidesRandomOrder` |

**Manifest** (`.strict()`): `{ schemaVersion: 2, sourceProjectId:'ski-school-staging', exportedAt,
sourceDocuments[{kind, logicalKey, sourcePath, sourceId, selected, sourceHash, payload, issues?}],
media[{mediaKey, ownerKind, ownerLogicalKey, fieldPath, sourceBucket, sourceObjectPath, sha256, contentType}],
excludedSummary{collectionCounts, reasonCounts, fixtureOwnedDocumentCount, excludedPaths} }`.

Contract invariants: `stableHash(payload) === sourceHash`; deep scrub of keys matching
`/^(?:password|token|linkedAccountId|rating|reviewsCount|revision|audit|testSessionId|dataScope)$/i` and any
string containing `?token=`/`&token=`; media must be owned by `resort_slides`, `fieldPath` must match
`/^slides\.\d+\.backgroundImage$/`, path `/^banners\/…\.(png|jpe?g|webp)$/i`, content type in
`{image/jpeg, image/png, image/webp}`; `PROMOTION_MEDIA_MAX_BYTES = 8 MiB`.

**Never promoted:** `PROMOTION_EXCLUDED_COLLECTIONS` (34 entries incl. `users`, `participants`,
`bookings`, `guest_contacts`, `payments`, `monetary_events`, `attendance`, `course_enrollments`,
`notifications`, `admin_issues`, `resource_claims`, `admin_runtime`, …), plus
`PROMOTION_EXCLUDED_DOCUMENT_PATHS = ['resort_data/cache']` and
`PROMOTION_IGNORED_BUSINESS_COLLECTIONS = ['instructors', 'courses', 'course_catalog_content']` — the last
group is never even read or counted.

Apply writes lesson pricing through the canonical `update_lesson_pricing_settings` command with
`expectedRevision`; all other kinds use `transaction.set(ref, safePayload, {merge:true})` under a hash
recheck. **There is no delete path and no rollback.** Success line:
`PROMOTION: apply completed. No delete, Auth, identity, Course, transactional, TEST, or deployment operation was issued.`

### 8.6 Invocation — all six scripts are in the **root** `package.json` (lines 37–41)

```json
"staging:seed":          "npm run build:functions && node functions/lib/staging/stagingFixturesCli.js seed --project ski-school-staging"
"staging:reset":         "npm run build:functions && node functions/lib/staging/stagingFixturesCli.js reset --project ski-school-staging"
"staging:grant-owner":   "npm run build:functions && node functions/lib/staging/stagingOwnerCli.js --project ski-school-staging"
"staging:export-config": "npm run build:functions && node functions/lib/staging/configPromotionCli.js export --project ski-school-staging"
"prod:promote-config":   "npm run build:functions && node functions/lib/staging/configPromotionCli.js promote --project ski-school-8f3ca"
```

`functions/package.json` has **no** staging scripts. Extra promotion flags pass through npm's `--`
separator (`npm run prod:promote-config -- --manifest .staging-export/config-manifest.json --dry-run`);
`--dry-run` and `--apply` are mutually exclusive and one is **mandatory** for `promote`.

### 8.7 Project ids and environment

- Production **`ski-school-8f3ca`** (`configPromotionContract.ts:11` `PRODUCTION_PROJECT_ID`).
- Staging **`ski-school-staging`** — duplicated across **four independent literals**:
  `stagingProjectGuard.ts:1`, `configPromotionContract.ts:10`, `functions/src/deploymentProvenance.ts:2`,
  `src/infrastructure/firebase/firebaseEnvironmentGuard.ts:1` (which also pins
  `STAGING_HOSTS = {'ski-school-staging.web.app', 'ski-school-staging.firebaseapp.com'}`). They agree today;
  there is no single shared constant.
- `.firebaserc` aliases: `default`/`prod` → `ski-school-8f3ca`, `staging` → `ski-school-staging`.
  Deploy scripts use aliases (`deploy:rules:prod` → `firebase deploy --project prod`); the staging guard
  deliberately ignores the CLI alias.
- `.env.example` hard-codes neither id — it names both in comments only. The frontend id comes from
  `VITE_FIREBASE_PROJECT_ID` in the uncommitted `.env.staging`.
- Env vars that gate the staging work (none in `.env.example`): `STAGING_OWNER_EMAIL`,
  `STAGING_ADMIN_PASSWORD`, `STAGING_PARENT_PASSWORD`, `STAGING_INSTRUCTOR_PASSWORD` (min 8 chars),
  `CONFIG_PROMOTION_STAGING_STORAGE_BUCKET`, `CONFIG_PROMOTION_PRODUCTION_STORAGE_BUCKET`,
  `CONFIG_PROMOTION_ADMIN_ACCOUNT_ID`.