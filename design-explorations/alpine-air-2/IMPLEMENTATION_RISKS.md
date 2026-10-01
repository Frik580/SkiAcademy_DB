# Implementation Risks — Alpine Air 2.0 redesign

Where the design and the current architecture may conflict. Nothing here blocks the design; every
item is a decision or a piece of work that implementation must resolve.

---

## A. Blockers — need a product-owner decision

| # | Issue | Why it matters | Options |
|---|---|---|---|
| A-1 | **Certificates have no backend.** `/cabinet/profile_certificates` is a live tab, but there is no Certificate model, command, or collection. | The redesign must not imply a working feature that cannot exist. | (a) keep the tab, render an explicit "not available yet" state; (b) remove the tab; (c) build the backend |
| A-2 | **Authorised users get a silent redirect, not a 403 screen.** | Today an admin who opens `/` sees nothing wrong. A redesign that shows a proper "no access" state is a behaviour change. | (a) add an explicit no-access screen; (b) keep silent redirect |
| A-3 | **`/cabinet/:tab` deep links are inert** — they all render Home. | Either the tab parameter or the router is wrong. Bookmarks and shared links are broken today. | (a) make tabs real routes; (b) remove the parameter from the router |
| A-4 | **Public pages have no routes.** Everything is one scrolling state. | Cannot deep-link a course or a coach, and cannot return from payment. | (a) introduce public routes; (b) accept single-page |
| A-5 | **Guest booking was not verified end-to-end in staging.** | The 1-hour hold + countdown + expiry is code-documented only. | verify on staging before implementation |

---

## B. Design vs architecture conflicts

| # | Conflict | Impact |
|---|---|---|
| B-1 | **`FORBIDDEN_GENERIC_COMMAND_KINDS`** — every mutation is one named command. | A "save everything" settings screen is impossible. Settings must be per-command forms. |
| B-2 | **Client is GET-only on wallet state**; amounts are KZT minor units computed server-side. | Price breakdowns are renders, not calculations. Any UI-side total is a bug. |
| B-3 | **~250 hardcoded Cyrillic lines** in `.tsx`, inline `language === 'ru' ? … : …` ternaries and `t(key) || 'Русский фолбэк'` with no EN arm. | The redesign's RU/EN promise cannot be met until this copy debt is extracted. CI parity (`npm run i18n:check`) only checks keys, not inline literals. |
| B-4 | **Admin uses query params + collapsible sections, not routes** (19 deep-link keys, localStorage open-state). | Redesign must keep query keys or every shared admin link breaks. |
| B-5 | **17 bare `<Suspense>` blocks in `AdminPanel.tsx` are outside the single `ErrorBoundary`** (mounted only via `LazyLoad`). | A redesigned admin shell should mount one boundary around the whole panel — small, safe, and it changes failure behaviour. Needs approval as a behaviour change. |
| B-6 | **Three divergent notification type unions; no FCM** despite a `PushNotificationHub` filename. | Notification UI must be specified against one union before redesign. |
| B-7 | **Instructors are detected by `role === 'admin' \|\| isInstructor`**, not by a role. | An instructor-specific nav cannot assume a role claim exists. |

---

## C. Accessibility work required (not just visual)

| # | Finding | Required work |
|---|---|---|
| C-1 | 0 of ~29 dialogs close on Escape | Shared dialog primitive: Escape + focus trap + focus restore |
| C-2 | No `autoFocus` on first field, no skip link | Add both |
| C-3 | `aria-live` used once | Toasts + slot availability |
| C-4 | `--ink-dim` ≈3.95:1 fails AA | Raise secondary text contrast; keep identity |
| C-5 | `jsx-a11y` demoted to `warn` | Re-enable as `error`, or the redesign regresses |
| C-6 | Status conveyed by colour in several places (paid/unpaid, taken slot) | Add icon/label second channel everywhere |

---

## D. Areas needing more testing

1. **Instructor flows end-to-end** — the staging fixture has zero lessons, so attendance, progress,
   skill assessment and payouts were code-verified only. Build a lesson-bearing fixture.
2. **Multi-participant booking with a family party** — `party.kind = family_group`, additional
   participant pricing, and the single-payment invariant are untested on staging data.
3. **Guest hold expiry** — countdown, `expire_guest_reservation`, and what the user sees after expiry.
4. **Destructive admin actions** — deliberately not executed. `clear_student_bookings`, course deletion,
   wallet adjustments all need a confirmation pattern verified on staging.
5. **Unattributed `400 (Bad Request)`** observed in the console on the admin/instructor account.
6. **Long-text behaviour** — long RU instructor/participant names and long EN labels at 360px.
7. **Mobile** — the current product's mobile behaviour was only spot-checked; the redesign's mobile
   specs are design-intent until implemented and tested on real devices.

---

## E. Explicitly out of scope for this design task

No React screen was rewritten, no component migrated, no Cloud Function, Firestore rule, index or
Firebase config touched, nothing deployed. Product source diff: **NONE**.
