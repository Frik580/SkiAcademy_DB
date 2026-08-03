<div align="center">
  <img src="https://storage.yandexcloud.net/carve/wall.webp" alt="Баннер Carve Academy" style="width: 100%; max-width: 900px; height: auto; border-radius: 8px;" />
  <h1 style="margin-top: 1.5rem;">Carve Academy</h1>
  <p>
    <strong>Система бронирования уроков и курсов для горнолыжной школы</strong>
  </p>
  <p>
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" />
    <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  </p>
</div>

## О проекте

**Carve Academy** — SPA для горнолыжной и сноубордической школы: бронирование уроков и курсов, личный кабинет ученика с прогрессом навыков, рабочее место инструктора и админ-панель. Бэкенд — Firebase (Auth, Firestore, Storage); бизнес-логика и UI на React + TypeScript.

---

## Ключевые возможности

### Для клиентов

- Регистрация / вход (Email или Google)
- Каталог инструкторов и групповых курсов с фильтрами
- Бронирование, перенос и отмена занятий
- Личный кабинет: история, навыки, достижения, чат по занятию
- Симулированный кошелёк (demo top-up)
- Интерфейс **EN / RU**

### Для инструкторов

- Рабочее место: расписание, ученики, оценка навыков, рекомендации

### Для администраторов

- Финансовая сводка, расписание, CRUD инструкторов / курсов / клиентов
- Подтверждение и отмена бронирований, привязка гостевых заявок
- Настройки курорта, hero-слайдер, матрица навыков, достижения

---

## Технологический стек

| Слой     | Технологии                                  |
| -------- | ------------------------------------------- |
| UI       | React 18, TypeScript, Vite                  |
| Стили    | Tailwind CSS 4 (alpha), CSS variables       |
| Анимации | Motion                                      |
| Backend  | Firebase Auth, Firestore, Storage           |
| i18n     | EN / RU (`src/lib/i18n/translations.ts`)    |
| Тесты    | Vitest, Testing Library, Firebase emulators |

---

## Быстрый старт

### Требования

- Node.js 18+
- npm
- Проект Firebase

### Установка

```bash
git clone https://github.com/your-username/SkiAcademy_DB.git
cd SkiAcademy_DB
npm install
cp .env.example .env
# заполните .env значениями из Firebase Console
npm run dev
```

Приложение: **http://localhost:3000**

---

## Скрипты

| Команда                 | Описание                                        |
| ----------------------- | ----------------------------------------------- |
| `npm run dev`           | Dev-сервер (порт 3000)                          |
| `npm run build`         | Type-check + production build                   |
| `npm run lint`          | ESLint + `tsc --noEmit`                         |
| `npm run test:unit`     | Unit-тесты (Vitest)                             |
| `npm run test:coverage` | Coverage для `src/lib/` и `studentCabinetUtils` |
| `npm run test:rules`    | Firestore security rules (emulator)             |
| `npm run test`          | Полный набор тестов                             |
| `npm run i18n:check`    | Проверка паритета ключей en/ru                  |

---

## Безопасность кошелька

Баланс (`balanceUSD`) **нельзя** произвольно изменить с клиента:

- **Списание** — только уменьшение баланса (оплата бронирования / курса)
- **Пополнение и возврат** — через поле `pendingWalletCredit` и `src/lib/walletCredit.ts`
- **Админ** — может корректировать профили клиентов через правила Firestore

Подробнее: `firestore.rules` (секция `users`).

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) на каждый push/PR в `main`:

1. `npm run lint`
2. `npm run i18n:check`
3. `npm run test:unit`
4. `npm run test:coverage`
5. `npm run build`

---

## Демо-аккаунты

- **Клиент**: зарегистрируйтесь через UI — стартовый баланс $250
- **Админ**: в Firebase Console создайте пользователя, затем документ `users/{uid}` с `role: 'admin'`; для управления ролями — `systemRole: 'owner'`

> Не храните реальные пароли в репозитории.

---

## Структура проекта

```
src/
  components/     # UI (admin/, personal_cabinet/, instructor_workspace/)
  lib/            # Бизнес-логика, Firebase, i18n, транзакции
  types.ts        # Доменные типы
tests/
  unit/           # Unit-тесты
  integration/    # Firestore emulator
  firestore.rules.test.ts
```
