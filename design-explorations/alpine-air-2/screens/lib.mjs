/**
 * Alpine Air 2.0 — screen generator helpers.
 * Static HTML only; no build step, no product code involved.
 */

export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const chip = (text, kind = '') => `<span class="chip ${kind}">${esc(text)}</span>`;

export const chipRow = (items) => `<div class="row gap-8" style="flex-wrap:wrap">${items.map((i) => chip(i.t ?? i, i.k ?? '')).join('')}</div>`;

export const btn = (label, kind = 'btn-ghost', extra = '') =>
  `<button class="btn ${kind}" ${extra}>${esc(label)}</button>`;

export const card = (inner, { pad = 'pad-24', style = '' } = {}) =>
  `<section class="card ${pad}" style="${style}">${inner}</section>`;

export const dark = (inner, { pad = 'pad-24' } = {}) =>
  `<section class="card-dark ${pad}">${inner}</section>`;

export const label = (t) => `<div class="label-mono">${esc(t)}</div>`;

export const h2 = (t, sub = '') =>
  `<h2 class="d3">${esc(t)}</h2>${sub ? `<p class="body mt-8">${esc(sub)}</p>` : ''}`;

export const mono = (t, size = 20) => `<div class="num" style="font-size:${size}px">${esc(t)}</div>`;

export const avatar = (initials, kind = '', size = 44) =>
  `<div class="avatar avatar-${size} ${kind}">${esc(initials)}</div>`;

/** stat strip: [{l, v, s}] */
export const stats = (items) =>
  `<div class="stat-strip">${items
    .map(
      (s) => `<div class="stat-cell">
        ${label(s.l)}
        <div class="stat-v">${esc(s.v)}</div>
        ${s.s ? `<div class="tiny mt-4">${esc(s.s)}</div>` : ''}
        ${s.bar ? `<div class="bar mt-10"><div class="bar-fill" style="width:${s.bar}%"></div></div>` : ''}
      </div>`
    )
    .join('')}</div>`;

/** vertical list of records: {title, meta, lead, chips:[{t,k}], actions:[{t,k}]} */
export const list = (items) =>
  `<div class="rec-list">${items
    .map(
      (i) => `<div class="rec">
        ${i.lead ? `<div class="rec-lead">${i.lead}</div>` : ''}
        <div class="grow">
          <div class="row gap-10" style="flex-wrap:wrap;align-items:center">
            <div class="strong">${esc(i.title)}</div>
            ${(i.chips || []).map((c) => chip(c.t ?? c, c.k ?? '')).join('')}
          </div>
          ${i.meta ? `<div class="tiny mt-4">${esc(i.meta)}</div>` : ''}
          ${i.desc ? `<div class="small mt-6">${esc(i.desc)}</div>` : ''}
        </div>
        ${i.actions?.length ? `<div class="rec-actions">${i.actions.map((a) => btn(a.t, a.k ?? 'btn-ghost btn-sm')).join('')}</div>` : ''}
      </div>`
    )
    .join('')}</div>`;

/** dense operational table: {cols:[], rows:[[html,...]]} */
export const table = (cols, rows) =>
  `<div class="table-wrap"><table class="data-table">
    <thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map((r) => `<tr>${r.map((cell, i) => `<td data-l="${esc(cols[i])}">${cell}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table></div>
  <div class="table-foot"><span class="tiny">Показано ${rows.length} из ${rows.length}</span>
    <div class="row gap-8">${btn('Назад', 'btn-ghost btn-sm')}${btn('Вперёд', 'btn-ghost btn-sm')}</div>
  </div>`;

/** key/value detail block */
export const kv = (pairs) =>
  `<div class="kv">${pairs
    .map((p) => `<div class="kv-row"><span class="tiny">${esc(p[0])}</span><span class="kv-v">${p[2] ? `<b>${esc(p[1])}</b>` : esc(p[1])}</span></div>`)
    .join('')}</div>`;

export const alert = (kind, title, desc, action = '') =>
  `<div class="alrt alrt-${kind}">
    <div class="alrt-mark">${kind === 'flame' ? '!' : kind === 'accent' ? 'i' : '✓'}</div>
    <div class="grow">
      <div class="strong">${esc(title)}</div>
      ${desc ? `<div class="small mt-4">${esc(desc)}</div>` : ''}
    </div>
    ${action ? btn(action.t, action.k ?? 'btn-ghost btn-sm') : ''}
  </div>`;

export const empty = (title, desc, action = '') =>
  `<div class="empty">
    <div class="d5">${esc(title)}</div>
    ${desc ? `<div class="small mt-8" style="max-width:420px">${esc(desc)}</div>` : ''}
    ${action ? `<div class="mt-16">${btn(action.t, action.k ?? 'btn-soft')}</div>` : ''}
  </div>`;

export const loadingCard = () =>
  `<div class="card pad-24"><div class="sk-row"><span class="sk sk-circle"></span><span class="sk-lines"><span class="sk" style="width:60%"></span><span class="sk" style="width:38%"></span></span></div><span class="sk mt-16" style="width:100%"></span></div>`;

export const slots = (arr) =>
  `<div class="slot-grid">${arr
    .map((s) => `<div class="slot ${s.k || ''}">${esc(s.t)}</div>`)
    .join('')}</div>`;

export const participants = (listOf) =>
  `<div class="pswitch">
    ${listOf
      .map(
        (p, i) => `<button class="pswitch-item ${p.on ? 'is-on' : ''}">
          <span class="check ${p.on ? 'check-on' : ''}">${p.on ? '✓' : ''}</span>
          ${avatar(p.i, p.k, 36)}
          <span class="pswitch-txt">
            <b>${esc(p.name)}</b>
            <span class="tiny">${esc(p.sub)}</span>
          </span>
        </button>`
      )
      .join('')}
  </div>`;

export const pageHeader = ({ eyebrow, title, sub, actions = [] }) => `
  <header class="pg-head">
    <div>
      <div class="eyebrow eyebrow-accent">${esc(eyebrow)}</div>
      <h1 class="d2 mt-8">${esc(title)}</h1>
      ${sub ? `<p class="body mt-10" style="max-width:640px">${esc(sub)}</p>` : ''}
    </div>
    ${actions.length ? `<div class="pg-actions">${actions.map((a) => btn(a.t, a.k ?? 'btn-ghost')).join('')}</div>` : ''}
  </header>`;

/** role-aware shell. nav: [{t, on}] */
export function shell({ id, title, lang = 'ru', role, nav = [], body, participantsBar = false, stickyCta = null, meta = '' }) {
  const roleTabs = {
    student: [
      { t: 'Главная', on: id === 'student-home' },
      { t: 'Обучение', on: id.startsWith('student-training') || id.startsWith('student-lessons') || id.startsWith('student-skills') },
      { t: 'Тренер', on: id.startsWith('student-coach') },
      { t: 'Профиль', on: id.startsWith('student-profile') || id.startsWith('student-wallet') || id.startsWith('student-participants') || id.startsWith('student-achievements') || id.startsWith('student-season') || id.startsWith('student-videos') || id.startsWith('student-certificates') || id.startsWith('student-history') },
    ],
    instructor: [
      { t: 'Сегодня', on: id.includes('today') },
      { t: 'Расписание', on: id.includes('schedule') },
      { t: 'Участники', on: id.includes('participants') },
      { t: 'Курсы', on: id.includes('courses') },
      { t: 'Финансы', on: id.includes('finance') },
    ],
    admin: [
      { t: 'ОПЕРАЦИИ', on: id.startsWith('admin-operations') },
      { t: 'ФИНАНСЫ', on: id.startsWith('admin-finance') },
      { t: 'ЛЮДИ', on: id.startsWith('admin-people') },
      { t: 'ПРОДУКТ', on: id.startsWith('admin-product') },
      { t: 'СИСТЕМА', on: id.startsWith('admin-system') },
    ],
    public: [
      { t: 'Инструкторы', on: id.includes('instructor') },
      { t: 'Курсы', on: id.includes('course') },
      { t: 'Условия', on: id.includes('conditions') },
      { t: 'О школе', on: false },
    ],
  }[role] || nav;

  return `<!DOCTYPE html>
<html lang="${lang === 'en' ? 'en' : 'ru'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Carve Academy · Alpine Air 2.0</title>
<link rel="stylesheet" href="../../tokens.css">
<link rel="stylesheet" href="../../responsive.css">
</head>
<body>
<a class="skip-link" href="#main">К содержанию</a>
<nav class="nav">
  <div class="wrap row-between" style="height:64px">
    <div class="logo-mark">Carve Academy <span>${esc(meta || 'Алматы')}</span></div>
    <div class="nav-tabs">${roleTabs.map((t) => `<span class="nav-link ${t.on ? 'nav-link-on' : ''}">${esc(t.t)}</span>`).join('')}</div>
    <div class="row gap-10">
      ${participantsBar ? '<div class="av-mini" aria-label="Выбранный участник"><span class="dot"></span>Артём</div>' : ''}
      <div class="seg" title="Язык интерфейса: только RU и EN">
        <span class="seg-item ${lang === 'en' ? 'seg-item-on' : ''}">EN</span>
        <span class="seg-item ${lang === 'ru' ? 'seg-item-on' : ''}">RU</span>
      </div>
      <span class="icon-btn" title="Тема">☾</span>
    </div>
  </div>
  <div class="tabbar">
    ${roleTabs.slice(0, 5).map((t) => `<span class="tab ${t.on ? 'tab-on' : ''}">${esc(t.t)}</span>`).join('')}
  </div>
</nav>
<main id="main" class="wrap main">
${body}
</main>
<footer class="foot">
  <div class="wrap row-between">
    <span class="tiny">© 2026 Carve Academy · Ski &amp; Snowboard Instruction</span>
    <span class="tiny">Алматы · +7 727 000 00 00</span>
  </div>
</footer>
${stickyCta ? `<div class="sticky-cta"><div class="grow"><div class="label-mono">${esc(stickyCta.l)}</div><div class="num" style="font-size:22px">${esc(stickyCta.v)}</div></div>${btn(stickyCta.t, 'btn-primary btn-lg')}</div>` : ''}
</body>
</html>
`;
}