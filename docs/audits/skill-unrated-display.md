# Аудит отображения индивидуальных оценок навыков

Ветка: `fix/skill-unrated-display-everywhere`.

## Результат

DONE. Проверены все потребители `skillScores` в `src`, связанные модели представления,
индивидуальные выводы `earned`, `score`, `newScore`, `maxPoints` и их вызывающие интерфейсы.
Наличие оценки определяется через `Object.hasOwn`, независимо от числового значения.
Канонические данные, чтение Firestore и сохранение оценок не менялись.

Индивидуальный результат: `Нет оценки / 3` / `Not evaluated / 3`,
`0 / 3 · 0%`, `1 / 3 · 33%`, `2 / 3 · 67%`, `3 / 3 · 100%`.
Максимум берётся из `item.maxPoints`. Для отсутствующей оценки процент не вычисляется.

## Найденные интерфейсы

| Место                                                                                          | Результат аудита                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StudentDevelopmentPanel` — «Развитие», приоритетные упражнения                                | Исправлено: отсутствующая оценка больше не становится `0 / max · 0%`.                                                                                                                                                                  |
| `SkillRadarChart` — подробности упражнений, комментарии рядом с ними                           | Исправлено: отдельная оценка форматируется с учётом наличия. Общие кольца, оси, легенда, подсказки направлений и симуляция сохраняют прежние агрегаты.                                                                                 |
| `ClientSkillProgressView` — общий список навыков с комментариями                               | Исправлено отображение отсутствующих оценок, добавлены проценты фактических оценок. Скрытие оценок и действия закрепления сохранены.                                                                                                   |
| `StudentCoachPanel` / `getInstructorSkillComments` — комментарии инструктора                   | Исправлено: комментарий без оценки не означает нулевую оценку. Фильтрация по инструктору сохранена.                                                                                                                                    |
| `StudentSkillEvaluationModal` — оценивание и просмотр навыков инструктором                     | Уже различала отсутствие и явный ноль через `Object.hasOwn`. Подпись унифицирована, добавлены проценты; убрана визуальная подсветка кнопки нуля для отсутствующей оценки. Числовые кнопки и сохранение работают по прежнему алгоритму. |
| `InstructorStudents`, `InstructorBookingCard`, `InstructorWorkspace`                           | Используют общую модалку выше; индивидуального дублирующего форматирования нет. Агрегат этапа и доступ к оцениванию не менялись.                                                                                                       |
| `StudentNextStepCard`, плитка следующего шага, `getNextStepAction`                             | Корректно: показывают потенциальный прирост и прогресс уровня, а не текущую индивидуальную оценку. Выбор упражнения и расчёты сохранены.                                                                                               |
| `StudentHistoryList` / `studentHistory`                                                        | Корректно: история показывает начисленный XP и максимум, а не подставленный текущий ноль. Отсутствующие `oldScore` / `newScore` не форматируются как оценки.                                                                           |
| `StudentTodayProgressBlock` / `buildParticipantTodayProgress`                                  | Корректно: текущие оценки берутся только из существующих записей `Object.entries(skillScores)` с положительным приростом. Неизвестная дневная история остаётся неизвестной.                                                            |
| `StudentProfilePanels`, `StudentCabinetShell`, `getSectionProgress`, `getLevelProgressPercent` | Корректно: суммарные XP, освоенные навыки, категории и прогресс уровня. Математический ноль для отсутствующего навыка сохранён.                                                                                                        |
| `YourJourneySection`, `JourneyProgress`, `SkillTree`, `journeyUtils`                           | Корректно: агрегаты и названия уже освоенных навыков; индивидуальные отсутствующие баллы не выводятся.                                                                                                                                 |
| `ParticipantLevelPanel`, `ParticipantLevelManager`, `AdminLevelRequests`                       | Корректно: официальный уровень, агрегат текущего этапа, подтверждение и квалификации. Отдельных оценок навыков нет.                                                                                                                    |
| Административные `AdminClientParticipantDetail`, `CanonicalIdentityManager`, списки участников | Индивидуальные баллы не отображаются; поля уровня/профиля не являются оценками упражнений.                                                                                                                                             |
| `SkillConfigManager`, `AchievementsManager`, `AdminSystemSettings`                             | Настройки максимумов/порогов, а не персональные оценки. Изменения не требуются.                                                                                                                                                        |

Отдельных мобильных копий этих списков нет. Изменения применяются к общей адаптивной
разметке; в модалке и деталях радара разрешён перенос увеличившейся подписи.
Сохранены комментарии, сворачивание уровней, закрепление упражнений и скрытие прогресса.

## Изменённые файлы

- `src/lib/i18n/skillScore.ts` — общий форматтер RU/EN.
- `src/features/profile/components/ClientSkillProgressView.tsx`.
- `src/features/profile/components/StudentSkillEvaluationModal.tsx`.
- `src/features/student-cabinet/components/student/StudentDevelopmentPanel.tsx`.
- `src/features/student-cabinet/components/student/SkillRadarChart.tsx`.
- `src/features/student-cabinet/components/student/StudentCoachPanel.tsx`.
- `src/features/student-cabinet/components/student/studentSkillProgress.ts` — только дополнительный признак наличия оценки.
- `src/features/student-cabinet/components/student/studentSkillRadarData.ts` — только дополнительный признак наличия оценки.
- `src/features/student-cabinet/components/student/coachUtils.ts` — только дополнительный признак наличия оценки.
- `tests/unit/skillScoreDisplay.test.tsx` — новый набор проверок пяти интерфейсов и форматтера.
- `tests/unit/developmentHelpers.test.ts` — регрессия порядка, подбора, прироста, сумм и радара.
- `tests/unit/coachUtils.test.ts` — обновлён контракт модели комментария.
- Этот отчёт и генерируемые результаты `graphify update .`.

## Проверки

- PASS — 230 тестов в 12 затронутых/регрессионных наборах приложения.
- PASS — 7 тестов `participantLevelProgression.test.ts` shared-domain.
- PASS — `npx tsc --noEmit`.
- PASS — ESLint всех изменённых TypeScript/TSX-файлов: 0 ошибок, 1 существующее предупреждение `jsx-a11y/label-has-for` у поля причины исправления в модалке.
- PASS — Prettier изменённых файлов.
- PASS — `git diff --check`.
- PASS — независимое ревью; замечания к тестовому harness исправлены и повторно проверены.
- PASS — `graphify update .`: 16072 узла, 46458 связей.
- AUTHENTICATED WORKFLOW: NOT VERIFIED — авторизованный браузерный сценарий не выполнялся; интерфейсы проверены компонентными тестами.

Новые UI-тесты проверяют отсутствие оценки, явный ноль, 1/2/3 балла, динамический
максимум 6, проценты и RU/EN во всех пяти интерфейсах. Завершённое упражнение
по-прежнему исключается из приоритетов. Отдельно проверено сохранение выбранного
нуля без создания оценок для остальных навыков.

Регрессионные наборы: `StudentSkillEvaluationModal`, `studentSkillRings`,
`studentSkillRadarLayout`, `coachUtils`, `developmentHelpers`, `studentNextStepTile`,
`participantLevelPanel`, `studentTodayParticipantProgress`, `achievementsCanonical`,
`journeyCabinetPresentation`, `participantTodayChecklist`, `skillScoreDisplay`.

Первый завершённый прогон дал 229/230: новая проверка суммы ссылалась на внутреннее имя
вместо публичного `overall.earned`. Ожидание исправлено, весь набор
`developmentHelpers` повторно прошёл 5/5. Предыдущие незавершённые запуски остановлены
после обнаружения цикла в новом тестовом harness модалки; стабильные входные объекты
устранили цикл. Продуктовый алгоритм ради этих тестов не менялся.

## Неизменённые контракты и инфраструктура

Формулы XP и прогресса, сортировка/автоматический подбор упражнений, потенциальный
прирост, симуляция, официальные уровни и подтверждения сохранены. `ParticipantProgress`,
рекомендации, домашние задания, команды и persistence не изменены.

- Functions: NO.
- Hosting: YES — клиентские файлы; deploy не выполнялся.
- Firestore Rules: NO.
- Firestore Indexes: NO.
- Migration/Data migration: NO.
- Settings/manual setup: NO.
- Schedulers/triggers: NO.

Commit, push, merge и deploy не выполнялись.
