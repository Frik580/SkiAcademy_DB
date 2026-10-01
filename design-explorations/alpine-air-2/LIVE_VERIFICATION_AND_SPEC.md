# Live Verification, Blockers and Design Specification

Companion to `PRODUCT_AUDIT.md`, `SCREEN_COVERAGE.md` and `IMPLEMENTATION_RISKS.md`.
Everything here was verified against the live staging application with a real browser unless marked
otherwise. No production data was touched; nothing was deployed.

---

## 1. Live verification results

| Mode | Result | Evidence |
|---|---|---|
| Guest | PASS | home, language RU/EN toggle, theme toggle, auth modal (sign in / sign up), course `Записаться` / `Подробнее`, guide `Забронировать`, guest booking form |
| Student | PASS | login, 4 tabs (Главная / Обучение / Тренер / Профиль), 9 Profile destinations, 3 participants, balance 755 250 ₸, path-to-mastery XP ladder, skills |
| Instructor | **BLOCKED (concrete)** | see §2 |
| Admin | PASS | 5 tabs, planner grid `ИНСТРУКТОР × 08:00–18:00`, bookings table, people tables, courses with Active/Archived, system settings |
| Guest booking end-to-end | **BLOCKED (concrete)** | see §3 |

### New facts discovered in this pass (not in the earlier audit)

1. **Guest booking is a REQUEST, not an instant slot hold.** The dialog reads
   «Заявка без регистрации… Регистрация не требуется. Администратор свяжется с вами по указанным
   контактам для организации оплаты.» There is no countdown and no hold in the public flow.
   The code-level 1-hour hold / `expire_guest_reservation` exists for a different path. The redesign
   shows the request form, not a countdown.
2. **Guest form fields**: name*, phone*, email, calendar, time, duration (1/2/3/4/6 h),
   skill level (5 options), training goals textarea, total, submit.
3. **Admin clients table has an «УЧАСТНИКИ» column** — participant count is a first-class admin
   concept (`Стaging Parent → Артём, Ева, Максим (3)`).
4. **Admin instructors table has «ПРИЁМ ЗАПИСЕЙ»** — booking acceptance is a per-instructor toggle
   and is the control that creates availability.
5. **Unattributed console error**: `400 (Bad Request)` on the admin/instructor account.

---

## 2. Instructor live verification — BLOCKED, with the exact chain

The instructor fixture account cannot be given live lessons without unsafe operations. Verified chain:

```
Айдар Керметов (fixture instructor)
  → «Приём записей» = ВЫКЛЮЧЕН  (admin → Люди → Инструкторы)
    → доступных слотов нет
      → гостевая заявка показывает «Нет свободного времени»
        → кнопка «Отправить заявку на бронирование» заблокирована (проверено: click timeout)
          → запись создать нечем
            → в кабинете инструктора 0 занятий
```

What was verified live anyway: workspace shell, skeleton→loaded transition, account/instructor block,
rating block, counters (всего занятий / завершено / неявка / ожидают), top-bar switcher, balance.

**Why not fixed by me:** the only ways to seed lessons are `npm run staging:seed` / `staging:reset`,
which reset or overwrite shared staging fixtures (destructive). Toggling booking acceptance for the
fixture instructor would change shared fixture configuration for other testers. Both are outside the
"safe and reversible" boundary, so the task is reported as BLOCKED with this exact reason instead of
being guessed from code.

**Design consequence:** all 7 instructor surfaces are designed from code plus the verified shell —
including a deliberately separate **BUSY DAY** screen with 10 lessons and 4 simultaneous
action-required states (`instructor-busy-day`).

---

## 3. Guest booking end-to-end — BLOCKED, with the exact unverified point

Attempted and captured: open dialog → fill name/phone/email/textarea → pick date.

**Unverified point:** slot selection and submission. The time section renders «Нет свободного
время» for every date, so no slot can be selected and the submit button stays disabled.

What this means for the design: the confirmation state after a successful guest request
(«Заявка отправлена») could not be observed live and is therefore specified from the product's own
copy, not from a screenshot. Admin-side visibility of a guest request is designed
(`admin-guest-finance`) from the live admin table structure, which does exist.

No cleanup was needed: no record was created.

---

## 4. Design proposals requiring owner approval

| # | Proposal | Status |
|---|---|---|
| P-1 | **Access denied (403) screen** instead of silent redirect (`screens/public/public-access-denied`) | **UX PROPOSAL — OWNER APPROVAL REQUIRED.** Not current canonical behaviour. |
| P-2 | **Public routes** for course/coach detail pages (today everything is state on one route) | PROPOSAL — would change routing. |
| P-3 | **Repair `/cabinet/:tab`** — today every deep link renders Home | Recorded as a product defect + implementation requirement; the redesign keeps meaningful deep-link destinations rather than hiding the defect. |
| P-4 | **Certificates issuance system** | **FUTURE / REQUIRES BACKEND.** The surface is preserved with an honest empty state only. |

---

## 5. Certificates — current truth

`student-certificates` preserves the existing navigation destination and shows:

- an explicit notice: «Вкладка доступна в кабинете, но выдача сертификатов пока не поддерживается системой»;
- an honest empty state instead of invented earned certificates;
- a `DESIGN-ONLY` marker in `SCREEN_COVERAGE.md`.

No backend data is simulated anywhere.

---

## 6. Accessibility — DESIGN SPEC FIXED (implementation NOT fixed)

**DESIGN SPEC FIXED** — the redesign specifies:

| Area | Specification |
|---|---|
| Dialog (≥768px) | `Esc` closes · focus trap · initial focus on first field or title · focus returns to the trigger · backdrop not clickable · `role="dialog" aria-modal="true"` |
| Bottom sheet (<768px) | `Esc` closes · max 85% viewport height · mandatory drag handle · swipe-down closes · keyboard never covers fields |
| Toast | `aria-live="polite"` · 4 s · one primary action |
| Focus | visible `:focus-visible` ring on every interactive element |
| Skip link | present on every screen (`<a class="skip-link">К содержанию</a>`) |
| Contrast | secondary text raised to ≥4.5:1 (the current `--ink-dim` ≈3.95:1 fails AA) |
| Status | never colour-only — every status carries a label and/or icon |
| Touch targets | ≥44 px on mobile |

**PRODUCT IMPLEMENTATION FIXED: NO.** As audited, 0 of ~29 dialogs close on `Esc`, there are no focus
traps, no `autoFocus`/focus restore, no skip link, and `jsx-a11y` is demoted to `warn`.
None of that was changed in this task.

---

## 7. Rendering note

Fixed-position elements (mobile bottom tab bar, sticky CTA) appear at the top of full-page
screenshots — a capture artifact, not a layout defect. View the same PNG at viewport size to see them
in place.