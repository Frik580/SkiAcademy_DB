# Carve Academy — Product Audit

**Scope:** complete product audit of the existing application, used as the factual basis for the
Alpine Air 2.0 redesign.
**Sources:** (1) live staging application `https://ski-school-staging.web.app/` audited with a real
browser across all four access modes, (2) read-only repository audit.
**Raw evidence:** `audit/staging/*.json`, `audit/staging/shots/*.png`, `audit/code-*.md|json`.
**Product source was not modified.**

---

## 1. Access modes audited

| Mode | How audited | Result |
|---|---|---|
| Guest | live browser, logged out, EN + RU | PASS |
| Student / client | live browser, test student account | PASS |
| Instructor | live browser, test instructor account | PARTIAL — surface renders, but the fixture account has no lessons, so live data states (attendance recording, progress assessment, payouts) were verified from code, not from the UI |
| Admin | live browser, test admin account, all 5 tabs | PASS |

Credentials were used only for inspecting staging, were never written into any repository file,
and appear in no screenshot. Nothing was deployed and no production data was touched.

---

## 2. Application shape

The product is **not** a multi-route marketing + app site. It is a compact SPA:

| Route | Screen | Guard |
|---|---|---|
| `/` | Public marketing site + guest booking | none |
| `/cabinet` | Student cabinet | silent `<Navigate replace>` if not authed |
| `/cabinet/:tab` | Cabinet deep link | same |
| `/instructor` | Instructor workspace | silent redirect if not instructor |
| `/admin` | Admin panel | silent redirect if not admin |
| `*` | redirect to `/` | — |

Consequences for redesign:

- There is **no "no access" screen**. An unauthorised user is silently bounced. This is a real gap,
  not a design choice, and it must be represented explicitly in the redesign.
- Public navigation is **state-driven inside one route**, not URL-driven. Deep links to a public page
  do not exist. The redesign should decide whether public pages become real routes.
- Role is derived from the `users` document. **There are no custom claims.** `instructor` is not a
  role — the app branches on `role === 'admin' || isInstructor`.

---

## 3. Public / guest surface (verified live)

Single scrolling page with a sticky frosted navbar. Verified interactive elements (EN labels):

- **Top bar:** language toggle `EN|RU`, theme toggle (light/dark), `Sign In`.
- **Hero:** headline block + CTA `Start Your Journey` and `Choose Course`.
- **Path to mastery:** a level ladder — `BEGINNER 0 XP`, `CARVING 100 XP`, `MASTERY 250 XP`, `EXPERT 500 XP`.
- **Skills preview:** skill groups on the home page (e.g. "Balance & stance", "First turns",
  "Pluge and speed control", "Edge control", "Parallel skiing"), with counters
  `8 skills • 10 achievements`.
- **Course catalog:** course cards with `Enroll` and `Details` per course.
- **Guides:** coach rows with rating/review state (`No reviews received yet.`) and `Book Lesson`.
- **Auth modal:** centered overlay with body-scroll-lock; tabs for sign-in and sign-up
  (email + password, `Email Address` / `Password` placeholders), submit button.
- **Footer:** `Home / Training / Coach / Profile`, copyright, `Ski & Snowboard Instruction`.

Observed states: an empty-review state (`No reviews received yet.`) and a disabled-enrolment state
(`Enrollment for this course is not available yet`) both render on staging — these are real states
the redesign must style, not edge cases.

Guest booking is reachable (`Book Lesson` on a guide, `Enroll` on a course). The reservation is a
**1-hour hold** in `pending` state with a countdown to `reservationExpiresAt`, then expires via
`expire_guest_reservation`. Not completed end-to-end in the browser during this audit (see §9).

---

## 4. Student / client surface (verified live)

Top-level tabs (EN): **Home · Training · Coach · Profile**.

**Home**
- Balance in the top bar (`Balance: 755 250 ₸`).
- **Participant switcher with 3 participants** (avatars `S`, `A`, `M`) in the top bar.
- Path-to-mastery ladder with XP thresholds.
- Skill groups and counters.
- Buttons: `Add to Today`, `Development →`, `My Lessons`.

**Training**
- `Skill development`, `My Lessons`, `Courses`.

**Coach**
- Coach list with review state and `Book Lesson`.

**Profile** — 9 destinations, each an explicit capability:
1. `Participants` — edit personal info, avatars, dependent participants
2. `Wallet transaction history` — credits, debits, current balance
3. `My history` — progress and training history
4. `Skills` — skill radar and exercise progress
5. `Certificates`
6. `Achievements` — badges earned on the slopes
7. `This season` — stats for the current season
8. `Video archive` — training videos from lessons
9. `Settings` — privacy and account

Footer navigation duplicates the four tabs. Deep links such as `/cabinet/lessons`,
`/cabinet/progress`, `/cabinet/wallet` all render the cabinet **home** — the `:tab` segment is
effectively inert in the current build. This is a real navigation defect worth fixing in the
redesign, and it constrains how deep links are specified.

**Participant model (critical).** Account is the login; **Participant is the person**. Identity,
avatar, progress, attendance, achievements and certificates are person-scoped. The staging student
account has three participants, so participant switching is not optional UI here — it is the primary
navigation control for every person-scoped screen.

---

## 5. Instructor surface (partially verified live)

Route `/instructor`. Verified live:

- First paint is a **loading skeleton that can persist** (3 skeleton cards, `Loading…`).
- Header: `Instructor Workspace` switcher in the top bar, balance (`250 ₸`), notifications bell,
  theme, language, sign out.
- Workspace header: account/instructor name, discipline (`ЛЫЖНЫЙ ИНСТРУКТОР`), rating block,
  review counter (`Отзывов пока нет`).
- Counter strip: **ВСЕГО ЗАНЯТИЙ · ЗАВЕРШЕНО · НЕЯВКА · ОЖИДА…** (waiting) — all zero for this
  fixture account.

Because the staging instructor fixture has no lessons, the day workflow, attendance marking,
progress/skill assessment and payout states could **not** be exercised in the browser. They are
documented from code in `audit/code-instructor.md`.

---

## 6. Admin surface (verified live, all 5 tabs)

Tabs: **OPERATIONS · FINANCE · PEOPLE · PRODUCT · SYSTEM** (URL query `?tab=`).
Currency is `KZT` and shown in the top bar.

**OPERATIONS**
- Financial/ops counter strip: `АКТИВНЫЕ УРОКИ`, `ЗАВЕРШЕННЫЕ УРОКИ`, `НЕЯВКА`, `ВСЕГО ГИДОВ`.
- **Instructor Timetable & Schedule Board** — a real `COACH × 08:00…18:00` grid table (view
  switch Day/Week, Today).
- **Active Bookings Monitor.**
- **Attention center** — issue inbox.
- **Lessons and courses** — unified canonical training records table with columns
  `BOOKING ID | BOOKING DATE | SKIER | COACH | TRAINING LEVEL | DATE/TIME | FEE | STATUS | APPROVAL ACTIONS`.
  Lesson bookings and course enrollments are **one unified section** filtered by kind — they must not
  be split back apart in the redesign.

**FINANCE**
- Financial overview with period segmented control `DAY | WEEK | MONTH`.
- Guest funds, canonical payments and wallets, school cash flow
  (table `TIME | KIND | SOURCE | SUBJECT | PAYMENT | WALLET | AMOUNT`).

**PEOPLE**
- Client database management, coaches directory management (`ADD INSTRUCTOR`), administrator role
  management.

**PRODUCT**
- Courses database management (`Active` / `Archived`, `Add Course`, `Refresh`) — verified live with
  courses `Carving Essentials`, `Performance Carving Masterclass`, lesson settings.
- Resort details & weather location, hero slider slides & speed.

**SYSTEM**
- Notification retention, starter gift credit, client rating & skill level matrix, student
  achievements, danger zone, testing environment (`Create test session`, `Retry`), system error logs.

Sections are collapsible, persist their open state to `localStorage`, and are deep-linkable by DOM id
and query key.

**Density is the point here.** The admin panel is a working instrument. Tables, filters, row actions
and bulk actions must survive the redesign; decorative card layouts would be a functional regression.

---

## 7. Domain mechanics that constrain the design

Full detail: `audit/code-domain-mechanics.md`. The constraints that directly shape screens:

| Area | Reality | Design consequence |
|---|---|---|
| Booking lifecycle | **6** states: `pending`, `confirmed`, `pending_cancellation`, `cancelled`, `completed`, `no_show` | 6 distinct chips. `pending_cancellation` is a real user-visible state (waiting for admin), not "cancelled". `pending` is guest-only and shows a countdown. `cancelled` always renders a reason code. Terminal states are frozen — no actions. |
| Course enrollment | **7** states (adds `withdrawn`), cancellation tiers 7d/2d | Enrollment must not reuse the booking chip set verbatim. |
| Booking party | One Booking = one lesson = one slot = one payment for the whole party; `party.kind` = `individual` (N=1) or `family_group` (N≥2) | Multi-participant booking is a first-class flow, never one booking per skier. |
| Money | Fully server-authoritative. Client is GET-only on wallet state. KZT minor units. Idempotency key per mutation. Refunds produce `refundDelta` **and** `writeOffDelta` | The client may render amounts, never compute them. |
| Attendance | `present` / `absent` / **not recorded**. Missing attendance is UNKNOWN, never absent; stays `confirmed` until end+24h, then raises a `missing_attendance` issue | A third neutral state is mandatory. Absence must never be inferred. |
| Progress & skills | Person-scoped skill model with levels, written by instructor assessment | Progress screens are per-participant, not per-account. |
| Commands | `FORBIDDEN_GENERIC_COMMAND_KINDS` — every mutation is exactly one named canonical command | Every button in the redesign maps to exactly one command. No "generic save". |
| Certificates | **No Certificate model, command or collection exists**, yet `/cabinet/profile_certificates` is a live tab | Certificates are NEW BUILD. Must be labelled DESIGN-ONLY until the backend exists. |

---

## 8. Platform facts that constrain the redesign

From `audit/code-platform.md`:

- **Two languages only:** `en` / `ru`. Binary toggle, `localStorage['alpine_glide_lang']`,
  resolved saved → navigator → `en`. Parity is CI-checked by `npm run i18n:check`.
  **The existing Alpine Air 2.0 concept screens wrongly show a RU/KZ/EN selector — corrected here.**
- **Copy layer debt:** ~250 lines of hardcoded Cyrillic in `.tsx`, plus inline
  `language === 'ru' ? … : …` ternaries and `t(key) || 'Русский фолбэк'` patterns with no EN arm.
  A redesign cannot assume a clean dictionary.
- **Accessibility is the weakest area, systemically:** 0 of ~29 dialogs close on Escape, 0 focus
  traps, 0 `autoFocus` / focus restore, no skip link, `aria-live` used once, light-theme `--ink-dim`
  ≈3.95:1 fails WCAG AA, `jsx-a11y` demoted to `warn`.
- **Infra:** Firestore-native (no react-query), listeners are `limit()`-bounded, essentially no
  polling. One `ErrorBoundary`, mounted only via `LazyLoad`, while 17 bare `<Suspense>` blocks in
  `AdminPanel.tsx` are unprotected. Toasts are hand-rolled; no FCM despite a `PushNotificationHub`
  filename; 3 divergent notification type unions.
- **Staging fixtures:** v2 = 2 accounts + 2 dependents + 1,000,000 KZT (no courses/bookings);
  v1 legacy adds 2 courses + 1 instructor.

---

## 9. Unknowns and unverified behaviour

Documented rather than guessed:

1. **Guest booking end-to-end** — the dialogs open and are captured, but completing a reservation
   was not exercised (it mutates staging data). Guest hold countdown behaviour is documented from
   code, not observed live.
2. **Instructor lesson workflow** — attendance, progress and skill assessment, payouts: code-verified
   only, because the staging instructor fixture has zero lessons.
3. **Certificates** — the UI tab exists, the domain does not. Cannot be verified at all.
4. **Admin destructive actions** — deliberately not executed (course deletion, booking mass-cancel,
   wallet adjustments). Destructive flows are documented from code and flagged in the risk register.
5. **Notifications** — bell exists; delivery mechanism is inconsistent in code (3 divergent unions,
   no FCM), so no notification state could be verified end-to-end.
6. **Console error observed:** a `400 (Bad Request)` on the admin/instructor account. Not yet
   attributed; recorded as a risk.
7. **Certificate/video archive** backends: video archive is listed in the UI; its storage path was
   not traced in this pass.

---

## 10. Count summary

| Item | Count |
|---|---|
| Routes | 6 |
| Public surfaces (guest) | 1 page + 2 modal families (auth, booking/enrolment) |
| Student tabs / sections | 4 tabs, 9 profile destinations |
| Instructor surfaces | 1 workspace + code-only sub-flows |
| Admin tabs / sections | 5 tabs, ~20 collapsible sections |
| Canonical statuses | 6 booking, 7 enrollment, 3 attendance, payment/wallet/issue enums |
| Capabilities in the preservation matrix | 284 |
| Dialogs / overlays audited | ~29 (code) + guest auth & booking (live) |
