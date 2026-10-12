# Carve Academy typography

Branch: `style/unified-typography-system`. Source of truth: `src/index.css`.

## Audit

The frontend uses Tailwind 4 via `@tailwindcss/vite`. There is no separate Tailwind
configuration file: font families and semantic typography belong in CSS `@theme`.
`index.html` loads DM Sans, Cormorant Garamond, and Space Mono from Google Fonts,
with `display=swap`, preconnect, deferred stylesheet loading, and a noscript fallback.
Those sources are retained. The existing sans fallback supplies unsupported glyphs
and remains usable while the external stylesheet is unavailable.

Before migration, the source contained 931 `text-xs`, 287 `text-sm`, 313 `text-[10px]`,
145 `text-[9px]`, 50 `text-[11px]`, and 28 `text-[8px]` occurrences, plus a few 6–7px
labels. These are source occurrences, including responsive variants, rather than
counts of visible elements. Family/weight/leading/tracking were set independently
in JSX, feature CSS, and repeated component rules in `index.css`.

Concrete inconsistencies:

- Dashboard headings varied from 11px mono uppercase (`studentNextStep.css`,
  `studentCountdown.css`, weather/current sessions/recommendations) to 16–18px sans
  (`studentTodayTasks.css`, `studentNextSession.css`). All now use the 18px card role.
- Cabinet page titles used 36px serif; ordinary modal headings ranged from 14–20px;
  `ui-section-title` had competing 24px and 30px declarations. Page, section, and card
  roles now distinguish these purposes explicitly.
- `ActionButton` used 12/14px bold mono uppercase, while shared Air buttons used
  13/14px sans medium. Standard actions now share the 14px/500 button role.
- Shared fields were 13px, with local 12/14px overrides in booking, enrollment,
  participant, and admin forms. They now use the 16px body role.
- Instructor KPI values used 30px light serif; ordinary labels reached 8–9px.
  KPI values now use sans 24px on mobile and 32px on desktop; labels use captions.

Reusable existing boundaries: `ui-section-title`, `ui-section-eyebrow`, `ui-label`,
`ui-field`, `ui-field-plain`, `ui-select`, shared `btn-*`/`ui-chip`, `ActionButton`,
`StatusBadge`, cabinet header constants, and dashboard title CSS. These consume
the same semantic tokens rather than defining another typography scale.

## Semantic scale

Every ordinary UI role uses `--font-sans`. Sizes are in rem, retaining browser font
scaling; the pixel equivalents below assume a 16px root. Page/section sizes use
bounded `clamp()` interpolation. Tracking is in em.

| JSX utility          | Size    | Weight             | Line-height | Tracking |
| -------------------- | ------- | ------------------ | ----------- | -------- |
| `type-page-title`    | 30–32px | 700                | 1.2         | -0.02    |
| `type-section-title` | 22–24px | 600                | 1.3         | -0.015   |
| `type-card-title`    | 18px    | 600                | 1.4         | -0.01    |
| `type-body`          | 16px    | 400                | 1.5         | 0        |
| `type-compact`       | 14px    | 400 (500 emphasis) | 1.5         | 0        |
| `type-caption`       | 13px    | 400 (500 emphasis) | 1.5         | 0        |
| `type-caption-sm`    | 12px    | 500                | 1.5         | 0        |
| `type-button`        | 14px    | 500                | 1.4         | 0        |
| `type-button-lg`     | 16px    | 600                | 1.5         | 0        |
| `type-nav`           | 14px    | 500 (600 active)   | 1.4         | 0        |
| `type-metric`        | 24px    | 600                | 1.2         | -0.02    |
| `type-metric-lg`     | 32px    | 700                | 1.2         | -0.02    |

The `type-*` utilities compose `font-sans` with Tailwind's `text-*` theme metadata.
Metrics additionally use tabular figures. Feature styles reference this theme with
`@reference` and consume utilities with `@apply`. Emphasis is local; size, leading,
and tracking stay owned by the semantic role. No forced heading-size selectors or
new typography `!important` rules are used.

## Applied surfaces

- Student workspace: shared page/section headers, bottom navigation, dashboard
  tiles, session/checklist/recommendation/weather tiles, profile/wallet/history,
  courses, participant surfaces, development controls, and feedback dialogs.
- Home: shared sections, course/instructor cards, filters, resort conditions,
  navigation, and actions. Hero display typography remains explicit.
- Lesson/course booking: authenticated/guest forms, participant selectors,
  booking labels/header/price, notes, enrollment forms, and collaboration dialogs.
- Instructor: header/KPIs, bookings, courses, attendance/feedback controls, students,
  reviews, and course day/detail surfaces.
- Admin: navigation, directories, finance/operations, calendar cells, courses,
  enrollment/training records, settings, and dialogs.
- Shared UI: buttons, status badges, empty/loading states, pagination, notices,
  development links, and notifications.

Localized headings can wrap; dashboard title clamps and modal title truncation were
removed. Calendar lesson/course cells use minimum height instead of a fixed 44px
height. Counter badges reserve enough height for 12px text. The bottom rail keeps
all four localized labels and the booking action, with reduced internal spacing.
The notes field calculates its two-line height from body typography tokens.

## Retained exceptions

- Hero headline/eyebrow/pagination and public Journey display: editorial identity
  and existing responsive composition; ordinary actions still use UI tokens.
- Large resort temperature and countdown digits/unit: deliberate display/KPI
  treatments, including their container-responsive sizing.
- Instructor recommendation quotation: editorial serif quotation, with the existing
  responsive size; surrounding heading, metadata, and actions use UI tokens.
- Journey path labels, SVG/radar/ring annotations, and animated wheel-picker values:
  geometry-dependent display text. Radar filters/history/actions use UI tokens.
- Code, diagnostic identifiers, and the development-only course pilot: technical
  typography rather than ordinary product text.

These exceptions retain existing fonts and do not create additional font sources.

## Verification

Validation artifacts and before/after component images are generated in
`.scratch/typography-qa/`. The component comparison uses real React components
with fixture data: cabinet headers/tiles/navigation, instructor header/KPIs,
booking header/fields, admin navigation, buttons, badges, and empty states.
Instructor fixtures cover both numeric ratings and the localized no-review state.
It covers RU/EN at 320, 390, 768, and 1440px in light/dark modes, checking page
overflow, rail clipping, title clipping, and field font sizes. It is a component
comparison, not an authenticated end-to-end workflow.

Build, TypeScript, lint, relevant frontend tests, independent review, and public
Home screenshots are reported in the task result. Protected workflows require an
authenticated session and are not claimed verified by fixture screenshots.
