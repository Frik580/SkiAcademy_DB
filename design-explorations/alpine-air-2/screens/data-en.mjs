/** English long-copy verification screens (RU/EN coverage). */
import { card, dark, label, pageHeader, stats, list, table, kv, alert, empty, slots, btn, chip, chipRow, avatar, mono, participants } from './lib.mjs';

export const SCREENS_EN = [
  {
    id: 'en-public-home', role: 'public', name: 'Home (EN long copy)', route: '/', en: true,
    states: 'full · no reviews · course unavailable',
    notes: 'Длинные английские строки: самый длинный CTA, заголовок карточки инструктора и подпись курса.',
    body: `
      ${pageHeader({ eyebrow: 'Ski & snowboard school · Almaty', title: 'Confidence starts here', sub: 'Step-by-step instruction from the very first lesson. Private lessons and small groups, honest pricing, booking without back-and-forth email threads.', actions: [{ t: 'Start Your Journey', k: 'btn-primary' }, { t: 'Choose a Course', k: 'btn-ghost' }] })}
      ${card(`<div class="cols-4">
        <div>${label('Temperature')}<div class="stat-v">−12°C</div><div class="tiny mt-4">Feels like −17°C</div></div>
        <div>${label('Snow base')}<div class="stat-v">42 cm</div><div class="tiny mt-4">18 cm fresh</div></div>
        <div>${label('Lift status')}<div class="stat-v" style="color:var(--pine)">Running</div><div class="tiny mt-4">Wind 4 m/s</div></div>
        <div style="background:var(--accent-soft);padding:14px;border-radius:var(--r-sm)">${label('Next available slot')}<div class="stat-v" style="color:var(--accent-ink)">14:30</div><div class="tiny mt-4">7 slots open today</div></div>
      </div>`, { pad: 'pad-24' })}
      <h2 class="d3 mt-40">Instructors</h2>
      <div class="mt-16">${card(list([
        { lead: '★ 5.0', title: 'Aidar Kermetov — ski instructor specialising in beginners and returning riders', meta: '128 reviews · Russian, Kazakh, English · slots today 14:30 and 17:00', desc: 'No reviews received yet.', actions: [{ t: 'Book a Lesson', k: 'btn-primary btn-sm' }, { t: 'View Profile', k: 'btn-ghost btn-sm' }] },
        { lead: '★ 4.9', title: 'Marina Sokolova, snowboard and cross-country freeride', meta: '96 reviews · Russian, English · slots today 11:00 and 16:30', actions: [{ t: 'Book a Lesson', k: 'btn-primary btn-sm' }] },
      ]), { pad: 'pad-24' })}</div>`,
  },
  {
    id: 'en-student-booking', role: 'student', name: 'Booking (EN long copy)', route: '/cabinet', en: true,
    states: 'slot free · taken · group party · partial payment',
    notes: 'Проверка длинного CTA и длинных названий слотов/участников в английском варианте.',
    body: `
      ${pageHeader({ eyebrow: 'Booking', title: 'Marina Sokolova', sub: 'Snowboard · 60 minutes · 11 000 ₸ per hour' })}
      <div class="cols-2 mt-28">
        <div class="col gap-20">
          ${card(`<h3 class="d4">Date</h3><div class="row gap-8 mt-16">
            ${['Mon 8', 'Tue 9', 'Wed 10', 'Thu 11', 'Fri 12', 'Sat 13', 'Sun 14'].map((d, i) => `<div class="daychip ${i === 0 ? 'daychip-on' : ''}"><div class="tiny">${d.split(' ')[0]}</div><div class="strong">${d.split(' ')[1]}</div></div>`).join('')}
          </div>`, { pad: 'pad-24' })}
          ${card(`<h3 class="d4">Time</h3><div class="mt-16">${slots([{ t: '09:00', k: 'slot-off' }, { t: '10:00' }, { t: '11:00', k: 'slot-on' }, { t: '12:00' }, { t: '13:00' }, { t: '14:00', k: 'slot-off' }])}</div>`, { pad: 'pad-24' })}
          ${card(`<h3 class="d4">Who is going on the slope</h3><div class="mt-16">${list([
            { title: 'Artem Sokolov — this is you', meta: 'Ski · intermediate · 14 lessons completed', chips: [chip('Selected', 'chip-pine')] },
            { title: 'Eva Sokolova, 9 years old', meta: 'Additional participant surcharge configured for this programme', chips: [chip('Selected', 'chip-pine')] },
          ])}</div>`, { pad: 'pad-24' })}
        </div>
        <div>${card(`<div class="eyebrow eyebrow-accent">Total</div><div class="mt-16">${kv([['Lesson · Artem', '11 000 ₸'], ['Additional participant · Eva', '6 000 ₸'], ['Equipment rental', '1 200 ₸'], ['Evening rate', '−1 700 ₸'], ['Total payable', '16 500 ₸', true]])}</div>
          <button class="btn btn-primary btn-lg mt-20" style="width:100%">Book the lesson · 16 500 ₸</button>
          <div class="tiny mt-10" style="text-align:center">Free reschedule and cancellation up to 12 hours before</div>`, { pad: 'pad-24' })}</div>
      </div>`,
  },
  {
    id: 'en-student-lessons', role: 'student', name: 'My Lessons (EN, all booking states)', route: '/cabinet (Training)', en: true,
    states: 'all 6 booking states',
    notes: 'Английская версия списка занятий со всеми шестью статусами.',
    body: `
      ${pageHeader({ eyebrow: 'My lessons', title: 'Lessons', sub: 'Upcoming and past lessons. Status changes only through the canonical domain rules.' })}
      ${card(list([
        { lead: '11:00', title: 'Aidar Kermetov · 8 December', meta: 'Tashlina run · Ski', chips: [chip('Confirmed', 'chip-pine'), chip('Paid', 'chip-pine')], actions: [{ t: 'Reschedule', k: 'btn-soft btn-sm' }, { t: 'Cancel', k: 'btn-ghost btn-sm' }] },
        { lead: '14:30', title: 'Timur Abdrakhmanov · 18 December', meta: 'Parallel turns', chips: [chip('Confirmed', 'chip-pine'), chip('Payment due', 'chip-flame')], actions: [{ t: 'Pay now', k: 'btn-primary btn-sm' }] },
        { lead: '16:00', title: 'Marina Sokolova · 20 December', meta: 'Cancellation requested 6 hours ago', chips: [chip('Pending cancellation', 'chip-accent')], actions: [{ t: 'Withdraw request', k: 'btn-ghost btn-sm' }] },
        { lead: '10:00', title: 'Aidar Kermetov · 1 December', meta: 'Reason: cancelled by the student · 9 000 ₸ refunded', chips: [chip('Cancelled')] },
        { lead: '12:00', title: 'Marina Sokolova · 25 November', meta: 'Attendance: present', chips: [chip('Completed', 'chip-pine')] },
        { lead: '09:00', title: 'Timur Abdrakhmanov · 12 November', meta: 'Attendance: absent', chips: [chip('No-show', 'chip-flame')] },
      ]), { pad: 'pad-24' })}`,
  },
  {
    id: 'en-admin-records', role: 'admin', name: 'Training records (EN, dense table)', route: '/admin (canonical_training_records)', en: true,
    states: 'lessons + course enrolments, all statuses',
    notes: 'Самая широкая таблица проекта в английском варианте: проверка ширины колонок и действий.',
    body: `
      ${pageHeader({ eyebrow: 'Operations', title: 'Lessons and courses', sub: 'A single register for lessons and course enrolments, filtered by kind and scope.' })}
      ${card(`<div class="row gap-8" style="margin-bottom:16px;flex-wrap:wrap">${chip('Lessons', 'chip-accent')}${chip('Courses')}${chip('All')}${chip('Current')}${chip('Archived')}</div>
      ${table(['Record ID', 'Booked on', 'Skier', 'Coach', 'Training level', 'Date / time', 'Fee', 'Status', 'Approval actions'], [
        ['BK-1042', '8 Dec', 'Artem Sokolov', 'Aidar Kermetov', 'Intermediate', '8 Dec 11:00', '<span class="num">9 000 ₸</span>', chip('Confirmed', 'chip-pine'), btn('Approve', 'btn-soft btn-sm')],
        ['BK-1043', '9 Dec', 'Eva Sokolova', 'Dana Lysenko', 'Beginner', '9 Dec 15:00', '<span class="num">8 500 ₸</span>', chip('Pending', 'chip-gold'), btn('Pay', 'btn-soft btn-sm')],
        ['EN-203', '20 Dec', 'Nurlan Sagyndyk', 'Arseniy G.', 'Course day 2', 'Course day 2', '<span class="num">150 000 ₸</span>', chip('Withdrawn'), btn('Open', 'btn-ghost btn-sm')],
        ['BK-1047', '12 Nov', 'Anton Drey', 'Marina Sokolova', 'Advanced', '12 Nov 09:00', '<span class="num">11 000 ₸</span>', chip('No-show', 'chip-flame'), btn('Resolve', 'btn-soft btn-sm')],
      ])}`, { pad: 'pad-24' })}`,
  },
];