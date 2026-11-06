# Единая карточка учебного контекста занятия: архитектурный аудит

Дата: 6 ноября 2026. Проект: Carve Academy. Статус: аудит завершён; проект ниже предложен к согласованию, реализация не выполнялась.

Запрошенная ветка: `audit/instructor-lesson-context-card`. Фактическая ветка аудита: `feat/audit-instructor-lesson-context-card`, исходный HEAD `0d30cf6f`; создание запрошенной ветки было отклонено пользователем. Исходное рабочее дерево было чистым. Production/deployed state не исследовался: выводы относятся к текущему исходному коду, а не к наличию функций или исторических документов в production.

## 1. EXECUTIVE SUMMARY

**Архитектура частично готова.** Для объединяющего интерфейса уже есть канонический прогресс Participant, официальные уровни и ступени, оценивание с OCC/idempotency, серверное авторство текущих комментариев, неизменяемая история, рекомендации на Participant × Booking, групповые участники и постраничные домашние задания. Создавать новую систему прогресса, комментариев, рекомендаций или домашних заданий не требуется.

Однако полный предложенный MVP нельзя получить одной композицией существующих hooks:

1. `participant_progress_events` сохраняет историю оценок/текстов, но разрешённого history callable и клиентской пагинации этой истории нет. Наличие сохранённых событий не означает наличия доступного инструктору раздела истории.
2. `skillCommentAttribution` возвращается существующим progress callable по контракту 3, но теряется в `toParticipantProgressView`. Текущий UI показывает комментарии без подтверждённого автора, а не полноценную историю комментариев.
3. Инструктор читает рекомендации только конкретного своего занятия с `Attendance = present`. Чтение рекомендаций других инструкторов и общей истории будущего ученика существующим instructor scope не поддерживается.
4. Домашние задания доступны в разрешённых чатах. Participant-фильтрация аудитории есть, но права на чужой чат из права чтения прогресса не следуют. K-way merge читает первую страницу каждого переданного чата и не имеет общего ограничения числа чатов.
5. Сохраняемой цели конкретного занятия и статуса выполнения домашнего задания в проверенном пути нет.

Рекомендация: адаптивное модальное окно из строки Participant существующей карточки занятия, без нового маршрута; переиспользовать текущие формы действий. Сначала согласовать отдельно историю наблюдений и обмен рекомендациями между инструкторами. Можно независимо реализовать ограниченную версию на текущих правах, но её нельзя выдавать за полный целевой MVP.

Основания: [модель прогресса](../../packages/shared-domain/src/canonical/participantProgress.ts), [запись истории — `stageProgressEvent`](../../functions/src/canonical/progress/participantLevelSupport.ts), [потеря полей в адаптере](../../src/features/participant-progress/applyParticipantProgressToProfile.ts), [feedback read models](../../functions/src/canonical/readModels/participantLessonFeedbackReadModels.ts), [домашние задания](../../src/features/chat/homeworkHistory.ts), [ADR-0011](../adr/0011-instructor-participant-progress-access.md), [документ авторства](../participant-progress-attribution.md).

## 2. EXISTING CAPABILITIES

### 2.1. Прогресс, уровни, упражнения

- Authority — `participant_progress/{participantId}`, `ParticipantProgressSchema`. `skillScores` и `skillComments` — текущее состояние карт по Skill ID, максимум 128 записей; балл — целое 0–100. Нет отдельного прогресса по Booking или дисциплине. Дисциплина занятия берётся из Booking; нельзя называть глобальную оценку подтверждённой именно для лыж/сноуборда без соответствующих данных.
- Официальный уровень — `level`: Beginner/Carve/Performance/Expert, 1–4. `levelState` хранит происхождение и подтверждения/запросы. `calculateParticipantStage` вычисляет текущую ступень, earned/maximum/required, число оценённых навыков и готовность; готовность не является повышением официального уровня. `Participant.skillLevel` и сложность занятия не заменяют mastery level. [Каноническая прогрессия](../../packages/shared-domain/src/canonical/participantLevelProgression.ts), [словарь проекта](../../CONTEXT.md).
- Конфигурация — `settings/skill_config`, серверный `readProgressionConfig`, существующий `SkillConfig`/`DEFAULT_SKILL_CONFIG`. Не переносить пороги/названия/максимумы в новую карточку константами. [Серверное чтение конфигурации](../../functions/src/canonical/progress/participantLevelSupport.ts), [модуль навыков](../../src/domain/achievements/index.ts).
- `getPrioritySkillItems` выбирает незавершённые навыки текущей ступени, учитывает participant Today pins и сортирует по проценту; `getNextStepAction` предпочитает переданную невыполненную рекомендацию, затем предлагает упражнение. Это клиентская подсказка, не назначение инструктора. Helpers принимают `UserProfile` с уже наложенным Participant-прогрессом и Today-данными; инструктору нельзя ради них читать приватный `/users` ученика. Для новой presentational границы нужен узкий вход, вычисления остаются вне JSX. [Helpers](../../src/features/student-cabinet/components/student/studentSkillProgress.ts).
- Пропущенная оценка — отсутствие ключа, явный ноль — присутствующий ключ со значением `0`. Проверять `Object.hasOwn`, использовать `formatSkillScore`; не превращать `undefined` в отображаемый нулевой результат. [Форматирование](../../src/lib/i18n/skillScore.ts), [тесты отображения](../../tests/unit/skillScoreDisplay.test.tsx).
- `dailyProgress` — ограниченный baseline текущего учебного дня `Asia/Almaty`, с флагом полноты. Это не снимок предыдущего занятия: за день возможны несколько занятий/инструкторов. [Модель и `nextParticipantDailyProgress`](../../packages/shared-domain/src/canonical/participantProgress.ts).

Чтение: `queryParticipantProgressReadModels` → `refreshInstructorParticipantProgress` → `useParticipantProgressStore.byId`. Workspace уже получает прогресс подходящих учеников через `useParticipantProgressSync`; клиент делит ID на пачки максимум 32. Это callable-чтения, а не Firestore listeners. [Синхронизация](../../src/features/participant-progress/useParticipantProgressSync.ts), [service](../../src/features/participant-progress/participantProgressService.ts), [отбор ID](../../src/features/participant-progress/instructorProgressParticipantIds.ts), [transport](../../src/lib/canonical/canonicalReadModelClient.ts).

Изменение: существующий `StudentSkillEvaluationModal` → `handleSaveStudentScores` → `updateCanonicalParticipantProgress` → `executeCanonicalCommand`/`update_participant_progress`. Уровни — `ParticipantLevelManager`/`manage_participant_level`. Сохраняются `expectedRevision`, конфликты, correction reason и серверная авторизация; оценочная форма не заменяется новой. [Workspace](../../src/features/instructor-workspace/components/useInstructorWorkspace.ts), [форма](../../src/features/profile/components/StudentSkillEvaluationModal.tsx), [команды](../../functions/src/canonical/progress/participantProgressCommands.ts).

### 2.2. Комментарии и история оценок

**Текущий комментарий.** `skillComments[skillId]` хранит последний текст. `skillCommentAttribution[skillId]` — подтверждённые сервером instructorId/accountId, время изменения текста и revision. Score-only update сохраняет это авторство; реальное изменение текста назначает текущего подтверждённого автора; удаление текста удаляет attribution. `updatedBy` всего агрегата не доказывает авторство каждого комментария. [Схема](../../packages/shared-domain/src/canonical/participantProgress.ts), [обработчик](../../functions/src/canonical/progress/participantProgressCommands.ts), тест `keeps per-text authorship, unknown historical authors, deletion history and replay atomic` в [command tests](../../functions/src/canonical/progress/participantProgressCommands.test.ts).

**История.** `stageProgressEvent` атомарно создаёт `participant_progress_events/{participantId}_{revision}` вместе с изменением прогресса. Событие содержит Participant, `oldScores/newScores`, `oldComments/newComments`, время, revision, commandId, actor, kind, конфигурацию и состояние уровня; для новых assessment-событий — серверный `instructorId`. Поэтому можно вывести изменение текста/оценки по объединению ключей до/после и показать балл в снимке на момент изменения. Включение неизменившегося текста в snapshot не является новым наблюдением. Удаление и missing → 0 тоже требуют сравнения наличия ключей. [Writer](../../functions/src/canonical/progress/participantLevelSupport.ts).

**Ограничения достоверности:**

- `lessonBookingId` в progress command intent/event отсутствует. Нельзя приписать событие ближайшему по времени занятию: в этот день могли быть другие занятия или поздняя корректировка.
- Текущая attribution не хранит балл на момент изменения текста. Пара «нынешний комментарий + нынешний score» не должна подписываться «оценка при наблюдении».
- Старые события могут иметь account actor без подтверждённого исторического Instructor ID; старый текст, перенесённый через snapshot, может иметь неизвестного исходного автора. Текущая связь account ↔ instructor не восстанавливает историческое авторство.
- Нет готового history read model/callable. `participant_progress_events` не открыт клиенту: действует default deny. Полный сырой event также содержит чужие тексты и служебные поля; будущая выдача должна быть безопасной проекцией, а не раскрытием события.

Существующий progress callable уже запрашивается клиентом с `participantProgressContract: 3` и возвращает attribution; `toParticipantProgressView` отбрасывает её, `updatedAt` и `updatedBy`. `getInstructorSkillComments` намеренно возвращает `[]`; `StudentCoachPanel` использует `getUnattributedSkillComments`. Значит, утверждение о готовом UI истории с авторами текущим кодом не подтверждается. Для старого текста корректна подпись «Автор не подтверждён», без угадывания по имени/логам. [Callable](../../functions/src/canonical/readModels/queryParticipantProgressReadModelsCallable.ts), [адаптер](../../src/features/participant-progress/applyParticipantProgressToProfile.ts), [coach helpers](../../src/features/student-cabinet/components/student/coachUtils.ts), [UI](../../src/features/student-cabinet/components/student/StudentCoachPanel.tsx), [тесты отсутствия ложной атрибуции](../../tests/unit/coachUtils.test.ts).

### 2.3. Домашние задания

Authority текущего механизма — сообщения `bookings/{threadId}/messages/{messageId}`, отмеченные `isHomework`. Для группового курса threadId может быть Course ID; имя коллекции не гарантирует существования Booking с этим ID. `ChatMessage` хранит senderId/name, optional senderRole/senderInstructorId, timestamp, текст, attachment и optional `homeworkForParticipantIds`. [Тип](../../src/types/common.ts), [чтение](../../src/features/chat/homeworkHistory.ts), [запись](../../src/features/chat/chatService.ts).

| Проверка | Фактический результат |
|---|---|
| Чтение для Participant | Возможно в разрешённых чатах с `isHomeworkVisibleToStudent(message, participantId)`. Нет самостоятельного server Participant-homework query. |
| Аудитория группы | Пустой/отсутствующий список = всем участникам чата; непустой = перечисленным Participant. Это UI-фильтр, а не разграничение доступа к отдельным сообщениям Rules. |
| Автор | Сохранён senderId; instructor metadata и имя отображаются, но не имеют гарантий progress attribution. Rules на create сверяют senderId с auth.uid, однако не удостоверяют senderName/senderRole/senderInstructorId. Имя/роль нельзя выдавать за серверно подтверждённое авторство. |
| Занятие | Надёжно сохранять threadId из пути. Индивидуальный/семейный thread связывается с Booking; course thread — с Course, без гарантированной связи с конкретным CourseDay. |
| Последние задания | `getHomeworkPage`: `isHomework == true`, timestamp desc, documentId desc, limit 20, составной cursor. Обычная переписка не загружается. |
| Несколько занятий | `createHomeworkHistory` выполняет k-way merge и выдаёт до 20 сообщений, параллельность чтений до 4; сначала нужны heads всех переданных threads. |
| Актуальность | Сохранённой lifecycle active/expired нет. «Последние выданные» допустимо; «актуальные» как подтверждённый статус — нет. |
| Выполнение | Поля выполнения нет. Нельзя показывать done/overdue/not done, выводить результат из возраста задания или из completed recommendations. |

Детали: [семантика аудитории](../../src/domain/chat/chatHomework.ts), [lazy hook с generation/pending](../../src/features/student-cabinet/components/student/useInstructorHomeworkHistory.ts), [Rules](../../firestore.rules) — `canAccessChatMessages` и `match /messages/{messageId}`, [тесты истории](../../tests/unit/homeworkHistory.test.ts), [тесты hook](../../tests/unit/useInstructorHomeworkHistory.test.tsx), [интеграционный тест пагинации](../../tests/integration/homeworkHistory.test.ts).

### 2.4. Рекомендации

`participant_lesson_feedback/{feedbackId}` — существующая каноническая сущность на `(participantId, lessonBookingId)` с детерминированным ID, `instructorId`, `items[{itemId,text}]`, `completedItemIds`, revision и audit. Общей рекомендации на всех участников Booking в этом агрегате нет: у каждого свой документ. `itemId` — ID пункта рекомендации, **не Skill ID**. Структурированной ссылки на навык, срока актуальности, цели будущего занятия или подтверждённой эффективности нет. [Схема](../../packages/shared-domain/src/canonical/participantLessonFeedback.ts).

`participantLessonFeedbackReadModelItemsWithCompletion` выводит boolean completed из сохранённых ID. Выполнение меняет управляющий аккаунт (`account_owner`/`parent_guardian`) командой `set_participant_lesson_feedback_item_completion`; инструктор сохраняет текст через `save_participant_lesson_feedback`. Статус достоверно отражает сохранённую отметку управляющего, а не независимую проверку освоения инструктором. [Service](../../src/features/participant-lesson-feedback/participantLessonFeedbackService.ts), [команды](../../functions/src/canonical/lessonFeedback/participantLessonFeedbackCommands.ts).

Три существующих read scopes:

- `instructor_lesson`: один Participant × конкретный Booking текущего инструктора; начавшееся qualifying занятие + Attendance present именно этого Participant.
- `managed_participant`: история управляемого Participant; максимум 50 уроков, либо явно переданные lesson IDs; клиентского cursor в этом контракте нет.
- `managed_latest`: один последний документ управляемого Participant. Это не универсальный запрос для инструктора и не обязательно последний непустой feedback.

`useParticipantLessonFeedbackStore` кэширует buckets по Participant с generation; instructor editor использует собственный точечный load и локальный draft. Нельзя переиспользовать owner bucket в другой роли как доказательство instructor access. [Read models](../../functions/src/canonical/readModels/participantLessonFeedbackReadModels.ts), [контракт](../../packages/shared-domain/src/canonical/readModels/participantLessonFeedbackReadModel.ts), [store](../../src/features/participant-lesson-feedback/participantLessonFeedbackStore.ts), [editor hook](../../src/features/instructor-workspace/useInstructorParticipantLessonFeedbackEditor.ts).

«Актуальные» в студентском Today — presentation rule: невыполненные пункты и окно 14 дней; это не lifecycle канонической рекомендации. «Предыдущее занятие» нужно выбирать по `lessonStartsAt` до выбранного занятия, а не по времени последнего редактирования. Сейчас инструктор может запросить feedback предыдущего **своего** eligible Booking, если его ID известен; обобщённого запроса «последние рекомендации этого ученика от всех» нет. [Presentation selectors](../../src/features/student-cabinet/studentLessonFeedbackPresentation.ts), [окно](../../src/features/student-cabinet/components/student/studentLessonPresentation.ts).

### 2.5. Расписание, группы, гости и видео

`InstructorWorkspace` уже содержит `InstructorBookingList`/`InstructorBookingCard`, форму оценки, level modal, chat и feedback editor. `InstructorLessonBookingItem` предоставляет ID и revision Booking, время, дисциплину, partyKind, участников с именем/аватаром, происхождение и participant Attendance/actions. Это достаточный вход заголовка новой карточки, без нового чтения account contacts. [Контракт](../../src/features/booking-collaboration/bookingCollaborationContracts.ts), [контейнер](../../src/features/instructor-workspace/InstructorWorkspace.tsx), [строка участника и действия](../../src/features/instructor-workspace/components/InstructorBookingCard.tsx).

- Family/group lesson — один Booking, одна услуга, разные Participant. Уровни/оценки/Attendance/feedback выбираются отдельно; чат может быть общим. Нельзя автоматически брать первого участника из `DisplayBooking.participantId`: открывать по выбранному ID из `participants`.
- Guest — настоящий Participant без обязательного account/selfAccountId. Progress policy проверяет membership/assignment, а не наличие логина ученика. Нельзя связывать гостя по email/имени или подставлять progress плательщика. Существующие read model поля позволяют показать гостя и пустой канонический старт; доступ к chat определяется отдельно. [Progress policy](../../packages/shared-domain/src/canonical/participantProgressAccessPolicy.ts), [контракт Workspace](../../src/features/instructor-workspace/components/useInstructorWorkspace.ts).
- Course group — другой путь: `InstructorCourseSection` использует `instructor-courses`, выбранный CourseDay, enrollment roster и отдельные Attendance commands. Он не является family Booking. Одного course assignment недостаточно для Booking-only progress/feedback guards. Поддержку карточки из course roster вынести в отдельный согласованный этап, без фиктивного Booking. [Course UI](../../src/features/instructor-workspace/components/InstructorCourseSection.tsx), [Booking-only access policy](../../packages/shared-domain/src/canonical/participantProgressAccessPolicy.ts), [feedback identity](../../packages/shared-domain/src/canonical/participantLessonFeedback.ts).
- «Видеоразборы» в проверенном UI — video attachments сообщений, отобранные `getInstructorVideoMessages`; это не отдельная canonical VideoAnalysis с Participant/Skill ID. `useInstructorBookingMessages` подписывается на последние сообщения каждого чата (лимит 100), поэтому старые видео за этим окном могут отсутствовать. Не подключать этот hook для всей истории карточки. [Coach helpers](../../src/features/student-cabinet/components/student/coachUtils.ts), [hook](../../src/features/student-cabinet/components/student/useInstructorBookingMessages.ts), [лимиты](../../src/shared/queryLimits.ts).

Attendance остаётся отдельным factual evidence: отсутствие записи = неизвестно, а не absent. Текущая policy задаёт инструкторское окно от startsAt до endsAt + 24 часа включительно (`evaluateInstructorAttendanceWindow`); overdue/automation eligibility начинается при `now >= endsAt + 24 часа`. Workspace уже показывает admin-required при достижении этой границы. Значит, в точности на deadline окно и overdue имеют разные условия сравнения; новая карточка должна переиспользовать серверные `authorizedActions` и существующее follow-up отображение, не вычислять собственное разрешение и не менять эту семантику. После deadline нельзя подменять missing фактом Attendance ради доступа к feedback. [Policy](../../packages/shared-domain/src/canonical/bookingAttendancePolicy.ts), [Workspace follow-up](../../src/features/instructor-workspace/instructorAttendanceOverdue.ts).

## 3. DATA SOURCE MATRIX

«Изменения» ниже — предложение для будущей реализации, а не выполненные изменения.

| Данные | Канонический / действующий источник | Существующий read model / hook | Доступ инструктору | Требуются изменения |
|---|---|---|---|---|
| Имя, аватар, время, дисциплина | Participant identity projection + canonical Booking | `InstructorLessonBookingItem`, `useInstructorWorkspace` | Назначенное занятие через Workspace read models | Только UI-композиция; не запрашивать `/users` ученика |
| Текущий официальный уровень / ступень | `participant_progress.level/levelState/skillScores`, `settings/skill_config` | `queryParticipantProgressReadModels`, `ParticipantLevelPanel`, `calculateParticipantStage` | Relationship или qualifying confirmed/completed Booking для чтения | UI и узкий VM, без новой authority |
| Оценки навыков | `participant_progress.skillScores` | `useParticipantProgressStore`, `StudentSkillEvaluationModal` | Future read; started Booking для записи | Переиспользовать форму/команду |
| История оценок | `participant_progress_events` | Writer есть; разрешённого reader нет | Прямое чтение закрыто | Bounded server projection, отдельное решение о scope, индекс |
| Текущие комментарии / автор | `skillComments`, `skillCommentAttribution` | Progress RM contract 3; `getUnattributedSkillComments` | Как текущий progress; автор не фильтрует текст по инструктору | Сохранить metadata в VM; отображать неизвестного автора честно |
| История комментариев / score-at-observation | `participant_progress_events.old*/new*` | Готового UI/API истории нет | Прямое чтение закрыто | Тот же history reader, diff и provenance; без новой коллекции |
| Домашние задания | `bookings/{threadId}/messages` с `isHomework` | `getHomeworkPage`, `createHomeworkHistory`, `useInstructorHomeworkHistory` | Только разрешённые чаты, не весь Participant history | UI-переиспользование + явная граница числа chats/покрытия; широкая выдача отдельно |
| Рекомендации / completed | `participant_lesson_feedback` | `queryParticipantLessonFeedbackReadModels`, editor, store | Только exact own eligible lesson; owner scopes недоступны инструктору как инструктору | Для общей prelesson истории нужен новый согласованный instructor read scope |
| Цель занятия | Подходящей сохраняемой Participant × lesson сущности в пути нет | `getNextStepAction` даёт подсказку, не цель | Право назначать цель не определено | В MVP не сохранять; варианты в §5 |
| Видеоразборы | Video attachment сообщения, не отдельная учебная authority | Chat UI / `getInstructorVideoMessages` | По chat/media ACL | В MVP переход в разрешённый чат; обзор истории видео отдельно |

Источники матрицы: [progress RM](../../functions/src/canonical/readModels/participantProgressReadModels.ts), [клиентский VM](../../src/features/participant-progress/applyParticipantProgressToProfile.ts), [event writer](../../functions/src/canonical/progress/participantLevelSupport.ts), [homework](../../src/features/chat/homeworkHistory.ts), [feedback](../../functions/src/canonical/readModels/participantLessonFeedbackReadModels.ts), [Workspace](../../src/features/instructor-workspace/components/useInstructorWorkspace.ts).

## 4. AUTHORIZATION

### 4.1. Разные источники — разные права

| Источник | Действующая проверка | Существенные ограничения |
|---|---|---|
| Current progress, включая текущие чужие комментарии | Auth account active; Instructor ID из account; Participant active; `evaluateInstructorParticipantAccess`; relationship либо assignment + membership в party **и** frozen serviceParty + confirmed/completed + не deleted | Нет фильтра комментариев по автору. Future confirmed даёт чтение; отмена/no_show не даёт этот Booking basis. Прямой Firestore read/write запрещён. |
| Progress/level mutation | Active account/capability, active Participant; обязательный qualifying started Booking, серверное время, OCC/idempotency | Relationship без начавшегося Booking недостаточен. Attendance missing/absent сама по себе не запрещает progress assessment. |
| Progress events / история | Default deny Firestore; reader отсутствует | Текущий доступ к progress нельзя трактовать как уже разрешённую выдачу всей истории. |
| Lesson feedback read | Active auth account, Instructor ID; exact assigned Booking/Participant; started confirmed/completed, не deleted, factual Attendance present | Не читает историю чужого инструктора. `instructor_lesson` reader не загружает Participant lifecycle или ParticipantBlock; не обещать ему те же guards, что у progress. |
| Lesson feedback write | Active actor/capability, active Participant, exact Booking + present Attendance, expectedRevision | Не подменять Attendance значением из lifecycle/времени. Completion — отдельное право управляющего аккаунта. |
| Homework/message read | `canAccessChatMessages`: assigned canonical instructor либо manager участника; для Course — course instructor/access guard; admin отдельно | Нет проверки lifecycle Booking/cancelled/archival/ParticipantBlock в canonical chat ветке; нет per-message target ACL. Чужое занятие с тем же учеником прав не даёт. |
| Video/media | `authorizeChatMedia` на каждой операции: активность account, live/test scope, assignment/management/course access; прямой Storage `/chat/**` закрыт | Не переносить долгоживущие download URLs. Нет автоматического отзыва chat/media при отмене Booking или парном ParticipantBlock в проверенном ACL. |

Основания: [progress read authorization](../../functions/src/canonical/readModels/participantProgressReadModels.ts) — `instructorHasProgressAccess`, [progress callable](../../functions/src/canonical/readModels/queryParticipantProgressReadModelsCallable.ts), [assessment evidence](../../functions/src/canonical/progress/participantProgressAuthorization.ts), [feedback read authorization](../../functions/src/canonical/lessonFeedback/participantLessonFeedbackAuthorization.ts), [feedback callable](../../functions/src/canonical/readModels/queryParticipantLessonFeedbackReadModelsCallable.ts), [feedback commands](../../functions/src/canonical/lessonFeedback/participantLessonFeedbackCommands.ts), [Firestore Rules](../../firestore.rules), [media ACL](../../functions/src/chat/chatMediaAccess.ts), [Storage Rules](../../storage.rules).

### 4.2. Время, отмена, блокировка

| Ситуация | Текущий progress / оценивание | Feedback | Чат/домашние задания |
|---|---|---|---|
| Future confirmed, иных started lessons нет | Чтение да; оценивание нет | Exact feedback недоступен без started + present | Чат назначенного инструктора доступен независимо от начала |
| Наступил startsAt | Чтение/assessment да при остальных guards; время авторитетно на сервере | Только при factual present | Chat ACL не меняется от startsAt |
| Completed qualifying Booking | Чтение и assessment сохраняются без фиксированного срока после занятия | Own lesson с present сохраняет доступ | Пока сохраняется chat authority |
| Cancelled / deleted / no_show | Это занятие не основание progress. Другое eligible занятие или relationship может сохранить чтение; другое started занятие — assessment | Этот Booking не проходит evidence guard | Отмена сама по себе не отзывает canonical chat ACL |
| Активный ParticipantBlock с любой стороны | Закрывает relationship-only access и новую активность; qualifying Booking-scoped доступ сохраняется по ADR-0011 | Reader не проверяет pair blocks; сохраняет exact lesson guard | Pair block не проверяется |
| Instructor account lifecycle не active | Progress/feedback callable отказывает | Отказ | Instructor role branch Rules и media отвергают inactive account; отсутствие lifecycle допускается исторической Rules-политикой |
| Participant lifecycle не active | Progress read/write отказывает | Write отказывает; instructor read не имеет отдельной проверки Participant lifecycle | Canonical chat не проверяет Participant lifecycle |

Важно различать блокировку **пары Instructor–Participant** и деактивацию **аккаунта инструктора**. Не менять принятую политику блоков в рамках UI. Функция `evaluateInstructorParticipantAccess` прямо возвращает `blockedForNewActivity` при сохранённом Booking basis. [Политика](../../packages/shared-domain/src/canonical/accountParticipantAccess.ts), [ADR-0011](../adr/0011-instructor-participant-progress-access.md), [read/write policy tests](../../packages/shared-domain/src/canonical/participantProgressAccessPolicy.test.ts).

Assessment authority сейчас Participant-scoped, а не ограничена выбранным будущим Booking: если у того же инструктора уже есть qualifying started/historical Booking этого Participant, сервер может разрешать оценивание и при открытом будущем занятии. `useInstructorWorkspace.canAssessParticipant` тоже проверяет **любое** подходящее занятие; `InstructorBookingCard` подписывает действие по времени выбранного занятия. Нельзя обещать «перед любым будущим занятием оценка всегда запрещена». Сохранить серверный контракт; при необходимости lesson-specific запрета это отдельное продуктовое решение. [Workspace gate](../../src/features/instructor-workspace/components/useInstructorWorkspace.ts), [lesson gate](../../src/features/instructor-workspace/instructorLessonProgressAssessment.ts), [серверная policy](../../packages/shared-domain/src/canonical/participantProgressAccessPolicy.ts).

### 4.3. Что потребует согласования

1. История наблюдений других инструкторов: определить, достаточно ли действующего progress read basis, какие поля/период/авторы видимы, сохраняется ли доступ после завершения. Предлагаемый history reader должен повторно проверять auth и scope на **каждой странице**, возвращать только выбранный Participant и безопасные строки изменений. Это новое серверное чтение, не изменение Rules на сырые события.
2. Рекомендации прошлых чужих занятий: действующий `instructor_lesson` не подходит. Варианты: ограничить карточку собственными eligible уроками; либо согласовать отдельное чтение учебного feedback по Participant при текущем progress basis. Чтение истории не должно открывать редактирование чужих рекомендаций.
3. Домашние задания чужих чатов: не открывать весь чат ради учебного контекста. Если нужен общий обзор — отдельный согласованный sanitized read model только homework с проверкой аудитории/author evidence, bounded discovery и cursor. Сложность discovery может потребовать производную query-проекцию, но её нельзя выбирать до решения о полноте/правах. Не предлагать collectionGroup scan всей переписки.
4. Выявленная неодинаковая проверка inactive Participant в feedback read и progress read требует отдельного security regression ticket до расширения выдачи. Не исправлена в этом аудите; source finding, а не подтверждённый production incident. Аналогично, assignment чатам и парный блок имеют иной контракт; его нельзя «исправлять» без решения владельца продукта.

Альтернатива всем расширениям: ограниченная карточка с явно обозначенным охватом и состоянием «Нет доступа к этому разделу», без утечки существования/количества скрытых записей. «Недоступно» не должно отображаться как «истории нет».

## 5. ARCHITECTURE GAPS

| Пробел | Минимальное направление | Что не требуется |
|---|---|---|
| Нет history reader | Bounded server read projection поверх существующих events; курсор revision; политика чужих наблюдений; безопасное авторство | Новая таблица комментариев, копия progress, чтение raw audit клиентом |
| Metadata теряется на клиенте | Расширить feature view/adapter только нужными полями attribution/updatedAt | Новая authority или дополнительные progress запросы ради тех же данных |
| Нет instructor-wide feedback history | Только после согласования — новый read scope поверх `participant_lesson_feedback`, сохраняющий write guards | Новые рекомендации на Booking/legacy поля |
| Нет bounded Participant homework discovery | Текущие known authorized threads с честным охватом; общий индексированный обзор отдельно | Полная загрузка сообщений всех уроков |
| Нет достоверного homework completion | Показывать «выдано», автора/дату/материал | Синтетический done/not done |
| Нет progress event → lesson связи | Не показывать название занятия как доказанный факт | Восстановление связи по времени |
| Нет skill-specific feedback link | Текст рекомендации без автоматического сопоставления с Skill ID | Приравнивание itemId к Skill ID |
| Нет course-based progress basis | Отдельный course slice с реальными enrollment/roster/Attendance contracts | Фиктивные Booking или account-level progress |

### Цель занятия: сравнение вариантов

В проверенных Booking/progress/feedback contracts и Workspace нет отдельной сохраняемой цели на выбранный Participant × lesson. `Booking.notes` — общий текст занятия, не структурированная персональная цель с авторством/состоянием; использовать его молча для этой роли опасно для группы. Основания: [Booking contract](../../packages/shared-domain/src/canonical/bookingOccurrenceProposalChange.ts), [Workspace input](../../src/features/booking-collaboration/bookingCollaborationContracts.ts), [feedback schema](../../packages/shared-domain/src/canonical/participantLessonFeedback.ts), [next step](../../src/features/student-cabinet/components/student/studentSkillProgress.ts).

| Вариант | Домен / безопасность | Стоимость / совместимость | Масштабирование / UX / данные |
|---|---|---|---|
| Существующие рекомендации | Итог/совет прошлого урока, не назначенная цель будущего. ACL строже progress | Низкая стоимость показа; не менять persisted semantics | Полезный вход для подготовки; нет Skill ID/срока/цели |
| `getNextStepAction` / priority skills | Вычисляемая подсказка; не решение инструктора. Не читать account Today приватно | Низкая, без миграции; нужен узкий безопасный вход | Подходит для MVP как «Можно повторить»; не обещает персональный план |
| Поле существующего Booking | Нужен participant-keyed контракт, авторство, canonical command, OCC и policy до/после урока | Средняя: изменение общего агрегата и команды; исторические Booking должны оставаться валидны без поля | Уместно для одной цели одного Booking, но изменения участников/отмена/общий revision усложняют UX |
| Отдельная canonical сущность | Явная identity Participant × lesson, собственные права/revision/lifecycle | Наибольшая стоимость, новая persistence/команды/чтение/тесты | Оправдано при нескольких целях, course-day контексте, истории согласования; избыточно для первого экрана |

**Рекомендуется для MVP не сохранять цель.** Показывать приоритетные навыки/разрешённые рекомендации как материалы подготовки с явной подписью подсказки. Это предложение, не принятая новая продуктовая политика.

Если владелец продукта требует сохраняемую единственную цель, сначала рассмотреть optional participant-keyed поле Booking. Минимальные требуемые данные для обсуждения: Participant ID, текст, optional подтверждённые Skill IDs, автор Instructor/account, server updatedAt; Booking даёт lesson identity, текущий aggregate revision даёт OCC. Нужны решения о редактировании до startsAt, видимости управляющему, отмене, смене состава и истории. Только если выбран отдельный aggregate — та же identity `(lessonBookingId, participantId)` плюс собственная revision. Этих сущностей/полей сейчас нет; ничего не добавлено.

## 6. UX OPTIONS

Сравнение выполнено по существующему `InstructorWorkspace`, карточке с participant rows и используемым модальным формам. Визуальное исследование через Stitch не требовалось: новые экраны/макеты не генерировались.

| Критерий | A. Модальное окно | B. Боковая панель | C. Отдельная страница |
|---|---|---|---|
| Соответствие текущему UI | Уже используются evaluation/level/chat/feedback overlays | Новый layout/shell, управление шириной и focus | Новый route, loader и возврат к расписанию |
| Телефон на горе | Одна вертикальная поверхность; понятное закрытие, крупные действия; длинные списки по раскрытию | Узкий drawer неудобен; на телефоне всё равно превращается в overlay | Удобно читать, но выше стоимость перехода и возврата к нужному занятию |
| Планшет | Широкое окно использует экран без сжатия расписания | В landscape удобно сопоставлять; в portrait съедает ширину | Хорошее пространство, но теряется быстрый обзор группы |
| История | Короткая сводка + bounded «Показать ещё» | Тот же компромисс; сложнее длинный текст | Лучше для будущего большого учебного досье |
| Переключение участников | Selector внутри одного окна, явный Participant header | Удобно на desktop, требует адаптации на touch | Нужен route state и защита смены Participant |
| Интеграция | Минимальная, переиспользует modal conventions | Средняя: responsive layout и отдельная проверка accessibility | Наибольшая: новая навигация без доказанной необходимости |

**Предпочтителен A.** Сначала компактная сводка в существующем контексте занятия; отдельную страницу рассматривать только при подтверждённой потребности в большом досье/deep links. На телефоне предусмотреть почти полноэкранный режим именно этой карточки, на планшете — широкую modal surface с одним body scroller и фиксированными заголовком/основным действием.

Основа `AdminModal` уже обеспечивает portal, focus trap/restore, Escape, visualViewport и safe areas. Но его текущий CSS — центрированное окно до 85dvh, **не готовый fullscreen режим**. Адаптацию проектировать локально для карточки, не менять геометрию всех модалок. [Shell](../../src/features/admin/components/AdminModal.tsx), [CSS](../../src/features/admin/components/adminModal.css), [существующая оценочная modal](../../src/features/profile/components/StudentSkillEvaluationModal.tsx).

## 7. RECOMMENDED DESIGN

### 7.1. Вход и состав

В `InstructorBookingCard.renderParticipant` добавить открытие учебного контекста по имени/аватару и явной доступной кнопке. Контейнер `InstructorWorkspace` хранит выбранные `bookingId + participantId`; entity и callbacks разрешает в контейнере. Не создавать отдельную top-level навигацию и не менять existing Attendance/proposal/chat actions.

Предлагаемые, **ещё не существующие** границы:

- `InstructorLessonContextCard` — feature container, собирающий разрешённые sources и состояние действий.
- `useInstructorLessonContext` — владелец загрузки только открытой карточки и развёрнутых разделов; не отдельный persisted domain/store authority.
- `instructorLessonContextContracts.ts` — узкие `*Input`/VM для заголовка, навыков, наблюдений, feedback и homework; callback принимает ID. Полные Booking/UserProfile и сервисы остаются в контейнере.
- Feature-level translation hook для новых детей; использовать существующие токены RU/EN, light/dark. Helpers расчёта и форматирования вне JSX.

Порядок разделов:

1. **Participant и это занятие:** имя/аватар, guest, discipline Booking, дата/время, Attendance factual status, официальный уровень и ступень отдельно. Не подставлять первый Participant группы или данные владельца аккаунта.
2. **Подготовка:** текущие навыки, «не оценено» отдельно от `0`, приоритеты как подсказки; текущие комментарии с provenance, если доступна. Не называть current comments историей.
3. **Последние наблюдения:** только после внедрения разрешённого history reader; дата/автор/Skill ID+label/исторический score/text. Нет доказанной lesson связи — не рисовать её. Пагинация по запросу.
4. **Рекомендации:** явно доступный охват; текущие сохранённые completed/не отмечено, дата исходного занятия. Чтение чужих прошлых уроков только после policy gate.
5. **Домашние задания:** lazy, последние сообщения из доступного охвата; адресат, отправитель, дата, thread/lesson/course context и materials. Не добавлять чекбокс выполнения.
6. **Действия:** открыть существующие оценивание, уровень, exact lesson recommendations editor или разрешённый чат. Для видео использовать переход в чат, без eager media hydration.

Отдельный записываемый блок «Цель» не входит в первую версию. Можно показывать «Подготовка / предложенные упражнения» без сохранения назначения.

### 7.2. Текущее / история / план

| Категория | Примеры | Правило отображения |
|---|---|---|
| Текущее | Official level, текущий score/comment, сохранённый feedback completed | Из текущей authority с явным source scope/временем обновления |
| Историческое | Изменение score/text, выданное homework, recommendation конкретного урока | С датой и provenance; score из события не заменяет current score |
| План / подсказка | Priority exercise, next step, возможная будущая цель | Не подписывать как назначение/выполненную работу инструктора без сохранённого факта |

### 7.3. Действия, группы и ошибки

- Переход в existing evaluation/feedback/chat закрывает либо временно скрывает контекст с сохранением selection/scroll; возврат восстанавливает карточку. Не накапливать три вложенные modal поверхности и не создавать вторую форму оценки. Не терять несохранённый draft при смене Participant.
- `canReadProgress`, `canAssessProgress`, `canReadLessonFeedback`, `canEditLessonFeedback`, `canReadHomeworkThread` независимы; UI-состояние не заменяет server/Rules authorization. Не вводить общий `canEditStudent`.
- Группа: selector только из участников выбранного Booking. При смене синхронно скрыть предыдущие строки, сбросить cursor/drafts/errors и generation; поздний response не должен попасть в новый Participant. Homework с пустой аудиторией обозначить «Для всей группы», targeted — «Для выбранного участника». Shared chat не делает рекомендации/оценки общими.
- Разделы имеют независимые loading/empty/denied/error/partial. Ошибка homework не закрывает progress. Отказ не маскировать пустым списком; retry повторяет только проблемный раздел.
- Кэш не доказательство доступа. На смене account/instructor/test scope, отмене последнего основания или отказе сервера скрыть защищённые данные текущей presentation и инвалидировать соответствующий cache scope. Сейчас progress store объединяет результаты, а не удаляет отсутствующие ID; успешный неполный ответ не должен сохранять видимость старой разрешённой строки. [Store](../../src/features/participant-progress/participantProgressStore.ts), [частичные результаты](../../src/lib/canonical/canonicalReadModelClient.ts).
- До первого startsAt показывать read-only объяснение, затем обновлять action state через существующий `useLessonStartClock`; server time решает запись. Не вводить polling ради часов. Для ранее начавшихся занятий учитывать nuance §4.2.
- Слабая связь на горе: частичная загрузка, локальный retry, видимая давность. Не обещать offline save: каноническая запись остаётся online server command.

## 8. PERFORMANCE

### 8.1. Что уже оплачивается Workspace

| Путь | Фактическая форма | Ограничение / частота / listeners |
|---|---|---|
| Collaboration lessons | `loadAllInstructorLessonBookingPages` вызывает `drainPagedReadModelItems` для `instructor_hot` и `instructor_history` | Страница максимум 25; **полный drain обеих выдач уже существует** при загрузке/refetch. Сам hook не ставит interval polling. Не запускать повторно из карточки. |
| Progress sync | Дедуплицированные Participant ID из уроков/access, chunks ≤32, callable | На изменения зависимостей/маршрута/lesson-start clock; нет realtime listener и постоянного interval. Загружает ряд учеников до открытия карточки. |
| Progress server authorization | Participant/relationship/blocks/management + scoped Booking evidence | Read evidence pages по 50, stop at first valid; при malformed/deleted matches может прочитать несколько страниц вплоть до исчерпания scoped выдачи. Write evidence batches 25 со startsAt filter и transaction budget. Это не постоянный исторический scan всех пользователей. |
| Chat unread | `useBookingChatUnread` → один `subscribeToChatMessages` на уникальный watched thread | Каждый listener ограничен последними 100 messages; число threads растёт с watched lessons. Это существующая нагрузка, карточка не должна дублировать её. |
| Feedback | Exact instructor editor query при открытии; managed history отдельно | Instructor: point reads Booking/Attendance/feedback; managed: query limit 50 без cursor. Карточке нельзя запускать owner history. |

Основания: [read sync/drain](../../src/features/booking-collaboration/useBookingCollaborationReadSync.ts), [Booking page bounds](../../packages/shared-domain/src/canonical/readModels/lessonBookingReadModel.ts), [progress sync](../../src/features/participant-progress/useParticipantProgressSync.ts), [evidence queries](../../functions/src/canonical/progress/participantProgressAuthorization.ts), [unread listeners](../../src/features/student-cabinet/useBookingChatUnread.ts), [message limit](../../src/features/chat/chatService.ts), [query limits](../../src/shared/queryLimits.ts).

### 8.2. Предлагаемый бюджет добавочной загрузки

Ниже число логических клиентских запросов, **не оценка оплачиваемых document reads**. Auth/topology reads, размер событий, пустые запросы и повторные страницы не позволяют честно назвать точную цену по одному коду.

| Операция | Добавочные запросы | Новые listeners |
|---|---|---|
| Открыть заголовок/skills с актуальным разрешённым Workspace cache | 0; при отсутствии/нужной revalidation — 1 progress callable для выбранного Participant | 0 |
| Текущие author metadata | 0 дополнительных к progress после исправления адаптера | 0 |
| Раскрыть историю после отдельной реализации | 1 callable/page; предложение limit 20 событий + lookahead 1, revision cursor | 0 |
| Exact own feedback | 1 callable для явно выбранного eligible lesson; не N запросов по всей истории | 0 |
| Homework одного thread | 1 `getHomeworkPage`, максимум 20 messages; ещё 1 на load more | 0 |
| Общая homework история T threads | Первая страница требует минимум T page calls; до 20 документов на каждый thread, параллельность ≤4; refill возможен даже внутри одной merge page | 0 |
| Перейти в existing chat | Нагрузка existing chat lifecycle; карточка не подписывается заранее | Не добавлять отдельный listener карточки |

Для history page 20 events не гарантируют 20 комментариев: события могут содержать только изменение уровня или сразу много skills. Не drain-ить последующие события автоматически, чтобы наполнить фиксированное число строк; возвращать cursor/hasMore, ограничивать payload и использовать правило «изменения за страницу». Двухснимочные события могут быть крупными: limit по документам не заменяет контроль байтов/минимальной проекции.

Для домашней истории нельзя называть текущий merge «20 reads всего»: он выдаёт до 20 сообщений после fan-out. В версии на нынешних правах предложен выбор доступного занятия/чата и его page, а не автоматический fan-out всей истории. Это ограничивает полноту и должно быть видно («Задания этого занятия» / выбор другого доступного занятия). Если нужен именно глобальный chronological top-N Participant, сначала нужен согласованный bounded discovery/index design; обрезать chats молча нельзя.

Для целевого расширенного MVP с одним выбранным homework thread и новым history reader: холодная загрузка progress + history + exact eligible feedback + homework = **до 4 независимых логических начальных запросов**, распределённых по раскрытию разделов; без feedback eligibility этот запрос вообще не выполняется. Это условный бюджет предложения, не текущая готовая реализация. Новый общий feedback history endpoint, если согласован, заменяет exact history fan-out и должен иметь собственный page budget.

### 8.3. Загрузка и кэш

После проверки source scope можно параллельно читать progress и независимые разрешённые разделы; не строить последовательный waterfall. Homework/history — только при раскрытии. Existing current progress брать из общего store с revalidation по необходимости; один owner загрузки, ключ `(accountId, instructorId, readScope, participantId, bookingId, section, cursor)` там, где эти измерения влияют на результат. `canonicalReadModelClient` уже дедуплицирует одинаковые **in-flight** reads с auth/session key; после resolve это **не result cache**. [Transport](../../src/lib/canonical/canonicalReadModelClient.ts).

Не добавлять глобальный history listener, interval polling или scheduler. Refresh после успешной команды и явный retry/refresh достаточны для первой версии; проверка доступа всё равно выполняется сервером при каждом чтении/записи. Без real-time сигнала внешняя отмена не может мгновенно стереть уже показанные данные: это ограничение нужно проверить/согласовать, а не обещать мгновенный отзыв. Перед возвратом к карточке после ухода приложения в фон предусмотреть revalidation.

Индексы: homework index уже описан (`isHomework`, timestamp desc, __name__ desc, COLLECTION); feedback participant/date index тоже есть. Индекса events для предлагаемого Participant+revision запроса в manifest нет. Точный live/test индекс нового reader вывести из окончательного server-filtered query (например Participant + dataScope + optional testSessionId + revision desc), проверить contract/emulator и дождаться READY перед dependent Functions deploy. Не объявлять новый индекс уже существующим. [Manifest](../../firestore.indexes.json).

Наблюдаемые существующие full drains и unread fan-out — отдельные optimization opportunities. Не включать их глобальный рефакторинг в карточку; достаточно не умножать нагрузку. Для общего homework обзора bounded discovery является непосредственной зависимостью, а не опциональной оптимизацией.

## 9. MVP SCOPE

### Ограниченная версия на текущих правах (MVP-0)

Возможна без расширения серверной авторизации:

- Participant/занятие, официальный уровень и ступень, навыки с missing/zero.
- Последние **текущие** тексты комментариев; confirmed attribution после узкой доработки адаптера, без выдуманного score-at-comment.
- Разрешённые рекомендации выбранного собственного started/present занятия; для будущего урока — честное unavailable, при наличии прошлого eligible собственного урока явный выбор его контекста.
- Homework выбранного доступного чата с 20-message pagination и переходом к другим известным доступным занятиям; без обещания всей истории и без статуса выполнения.
- Переходы к existing evaluation/level/feedback/chat actions; read-only до возникновения assessment authority.

Это полезный первый независимый slice, **но не весь запрошенный MVP**, потому что последние исторические наблюдения и общая prelesson история рекомендаций пока недоступны.

### Целевой минимальный MVP после policy gates

К MVP-0 добавить bounded последние изменения оценок/комментариев из существующих events. Если продукт подтверждает межинструкторский доступ, добавить bounded разрешённые прошлые рекомендации с текущими completion flags. Для homework либо явно принять охват доступных чатов, либо реализовать отдельно согласованную учебную выдачу без полного чата. Ни одного нового агрегата обучения для этого не требуется.

Не входят: новая сохраняемая цель, AI, автоматический план, video analytics, новая оценочная форма, автоматические связи recommendation→Skill/observation→lesson, придуманное выполнение homework. CourseDay entry — отдельный этап, не заявлять parity с family Booking до проверки course access contract.

## 10. IMPLEMENTATION PLAN

Это план после согласования; все этапы ниже **NOT IMPLEMENTED**. Один этап — отдельный небольшой PR, без commit/deploy в рамках аудита.

### P0 — Зафиксировать права и охват

- **Цель:** решить вопросы §13; подтвердить MVP-0/целевой MVP, границы чужой истории, homework полноту и course scope. Отдельно оформить выявленную lifecycle асимметрию feedback read.
- **Изменяемое:** этот design/релевантная access ADR после принятия; без продуктового кода на этапе решения.
- **Read models / Functions / Rules / indexes:** нет в самом P0. Не обещать автоматическое наследование progress ACL другим данным.
- **Риски:** незаметное расширение приватности; неполный MVP назван полным.
- **Проверка / готовность:** подписанная матрица прав и видимости, сценарии отмены/блоков/завершения, принятые границы охвата. Зависимостей нет; блокирует только соответствующие расширения, не анализ/дизайн.

### P1 — Сохранить current progress provenance в feature view

- **Цель:** не терять attribution/updatedAt существующего contract 3 и подготовить узкий current-context VM.
- **Изменяемое:** `applyParticipantProgressToProfile.ts`, feature contracts/selectors и их unit tests; не расширять UserProfile authority/редактирование.
- **Read models:** только клиентский VM; серверный контракт уже есть. **Functions / Rules / indexes:** нет.
- **Риски:** attribution ошибочно унаследована от aggregate updatedBy; старому тексту назначен автор; cache другого account/Participant.
- **Проверка:** source contract 1/2/3 compatibility, missing attribution, score-only update, переключение Participant, unknown skill, zero. **Готовность:** подтверждённые metadata доходят до нового narrow VM без второго запроса и без изменения canonical commands. Независим от решения о полной истории.

### P2 — Карточка-контейнер в Workspace и существующие действия

- **Цель:** MVP-0 header/current skills/comments и transitions из participant row.
- **Изменяемое:** `InstructorWorkspace.tsx`, `useInstructorWorkspace.ts`, `InstructorBookingCard.tsx`, новые feature-local card/contracts/translation hook; локальный responsive modal style. Existing evaluation/level/feedback/chat forms переиспользуются.
- **Read models:** новая presentation composition, без новой persistence. **Functions / Rules / indexes:** нет.
- **Риски:** nested dialogs, lost draft, stale cache, legacy broad model props, смешивание участников, неверный before-start label при historical authority.
- **Проверка:** UI unit/component tests, relevant typecheck/build; authenticated mobile/tablet flow, RU/EN/light/dark, keyboard/focus/back. **Готовность:** один выбор Participant, независимые loading/error/denied, отсутствие дубля оценки/listeners, сохранилась текущая UX capability parity. Зависимость: P1 для author UI, P0 для согласованного названия/охвата MVP.

### P3 — Bounded history projection поверх existing events

- **Цель:** последние реальные изменения scores/comments с подтверждённым provenance и cursor.
- **Изменяемое:** новый shared read contract, Functions read handler/projection/export, client service/section, index manifest. `stageProgressEvent` и модель прогресса не меняются ради карточки.
- **Read models:** новый server reader, без новой истории/dual write. **Functions:** новая read callable (рабочее предлагаемое имя `queryParticipantProgressHistoryReadModels`, имени сейчас нет). **Rules:** нет, raw events остаются закрыты. **Indexes:** да, окончательные формы live/test participant+revision определить и зафиксировать до реализации.
- **Риски:** broad history grant, старое неизвестное авторство, крупные snapshots, diff missing/zero/deletion, выдача других Participant, некорректная lesson attribution.
- **Проверка:** policy/handler tests, cursor ties/replay, bounded query & payload, scoped emulator/index tests, Rules negative raw-event test, клиентские page/race tests. **Готовность:** повторная авторизация каждой страницы, серверная минимальная проекция, bounded events/page без drain, неизвестные авторы обозначены. Зависимость: P0; UI section интегрируется с P2. По безопасности отдельный независимый review реализации.

### P4 — Homework в принятом доступном охвате

- **Цель:** lazy pages выбранного authorized thread и корректная группа/Participant фильтрация.
- **Изменяемое:** новый section/container; переиспользование `homeworkHistory.ts`, hook и homework visibility helpers; не менять message authority.
- **Read models:** нет нового server RM для варианта «выбранный чат». **Functions / Rules / indexes:** нет; existing homework index. Для общего обзора чужих чатов нужен **отдельный P4b после P0**, с собственным server projection/discovery/index design; не прятать его внутри frontend задачи.
- **Риски:** необозначенная неполнота, fan-out всех threads, client metadata выдана за verified author, targeted сообщение другого Participant, denied спутан с empty.
- **Проверка:** существующие pager/hook tests + новая selection integration, >20 targeted/shared messages, permission denial, stale response, duplicate IDs across threads, lazy no-read-when-closed. **Готовность:** ≤20 messages/query, явный охват, без обычной переписки и новых listeners; нет выдуманного completion. Зависимость: P0 (охват), P2 (entry/section).

### P5 — Recommendations section и, при согласовании, prelesson history

- **Цель:** сначала exact eligible own lesson display + transition в existing editor. Межинструкторскую history выдачу делать отдельным PR после policy gate.
- **Изменяемое:** feature view/section, reuse `participantLessonFeedbackService`/selectors/editor. Для истории — shared read scope и `participantLessonFeedbackReadModels.ts`, cursor contract/client.
- **Read models:** существующий exact scope для базового варианта; новый bounded instructor history scope только при согласовании. **Functions:** базово нет; расширение — `queryParticipantLessonFeedbackReadModels`. **Rules:** нет. **Indexes:** базово нет; для нового query проверить окончательные filters/order/cursor, при необходимости добавить scope/instructor fields в index, не объявлять существующий индекс достаточным заранее.
- **Риски:** обход present gate, чтение чужого feedback, inactive Participant read, completion как «инструктор подтвердил», N+1 по урокам, прошлый урок выбран по updatedAt.
- **Проверка:** точная identity, группы, completion flags, owner-vs-instructor isolation, started/present, cancelled/no_show, lifecycle, bounded history pages. **Готовность:** точный охват/права, нет новых write paths, нет client mutation completion от имени инструктора. Зависимость: P0/P2; permission расширение должно получить независимый review.

### P6 — Интеграционный gate и отдельные дальнейшие slices

- **Цель:** закрыть lifecycle/group/cache/performance/mobile parity всех принятых частей.
- **Изменяемое:** targeted integration/emulator/E2E tests и найденные дефекты карточки; только затронутые docs.
- **Read models / Functions / Rules / indexes:** только фактический итоговый diff P1–P5; новых по определению P6 нет.
- **Риски:** внешняя отмена в открытом окне, auth switch, partial source outage, повторные reads, незавершённые действия.
- **Проверка / готовность:** матрица §12, независимый review реализации; authenticated runtime, target checks/typecheck/build. Не считать аудиторские тесты независимым review будущего кода. Зависимости: принятые P1–P5.
- **Дальше отдельно:** CourseDay context с enrollment-specific access; сохраняемая цель только после продуктового решения; видеообзор после bounded query design. Не включать AI/аналитику и глобальную оптимизацию Workspace в этот PR.

При реализации, меняющей read/data flow/authorization, один Graphify update ближе к завершению каждого соответствующего slice. Для **данного документа** продуктовая архитектура/исходники не изменены, refresh не требуется. Будущий deploy определяется финальным diff; новые индексы READY раньше зависимых Functions, затем Hosting. В этом аудите deploy отсутствует.

## 11. RISKS

| Риск | Последствие / сдерживание |
|---|---|
| Принять progress read за доступ ко всем sources | Раскрытие чужой переписки/рекомендаций. Раздельные scopes и P0 gates. |
| Объявить историю уже реализованной | UI опирается на несуществующий reader. Использовать существующие events, добавить bounded projection отдельно. |
| Ложное авторство и время | Не приписывать current text последнему оценившему, старый текст actor события или событие ближайшему уроку. |
| Неодинаковые lifecycle guards | Feedback instructor read не проверяет Participant active отдельно; chat ACL иной. Явный security ticket, не молчаливое расширение. |
| Revoked access и кэш | Store merge сохраняет старые строки; очистка presentation/authorization scope и revalidation обязательны. Загруженное ранее нельзя мгновенно отозвать без сигнала. |
| Fan-out истории | K-way merge требует heads всех chats; existing lessons full drain + unread listeners могут быть велики. Карточка не умножает это, общий обзор требует bounded discovery. |
| Смешение family/group и Course | Booking identity/права не распространяются на enrollment/CourseDay. Отдельный contract/slice. |
| Official level vs initial classification/XP | «Готов к следующей ступени» не повышение. Использовать canonical stage/level, не calculated UI level. |
| Mobile / плохая сеть | Длинная история, вложенные overlays, потеря drafts. Один контекст, lazy pages, независимые retry и честная давность. |
| Deployment / retention неизвестны | Код не доказывает production экспорт/доступность или полноту исторических events. Не планировать backfill/миграцию как факт. |

## 12. TEST STRATEGY

### 12.1. Проверки будущей реализации

| Сценарий | Уровень / ожидаемый результат | Существующая опора |
|---|---|---|
| Будущий первый ученик | Handler + UI: progress виден, assessment недоступен | `participantProgressReadModels.test.ts`, `participantProgressAccessPolicy.test.ts` |
| Момент startsAt и открытая карточка | Command server-clock boundary + UI timer, доступ появляется без reload | `participantProgressCommands.test.ts`, `instructorLessonProgressAssessment.test.ts` |
| Есть старый started/completed lesson, открыт будущий | Не объявлять глобальный запрет assessment; следовать реальной authority §4.2 | `useInstructorWorkspace.canAssessParticipant`, command policy tests |
| Cancelled / deleted / no_show | Это Booking basis не даёт progress/feedback; независимое основание проверено отдельно | `participantProgressReadModels.test.ts`, access policy tests |
| Account inactive / Participant inactive / парный block | Account denial; Participant progress denial; booking exception для пары сохранён. Отдельно test feedback read asymmetry/принятое решение | `accountParticipantAccess.ts`, ADR-0011, `tests/firestore.rules.test.ts` |
| Исторический score и current score различаются | UI показывает current из progress, old observation из event; отсутствие ключа ≠ ноль | command tests, `skillScoreDisplay.test.tsx` |
| Авторы A/B, score-only save, comment edit/delete | Подтверждённый per-text автор, unknown historical author, event diff без дубликатов | `participantProgressCommands.test.ts`, `coachUtils.test.ts` |
| История страниц / большой event / unknown skill | Cursor без пропусков/повторов, bounded docs/байты, ID fallback label, нет auto-drain | Новый reader tests поверх `stageProgressEvent` fixtures |
| Homework разных уроков и shared Course thread | Глобальный порядок только внутри принятого охвата; message ID не уникален между threads; >20 сообщений | `homeworkHistory.test.ts`, `tests/integration/homeworkHistory.test.ts` |
| Homework sender metadata / completion | Не выдавать client role/name за verified author; completion control отсутствует | `tests/firestore.rules.test.ts`, `chatHomework.test.ts` |
| Рекомендации разных дат/авторов | `lessonStartsAt`, сохранённый completed, latest ≠ current lifecycle; чужой instructor scope запрещён | `participantLessonFeedbackReadModels.test.ts`, `studentParticipantLessonFeedback.test.ts` |
| Family/group с разными уровнями / Attendance | Индивидуальные progress/feedback; shared/targeted homework; один Booking остаётся одним | feedback read tests, `chatHomework.test.ts`, command group tests |
| Guest без account | Выбор canonical Participant, пустой canonical start, никаких account fallback | progress read model fixtures + новые Workspace scenario tests |
| Course enrollment | Не открывать Booking-only authority по course assignment; отдельные course cases после утверждения slice | `InstructorCourseSection`, `instructorCourseRosterReadModels` tests |
| Быстрое A → B, logout/account/test-session switch | Нет flash/race данных A, cursor/draft/error scope очищен; late request игнорируется | `useInstructorHomeworkHistory.test.tsx`, `cabinetProgressParticipantSwitching.test.tsx` |
| Утечки / прямые reads | Raw progress/events/feedback закрыты Rules; spoofed IDs/roles не расширяют callable scope | `tests/firestore.rules.test.ts`, progress/feedback read tests |
| Нет лишних запросов/listeners | Closed sections = 0 reads; same-key in-flight dedupe; повторное открытие по cache policy; card +0 listeners; cleanup при close | `useInstructorHomeworkHistory.test.tsx`, `canonicalReadModelClient` counter |
| RU/EN и темы | Тексты, даты, skill labels, unknown/denied states; контраст light/dark | Targeted UI fixtures/i18n check |
| Телефон/планшет | 360–430 px, tablet portrait/landscape, safe areas, touch targets, keyboard, focus/back/scroll | Authenticated Playwright/manual runtime, modal component tests |
| Частичная недоступность | Progress жив при homework error; denied ≠ empty; retry не дублирует страницы; offline save не обещан | pager/hook tests + новые card section tests |

Точные существующие файлы: [progress read tests](../../functions/src/canonical/readModels/participantProgressReadModels.test.ts), [progress command tests](../../functions/src/canonical/progress/participantProgressCommands.test.ts), [progress policy tests](../../packages/shared-domain/src/canonical/participantProgressAccessPolicy.test.ts), [feedback read tests](../../functions/src/canonical/readModels/participantLessonFeedbackReadModels.test.ts), [feedback policy tests](../../packages/shared-domain/src/canonical/participantLessonFeedbackAccessPolicy.test.ts), [homework pager tests](../../tests/unit/homeworkHistory.test.ts), [homework hook tests](../../tests/unit/useInstructorHomeworkHistory.test.tsx), [coach provenance tests](../../tests/unit/coachUtils.test.ts), [assessment gate tests](../../tests/unit/instructorLessonProgressAssessment.test.ts), [Rules tests](../../tests/firestore.rules.test.ts).

### 12.2. Что выполнено в аудите

Минимальная диагностика использовала **существующие** tests для подтверждения спорных read/write/provenance/pagination contracts; новые tests не писались.

```powershell
node scripts/runVitest.mjs --config functions/vitest.config.ts functions/src/canonical/readModels/participantProgressReadModels.test.ts functions/src/canonical/readModels/participantLessonFeedbackReadModels.test.ts functions/src/canonical/progress/participantProgressCommands.test.ts --reporter=dot

node scripts/runVitest.mjs --config vitest.config.ts tests/unit/homeworkHistory.test.ts tests/unit/useInstructorHomeworkHistory.test.tsx tests/unit/coachUtils.test.ts tests/unit/instructorLessonProgressAssessment.test.ts --reporter=dot
```

- **PASS:** Functions — 3 файла, 62 tests; client — 4 файла, 31 test. Оба процесса завершились с кодом 0; egress ledger — 0 attempts.
- **PASS:** Graphify query использован для навигации; существенные выводы проверены исходниками. Graph output ограничен budget 3000 и не использовался как доказательство отсутствия функций. CLI предупредил о несовпадении версии глобальных skills (0.9.50) и пакета (0.9.62); обновление окружения не выполнялось.
- **NOT RUN:** emulator/Rules/E2E/build/typecheck: продуктовый код не менялся, source analysis + targeted existing tests достаточны для документа. Упомянутые emulator/Rules tests прочитаны как контракты, не заявлены выполненными.
- **AUTHENTICATED WORKFLOW: NOT VERIFIED:** защищённые маршруты не открывались, runtime новой карточки отсутствует. UX-рекомендация основана на текущем UI-коде, а не на проведённом полевом usability test.
- Независимый review будущей реализации остаётся обязательным; эти проверки не считаются таким review. Аудит не является implementation ticket и не запускал отдельных reviewer agents.

## 13. OPEN QUESTIONS

Решения нужны **до соответствующей реализации**, а не для признания аудита завершённым:

1. Разрешать ли назначенному инструктору до урока историю наблюдений других инструкторов? Достаточен ли любой current progress basis, какой период/поля/авторы и срок доступа после занятия? Альтернатива — current comments и ограниченная собственная история.
2. Разрешать ли общую Participant-историю рекомендаций до урока, несмотря на нынешний exact lesson + present gate? Если да, сохраняется ли только чтение и требуется ли отдельная политика inactive Participant? Не расширять write authority.
3. Домашние задания: принять явно ограниченный охват доступных/выбранных чатов или нужен общий обзор в том числе чужих уроков? Во втором случае определить видимые поля/аудиторию и bounded discovery. Полный доступ к переписке не является необходимым следствием.
4. Нужна ли сохраняемая **цель конкретного занятия** уже в первой версии? Кто её задаёт/видит/меняет, до начала или после, индивидуальна ли она в группе, что происходит при отмене/смене состава? Пока предложено ограничиться подсказками без назначения.
5. Включать ли CourseDay в первый релиз? Текущие progress/lesson-feedback guards ориентированы на Booking. Для Course нужны реальные enrollment/day authorization и отдельная identity, без придуманного Booking.
6. Должна ли кнопка assessment в контексте будущего урока учитывать любую уже имеющуюся started Booking authority (как сервер сейчас) или требуется новый запрет именно выбранного урока? Последнее меняет политику, а не только UI.
7. Достаточно ли честного «Отправитель» для homework с неподтверждёнными instructor metadata? Если обязательно verified instructor authorship, нужен отдельный контракт удостоверения без backfill по именам.
8. Нужна ли гарантированная связь наблюдения с занятием в следующем этапе? Сейчас её нет; нельзя восстановить достоверно из timestamp. Это отдельное изменение command/event contract, не условие чтения существующей истории.

**Итог аудита: DONE.** Предложена архитектура без дублирования authority, выбрано место в существующем интерфейсе, определены текущие ограничения и отдельные policy gates. **Реализация карточки: NOT IMPLEMENTED. DEPLOY IMPACT: NONE.** Functions/Hosting/Rules/Indexes/Migration/Settings/Schedulers в рамках этого аудита не изменялись.
