# Screen Inventory — Carve Academy → Alpine Air 2.0

Every surface discovered in the audit, with its redesign destination.
Status key: **DONE** = rendered in this deliverable · **PLANNED** = specified, render in next pass ·
**DESIGN-ONLY** = no backend exists today (must not be presented as available).

---

## PUBLIC / GUEST

| # | Surface | Route / entry | Purpose | Key actions | Key states | Desktop | Mobile | Alpine Air 2.0 |
|---|---|---|---|---|---|---|---|---|
| P-01 | Home (single page) | `/` | Positioning, trust, conversion | Start Your Journey · Choose Course · Enroll · Details · Book Lesson | full · course without enrolment · no reviews · loading | hero editorial | hero + sticky CTA | **DONE** `png/01-home.png` |
| P-02 | Path-to-mastery ladder | `/` | Show progression & XP thresholds | (informational) | beginner→expert | in hero block | stacked cards | **DONE** (in P-01) |
| P-03 | Skills preview | `/` | Show skill taxonomy | (informational) | counters `8 skills / 10 achievements` | 2-col | horizontal scroll | **DONE** (in P-01) |
| P-04 | Course catalog | `/` | Discover courses | Enroll · Details | available · not available · loading | 3-col grid | 1-col | **DONE** (in P-01) |
| P-05 | Course detail / enrolment | dialog from `/` | Decide + enrol | Enroll → participant/slot flow | not available · available | dialog | bottom sheet | **DONE** `png/02-booking.png` |
| P-06 | Guides / instructors | `/` | Discover coaches | Book Lesson | has reviews · no reviews | rows | cards | **DONE** (in P-01) |
| P-07 | Coach booking (guest) | dialog from `/` | Reserve a slot without account | pick slot → hold | free · taken · unavailable | dialog | bottom sheet | **DONE** (in P-02 booking) |
| P-08 | Auth modal | navbar | Sign in / sign up | sign in · sign up · submit | idle · submitting · error | centered modal | full-screen sheet | **DONE** `png/07-public-auth.png` |
| P-09 | Language + theme controls | navbar | RU/EN, light/dark | toggle | ru · en · light · dark | top bar | top bar | **DONE** (all screens) |

## STUDENT

| # | Surface | Route / entry | Purpose | Key actions | Key states | Desktop | Mobile | Alpine Air 2.0 |
|---|---|---|---|---|---|---|---|---|
| S-01 | Cabinet Home | `/cabinet` | Next action | Add to Today · Development → · My Lessons | loading · empty · with lesson | 3-zone | stacked + sticky CTA | **DONE** `png/03-cabinet.png` |
| S-02 | Participant switcher | `/cabinet` top bar | Choose whose data is shown | switch participant | 1 · N participants · selected | avatar row | avatar row (persistent) | **DONE** (S-01, S-05) |
| S-03 | Training / skill development | Training tab | Skill plan | open skill | loading · empty · populated | 2-col | 1-col | **DONE** `png/student/04-training.png` |
| S-04 | My Lessons (upcoming) | Training tab | Manage bookings | open · reschedule · cancel | 6 booking states + payment state | list | list + sticky action | **DONE** `png/student/05-lessons.png` |
| S-05 | Lesson history | Profile → My history | Progress history | open record | empty · list | list | list | **PLANNED** (folded into S-04) |
| S-06 | Coach directory (student view) | Coach tab | Find a coach | Book Lesson | no reviews · reviews | rows | cards | **PLANNED** (folded into P-06) |
| S-07 | Progress / Path | Training tab | See level & XP | — | beginner→expert | ladder | ladder | **DONE** (in S-01) |
| S-08 | Skills + radar + exercises | Profile → Skills | Skill assessment view | open exercise | not recorded · in progress | radar + list | list only | **DONE** `png/student/06-skills.png` |
| S-09 | Wallet | Profile → Wallet | Balance & transactions | top up · view movements | no balance · partial · enough | summary + ledger | summary + ledger | **DONE** `png/student/07-wallet.png` |
| S-10 | Payment / checkout | booking flow | Pay from wallet or card | confirm | unpaid · processing · failed · paid | inline panel | sticky bottom bar | **DONE** `png/02-booking.png` |
| S-11 | Participants & avatars | Profile → Participants | Manage people | add dependent · edit · avatar | 1 · N · incomplete | list | list + sheet | **DONE** `png/student/08-participants.png` |
| S-12 | Profile & settings | Profile → Settings | Personal data, privacy | edit fields | valid · invalid · saving | form | form | **DONE** (in S-11) |
| S-13 | Achievements | Profile → Achievements | Badges | — | none · some · all | grid | grid | **PLANNED** (grouped render) |
| S-14 | Season stats | Profile → This season | Season summary | — | empty · populated | tiles | tiles | **PLANNED** (grouped render) |
| S-15 | Video archive | Profile → Video archive | Lesson videos | open video | empty · list | grid | grid | **PLANNED** (grouped render) |
| S-16 | Certificates | Profile → Certificates | Level certificates | — | — | — | — | **DESIGN-ONLY** — no Certificate model/command/collection exists |
| S-17 | Booking (multi-participant) | from coach/course | Book the party | choose participants → slot → pay | free · stale · occupied · taken | 2-col + sticky summary | bottom sheet | **DONE** `png/02-booking.png` |

## INSTRUCTOR

| # | Surface | Route / entry | Purpose | Key actions | Key states | Desktop | Mobile | Alpine Air 2.0 |
|---|---|---|---|---|---|---|---|---|
| I-01 | Workspace today | `/instructor` | Daily driver | open lesson · confirm | loading skeleton · empty day · busy day | KPI + timeline | KPI + timeline | **DONE** `png/04-instructor.png` |
| I-02 | Lesson detail / attendance | lesson | Run the lesson | start · mark attendance · assess | before · during · after · frozen | card + actions | full-screen | **DONE** `png/instructor/02-lesson-attendance.png` |
| I-03 | Progress & skill assessment | lesson | Grade skills | set skill level · write note | not recorded · recorded | inline form | sheet | **DONE** `png/instructor/03-assessment.png` |
| I-04 | Schedule | `/instructor` | Own schedule | — | empty · populated | grid | list | **PLANNED** (in I-01) |
| I-05 | Participants | `/instructor` | See people | open participant | empty · list | list | list | **PLANNED** (in I-01) |
| I-06 | Courses | `/instructor` | Assigned courses, course days | open course day | active · archived | list | list | **PLANNED** (grouped render) |
| I-07 | Finance / earnings | `/instructor` | Money | — | no balance · owed · paid | dark summary | summary | **DONE** (in I-01) |

## ADMIN

| # | Surface | Route / entry | Purpose | Key actions | Key states | Desktop | Mobile | Alpine Air 2.0 |
|---|---|---|---|---|---|---|---|---|
| A-01 | Operations overview | `/admin?tab=operations` | Day control centre | day/week toggle · open section | loading · empty · truncated · denied | KPI strip | stacked | **DONE** `png/05-admin.png` |
| A-02 | Schedule board (planner) | `admin_planner` | Instructor × hour occupancy | navigate · place | empty · occupied · truncated · no instructors | grid table | list | **DONE** (in A-01) |
| A-03 | Active bookings monitor | `admin_booking_monitor` | Live bookings | filter · open | loading · empty · list | table | list | **DONE** (in A-01) |
| A-04 | Unified training records | `canonical_training_records` | Lessons + enrollments | filter kind/scope · row actions · approval | 6 booking / 7 enrollment states | table | list | **DONE** (in A-01) |
| A-05 | Attention centre / issues | `admin_issue_inbox` | Resolve domain issues | filter severity · open · resolve | none · urgent · critical · resolved | list | list | **DONE** (in A-01) |
| A-06 | Finance overview | `?tab=finance` | Period view | DAY/WEEK/MONTH | empty · populated | period + tables | stacked | **PLANNED** (grouped render) |
| A-07 | Payments & wallets | `canonical_finance` | Money operations | open movement · manual payment | unpaid · paid · refunded | table | list | **PLANNED** (grouped render) |
| A-08 | Guest funds | `canonical_guest_finance` | Guest reservations money | open | empty · populated | table | list | **PLANNED** (grouped render) |
| A-09 | School cash flow | `canonical_school_movement` | Movements | open | empty · populated | table | list | **PLANNED** (grouped render) |
| A-10 | People — clients | `admin_clients` | Client database | search · open | empty · list | table | list | **DONE** `png/admin/02-people.png` |
| A-11 | People — instructors | `admin_instructors` | Coach directory | Add instructor | empty · list | table | list | **DONE** (in A-10) |
| A-12 | People — roles | `admin_roles` | Role management | promote/demote | list | table | list | **DONE** (in A-10) |
| A-13 | Product — courses | `courses_manager` | Course DB | Add Course · Active/Archived · lesson settings | active · archived · saving | table + form | list + sheet | **DONE** `png/admin/03-courses.png` |
| A-14 | Product — resort & content | `resort_data`, `resort_slider` | Resort info, hero slider | edit · save | empty · populated | form | form | **PLANNED** (in A-13) |
| A-15 | System — settings | `starter_credit`, `skill_matrix`, `achievements_config`, `notification_retention` | Global config | save | default · modified | forms | forms | **DONE** `png/admin/04-system.png` |
| A-16 | System — danger zone | `clear_student_bookings` | Destructive | confirm with reason | idle · confirming | dialog | full-screen confirm | **DONE** (in A-15) |
| A-17 | System — testing | testing env, TestSession | Test tooling | create session · retry | idle · running | panel | — | **DONE** (in A-15) |
| A-18 | System — error logs | `error_logs` | Diagnostics | filter | empty · populated | table | — | **DONE** (in A-15) |

## SHARED / SYSTEM

| # | Surface | Purpose | Alpine Air 2.0 |
|---|---|---|
| X-01 | Top bar (navbar) | identity, language, theme, notifications, sign out | **DONE** on every render |
| X-02 | Workspace switcher | move between cabinet / instructor / admin | **DONE** |
| X-03 | Lesson chat | per-booking messaging | **PLANNED** |
| X-04 | Toast / notifications | feedback | **PLANNED** |
| X-05 | Dialog / bottom-sheet primitive | every overlay | **DONE** `png/08-components.png` |
| X-06 | Empty / loading / error states | all lists | **DONE** (components render) |

---

## Overlays inventory

| Kind | Count / examples | Redesign treatment |
|---|---|---|
| Modal dialog | ~29 in code (auth, booking, course form, confirmations) | dialog on ≥768px, **bottom sheet** on mobile — never auto-fullscreen |
| Confirmation with reason | destructive admin actions | Flame accent, mandatory reason field, explicit target name |
| Bottom sheet | 0 today (desktop-only patterns) | **new** for date/slot selection, participant picker, assessment |
| Drawer | admin collapsible sections | keep collapsible + deep-linkable; state in localStorage |
| Popover / menu | overflow menus, workspace switcher | anchored menu with focus trap |
| Toast | hand-rolled, inconsistent | single toast component, `aria-live="polite"` |
| Error state | inline red text + one ErrorBoundary | inline + page-level boundary |
| Loading state | skeletons + `Loading…` text | skeleton matching final layout; never layout-shifting |
