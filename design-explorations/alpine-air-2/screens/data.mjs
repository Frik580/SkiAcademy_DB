/**
 * Alpine Air 2.0 — explicit screen-by-screen redesign destinations.
 * One entry per discovered product surface. No category-level shortcuts.
 */
import {
  card, dark, label, h2, pageHeader, stats, list, table, kv, alert, empty, loadingCard,
  slots, participants, btn, chip, chipRow, avatar, mono,
} from './lib.mjs';

const P = (on = true) => participants([
  { i: 'АС', name: 'Артём', sub: 'Горные лыжи · это вы', on: on, k: '' },
  { i: 'ЕС', name: 'Ева', sub: '9 лет · детская программа', on: false, k: 'avatar-gold' },
  { i: 'МС', name: 'Максим', sub: 'данные не заполнены', on: false, k: 'avatar-slate' },
]);

const bookingStates = [
  { t: 'Ожидает', k: 'chip-gold' },
  { t: 'Подтверждён', k: 'chip-pine' },
  { t: 'Ожидает отмены', k: 'chip-accent' },
  { t: 'Отменён', k: '' },
  { t: 'Проведён', k: 'chip-pine' },
  { t: 'Неявка', k: 'chip-flame' },
];

export const SCREENS = [
  /* ======================= PUBLIC / GUEST ======================= */
  {
    id: 'public-home', role: 'public', name: 'Главная (единая страница)', route: '/',
    states: 'полная · без отзывов · курс без записи · загрузка',
    notes: 'Публичные секции работают как состояния одной страницы, а не роуты. Сохранено как есть; роутизация — отдельное предложение.',
    body: `
      ${pageHeader({ eyebrow: 'Горнолыжная школа · Алматы', title: 'Уверенность начинается здесь', sub: 'Пошаговое обучение с самого первого занятия. Индивидуальные занятия и группы, честная цена, бронирование без переписки.', actions: [{ t: 'Начать свой путь', k: 'btn-primary' }, { t: 'Подобрать курс', k: 'btn-ghost' }] })}
      ${card(`<div class="cols-4">
        <div>${label('Температура')}<div class="stat-v">−12°C</div><div class="tiny mt-4">ощущается −17°C</div></div>
        <div>${label('Снег')}<div class="stat-v">42 см</div><div class="tiny mt-4">свежий 18 см</div></div>
        <div>${label('Подъёмник')}<div class="stat-v" style="color:var(--pine)">Работает</div><div class="tiny mt-4">ветер 4 м/с</div></div>
        <div style="background:var(--accent-soft);padding:14px;border-radius:var(--r-sm)">${label('Ближайший слот')}<div class="stat-v" style="color:var(--accent-ink)">14:30</div><div class="tiny mt-4">7 свободно</div></div>
      </div>`, { pad: 'pad-24' })}
      <h2 class="d3 mt-40">Путь к мастерству</h2>
      <div class="cols-4 mt-16">
        ${['НАЧИНАЮЩИЙ|0 XP', 'КАРВИНГ|100 XP', 'МАСТЕРСТВО|250 XP', 'ЭКСПЕРТ|500 XP']
          .map((t) => { const [a, b] = t.split('|'); return card(`${label(a)}<div class="stat-v">${b}</div>`, { pad: 'pad-20' }); })
          .join('')}
      </div>
      <h2 class="d3 mt-40">Инструкторы</h2>
      <div class="cols-2 mt-16">
        ${card(list([
          { lead: '★ 5.0', title: 'Айдар Керметов — инструктор по горным лыжам, стаж 11 лет', meta: '128 отзывов · русский, қазақша, english', desc: 'Отзывов пока нет.', actions: [{ t: 'Забронировать', k: 'btn-primary btn-sm' }] },
          { lead: '★ 4.9', title: 'Марина Соколова, сноуборд и кросс-фрирайд', meta: '96 отзывов · русский, english', actions: [{ t: 'Забронировать', k: 'btn-primary btn-sm' }] },
          { lead: '★ 4.8', title: 'Тимур Абдрахманов, горные лыжи, начинающие', meta: '74 отзыва · русский, қазақша', actions: [{ t: 'Забронировать', k: 'btn-primary btn-sm' }] },
        ]), { pad: 'pad-24' })}
        ${card(`<h3 class="d4">Курсы сезона</h3>
          <div class="mt-16">${list([
            { title: 'Карвинг 1–3', meta: 'Январь 2027 · 0/10 мест', actions: [{ t: 'Записаться', k: 'btn-soft btn-sm' }, { t: 'Подробнее', k: 'btn-ghost btn-sm' }] },
            { title: 'Мастеркласс', meta: '10–15 декабря 2026 · 1/4 места', actions: [{ t: 'Записаться', k: 'btn-soft btn-sm' }, { t: 'Подробнее', k: 'btn-ghost btn-sm' }] },
            { title: 'Нет записи на этот курс', meta: 'Набор не открыт', actions: [{ t: 'Подробнее', k: 'btn-ghost btn-sm' }] },
          ])}</div>`, { pad: 'pad-24' })}
      </div>`,
  },
  {
    id: 'public-instructors', role: 'public', name: 'Инструкторы — каталог', route: '/ (секция)',
    states: 'с отзывами · без отзывов · фильтр · загрузка',
    notes: 'Каталог инструкторов продублирован из student-coach с ролью-контекстом; фильтры те же.',
    body: `
      ${pageHeader({ eyebrow: 'Инструкторы', title: 'К кому доверить склон', sub: 'Фильтры по специализации, языкам и уровню. Цена и свободные слоты видны сразу.', actions: [{ t: 'Сбросить фильтры', k: 'btn-ghost' }] })}
      ${card(chipRow([{ t: 'Все', k: 'chip-accent' }, 'Горные лыжи', 'Сноуборд', 'Дети', 'Фрирайд', 'Русский / English']), { pad: 'pad-20' })}
      <div class="mt-24">${card(list([
        { lead: '★ 5.0', title: 'Айдар Керметов, горные лыжи, специализация — начинающие и «возврат к катанию»', meta: '128 отзывов · ISASI Level 2 · слоты сегодня 14:30, 17:00', actions: [{ t: 'Забронировать', k: 'btn-primary btn-sm' }, { t: 'Профиль', k: 'btn-ghost btn-sm' }] },
        { lead: '★ 4.9', title: 'Марина Соколова, сноуборд, кросс-фрирайд', meta: '96 отзывов · слоты сегодня 11:00, 16:30', actions: [{ t: 'Забронировать', k: 'btn-primary btn-sm' }, { t: 'Профиль', k: 'btn-ghost btn-sm' }] },
        { lead: '★ 5.0', title: 'Дана Лысенко, детские группы 6–12', meta: '51 отзыв · слот сегодня 15:00', actions: [{ t: 'Забронировать', k: 'btn-primary btn-sm' }, { t: 'Профиль', k: 'btn-ghost btn-sm' }] },
      ]), { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'public-instructor-profile', role: 'public', name: 'Профиль инструктора', route: '/ (секция, карточка)',
    states: 'с отзывами · без отзывов',
    notes: 'Отдельной страницы нет — это разворот внутри каталога. Сохранено как экран.',
    body: `
      ${pageHeader({ eyebrow: 'Инструктор', title: 'Айдар Керметов', sub: 'Горные лыжи · стаж 11 лет · ISASI Level 2 · специализация: начинающие и «возврат к катанию»', actions: [{ t: 'Забронировать урок', k: 'btn-primary' }] })}
      <div class="cols-2 mt-28">
        <div class="col gap-20">
          ${card(`${chipRow([{ t: 'Русский', k: 'chip-accent' }, { t: 'Қазақша', k: 'chip-accent' }, { t: 'English', k: 'chip-accent' }, 'Сноуборд', 'Дети'])}<div class="mt-20">${kv([['Стаж', '11 лет'], ['Сертификация', 'ISASI Level 2'], ['Рейтинг', '5.0 · 128 отзывов'], ['Ставка', '10 000 ₸/ч'], ['Опыт с детьми', 'есть']])}</div>`, { pad: 'pad-24' })}
          ${card(`<h3 class="d4">Отзывы</h3>${list([{ title: 'Спокойно поставил на лыжи после двух сезонов без катания', meta: 'Декабрь 2026' }, { title: 'Короткие трассы, много перерывов — всё как договорились', meta: 'Ноябрь 2026' }])}`, { pad: 'pad-24' })}
        </div>
        <div class="col gap-20">
          ${card(`<h3 class="d4">Свободные слоты</h3><div class="mt-16">${slots([{ t: '10:00' }, { t: '11:00', k: 'slot-on' }, { t: '12:00' }, { t: '13:00' }, { t: '14:00', k: 'slot-off' }, { t: '15:00' }, { t: '16:00' }, { t: '17:00' }])}</div>`, { pad: 'pad-24' })}
        </div>
      </div>`,
  },
  {
    id: 'public-courses', role: 'public', name: 'Курсы — каталог', route: '/ (секция)',
    states: 'активные · нет записи · загрузка',
    notes: 'Активное/архивное разделение видно и на публичной стороне.',
    body: `
      ${pageHeader({ eyebrow: 'Курсы', title: 'Программы сезона', sub: 'Групповые программы с промежуточной аттестацией на склоне.' })}
      <div class="cols-3 mt-28">
        ${card(`<div class="row gap-8">${chip('Уровень 1–2', 'chip-accent')}${chip('8 недель')}</div><h3 class="d4 mt-16">Карвинг 1–3</h3><p class="small mt-8">Январь 2027, 09:00–13:00. Инструктор Арсений Герасимчук.</p>${kv([['Стоимость', '150 000 ₸'], ['Занято', '0 / 10 мест']])}<div class="row gap-8 mt-16">${btn('Записаться', 'btn-primary btn-sm')}${btn('Подробнее', 'btn-ghost btn-sm')}</div>`, { pad: 'pad-24' })}
        ${card(`<div class="row gap-8">${chip('Уровень 3+', 'chip-accent')}${chip('6 недель')}</div><h3 class="d4 mt-16">Мастеркласс</h3><p class="small mt-8">10–15 декабря 2026, 09:00–13:00.</p>${kv([['Стоимость', '250 000 ₸'], ['Занято', '1 / 4 места']])}<div class="row gap-8 mt-16">${btn('Записаться', 'btn-primary btn-sm')}${btn('Подробнее', 'btn-ghost btn-sm')}</div>`, { pad: 'pad-24' })}
        ${card(`<div class="row gap-8">${chip('Набор не открыт')}</div><h3 class="d4 mt-16">Интенсивные групповые курсы</h3><p class="small mt-8">Набор на этот сезон не открыт.</p>${empty('Запись недоступна', 'Набор откроется позже. Можно записаться на индивидуальное занятие.', { t: 'К инструкторам', k: 'btn-soft btn-sm' })}`, { pad: 'pad-24' })}
      </div>`,
  },
  {
    id: 'public-course-detail', role: 'public', name: 'Детали курса', route: '/ (секция, модальное)',
    states: 'доступен для записи · набор закрыт',
    notes: 'Модальное окно поверх страницы, не отдельный роут.',
    body: `
      ${pageHeader({ eyebrow: 'Курс', title: 'Карвинг 1–3', sub: 'Январь 2027 · 09:00–13:00 · до 10 участников' })}
      <div class="cols-2 mt-28">
        ${card(`<h3 class="d4">Программа</h3>${list([
          { title: 'День 1–3 · Стойка, спуск, плуг', meta: 'Зелёные трассы' },
          { title: 'День 4–9 · Параллель, работа с кантом', meta: 'Синие трассы' },
          { title: 'День 10–15 · Чистый карвинг, аттестация', meta: 'Синие и чёрные' },
        ])}`, { pad: 'pad-24' })}
        ${card(`<h3 class="d4">Запись</h3>${kv([['Стоимость', '150 000 ₸'], ['Мест', '0 / 10'], ['Инструктор', 'Арсений Герасимчук']])}<button class="btn btn-primary mt-20" style="width:100%">Записаться на курс</button><div class="tiny mt-10" style="text-align:center">Оплата с баланса или картой</div>`, { pad: 'pad-24' })}
      </div>`,
  },
  {
    id: 'public-guest-booking', role: 'public', name: 'Гостевая заявка на бронирование', route: '/ (модальное окно)',
    states: 'заполняется · нет свободного времени · отправлено · ошибка валидации',
    notes: 'Живая проверка: форма заполняется, но слот выбрать нельзя — «Нет свободного времени», кнопка отправки заблокирована. Фиксируется как блокер, а не как успешный сценарий.',
    body: `
      ${pageHeader({ eyebrow: 'Бронирование без регистрации', title: 'Забронировать урок', sub: 'Регистрация не требуется. Администратор свяжется по указанным контактам для организации оплаты.' })}
      <div class="cols-2 mt-28">
        ${card(`<h3 class="d4">Кто едет</h3>
          <div class="mt-16">${kv([['Инструктор', 'Айдар Керметов'], ['Ставка', '10 000 ₸/ч'], ['Формат', 'индивидуальное занятие']])}</div>
          <div class="field mt-16">Ваше имя *</div><div class="field mt-8">+7 (999) 000-00-00</div>
          <div class="field mt-8">name@example.com</div>
          <div class="field mt-8" style="height:76px;align-items:flex-start;padding-top:12px">Цели тренировки и примечания к экипировке…</div>
          <div class="mt-16">${label('Уровень обучения')}${chipRow(['Начинающий', 'Средний', 'Продвинутый', 'Вне трассы', 'Фристайл'])}</div>
          <div class="mt-16">${label('Длительность')}${chipRow([{ t: '1 час', k: 'chip-accent' }, '2 часа', '3 часа', '4 часа', '6 часов'])}</div>
          <button class="btn btn-primary mt-24" style="width:100%" disabled style2>Отправить заявку на бронирование</button>
          <div class="tiny mt-10" style="text-align:center">Кнопка заблокирована: не выбрано свободное время</div>`, { pad: 'pad-24' })}
        <div class="col gap-20">
          ${card(`<h3 class="d4">Время</h3>${alert('gold', 'Нет свободного времени', 'У инструктора нет доступных слотов на выбранную дату. Выберите другую дату.')}`, { pad: 'pad-24' })}
          ${card(`<h3 class="d4">Итоговая стоимость</h3><div class="mt-16">${kv([['Занятие · 2 часа', '20 000 ₸'], ['Итого', '20 000 ₸', true]])}</div>`, { pad: 'pad-24' })}
        </div>
      </div>`,
  },
  {
    id: 'public-auth', role: 'public', name: 'Вход и регистрация', route: '/ (модальное окно)',
    states: 'вход · регистрация · восстановление · ошибка · загрузка',
    notes: 'В дизайне: Esc закрывает, фокус в первом поле, фокус возвращается. В продукте сейчас не работает — см. IMPLEMENTATION_RISKS.',
    body: `
      ${pageHeader({ eyebrow: 'Доступ', title: 'Вход и регистрация', sub: 'Один экран с двумя режимами и восстановлением пароля.' })}
      <div class="cols-2 mt-28">
        ${card(`<div class="seg" style="margin-bottom:16px"><span class="seg-item seg-item-on">Вход</span><span class="seg-item">Регистрация</span><span class="seg-item">Восстановить</span></div>
          <div class="field field-focus">name@carve.kz</div>
          <div class="field mt-8">••••••••</div>
          <button class="btn btn-primary mt-20" style="width:100%">Войти</button>
          <div class="tiny mt-12" style="text-align:center">Забыли пароль? · Создать аккаунт</div>`, { pad: 'pad-24' })}
        <div class="col gap-20">
          ${card(`<h3 class="d4">Регистрация</h3>${kv([['Имя', 'Алексей Смирнов'], ['Телефон', '+7 999 000 00 00'], ['E-mail', 'name@carve.kz'], ['Пароль', '••••••••']])}`, { pad: 'pad-24' })}
          ${card(`<h3 class="d4">Спецификация доступности</h3>${kv([['Esc', 'закрывает окно'], ['Начальный фокус', 'поле e-mail'], ['Ловушка фокуса', 'внутри окна'], ['Возврат фокуса', 'на кнопку «Войти»'], ['Фон', 'не кликабелен']])}<div class="tiny mt-12">Это спецификация дизайна. Продукт сегодня не соответствует — см. IMPLEMENTATION_RISKS, раздел C.</div>`, { pad: 'pad-24' })}
        </div>
      </div>`,
  },
  {
    id: 'public-conditions', role: 'public', name: 'Условия склона', route: '/ (секция)',
    states: 'актуально · устарело · ошибка загрузки',
    notes: 'Виджет состояния склона в шапке и на главной.',
    body: `
      ${pageHeader({ eyebrow: 'Склон', title: 'Условия', sub: 'Данные обновляются автоматически. Устаревшие данные помечаются, а не показываются как свежие.' })}
      ${stats([{ l: 'Температура', v: '−12°C', s: 'ощущается −17°C' }, { l: 'Снег', v: '42 см', s: 'свежий 18 см' }, { l: 'Ветер', v: '4 м/с', s: 'порывы 9 м/с' }, { l: 'Видимость', v: '800 м', s: 'м выше 1200 м' }])}
      <div class="mt-24">${card(`${alert('gold', 'Данные 25 минут назад', 'Источник не отвечает. Показаны последние известные значения.')}`, { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'public-access-denied', role: 'public', name: 'Доступ запрещён (403)', route: '— (предложение)',
    states: 'нет доступа',
    notes: 'UX PROPOSAL — OWNER APPROVAL REQUIRED. Сейчас продукт молча перенаправляет. Каноническим поведением не является.',
    body: `
      ${pageHeader({ eyebrow: 'Предложение', title: 'Раздел недоступен', sub: 'У этого аккаунта нет прав на просмотр раздела.' })}
      ${card(empty('Нет доступа', 'Если это ошибка — обратитесь к администратору школы. Вернуться в личный кабинет.', { t: 'В кабинет', k: 'btn-primary btn-sm' }), { pad: 'pad-32' })}
      ${card(`<div class="label-mono">Статус предложения</div><div class="small mt-8"><b>UX PROPOSAL — OWNER APPROVAL REQUIRED.</b> Текущее поведение продукта — тихий редирект без объяснения. Реализовывать только после решения владельца.</div>`, { pad: 'pad-24', style: 'margin-top:20px' })}`,
  },

  /* ======================= STUDENT ======================= */
  {
    id: 'student-home', role: 'student', name: 'Кабинет · Главная (Today)', route: '/cabinet',
    states: 'есть занятие · нет занятий · загрузка · новый участник',
    notes: 'Точка входа. Первое действие и ближайшее занятие — главное.',
    body: `
      ${pageHeader({ eyebrow: 'Кабинет', title: 'Привет, Артём', sub: 'Ближайшее занятие через 2 дня, 11:00. Погода в норме, ветер 4 м/с.', actions: [{ t: 'Записаться ещё', k: 'btn-primary' }] })}
      <div class="side mt-28">
        <aside class="col gap-20">
          ${card(`<div class="label-mono" style="padding:0 4px 8px">Участник</div>${P()}`, { pad: 'pad-20' })}
        </aside>
        <div class="col gap-20">
          ${card(`<div class="row-between"><div class="row gap-10">${chip('Ближайшее', 'chip-accent')}${label('Занятие №15')}</div>${btn('Ещё', 'btn-ghost btn-sm')}</div>
            <div class="cols-2e mt-20" style="align-items:flex-start">
              <div>${mono('11:00', 42)}<div class="tiny mt-4">пн, 8 декабря · 60 минут</div></div>
              <div class="row gap-12">${avatar('АК')}<div><div class="strong">Айдар Керметов</div><div class="tiny">Горные лыжи · Ташлинская тафта</div></div></div>
            </div>
            <div class="row gap-8 mt-20">${btn('Перенести', 'btn-soft btn-sm')}${btn('Написать инструктору', 'btn-ghost btn-sm')}${btn('Отменить', 'btn-ghost btn-sm')}</div>`, { pad: 'pad-24' })}
          ${stats([{ l: 'Баланс', v: '755 250 ₸' }, { l: 'Уровень', v: 'Карвинг', s: '100 XP' }, { l: 'Навыков', v: '8', s: 'из 12 освоено' }, { l: 'Достижений', v: '10', s: 'получено' }])}
        </div>
      </div>`,
  },
  {
    id: 'student-training', role: 'student', name: 'Обучение · Развитие навыков', route: '/cabinet (Training)',
    states: 'навык не начат · в процессе · освоен',
    notes: 'Три подраздела в одном экране: развитие навыков, мои занятия, курсы.',
    body: `
      ${pageHeader({ eyebrow: 'Обучение', title: 'Развитие', sub: 'Навыки разбиты по группам. Уровень каждого навыка ставит инструктор после занятия.' })}
      <div class="cols-3 mt-28">
        ${card(`<div class="row-between">${label('Баланс и стойка')}${chip('Освоен', 'chip-pine')}</div><div class="small mt-12">Стойка, равновесие, работа с корпусом.</div>${kv([['Уровень', 'Уверенно', true], ['Занятий', '3']])}`, { pad: 'pad-24' })}
        ${card(`<div class="row-between">${label('Первые повороты')}${chip('В процессе', 'chip-accent')}</div><div class="small mt-12">Плуг и контроль скорости.</div>${kv([['Уровень', 'Базово', true], ['Занятий', '2']])}`, { pad: 'pad-24' })}
        ${card(`<div class="row-between">${label('Контроль канта')}${chip('Не начат')}</div><div class="small mt-12">Работа с кантом, разгрузка склона.</div>${kv([['Уровень', '—', true], ['Занятий', '0']])}`, { pad: 'pad-24' })}
      </div>`,
  },
  {
    id: 'student-lessons', role: 'student', name: 'Мои занятия (Lessons)', route: '/cabinet (Training)',
    states: 'все 6 статусов брони + неоплаченные + ожидающие отмены',
    notes: 'Ключевой экран статусов. Все шесть состояний записи представлены явно.',
    body: `
      ${pageHeader({ eyebrow: 'Мои занятия', title: 'Занятия', sub: 'Предстоящие и прошлые. Статус меняется только по каноническим правилам домена.' })}
      <div class="mt-24">
      ${card(list([
        { lead: '11:00', title: 'Айдар Керметов · 8 декабря', meta: 'Ташлинская тафта · Горные лыжи', chips: [bookingStates[1], chip('Оплачено', 'chip-pine')], actions: [{ t: 'Перенести', k: 'btn-soft btn-sm' }, { t: 'Отменить', k: 'btn-ghost btn-sm' }] },
        { lead: '11:00', title: 'Дана Лысенко · 15 декабря', meta: 'Ева · детская программа', chips: [bookingStates[0], chip('Истекает через 00:42:18', 'chip-gold')], actions: [{ t: 'Подтвердить', k: 'btn-primary btn-sm' }] },
        { lead: '14:30', title: 'Тимур Абдрахманов · 18 декабря', meta: 'Параллельные', chips: [bookingStates[1], chip('Ждёт оплаты', 'chip-flame')], actions: [{ t: 'Оплатить', k: 'btn-primary btn-sm' }] },
        { lead: '16:00', title: 'Марина Соколова · 20 декабря', meta: 'Заявка на отмену отправлена 6 ч назад', chips: [bookingStates[2]], actions: [{ t: 'Отозвать заявку', k: 'btn-ghost btn-sm' }] },
        { lead: '10:00', title: 'Айдар Керметов · 1 декабря', meta: 'Причина: отмена учеником · возврат 9 000 ₸', chips: [bookingStates[3]] },
        { lead: '12:00', title: 'Марина Соколова · 25 ноября', meta: 'Посещаемость: пришёл', chips: [bookingStates[4]] },
        { lead: '09:00', title: 'Тимур Абдрахманов · 12 ноября', meta: 'Посещаемость: не пришёл', chips: [bookingStates[5], chip('Требует решения администратора', 'chip-flame')] },
      ]), { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'student-coach', role: 'student', name: 'Тренер (Coach)', route: '/cabinet (Coach)',
    states: 'с отзывами · без отзывов',
    notes: 'Каталог инструкторов в кабинете + переход к бронированию.',
    body: `
      ${pageHeader({ eyebrow: 'Тренер', title: 'Инструкторы', sub: 'Отзывов пока нет. — это реальное состояние, а не заглушка.' })}
      <div class="mt-24">${card(list([
        { lead: '★ 5.0', title: 'Айдар Керметов', meta: 'Горные лыжи · русский, қазақша, english', desc: 'Отзывов пока нет.', actions: [{ t: 'Забронировать', k: 'btn-primary btn-sm' }] },
        { lead: '★ 4.9', title: 'Марина Соколова', meta: 'Сноуборд · русский, english', actions: [{ t: 'Забронировать', k: 'btn-primary btn-sm' }] },
      ]), { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'student-profile-participants', role: 'student', name: 'Профиль · Участники и аватары', route: '/cabinet (Profile) → Participants',
    states: 'один участник · несколько · незаполненный · невалидный',
    notes: 'Управление людьми: свои данные, аватары, зависимые участники.',
    body: `
      ${pageHeader({ eyebrow: 'Профиль', title: 'Участники', sub: 'Аккаунт — это вход. Участник — это человек. Прогресс и занятия принадлежат участнику.' })}
      <div class="side mt-28">
        <aside>${card(P(), { pad: 'pad-20' })}${btn('+ Добавить участника', 'btn-ghost btn-sm', 'style="width:100%;margin-top:12px"')}</aside>
        <div class="col gap-20">
          ${card(`<div class="row gap-16">${avatar('АС', '', 56)}<div class="grow"><div class="strong">Артём Соколов</div><div class="tiny">Это вы · Горные лыжи · 14 занятий в сезоне</div><div class="row gap-8 mt-10">${btn('Изменить данные', 'btn-ghost btn-sm')}${btn('Сменить аватар', 'btn-ghost btn-sm')}</div></div></div>`, { pad: 'pad-24' })}
          ${card(`<div class="row gap-16">${avatar('ЕС', 'avatar-gold', 56)}<div class="grow"><div class="strong">Ева Соколова, 9 лет</div><div class="tiny">Зависимый участник · Детская программа · 4 занятия</div><div class="row gap-8 mt-10">${btn('Изменить данные', 'btn-ghost btn-sm')}${btn('Сменить аватар', 'btn-ghost btn-sm')}</div></div></div>`, { pad: 'pad-24' })}
          ${alert('gold', 'Максим — данные не заполнены', 'Участник создан, но обязательные поля не заполнены. Прогресс и занятия пока недоступны.', { t: 'Дозаполнить', k: 'btn-soft btn-sm' })}
        </div>
      </div>`,
  },
  {
    id: 'student-wallet', role: 'student', name: 'Профиль · Кошелёк и история', route: '/cabinet (Profile) → Wallet',
    states: 'нет денег · частичное покрытие · достаточно · ошибка пополнения',
    notes: 'Баланс читается сервером; клиент только показывает.',
    body: `
      ${pageHeader({ eyebrow: 'Профиль', title: 'Кошелёк', sub: 'Кредиты, дебеты и текущий баланс. Суммы считает сервер.' })}
      <div class="cols-2 mt-28">
        ${dark(`<div class="row-between">${label('Текущий баланс')}${chip('Kaspi ID', 'chip-on-dark')}</div>${mono('755 250 ₸', 34)}<button class="btn btn-light mt-20" style="width:100%">Пополнить</button>`, { pad: 'pad-24' })}
        <div class="col gap-20">
          ${card(`<h3 class="d4">Оплата занятия</h3><div class="mt-16">${kv([['Стоимость', '14 700 ₸'], ['С баланса', '14 700 ₸'], ['Доплата', '0 ₸', true]])}</div>${alert('pine', 'Хватает полностью', 'Оплата спишется при подтверждении записи.')}`, { pad: 'pad-24' })}
        </div>
      </div>
      <div class="mt-24">${card(`<h3 class="d4">История операций</h3>${table(['Дата', 'Тип', 'Назначение', 'Сумма'], [
        ['8 дек', 'Списание', 'Занятие · Айдар Керметов', '<span class="num">−9 000 ₸</span>'],
        ['8 дек', 'Возврат', 'Отмена занятия', '<span class="num" style="color:var(--pine)">+9 000 ₸</span>'],
        ['1 дек', 'Списание', 'Занятие · Марина Соколова', '<span class="num">−11 000 ₸</span>'],
        ['15 ноя', 'Пополнение', 'Kaspi.kz', '<span class="num" style="color:var(--pine)">+50 000 ₸</span>'],
      ])}`, { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'student-skills', role: 'student', name: 'Профиль · Навыки (радар и упражнения)', route: '/cabinet (Profile) → Skills',
    states: 'нет данных · частично · все отмечены',
    notes: 'Радар и упражнения — разные сущности домена, здесь показаны раздельно, а не слиты в «состояние ученика».',
    body: `
      ${pageHeader({ eyebrow: 'Профиль', title: 'Навыки', sub: '8 навыков · 10 достижений. Уровень ставит инструктор после занятия.' })}
      <div class="cols-2 mt-28">
        ${card(`<h3 class="d4">Радар навыков</h3>
          <div class="mt-20">${['Баланс и стойка|80', 'Первые повороты|65', 'Плуг и контроль скорости|55', 'Контроль канта|40', 'Параллельное катание|35'].map((s) => { const [n, v] = s.split('|'); return `<div style="margin-bottom:14px"><div class="row-between"><span class="small">${n}</span><span class="mono tiny">${v}%</span></div><div class="bar mt-6"><div class="bar-fill" style="width:${v}%"></div></div></div>`; }).join('')}</div>`, { pad: 'pad-24' })}
        ${card(`<h3 class="d4">Упражнения</h3>${list([
          { title: 'Плуг по прямой', meta: 'Отмечено · 5 декабря' },
          { title: 'Параллель на коротком спуске', meta: 'В работе' },
          { title: 'Скорость в карвинге', meta: 'Не отмечено инструктором', chips: [chip('Не отмечено')] },
        ])}`, { pad: 'pad-24' })}
      </div>`,
  },
  {
    id: 'student-progress', role: 'student', name: 'Профиль · История и прогресс', route: '/cabinet (Profile) → My history',
    states: 'пусто · список',
    notes: 'История занятий и прогресс по участнику.',
    body: `
      ${pageHeader({ eyebrow: 'Профиль', title: 'Моя история', sub: 'Проведённые занятия, посещаемость и динамика навыков.' })}
      ${stats([{ l: 'Занятий за сезон', v: '14' }, { l: 'Присутствие', v: '93%' }, { l: 'Пропущено', v: '1' }, { l: 'Рост уровня', v: '+2', s: 'за месяц' }])}
      <div class="mt-24">${card(list([
        { lead: '1 дек', title: 'Занятие №14 · Айдар Керметов', meta: 'Посещаемость: пришёл · отметка «параллель»', chips: [chip('Проведён', 'chip-pine')] },
        { lead: '25 ноя', title: 'Занятие №13 · Марина Соколова', meta: 'Посещаемость: пришёл', chips: [chip('Проведён', 'chip-pine')] },
        { lead: '12 ноя', title: 'Занятие №12 · Тимур Абдрахманов', meta: 'Посещаемость: не пришёл', chips: [chip('Неявка', 'chip-flame')] },
      ]), { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'student-achievements', role: 'student', name: 'Профиль · Достижения', route: '/cabinet (Profile) → Achievements',
    states: 'получено · не получено',
    notes: 'Значки завязаны на участника, а не на аккаунт.',
    body: `
      ${pageHeader({ eyebrow: 'Профиль', title: 'Достижения', sub: 'Значки, полученные на склоне. Принадлежат участнику.' })}
      <div class="cols-4 mt-28">
        ${[['Первый спуск', 'Получено', 'chip-pine'], ['10 занятий', 'Получено', 'chip-pine'], ['Параллель', 'Получено', 'chip-pine'], ['Чёрная трасса', 'Не получено', ''], ['Фрирайд', 'Не получено', ''], ['Сезон 100%', 'Не получено', ''], ['Ночное катание', 'Не получено', ''], ['Детская группа', 'Не получено', '']].map((a) => card(`<div class="strong">${a[0]}</div><div class="mt-8">${chip(a[1], a[2])}</div>`, { pad: 'pad-20' })).join('')}
      </div>`,
  },
  {
    id: 'student-certificates', role: 'student', name: 'Профиль · Сертификаты', route: '/cabinet (Profile) → Certificates',
    states: 'нет данных (текущая правда)',
    notes: 'Вкладка существует в продукте, но модели, команды и коллекции сертификатов НЕТ. Показан честный пустой экран. FUTURE / REQUIRES BACKEND.',
    body: `
      ${pageHeader({ eyebrow: 'Профиль', title: 'Сертификаты', sub: 'Раздел доступен в кабинете, но выдача сертификатов пока не поддерживается системой.' })}
      ${card(`<div class="alrt alrt-gold" style="margin-bottom:20px">
        <div class="alrt-mark">i</div>
        <div class="grow"><div class="strong">Сертификаты пока недоступны</div>
        <div class="small mt-4">В продукте нет модели сертификата, команды выдачи и хранилища. Показываем честное пустое состояние, а не выдуманные данные.</div></div>
      </div>
      ${empty('Сертификатов пока нет', 'Система выдачи сертификатов — FUTURE / REQUIRES BACKEND. До её появления раздел остаётся пустым и объясняет причину.')}`, { pad: 'pad-32' })}`,
  },
  {
    id: 'student-season', role: 'student', name: 'Профиль · Сезон', route: '/cabinet (Profile) → This season',
    states: 'нет данных · есть данные · закрытый сезон',
    notes: 'Статистика сезона по участнику.',
    body: `
      ${pageHeader({ eyebrow: 'Профиль', title: 'Этот сезон', sub: 'Сводка по участнику: занятия, посещаемость, прогресс.' })}
      ${stats([{ l: 'Занятий', v: '14' }, { l: 'Посещаемость', v: '93%' }, { l: 'Потрачено', v: '96 000 ₸' }, { l: 'Уровень', v: 'Карвинг' }])}
      <div class="mt-24">${card(`<h3 class="d4">Помесячно</h3>${table(['Месяц', 'Занятий', 'Посещаемость', 'Сумма'], [
        ['Ноябрь', '9', '100%', '<span class="num">62 000 ₸</span>'],
        ['Декабрь', '5', '80%', '<span class="num">34 000 ₸</span>'],
      ])}`, { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'student-videos', role: 'student', name: 'Профиль · Видеоархив', route: '/cabinet (Profile) → Video archive',
    states: 'пусто · список',
    notes: 'Видео с занятий; заглушка, если видео нет.',
    body: `
      ${pageHeader({ eyebrow: 'Профиль', title: 'Видеоархив', sub: 'Видео с ваших занятий.' })}
      ${empty('Видео пока нет', 'Инструктор загружает видео после занятия. Здесь появятся записи ваших занятий.', { t: 'К занятиям', k: 'btn-soft btn-sm' })}`,
  },
  {
    id: 'student-booking', role: 'student', name: 'Бронирование · выбор даты, слота, участников', route: '/cabinet → тренер → бронирование',
    states: 'слот свободен · занят · слот исчез · 1 участник · группа · частичная оплата',
    notes: 'Одно занятие = один слот = одна оплата на всех участников. Доплата за второго участника — конфигурация, не константа в UI.',
    body: `
      ${pageHeader({ eyebrow: 'Бронирование', title: 'Айдар Керметов', sub: 'Горные лыжи · 60 минут · 9 000 ₸' })}
      <div class="cols-2 mt-28">
        <div class="col gap-20">
          ${card(`<h3 class="d4">Дата</h3><div class="row gap-8 mt-16">
            ${['пн 8', 'вт 9', 'ср 10', 'чт 11', 'пт 12', 'сб 13', 'вс 14'].map((d, i) => `<div class="daychip ${i === 0 ? 'daychip-on' : ''}"><div class="tiny">${d.split(' ')[0]}</div><div class="strong">${d.split(' ')[1]}</div></div>`).join('')}
          </div>`, { pad: 'pad-24' })}
          ${card(`<h3 class="d4">Время</h3><div class="mt-16">${slots([{ t: '09:00', k: 'slot-off' }, { t: '10:00' }, { t: '11:00', k: 'slot-on' }, { t: '12:00' }, { t: '13:00' }, { t: '14:00', k: 'slot-off' }, { t: '15:00' }, { t: '16:00' }, { t: '17:00' }])}</div><div class="row gap-16 mt-16"><span class="tiny">■ выбрано</span><span class="tiny">□ свободно</span><span class="tiny">▨ занято</span></div>`, { pad: 'pad-24' })}
          ${card(`<h3 class="d4">Кто едет на склон</h3><div class="mt-16">${list([
            { title: 'Артём Соколов · это вы', meta: 'Горные лыжи · средний · 14 занятий', chips: [chip('Выбран', 'chip-pine')] },
            { title: 'Ева Соколова · 9 лет', meta: 'Доплата за второго участника по настройке курса', chips: [chip('Выбран', 'chip-pine')] },
            { title: 'Добавить ребёнка', meta: 'Дети 6–14 лет, отдельная программа и отчёт инструктору', actions: [{ t: 'Добавить', k: 'btn-ghost btn-sm' }] },
          ])}</div>`, { pad: 'pad-24' })}
        </div>
        <div class="col gap-20">
          ${card(`<div class="eyebrow eyebrow-accent">Итого</div>
            <div class="mt-16">${kv([['Занятие · Артём', '9 000 ₸'], ['Доп. участник · Ева', '6 000 ₸'], ['Аренда снаряда', '1 200 ₸'], ['Вечерний тариф', '−1 500 ₸'], ['К оплате', '14 700 ₸', true]])}</div>
            <div class="radio" style="margin-top:16px"></div><div class="small mt-8">С баланса: 8 200 ₸</div>
            <button class="btn btn-primary btn-lg mt-20" style="width:100%">Записаться · 14 700 ₸</button>
            <div class="tiny mt-10" style="text-align:center">Перенос и отмена — бесплатно за 12 часов</div>`, { pad: 'pad-24' })}
          ${alert('gold', 'Слот мог занять кто-то ещё', 'После подтверждения доступность перепроверяется. Если слот занят — предложим ближайшее время.')}
        </div>
      </div>`,
  },
  {
    id: 'student-history', role: 'student', name: 'Профиль · Настройки и приватность', route: '/cabinet (Profile) → Settings',
    states: 'валидное · сохранение · ошибка',
    notes: 'Настройки аккаунта. Клиент может писать только ограниченный набор полей.',
    body: `
      ${pageHeader({ eyebrow: 'Профиль', title: 'Настройки', sub: 'Приватность и данные аккаунта. Редактируемые поля ограничены каноническим контрактом.' })}
      ${card(`<h3 class="d4">Аккаунт</h3><div class="mt-16">${kv([['Имя', 'Артём Соколов'], ['Телефон', '+7 701 234 56 78'], ['E-mail', 'name@carve.kz'], ['Язык интерфейса', 'RU / EN']])}</div><button class="btn btn-primary mt-20">Сохранить</button>`, { pad: 'pad-24' })}`,
  },

  /* ======================= INSTRUCTOR ======================= */
  {
    id: 'instructor-today', role: 'instructor', name: 'Инструктор · Сегодня (нормальный день)', route: '/instructor',
    states: 'загрузка · пустой день · нормальный день',
    notes: 'Пять занятий. Базовый экран дня.',
    body: `
      ${pageHeader({ eyebrow: 'Понедельник, 8 декабря', title: 'Доброе утро, Айдар', sub: 'На сегодня 5 занятий, 3 участника ждут отметки о посещении.' })}
      ${stats([{ l: 'Уроков сегодня', v: '5' }, { l: 'Участников', v: '8', s: 'из 9 мест' }, { l: 'Заработок за день', v: '34 500 ₸' }, { l: 'Рейтинг', v: '5.0', s: '128 отзывов' }, { l: 'Ждут действий', v: '3' }])}
      <div class="cols-2 mt-28">
        ${card(`<div class="row-between"><h3 class="d4">Маршрут дня</h3>${chip('Ташлинская тафта')}</div>${list([
          { lead: '11:00', title: 'Артём Соколова', meta: 'Горные лыжи · 15-е занятие · параллель', chips: [chip('Идёт', 'chip-accent'), chip('Посещаемость не отмечена', 'chip-flame')], actions: [{ t: 'Отметить', k: 'btn-soft btn-sm' }] },
          { lead: '13:00', title: 'Ева Соколова, 9 лет', meta: 'Детская программа · 4-е занятие · кантон', actions: [{ t: 'Перенести', k: 'btn-ghost btn-sm' }, { t: 'Отметить', k: 'btn-soft btn-sm' }] },
          { lead: '15:00', title: 'Камиль Нурланов', meta: 'Новичок · пожелание: «хочу перестать бояться»', chips: [chip('Не оплачен', 'chip-flame')], actions: [{ t: 'Написать', k: 'btn-ghost btn-sm' }] },
          { lead: '17:00', title: 'Дамир Бекетов · группа 3', meta: 'Фрирайд-подготовка · вечерний тариф', chips: [chip('Ожидает подтверждения', 'chip-gold')], actions: [{ t: 'Отклонить', k: 'btn-ghost btn-sm' }, { t: 'Подтвердить', k: 'btn-primary btn-sm' }] },
          { lead: '19:00', title: 'Иван Ткаченко', meta: 'Горные лыжи · ждёт оплаты', chips: [chip('Ждёт оплаты', 'chip-flame')] },
        ])}`, { pad: 'pad-24' })}
        <div class="col gap-20">
          ${card(`<div class="row-between">${label('Чек-лист дня')}${btn('2 / 5', 'btn-ghost btn-sm')}</div><div class="bar mt-12"><div class="bar-fill" style="width:40%"></div></div>${list([{ title: 'Отметка за 11:00', chips: [chip('Готово', 'chip-pine')] }, { title: 'Фото Евы отправлено', chips: [chip('Готово', 'chip-pine')] }, { title: 'Отметка за 13:00' }, { title: 'Подтвердить 17:00' }, { title: 'Отзыв за прошлую неделю' }])}`, { pad: 'pad-24' })}
        </div>
      </div>`,
  },
  {
    id: 'instructor-busy-day', role: 'instructor', name: 'Инструктор · Загруженный день (9–12 занятий)', route: '/instructor',
    states: 'много занятий · несколько одновременных действий',
    notes: 'Проверка плотности: день из 10 занятий с 4 одновременными «требует действия» остаётся читаемым.',
    body: `
      ${pageHeader({ eyebrow: 'Вторник, 9 декабря', title: 'Загруженный день', sub: '10 занятий, 4 задачи требуют действия прямо сейчас.' })}
      ${stats([{ l: 'Уроков', v: '10', bar: 100 }, { l: 'Участников', v: '19' }, { l: 'Заработок', v: '68 000 ₸' }, { l: 'Требуют действия', v: '4' }, { l: 'Прогресс дня', v: '70%' }])}
      <div class="mt-24">${card(list([
        { lead: '08:00', title: 'Миша Гаврилов, 8 лет', meta: 'Детская программа', chips: [chip('Отметить', 'chip-flame')], actions: [{ t: 'Открыть', k: 'btn-soft btn-sm' }] },
        { lead: '09:00', title: 'Анна Ветрова', meta: 'Сноуборд · кантон', chips: [chip('Отметить', 'chip-flame')], actions: [{ t: 'Открыть', k: 'btn-soft btn-sm' }] },
        { lead: '10:00', title: 'Группа 4 чел. · младшая', meta: 'Сноуборд · Детская группа', chips: [chip('Идёт', 'chip-accent')], actions: [{ t: 'Открыть', k: 'btn-soft btn-sm' }] },
        { lead: '11:00', title: 'Нурлан Сагындык', meta: 'Горные лыжи · 3-е занятие', chips: [chip('Ждёт оплаты', 'chip-flame')], actions: [{ t: 'Написать', k: 'btn-ghost btn-sm' }] },
        { lead: '12:00', title: 'Ева Соколова, 9 лет', meta: 'Детская программа', actions: [{ t: 'Перенести', k: 'btn-ghost btn-sm' }, { t: 'Отметить', k: 'btn-soft btn-sm' }] },
        { lead: '13:00', title: 'Дамир Бекетов · 3 чел.', meta: 'Фрирайд-подготовка', actions: [{ t: 'Отметить', k: 'btn-soft btn-sm' }] },
        { lead: '14:00', title: 'Антон Дрей', meta: 'Сноуборд · 2-е занятие', chips: [chip('Не отмечена посещаемость', 'chip-flame')], actions: [{ t: 'Отметить', k: 'btn-soft btn-sm' }] },
        { lead: '15:00', title: 'Руслан Ержанов', meta: 'Горные лыжи', actions: [{ t: 'Отметить', k: 'btn-soft btn-sm' }] },
        { lead: '16:30', title: 'Семья Орловых · 3 чел.', meta: 'Сноуборд · кантон', actions: [{ t: 'Отметить', k: 'btn-soft btn-sm' }] },
        { lead: '18:30', title: 'Вечерняя группа · 4 чел.', meta: 'Фрирайд · вечерний тариф', chips: [chip('Ожидает подтверждения', 'chip-gold')], actions: [{ t: 'Подтвердить', k: 'btn-primary btn-sm' }] },
      ]), { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'instructor-lesson', role: 'instructor', name: 'Инструктор · Занятие и посещаемость', route: '/instructor → занятие',
    states: 'до начала · идёт · после · посещаемость не отмечена · терминальное',
    notes: 'Посещаемость: три состояния. Отсутствие не выводится из времени.',
    body: `
      ${pageHeader({ eyebrow: 'Занятие · 11:00–12:00', title: 'Артём Соколова', sub: 'Горные лыжи · 15-е занятие · средний · Ташлинская тафта', actions: [{ t: 'Открыть карту', k: 'btn-ghost' }] })}
      <div class="cols-2 mt-28">
        <div class="col gap-20">
          ${card(`<div class="row gap-10">${chip('Идёт', 'chip-accent')}<span class="num">11:00 – 12:00</span></div>
            <div class="mt-16">${chipRow(['Параллель', 'Короткие трассы', chip('Пожелание: без длинных спусков', 'chip-flame')])}</div>
            <hr class="snowline mt-20">
            <div class="row-between mt-16" style="align-items:flex-end">
              <div>${label('Отметка посещаемости')}<div class="tiny mt-4">Отправляется ученику и в отчётность</div></div>
              <div class="row gap-8">${btn('Пришёл', 'btn-pill-pine btn-sm')}${btn('Не пришёл', 'btn-pill-flame btn-sm')}${btn('Перенос', 'btn-ghost btn-sm')}</div>
            </div>`, { pad: 'pad-24' })}
          ${alert('gold', 'Посещаемость не отмечена', 'Если отметка не будет поставлена в течение 24 часов после конца занятия, запись создаст задачу администратору.')}
          ${card(`<h3 class="d4">Участники группы</h3>${list([
            { title: 'Артём Соколова', meta: 'Посещаемость: не отмечено', chips: [chip('Не отмечено')] },
            { title: 'Ева Соколова, 9 лет', meta: 'Посещаемость: не отмечено', chips: [chip('Не отмечено')] },
          ])}`, { pad: 'pad-24' })}
        </div>
        <div class="col gap-20">
          ${dark(`<div class="row-between">${label('Ставка за занятие', '')}</div>${mono('6 500 ₸', 30)}`, { pad: 'pad-24' })}
          ${card(`<h3 class="d4">Заметка об ученике</h3><div class="card-quiet pad-16 mt-12"><div class="small">Фокус на коротком спуске параллельными. Дать ему вести первым, страховка сзади. Подъёмник не использовать.</div></div>${btn('Открыть карточку ученика', 'btn-soft btn-sm', 'style="width:100%;margin-top:12px"')}`, { pad: 'pad-24' })}
        </div>
      </div>`,
  },
  {
    id: 'instructor-assessment', role: 'instructor', name: 'Инструктор · Оценка прогресса и навыков', route: '/instructor → занятие → оценка',
    states: 'не оценено · оценено · заморожено после завершения',
    notes: 'Прогресс и навыки — разные сущности. Здесь они разделены, а не слиты в «состояние ученика».',
    body: `
      ${pageHeader({ eyebrow: 'Занятие → оценка', title: 'Прогресс и навыки', sub: 'Оценка попадает в прогресс участника и в отчёт по программе.' })}
      <div class="cols-2 mt-28">
        ${card(`<h3 class="d4">Навыки</h3>${list([
          { title: 'Плуг и контроль скорости', meta: 'Текущий: базово', actions: [{ t: 'Поднять', k: 'btn-soft btn-sm' }, { t: 'Оставить', k: 'btn-ghost btn-sm' }] },
          { title: 'Параллельное катание', meta: 'Текущий: не начат', actions: [{ t: 'Поднять', k: 'btn-soft btn-sm' }] },
          { title: 'Контроль канта', meta: 'Текущий: не начат', chips: [chip('Не отмечено')] },
        ])}`, { pad: 'pad-24' })}
        ${card(`<h3 class="d4">Отметка инструктора</h3>
          <div class="field mt-16" style="height:96px;align-items:flex-start;padding-top:12px">Уверенно держит лыжи параллельно. Следующая цель — короткий спуск без перестроек.</div>
          <button class="btn btn-primary mt-20">Сохранить отметку</button>
          <div class="tiny mt-10">Занятие в статусе «идёт»: отметка редактируется. После завершения — только просмотр.</div>`, { pad: 'pad-24' })}
      </div>`,
  },
  {
    id: 'instructor-schedule', role: 'instructor', name: 'Инструктор · Расписание', route: '/instructor',
    states: 'пусто · есть занятия · конфликт',
    notes: 'Собственное расписание инструктора.',
    body: `
      ${pageHeader({ eyebrow: 'Инструктор', title: 'Расписание', sub: 'Ваши смены и загрузка на неделю.' })}
      ${stats([{ l: 'Занятий на неделе', v: '28' }, { l: 'Загрузка', v: '78%', bar: 78 }, { l: 'Свободных слотов', v: '9' }, { l: 'Подтверждено', v: '24' }])}
      <div class="mt-24">${card(`<h3 class="d4">Неделя</h3>${table(['День', 'Слоты', 'Занятий', 'Занято', 'Статус'], [
        ['Пн 8 дек', '08:00–18:00', '5', '5/9', chip('Полная', 'chip-pine')],
        ['Вт 9 дек', '08:00–20:00', '10', '10/12', chip('Полная', 'chip-pine')],
        ['Ср 10 дек', '08:00–18:00', '6', '4/9', chip('Есть места', 'chip-accent')],
        ['Чт 11 дек', '08:00–18:00', '7', '5/9', chip('Есть места', 'chip-accent')],
        ['Пт 12 дек', '—', '0', '0/0', chip('Выходной')],
      ])}`, { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'instructor-participants', role: 'instructor', name: 'Инструктор · Участники', route: '/instructor',
    states: 'список · карточка участника',
    notes: 'Участники видны инструктору по назначенным занятиям.',
    body: `
      ${pageHeader({ eyebrow: 'Инструктор', title: 'Участники', sub: 'Те, с кем у вас есть занятия или курсы.' })}
      ${card(list([
        { lead: '15', title: 'Артём Соколова', meta: 'Горные лыжи · 15 занятий · Карвинг', chips: [chip('Прогресс: параллель', 'chip-accent')] },
        { lead: '4', title: 'Ева Соколова, 9 лет', meta: 'Детская программа · Начинающий', chips: [chip('Детская группа', 'chip-gold')] },
        { lead: '1', title: 'Камиль Нурланов', meta: 'Новичок · пожелание: «хочу перестать бояться»', chips: [chip('Новичок')] },
      ]), { pad: 'pad-24' })}`,
  },
  {
    id: 'instructor-courses', role: 'instructor', name: 'Инструктор · Курсы и дни курса', route: '/instructor',
    states: 'активный курс · завершён · дни курса с посещаемостью',
    notes: 'Назначенные курсы, дни курса и посещаемость по дням.',
    body: `
      ${pageHeader({ eyebrow: 'Инструктор', title: 'Курсы', sub: 'Назначенные вам курсы и дни курса.' })}
      <div class="cols-2 mt-28">
        ${card(`<div class="row gap-8">${chip('Активен', 'chip-pine')}${chip('Январь 2027')}</div><h3 class="d4 mt-12">Карвинг 1–3</h3><p class="small mt-8">0 / 10 участников · 09:00–13:00</p>${table(['День', 'Дата', 'Участников', 'Посещаемость'], [
        ['День 1', '5 янв', '0', chip('Не начат')],
        ['День 2', '6 янв', '0', chip('Не начат')],
      ])}`, { pad: 'pad-24' })}
        ${card(`<div class="row gap-8">${chip('Завершён', 'chip-gold')}${chip('Декабрь 2026')}</div><h3 class="d4 mt-12">Мастеркласс</h3><p class="small mt-8">1 / 4 участника · завершён</p>${alert('pine', 'Курс завершён', 'Посещаемость закрыта по всем дням.')}`, { pad: 'pad-24' })}
      </div>`,
  },
  {
    id: 'instructor-finance', role: 'instructor', name: 'Инструктор · Финансы и заработок', route: '/instructor',
    states: 'нет начислений · ожидаются · выплачено',
    notes: 'Только те деньги, которые инструктору реально видно. Админские операции скрыты.',
    body: `
      ${pageHeader({ eyebrow: 'Инструктор', title: 'Финансы', sub: 'Начисления по занятиям и ожидающие суммы.' })}
      ${dark(`${label('За декабрь')}${mono('412 000 ₸', 32)}<div class="tiny mt-4" style="color:rgba(255,255,255,.55)">из них 3 занятия в ожидании</div>`, { pad: 'pad-24' })}
      <div class="mt-24">${card(`<h3 class="d4">Начисления</h3>${table(['Дата', 'Занятие', 'Участник', 'Ставка', 'Статус'], [
        ['8 дек', '11:00–12:00', 'Артём Соколова', '<span class="num">6 500 ₸</span>', chip('Начислено', 'chip-pine')],
        ['9 дек', '09:00–10:00', 'Нурлан Сагындык', '<span class="num">6 000 ₸</span>', chip('В ожидании', 'chip-gold')],
        ['9 дек', '10:00–11:00', 'Группа 4 чел.', '<span class="num">12 000 ₸</span>', chip('В ожидании', 'chip-gold')],
      ])}`, { pad: 'pad-24' })}</div>`,
  },

  /* ======================= ADMIN ======================= */
  {
    id: 'admin-operations', role: 'admin', name: 'Админ · Операции (обзор)', route: '/admin?tab=operations',
    states: 'загрузка · пусто · есть данные · усечение данных',
    notes: 'Точка входа операций: счётчики, внимание, разделы. Плотность операционная.',
    body: `
      ${pageHeader({ eyebrow: 'Операции', title: 'Расписание на 8 декабря', sub: 'Планировщик, монитор записей, задачи и единый реестр занятий и курсов.', actions: [{ t: 'День', k: 'btn-ghost' }, { t: 'Неделя', k: 'btn-soft' }, { t: 'Сегодня', k: 'btn-ghost' }] })}
      ${stats([{ l: 'Загрузка инструкторов', v: '78%', bar: 78 }, { l: 'Занятий сегодня', v: '64', s: 'из 78 возможных' }, { l: 'Выручка за день', v: '1 240 000 ₸' }, { l: 'Средняя загрузка', v: '6.1' }, { l: 'Отмены', v: '5' }])}
      <div class="mt-24">${alert('flame', 'Требует внимания', '7 учеников не отмечены после занятия — посещаемость не закрыта.', { t: 'Закрыть массово', k: 'btn-soft btn-sm' })}</div>`,
  },
  {
    id: 'admin-planner', role: 'admin', name: 'Админ · Планировщик и доска смен', route: '/admin (admin_planner)',
    states: 'загрузка · нет инструкторов · усечение · занято',
    notes: 'Сетка «инструктор × час». Плотность — главный приоритет.',
    body: `
      ${pageHeader({ eyebrow: 'Операции', title: 'Таймлайн инструкторов', sub: 'Сетка занятости по неделе. Данные обрезаются при большом объёме — обрезка показывается явно.' })}
      ${card(`<div class="table-wrap"><table class="data-table">
        <thead><tr><th>ИНСТРУКТОР</th><th>08:00</th><th>09:00</th><th>10:00</th><th>11:00</th><th>12:00</th><th>13:00</th><th>14:00</th><th>15:00</th><th>16:00</th><th>17:00</th><th>18:00</th></tr></thead>
        <tbody>
          <tr><td><b>Айдар Керметов</b><div class="tiny">5 занятий</div></td><td></td><td></td><td></td><td><span class="cell-book">Артём</span></td><td><span class="cell-book">Ева</span></td><td></td><td><span class="cell-book">Камиль</span></td><td></td><td></td><td><span class="cell-book">Дамир</span></td><td></td></tr>
          <tr><td><b>Марина Соколова</b><div class="tiny">6 занятий</div></td><td></td><td><span class="cell-book">Аяулым</span></td><td></td><td><span class="cell-book">Антон</span></td><td></td><td><span class="cell-book">Группа 3</span></td><td></td><td><span class="cell-book">Орловы</span></td><td></td><td></td><td><span class="cell-book cell-dim">Вечерняя</span></td></tr>
          <tr><td><b>Тимур Абдрахманов</b><div class="tiny">4 занятия · 67%</div></td><td></td><td></td><td><span class="cell-book">Нурлан</span></td><td></td><td><span class="cell-book">Детская</span></td><td></td><td><span class="cell-book">Руслан</span></td><td></td><td class="cell-free">свободно</td><td></td></tr>
          <tr><td><b>Дана Лысенко</b><div class="tiny">5 занятий</div></td><td></td><td><span class="cell-book">Миша</span></td><td></td><td><span class="cell-book">Группа 2</span></td><td></td><td></td><td><span class="cell-book">Ева</span></td><td></td><td><span class="cell-book">Ахметовы</span></td><td></td></tr>
        </tbody>
      </table></div>`, { pad: 'pad-20' })}
      ${alert('gold', 'Данные обрезаны', 'Показаны первые 500 записей. Усечение обозначено явно, а не выдаётся за полные данные.')}`,
  },
  {
    id: 'admin-bookings-monitor', role: 'admin', name: 'Админ · Монитор активных записей', route: '/admin (admin_booking_monitor)',
    states: 'загрузка · пусто · список',
    notes: 'Живые записи с быстрыми действиями.',
    body: `
      ${pageHeader({ eyebrow: 'Операции', title: 'Активные записи', sub: 'Текущие и ближайшие записи с действиями подтверждения и отмены.' })}
      ${card(`<div class="row gap-8" style="margin-bottom:16px;flex-wrap:wrap">${chip('Все', 'chip-accent')}${chip('Не подтверждены')}${chip('Ждут оплаты')}${chip('Сегодня')}${chip('Завтра')}</div>
      ${table(['ID записи', 'Дата', 'Лыжник', 'Инструктор', 'Уровень', 'Дата/время', 'Стоимость', 'Статус', 'Одобрение'], [
        ['BK-1042', '8 дек', 'Артём Соколова', 'Айдар Керметов', 'Средний', '8 дек 11:00', '<span class="num">9 000 ₸</span>', chip('Подтверждён', 'chip-pine'), btn('Отменить', 'btn-ghost btn-sm')],
        ['BK-1043', '9 дек', 'Ева Соколова', 'Дана Лысенко', 'Начинающий', '9 дек 15:00', '<span class="num">8 500 ₸</span>', chip('Ждёт оплаты', 'chip-flame'), btn('Оплатить', 'btn-soft btn-sm')],
        ['BK-1044', '10 дек', 'Руслан Ержанов', 'Тимур А.', 'Средний', '10 дек 14:30', '<span class="num">8 000 ₸</span>', chip('Ожидает', 'chip-gold'), btn('Подтвердить', 'btn-primary btn-sm')],
      ])}`, { pad: 'pad-24' })}`,
  },
  {
    id: 'admin-training-records', role: 'admin', name: 'Админ · Занятия и курсы (единый реестр)', route: '/admin (canonical_training_records)',
    states: 'все 6 статусов брони + 7 статусов зачисления',
    notes: 'Занятия и зачисления — одна секция с фильтром по виду и области. Разделять обратно нельзя.',
    body: `
      ${pageHeader({ eyebrow: 'Операции', title: 'Занятия и курсы', sub: 'Единый реестр: занятия и зачисления на курсы. Фильтр по виду и области.' })}
      ${card(`<div class="row gap-8" style="margin-bottom:16px;flex-wrap:wrap">
        ${chip('Занятия', 'chip-accent')}${chip('Курсы')}${chip('Все')}${chip('Текущие')}${chip('Архивные')}
      </div>
      ${table(['ID', 'Дата', 'Участник', 'Инструктор', 'Вид', 'Дата/время', 'Стоимость', 'Статус', 'Действия'], [
        ['BK-1042', '8 дек', 'Артём Соколова', 'Айдар Керметов', 'Занятие', '8 дек 11:00', '<span class="num">9 000 ₸</span>', chip(bookingStates[1].t, bookingStates[1].k), btn('Открыть', 'btn-ghost btn-sm')],
        ['BK-1043', '9 дек', 'Ева Соколова', 'Дана Лысенко', 'Занятие', '9 дек 15:00', '<span class="num">8 500 ₸</span>', chip(bookingStates[0].t, bookingStates[0].k), btn('Открыть', 'btn-ghost btn-sm')],
        ['BK-1044', '10 дек', 'Семья Орловых', 'Марина Соколова', 'Занятие', '10 дек 16:30', '<span class="num">28 000 ₸</span>', chip(bookingStates[2].t, bookingStates[2].k), btn('Открыть', 'btn-ghost btn-sm')],
        ['EN-201', '20 дек', 'Анна Ветрова', 'Арсений Г.', 'Курс', 'День 1', '<span class="num">150 000 ₸</span>', chip('Подтверждён', 'chip-pine'), btn('Открыть', 'btn-ghost btn-sm')],
        ['EN-202', '20 дек', 'Дамир Бекетов', 'Арсений Г.', 'Курс', 'День 1', '<span class="num">150 000 ₸</span>', chip('Ожидает подтверждения', 'chip-gold'), btn('Открыть', 'btn-ghost btn-sm')],
        ['EN-203', 'дек', 'Нурлан С.', 'Арсений Г.', 'Курс', 'День 2', '<span class="num">150 000 ₸</span>', chip('Выбыл'), btn('Открыть', 'btn-ghost btn-sm')],
        ['BK-1045', '1 дек', 'Камиль Нурланов', 'Айдар Керметов', 'Занятие', '1 дек 15:00', '<span class="num">9 000 ₸</span>', chip(bookingStates[3].t, bookingStates[3].k), btn('Открыть', 'btn-ghost btn-sm')],
        ['BK-1046', '25 ноя', 'Антон Дрей', 'Марина Соколова', 'Занятие', '25 ноя 12:00', '<span class="num">11 000 ₸</span>', chip(bookingStates[4].t, bookingStates[4].k), btn('Открыть', 'btn-ghost btn-sm')],
        ['BK-1047', '12 ноя', 'Нурлан С.', 'Тимур А.', 'Занятие', '12 ноя 09:00', '<span class="num">8 000 ₸</span>', chip(bookingStates[5].t, bookingStates[5].k), btn('Открыть', 'btn-ghost btn-sm')],
      ])}`, { pad: 'pad-24' })}`,
  },
  {
    id: 'admin-issues', role: 'admin', name: 'Админ · Центр задач (issues)', route: '/admin (admin_issue_inbox)',
    states: 'нет задач · обычная · срочная · критическая · решена',
    notes: 'Задачи нельзя «закрыть» напрямую — каждая решается связанной канонической командой.',
    body: `
      ${pageHeader({ eyebrow: 'Операции', title: 'Центр задач', sub: 'Каждая задача требует исправления в домене. Кнопки «закрыть задачу» не существует.' })}
      ${card(`<div class="row gap-8" style="margin-bottom:16px;flex-wrap:wrap">${chip('Все', 'chip-accent')}${chip('Обычные')}${chip('Срочные')}${chip('Критические')}${chip('Открытые')}${chip('Решённые')}</div>
      ${table(['Тип', 'Серьёзность', 'Суть', 'Кто', 'Когда', 'Действие'], [
        ['Нет посещаемости', chip('Срочная', 'chip-flame'), 'Занятие 1 декабря без отметки более 24 ч', 'Нурлан С.', '12 мин назад', btn('Исправить в занятии', 'btn-soft btn-sm')],
        ['Требуется оплата на старте', chip('Критическая', 'chip-flame'), 'Запись без оплаты на дату занятия', 'Руслан Е.', '1 ч назад', btn('Исправить оплату', 'btn-soft btn-sm')],
        ['Не решённая отмена', chip('Обычная', ''), 'Заявка на отмену висит дольше срока', 'Артём С.', '2 ч назад', btn('Решить отмену', 'btn-soft btn-sm')],
        ['Конфликт посещаемости и оплаты', chip('Срочная', 'chip-flame'), 'Отметка «не пришёл» при оплаченном занятии', 'Камиль Н.', 'вчера', btn('Исправить', 'btn-soft btn-sm')],
      ])}`, { pad: 'pad-24' })}`,
  },
  {
    id: 'admin-finance-overview', role: 'admin', name: 'Админ · Финансовый обзор', route: '/admin?tab=finance',
    states: 'период день/неделя/месяц · пусто · данные',
    notes: 'Период — сегментированный переключатель, ровно три значения.',
    body: `
      ${pageHeader({ eyebrow: 'Финансы', title: 'Финансовый обзор', sub: 'Принятые оплаты, ожидаемые, возвраты и списания. Валюта — KZT.' })}
      <div class="seg" style="margin-bottom:20px"><span class="seg-item seg-item-on">День</span><span class="seg-item">Неделя</span><span class="seg-item">Месяц</span></div>
      ${stats([{ l: 'Принято оплат', v: '1 240 000 ₸', bar: 88 }, { l: 'Ожидается', v: '58 000 ₸' }, { l: 'Возвраты', v: '9 000 ₸' }, { l: 'Списания', v: '4 000 ₸' }])}
      <div class="mt-24">${card(`<h3 class="d4">Сводка за день</h3>${table(['Показатель', 'Сумма', 'Доля'], [
        ['Принято оплат', '<span class="num">1 240 000 ₸</span>', '<div class="bar" style="width:120px"><div class="bar-fill" style="width:88%"></div></div>'],
        ['Ожидается оплат', '<span class="num">58 000 ₸</span>', '<div class="bar" style="width:120px"><div class="bar-fill" style="width:12%;background:var(--flame)"></div></div>'],
        ['Возвраты', '<span class="num" style="color:var(--flame)">9 000 ₸</span>', '<div class="bar" style="width:120px"><div class="bar-fill" style="width:6%;background:var(--flame)"></div></div>'],
      ])}`, { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'admin-payments', role: 'admin', name: 'Админ · Платежи и кошельки', route: '/admin (canonical_finance)',
    states: 'оплачено · не оплачено · частично · возврат · списание',
    notes: 'Возврат порождает и возврат, и списание — это два разных движения.',
    body: `
      ${pageHeader({ eyebrow: 'Финансы', title: 'Платежи и кошельки', sub: 'Канонические платежи. Изменение баланса — только именованной командой.' })}
      ${card(`<div class="row gap-8" style="margin-bottom:16px;flex-wrap:wrap">${chip('Все', 'chip-accent')}${chip('Оплачено')}${chip('Не оплачено')}${chip('Возвраты')}</div>
      ${table(['Время', 'Вид', 'Источник', 'Субъект', 'Платёж', 'Кошелёк', 'Сумма'], [
        ['11:04', 'Списание', 'Занятие', 'Артём Соколова', 'PAY-881', '8 200 ₸', '<span class="num">−9 000 ₸</span>'],
        ['10:52', 'Возврат', 'Отмена', 'Артём Соколова', 'PAY-880', '+9 000 ₸', '<span class="num" style="color:var(--pine)">+9 000 ₸</span>'],
        ['10:40', 'Пополнение', 'Kaspi.kz', 'Кошелёк клиента', 'PAY-879', '+50 000 ₸', '<span class="num" style="color:var(--pine)">+50 000 ₸</span>'],
        ['10:12', 'Списание', 'Зачисление на курс', 'Анна Ветрова', 'PAY-878', '150 000 ₸', '<span class="num">−150 000 ₸</span>'],
      ])}`, { pad: 'pad-24' })}`,
  },
  {
    id: 'admin-guest-finance', role: 'admin', name: 'Админ · Гостевые заявки и их деньги', route: '/admin (canonical_guest_finance)',
    states: 'нет заявок · заявка без оплаты · оплачено',
    notes: 'Гостевая заявка — это запрос, а не мгновенный холд слота. Деньги появляются после ручного подтверждения.',
    body: `
      ${pageHeader({ eyebrow: 'Финансы', title: 'Гостевые заявки', sub: 'Заявки без регистрации. Оплата организуется администратором после контакта.' })}
      ${card(`<div class="row gap-8" style="margin-bottom:16px;flex-wrap:wrap">${chip('Все', 'chip-accent')}${chip('Без оплаты', 'chip-flame')}${chip('Оплачено', 'chip-pine')}</div>
      ${table(['Дата', 'Гость', 'Контакт', 'Инструктор', 'Когда', 'Сумма', 'Статус', 'Действие'], [
        ['1 окт', 'Тестовый Гость Проверки', '+7 701 234 56 78', 'Айдар Керметов', 'дата не выбрана', '<span class="num">20 000 ₸</span>', chip('Нет свободного времени', 'chip-flame'), btn('Связаться', 'btn-soft btn-sm')],
        ['28 сен', 'Алексей Смирнов', '+7 999 000 00 00', 'Марина Соколова', '28 сен 11:00', '<span class="num">20 000 ₸</span>', chip('Оплачено', 'chip-pine'), btn('Открыть', 'btn-ghost btn-sm')],
      ])}`, { pad: 'pad-24' })}`,
  },
  {
    id: 'admin-school-movement', role: 'admin', name: 'Админ · Движение средств школы', route: '/admin (canonical_school_movement)',
    states: 'пусто · данные · период',
    notes: 'Движения по периоду.',
    body: `
      ${pageHeader({ eyebrow: 'Финансы', title: 'Движение средств', sub: 'Поступления, списания, возвраты и начисления инструкторам.' })}
      ${card(`<div class="seg" style="margin-bottom:16px"><span class="seg-item">День</span><span class="seg-item seg-item-on">Неделя</span><span class="seg-item">Месяц</span></div>
      ${table(['Время', 'Вид', 'Источник', 'Субъект', 'Платёж', 'Кошелёк', 'Сумма'], [
        ['8 дек 11:04', 'Доход', 'Занятие', 'Артём Соколова', 'PAY-881', '—', '<span class="num" style="color:var(--pine)">+9 000 ₸</span>'],
        ['8 дек 11:04', 'Начисление', 'Занятие', 'Айдар Керметов', 'PAY-881', '—', '<span class="num" style="color:var(--flame)">−6 500 ₸</span>'],
        ['8 дек 10:52', 'Возврат', 'Отмена', 'Артём Соколова', 'PAY-880', '—', '<span class="num">−9 000 ₸</span>'],
      ])}`, { pad: 'pad-24' })}`,
  },
  {
    id: 'admin-people-clients', role: 'admin', name: 'Админ · Клиенты и участники', route: '/admin (admin_clients)',
    states: 'поиск · список · карточка клиента',
    notes: 'Колонка «Участники» — ключевая: у клиента несколько людей.',
    body: `
      ${pageHeader({ eyebrow: 'Люди', title: 'База клиентов', sub: 'Аккаунты и их участники. Один аккаунт — несколько людей.' })}
      ${card(`<div class="field field-focus" style="max-width:340px;margin-bottom:16px">Поиск по имени, телефону или e-mail</div>
      ${table(['Клиент', 'Контакт', 'Статус аккаунта', 'Участники', 'Действия'], [
        ['Staging Parent', 'staging-parent@carve.kz', chip('Активен', 'chip-pine'), 'Артём, Ева, Максим (3)', btn('Открыть клиента', 'btn-ghost btn-sm')],
        ['Анна Ветрова', '+7 701 111 22 33', chip('Активен', 'chip-pine'), 'Анна (1)', btn('Открыть клиента', 'btn-ghost btn-sm')],
        ['Семья Орловых', '+7 727 444 55 66', chip('Заблокирован', 'chip-flame'), 'Орловы (3)', btn('Открыть клиента', 'btn-ghost btn-sm')],
      ])}`, { pad: 'pad-24' })}`,
  },
  {
    id: 'admin-people-instructors', role: 'admin', name: 'Админ · Инструкторы', route: '/admin (admin_instructors)',
    states: 'список · добавить · приём записей выкл',
    notes: 'Колонка «приём записей» управляет доступностью слотов.',
    body: `
      ${pageHeader({ eyebrow: 'Люди', title: 'Инструкторы', sub: 'Ставка, специализация, приём записей и связанный аккаунт.', actions: [{ t: 'Добавить инструктора', k: 'btn-primary' }] })}
      ${card(`${table(['Инструктор', 'Специализация', 'Ставка ₸/ч', 'Приём записей', 'Аккаунт', 'Действия'], [
        ['Айдар Керметов', 'Горные лыжи', '<span class="num">10 000 ₸</span>', chip('Выключен', 'chip-flame'), 'staging-admin@…', btn('Включить приём', 'btn-soft btn-sm')],
        ['Марина Соколова', 'Сноуборд', '<span class="num">11 000 ₸</span>', chip('Включён', 'chip-pine'), '—', btn('Изменить', 'btn-ghost btn-sm')],
        ['Дана Лысенко', 'Детские группы', '<span class="num">8 500 ₸</span>', chip('Включён', 'chip-pine'), '—', btn('Изменить', 'btn-ghost btn-sm')],
      ])}
      <div class="alrt alrt-flame mt-20"><div class="alrt-mark">!</div><div class="grow"><div class="strong">Почему нет занятий у fixture-инструктора</div><div class="small mt-4">Приём записей выключен → слотов нет → гостевая заявка не может выбрать время → запись создать нечем. Это цепочка блокеров проверена вживую.</div></div></div>`, { pad: 'pad-24' })}`,
  },
  {
    id: 'admin-people-roles', role: 'admin', name: 'Админ · Роли и доступ', route: '/admin (admin_roles)',
    states: 'список ролей · изменение роли',
    notes: 'Роль живёт в документе пользователя, custom claims отсутствуют.',
    body: `
      ${pageHeader({ eyebrow: 'Люди', title: 'Роли и доступ', sub: 'Роль хранится в документе пользователя. Отдельные claims не используются.' })}
      ${card(table(['Аккаунт', 'Роль', 'Инструктор', 'Действия'], [
        ['staging-admin@…', chip('Администратор', 'chip-gold'), 'да', btn('Понизить', 'btn-ghost btn-sm')],
        ['staging-parent@…', chip('Клиент', 'chip-accent'), 'нет', btn('Назначить инструктором', 'btn-soft btn-sm')],
      ]), { pad: 'pad-24' })}`,
  },
  {
    id: 'admin-product-courses', role: 'admin', name: 'Админ · Курсы (активные и архивные)', route: '/admin (courses_manager)',
    states: 'активные · архивные · добавление · настройки занятий',
    notes: 'Жизненный цикл архива — отдельный фильтр, а не удаление.',
    body: `
      ${pageHeader({ eyebrow: 'Продукт', title: 'Курсы', sub: 'Каталог курсов, вместимость, настройки занятий и архивирование.', actions: [{ t: 'Добавить курс', k: 'btn-primary' }, { t: 'Обновить', k: 'btn-ghost' }] })}
      <div class="row gap-8" style="margin-bottom:16px">${chip('Активные', 'chip-accent')}${chip('Архивные')}</div>
      ${card(table(['Курс', 'Даты', 'Инструктор', 'Стоимость', 'Занято', 'Действия'], [
        ['Карвинг 1–3', '1–3 января 2027, 09:00–13:00', 'Арсений Герасимчук', '<span class="num">150 000 ₸</span>', '0 / 10', btn('Настройки', 'btn-ghost btn-sm') + btn('В архив', 'btn-ghost btn-sm')],
        ['Мастеркласс', '10–15 декабря 2026, 09:00–13:00', 'Арсений Герасимчук', '<span class="num">250 000 ₸</span>', '1 / 4', btn('Настройки', 'btn-ghost btn-sm') + btn('В архив', 'btn-ghost btn-sm')],
        ['Интенсив (архив)', 'завершён', '—', '—', '—', btn('Восстановить', 'btn-soft btn-sm')],
      ]))}
      <div class="mt-24">${card(`<h3 class="d4">Настройки занятий</h3><div class="mt-16">${kv([['Длительность', '60 минут'], ['Доп. участник', 'настройка курса', true], ['Стоимость доп. участника', '6 000 ₸', true], ['Минимум в группе', '2']])}</div><div class="tiny mt-12">Доплата за дополнительного участника — конфигурация курса, а не константа интерфейса.</div>`, { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'admin-product-resort', role: 'admin', name: 'Админ · Склон и контент', route: '/admin (resort_data, resort_slider)',
    states: 'заполнено · пусто · сохранение',
    notes: 'Данные склона и слайдер на главной живут во вкладке «Продукт», а не «Система».',
    body: `
      ${pageHeader({ eyebrow: 'Продукт', title: 'Склон и контент', sub: 'Данные курорта, слайды главной и скорость прокрутки.' })}
      ${card(`<h3 class="d4">Детали склона</h3><div class="mt-16">${kv([['Название', 'Ташлинская тафта'], ['Часовой пояс', 'Asia/Almaty'], ['Координаты', '43.35, 77.09']])}</div><button class="btn btn-primary mt-20">Сохранить настройки</button>`, { pad: 'pad-24' })}
      <div class="mt-20">${card(`<h3 class="d4">Слайды на главной</h3>${list([
        { title: 'Уверенность начинается здесь', meta: 'Слайд 1 · активен' },
        { title: 'Катайтесь лучше', meta: 'Слайд 2 · активен' },
        { title: 'Чувствуйте разницу', meta: 'Слайд 3 · выключен' },
      ])}`, { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'admin-system-settings', role: 'admin', name: 'Админ · Системные настройки', route: '/admin?tab=system',
    states: 'по умолчанию · изменено · сохранение',
    notes: 'Начальный кредит, матрица уровней, достижения, хранение уведомлений.',
    body: `
      ${pageHeader({ eyebrow: 'Система', title: 'Настройки', sub: 'Глобальные параметры школы.' })}
      <div class="cols-2">
        ${card(`<h3 class="d4">Стартовый кредит</h3><div class="mt-16">${kv([['Сумма', '5 000 ₸', true], ['Активен', 'да']])}</div>`, { pad: 'pad-24' })}
        ${card(`<h3 class="d4">Матрица уровней и рейтинга</h3>${table(['Уровень', 'XP', 'Рейтинг'], [['Начинающий', '0', '0.0'], ['Карвинг', '100', '4.0'], ['Мастерство', '250', '4.5'], ['Эксперт', '500', '5.0']])}`, { pad: 'pad-24' })}
      </div>
      <div class="cols-2 mt-20">
        ${card(`<h3 class="d4">Достижения учеников</h3>${kv([['Включено', '10 достижений'], ['Первое достижение', 'первый спуск']])}`, { pad: 'pad-24' })}
        ${card(`<h3 class="d4">Хранение уведомлений</h3>${kv([['Срок', '90 дней', true]])}<button class="btn btn-primary mt-16">Сохранить изменения</button>`, { pad: 'pad-24' })}
      </div>`,
  },
  {
    id: 'admin-system-danger', role: 'admin', name: 'Админ · Опасная зона', route: '/admin?tab=system (danger zone)',
    states: 'покой · подтверждение с причиной · выполнено',
    notes: 'Разрушительное действие требует явной причины и имени цели.',
    body: `
      ${pageHeader({ eyebrow: 'Система', title: 'Опасная зона', sub: 'Действия необратимы. Требуют подтверждения с указанием причины.' })}
      ${card(`<div class="alrt alrt-flame"><div class="alrt-mark">!</div><div class="grow"><div class="strong">Очистка записей учеников</div><div class="small mt-4">Удаляет записи и историю. Отменить нельзя.</div></div>${btn('Очистить', 'btn-flame btn-sm')}</div>`, { pad: 'pad-24' })}
      <div class="mt-20">${card(`<h3 class="d4">Подтверждение</h3>
        <div class="field field-focus mt-16">Название аккаунта для подтверждения</div>
        <div class="field mt-8" style="height:76px;align-items:flex-start;padding-top:12px">Причина обязательна</div>
        <div class="row gap-8 mt-16">${btn('Удалить безвозвратно', 'btn-flame')}${btn('Отмена', 'btn-ghost')}</div>`, { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'admin-system-testing', role: 'admin', name: 'Админ · Тестовая среда и логи ошибок', route: '/admin?tab=system (testing, error logs)',
    states: 'простой · выполняется · ошибки',
    notes: 'Инструменты тестирования и системные логи.',
    body: `
      ${pageHeader({ eyebrow: 'Система', title: 'Тестирование и логи', sub: 'Создание тестовой сессии и просмотр системных ошибок.' })}
      ${card(`<h3 class="d4">Тестовая среда</h3>${kv([['Статус', 'готова'], ['Сессия', 'нет активной']])}<div class="row gap-8 mt-16">${btn('Создать тестовую сессию', 'btn-primary btn-sm')}${btn('Повторить', 'btn-ghost btn-sm')}</div>`, { pad: 'pad-24' })}
      <div class="mt-20">${card(`<h3 class="d4">Системные логи</h3>${table(['Время', 'Уровень', 'Источник', 'Сообщение'], [
        ['11:04', chip('Ошибка', 'chip-flame'), 'admin-read-models', '400 Bad Request · чтение платежей'],
        ['10:52', chip('Предупреждение', 'chip-gold'), 'outbox', 'Очередь доставки: повтор'],
        ['10:12', chip('Инфо', 'chip-pine'), 'booking', 'Бронирование создано'],
      ])}`, { pad: 'pad-24' })}</div>`,
  },

  /* ======================= SHARED / SYSTEM ======================= */
  {
    id: 'shared-topbar', role: 'shared', name: 'Верхняя панель и переключатель ролей', route: 'везде',
    states: 'гость · клиент · инструктор · администратор',
    notes: 'Роль не берётся из claims — переключатель ведёт по рабочим пространствам.',
    body: `
      ${pageHeader({ eyebrow: 'Общее', title: 'Верхняя панель', sub: 'Личность, баланс, язык, тема, уведомления и переключение рабочих пространств.' })}
      ${card(`<div class="row gap-12" style="flex-wrap:wrap">
        ${chip('Клиент', 'chip-accent')}${chip('Инструктор')}${chip('Администратор')}
      </div><hr class="snowline mt-20">${kv([['Баланс', '755 250 ₸'], ['Язык интерфейса', 'RU ⟷ EN (только два)'], ['Тема', 'светлая / тёмная'], ['Уведомления', 'есть'], ['Выход', 'доступен']])}`, { pad: 'pad-24' })}`,
  },
  {
    id: 'shared-overlays', role: 'shared', name: 'Диалоги, шторки, меню, тосты', route: 'везде',
    states: 'открыт / закрыт · Esc · фокус',
    notes: 'Спецификация поведения оверлеев. В продукте Esc и фокус не работают — это спецификация дизайна.',
    body: `
      ${pageHeader({ eyebrow: 'Общее', title: 'Оверлеи', sub: 'Единое поведение: Esc, ловушка фокуса, возврат фокуса, неактивный фон.' })}
      ${card(`<h3 class="d4">Диалог (≥768 px)</h3>${kv([['Esc', 'закрывает'], ['Начальный фокус', 'первое поле или заголовок'], ['Ловушка фокуса', 'да, внутри окна'], ['Возврат фокуса', 'на элемент-инициатор'], ['Фон', 'не кликабелен'], ['aria', 'role=dialog, aria-modal=true']])}`, { pad: 'pad-24' })}
      <div class="mt-20">${card(`<h3 class="d4">Bottom sheet (<768 px)</h3>${kv([['Esc', 'закрывает'], ['Высота', 'не более 85% экрана'], ['Ручка', 'обязательна'], ['Клавиатура', 'не перекрывает поля'], ['Свайп вниз', 'закрывает']])}`, { pad: 'pad-24' })}</div>
      <div class="mt-20">${card(`<h3 class="d4">Тост</h3>${kv([['aria-live', 'polite'], ['Время', '4 секунды'], ['Действие', 'одно основное']])}`, { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'shared-states', role: 'shared', name: 'Бордер канонических состояний', route: 'справочник',
    states: 'все канонические состояния',
    notes: 'Полный перечень: бронирование 6, зачисление 7, посещаемость 3, оплата, доступ, данные, админ.',
    body: `
      ${pageHeader({ eyebrow: 'Справочник', title: 'Канонические состояния', sub: 'Все состояния взяты из домена. Ни одно не выдумано, ни одно не пропущено.' })}
      ${card(`<h3 class="d4">Бронирование · 6</h3><div class="mt-16">${list([
        { title: 'pending · Ожидает', meta: 'Только гостевая бронь. Обратный отсчёт. Действия: подтвердить, отменить', chips: [chip('Ожидает', 'chip-gold')] },
        { title: 'confirmed · Подтверждён', meta: 'Действия: перенести, отменить, написать', chips: [chip('Подтверждён', 'chip-pine')] },
        { title: 'pending_cancellation · Ожидает отмены', meta: 'Ждёт решения администратора. Действие: отозвать заявку', chips: [chip('Ожидает отмены', 'chip-accent')] },
        { title: 'cancelled · Отменён', meta: 'Всегда с причиной. Терминальное, действий нет', chips: [chip('Отменён')] },
        { title: 'completed · Проведён', meta: 'Терминальное. Только просмотр и отзыв', chips: [chip('Проведён', 'chip-pine')] },
        { title: 'no_show · Неявка', meta: 'Только из явной отметки посещаемости. Терминальное', chips: [chip('Неявка', 'chip-flame')] },
      ])}</div>`, { pad: 'pad-24' })}
      <div class="cols-2 mt-20">
        ${card(`<h3 class="d4">Зачисление на курс · 7</h3>${list([
          { title: 'Активное', chips: [chip('Подтверждён', 'chip-pine')] },
          { title: 'Ожидает подтверждения', chips: [chip('Ожидает', 'chip-gold')] },
          { title: 'Просрочено', chips: [chip('Истекло', 'chip-flame')] },
          { title: 'Завершено', chips: [chip('Завершено', 'chip-pine')] },
          { title: 'Отменено', chips: [chip('Отменён')] },
          { title: 'Приостановлено', chips: [chip('Приостановлено', 'chip-accent')] },
          { title: 'Выбыл', chips: [chip('Выбыл')] },
        ])}`, { pad: 'pad-24' })}
        ${card(`<h3 class="d4">Посещаемость · 3</h3>${list([
          { title: 'present · Пришёл', meta: 'Явная отметка', chips: [chip('Пришёл', 'chip-pine')] },
          { title: 'absent · Не пришёл', meta: 'Только явная отметка человека', chips: [chip('Не пришёл', 'chip-flame')] },
          { title: 'Не отмечено · неизвестно', meta: 'Факт неизвестен. Через 24 ч — задача администратору', chips: [chip('Не отмечено')] },
        ])}
        <hr class="snowline mt-20">
        <h3 class="d4 mt-20">Оплата</h3>
        <div class="mt-12">${list([
          { title: 'Не оплачено', chips: [chip('Требует оплаты', 'chip-flame')] },
          { title: 'Частично покрыто балансом', chips: [chip('Частично', 'chip-gold')] },
          { title: 'В обработке', chips: [chip('В обработке', 'chip-accent')] },
          { title: 'Ошибка', chips: [chip('Ошибка', 'chip-flame')] },
          { title: 'Оплачено', chips: [chip('Оплачено', 'chip-pine')] },
        ])}</div>`, { pad: 'pad-24' })}
      </div>
      <div class="cols-3 mt-20">
        ${card(`<h3 class="d4">Доступ</h3>${list([{ title: 'Загрузка сессии' }, { title: 'Сессия истекла' }, { title: 'Нет доступа' }])}`, { pad: 'pad-24' })}
        ${card(`<h3 class="d4">Данные</h3>${list([{ title: 'Загрузка' }, { title: 'Пусто' }, { title: 'Ошибка' }, { title: 'Устарело' }])}`, { pad: 'pad-24' })}
        ${card(`<h3 class="d4">Админ</h3>${list([{ title: 'Требует действия', chips: [chip('Требует действия', 'chip-flame')] }, { title: 'Решена', chips: [chip('Решена', 'chip-pine')] }, { title: 'Ошибка операции', chips: [chip('Ошибка', 'chip-flame')] }])}`, { pad: 'pad-24' })}
      </div>
      ${alert('pine', 'Правило', 'Отсутствие никогда не выводится из того, что время прошло. Пропуск отметки — это неизвестность, а не «не пришёл».')}`,
  },
];
