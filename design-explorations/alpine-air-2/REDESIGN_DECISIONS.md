# Redesign Decisions — Alpine Air 2.0 applied to the real product

What the redesign changes, why, and what deliberately stays the same.

---

## 1. What the earlier concept got wrong (corrected here)

The first 7 concept screens were drawn before the audit. Three things were wrong and are now fixed:

| Wrong in concept | Correct after audit |
|---|---|
| RU / KZ / EN language selector | **Binary EN ⟷ RU toggle.** The product has exactly two interface languages (`UI_LANGUAGES = ['en','ru']`). Kazakh exists only as a spoken-language attribute and an `Asia/Almaty` timezone. |
| 5 booking states | **6 states.** `pending_cancellation` is its own visible state; `pending` is a guest-only hold with a countdown; `cancelled` always shows a reason code. |
| Attendance as a binary control | **Three states.** `present` / `absent` / **not recorded**. Absence is never inferred from elapsed time. |

Additionally, `Certificates` has **no backend at all** — it is labelled DESIGN-ONLY everywhere it appears.

---

## 2. What stays exactly the same

- **Domain semantics.** No status, transition, actor or authority changes. Every button in the redesign
  maps to exactly one canonical command (no generic save/update).
- **Money is server-owned.** The client renders amounts; it never computes them. Refunds remain
  `refundDelta` + `writeOffDelta`. Every mutation keeps its idempotency key.
- **One booking = one lesson = one slot = one payment for the whole party.** Multi-participant
  booking stays one Booking with `party.kind = family_group`. Never one booking per skier.
- **Participant-first.** Identity, avatar, progress, attendance, achievements stay person-scoped.
- **Unified admin training records.** Lessons and course enrollments remain one section with kind/scope
  filters.
- **Admin density.** Tables, filters, row actions, bulk actions and deep links survive. The redesign
  does not trade operational throughput for minimalism.

---

## 3. Density is role-specific

| Area | Density | Rule |
|---|---|---|
| Public | Low, editorial, generous whitespace | emotion, trust, conversion; one CTA per viewport |
| Student | Medium, action-first | next action, participant identity, payment clarity |
| Instructor | Medium-high, scannable timeline | 8–12 lesson days must stay usable; one tap to attendance |
| Admin | High, table-first | search, filter, sort, row actions, master-detail; no decorative cards |

---

## 4. Component system

One visual language per conceptual component — never two variants "because they look different".

Buttons (primary / soft / ghost / flame-attention / light-on-dark) · icon buttons · links · tabs ·
segmented controls · participant selector · instructor card · course card · lesson row · booking slot ·
date selector · wallet summary · price breakdown · status indicator · alert · empty state · loading
skeleton · error state · dialog · drawer · bottom sheet · table · filter · search · pagination · action
menu · form fields · select · checkbox · toggle · confirmation with reason.

Live component board: `png/08-components.png`.

---

## 5. Accessibility decisions (fixing audited defects)

The audit found accessibility to be systemic, not incidental. Redesign rules:

- **Contrast.** Alpine Air's `--ink-dim` fails AA at ≈3.95:1. Secondary text is raised to ≥4.5:1 and
  tertiary text is reserved for non-essential decoration only.
- **Never colour alone.** Every selected / disabled / occupied / warning state carries a second
  channel: icon, label, border style, strikethrough or shape. Selected slot = filled + check; taken
  slot = muted + strikethrough + `aria-disabled`; warning = Flame + label.
- **Dialogs.** All overlays close on Escape, trap focus, restore focus on close, and are
  `role="dialog" aria-modal="true"` with a labelled title.
- **Live regions.** Toasts and slot-availability changes announce via `aria-live="polite"`.
- **Skip link** and visible focus rings on every interactive element (`:focus-visible`).
- **Touch targets** ≥44px on mobile.

---

## 6. Responsive decisions

| Breakpoint | Behaviour |
|---|---|
| ≥1280 | Full layout: 2–3 zones, sticky summaries, admin grids |
| 1024 | Sidebars collapse to icon rails; admin grids drop to 2 columns; sticky page header |
| 390 | Single column; nav becomes a bottom bar; date/slot pickers become **bottom sheets**; primary CTA becomes a **sticky bottom bar**; tables become key-value lists, never horizontally squashed |
| 360 | Same as 390 with tighter gutters; long RU names truncate with an ellipsis plus full text on the detail screen; EN labels never hard-code widths |

Long translated text is handled by allowing wrap, not fixed widths. RU and EN are both exercised.

---

## 7. Mobile is a first-class surface

- Public: sticky CTA, hero collapse, horizontally scrolling instructor cards (only when unavoidable).
- Booking: bottom sheet for date + slot, sticky payment bar with total.
- Student: persistent participant switcher, bottom tab bar.
- Instructor: today timeline, full-screen attendance sheet with large targets.
- Admin: **tables become lists**; approval actions stay reachable; the planner degrades to a per-instructor list. No desktop grid is shrunk.

---

## 8. State-first design

Every screen in this deliverable is specified for its real states, not only the happy path:
loading skeleton matching final layout · empty · partial · error · stale · permission-denied ·
expired. Booking states: pending (guest hold + countdown) · confirmed · pending_cancellation ·
cancelled (with reason) · completed · no_show. Attendance: present · absent · not recorded.
Payment: unpaid · processing · failed · paid · partially covered by wallet.
