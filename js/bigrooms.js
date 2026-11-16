/* Big rooms page: the Large and Very large rooms (81+ seats) and what is held in each one now (Fall),
   from the meeting places and times in data/courses.js. Quotas: data/quota.js (SU's class search, from the term project). */
(() => {
  'use strict';

  const A = window.SUAdmin;
  const { esc, ROWS } = A;
  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => n.toLocaleString('en');

  // Size categories, same limits as the Categories sheet of SU_courses_and_classrooms.xlsx
  const LARGE = 81;
  const VERY_LARGE = 151;
  const GRID_ROWS = 11; // 08:40 … 18:40 starts, last hour ends 19:30
  const HOURS_PER_ROOM = 5 * GRID_ROWS - 2; // minus the Friday 12:40–14:30 break

  const RD = window.ROOM_DATA || { rooms: [] };
  const QUOTA = window.SECTION_QUOTA?.quota || {};
  const data = window.COURSE_DATA;

  // Year of a course from its number: CS 201 -> 2, 5xx and up -> graduate
  const YEARS = [['1', '1st year'], ['2', '2nd year'], ['3', '3rd year'], ['4', '4th year'], ['g', 'Graduate']];
  const yearOf = (code) => {
    const d = Number((String(code).match(/\d/) || ['1'])[0]);
    return d >= 5 ? 'g' : String(Math.max(1, d));
  };

  // ---------- Big rooms ----------
  const bigRooms = RD.rooms
    .map(([b, code, name, type, seats]) => ({ id: `${b} ${code}`, name, type: type || 'Other', seats }))
    .filter((r) => r.seats >= LARGE)
    .sort((a, b) => b.seats - a.seats || a.id.localeCompare(b.id));
  const isBig = new Map(bigRooms.map((r) => [r.id, r]));

  // ---------- Sections meeting in a big room now: one entry per (section, room) ----------
  const uses = []; // { room, code, name, type, group, crn, quota, year, slots[] }
  for (const c of data?.courses || []) {
    for (const cl of c.classes) {
      for (const s of cl.sections) {
        const byRoom = new Map();
        for (const m of s.schedule) {
          if (m.start < 0 || m.day < 0 || m.day > 4) continue;
          const room = A.roomOf(data.places[m.place]);
          if (!room || !isBig.has(room.id)) continue;
          if (!byRoom.has(room.id)) byRoom.set(room.id, new Set());
          for (let k = 0; k < m.duration; k++) byRoom.get(room.id).add(m.day * ROWS + m.start + k);
        }
        for (const [room, slots] of byRoom) {
          uses.push({
            room, code: c.code, name: A.courseName(c.code) || c.name, type: cl.type, group: s.group, crn: s.crn,
            quota: QUOTA[s.crn] || null, year: yearOf(c.code), slots: [...slots].sort((a, b) => a - b),
          });
        }
      }
    }
  }

  const state = {
    kind: A.remember('bigrooms-kind', 'all'),
    view: A.remember('bigrooms-view', 'week'),
    hide: new Set(A.remember('bigrooms-hide-years', [])),
  };

  const labelOf = (s) => `${s.code}${s.type ? ` ${A.typeName(s.type)}` : ''}${s.group && s.group !== '0' ? ` ${s.group}` : ''}`;
  const isBreak = (d, r) => d === 4 && (r === 4 || r === 5); // Friday 12:40–14:30
  const overQuota = (s, room) => s.quota && s.quota > room.seats;

  // ---------- Week grid: Mon–Fri × 08:40–19:30 ----------
  function weekGrid(room, own) {
    let html = '<div class="wk"><div class="wk-h"></div>' + A.DAY_NAMES.map((d) => `<div class="wk-h">${d}</div>`).join('');
    for (let r = 0; r < GRID_ROWS; r++) {
      html += `<div class="wk-t">${A.rowStart(r)}</div>`;
      for (let d = 0; d < 5; d++) {
        const x = d * ROWS + r;
        const here = own.filter((s) => s.slots.includes(x));
        const cls = here.length > 1 ? 'over' : here.length ? 'some' : isBreak(d, r) ? 'brk' : '';
        const tipTxt = `<b>${room.id} · ${A.DAY_NAMES[d]} ${A.rowStart(r)}–${A.rowEnd(r)}</b><br>`
          + (here.length ? here.map((s) => `${esc(labelOf(s))} · quota ${s.quota ?? '?'} · ${esc(s.name)}`).join('<br>') : 'Free')
          + (here.length > 1 ? '<br>More than one class here at this hour' : '');
        html += `<div class="wk-c ${cls}" data-tip="${esc(tipTxt)}">${isBreak(d, r) && !here.length ? '<span class="wk-brk">break</span>' : ''}`
          + here.map((s) => `<span class="wk-chip y${s.year}${overQuota(s, room) ? ' oq' : ''}">${esc(labelOf(s))}</span>`).join('')
          + '</div>';
      }
    }
    return html + '</div>';
  }

  function render() {
    A.save('bigrooms-kind', state.kind);
    A.save('bigrooms-view', state.view);
    A.save('bigrooms-hide-years', [...state.hide]);
    $('#kind').innerHTML = [['all', 'All sections'], ['lecture', 'Lectures only']]
      .map(([id, label]) => `<button type="button" data-kind="${id}" aria-pressed="${id === state.kind}">${label}</button>`).join('');
    $('#view').innerHTML = [['week', 'Week grid'], ['list', 'List']]
      .map(([id, label]) => `<button type="button" data-view="${id}" aria-pressed="${id === state.view}">${label}</button>`).join('');
    $('#years').innerHTML = YEARS.map(([id, label]) =>
      `<button type="button" data-year="${id}" class="yr y${id}" aria-pressed="${!state.hide.has(id)}" title="${state.hide.has(id) ? 'Show' : 'Hide'} ${label} courses">${label}</button>`).join('');

    const list = uses.filter((s) => (state.kind === 'all' || s.type === '') && !state.hide.has(s.year));
    const used = list.reduce((h, s) => h + s.slots.length, 0);
    const have = bigRooms.length * HOURS_PER_ROOM;
    $('#tiles').innerHTML = `
      <div class="tile"><b>${bigRooms.length}</b><span>Large and Very large rooms (${LARGE}+ seats)</span></div>
      <div class="tile"><b>${new Set(list.map((s) => s.crn)).size}</b><span>${state.kind === 'all' ? 'sections' : 'lectures'} held in them now</span></div>
      <div class="tile"><b>${fmt(used)} h <small class="muted">of ${fmt(have)} h</small></b><span>weekly hours in use, of what the big rooms offer</span></div>`;

    $('#rooms').innerHTML = bigRooms.map((room) => {
      const own = list.filter((s) => s.room === room.id).sort((a, b) => a.slots[0] - b.slots[0] || A.byCode(a.code, b.code));
      const hours = own.reduce((h, s) => h + s.slots.length, 0);
      const cat = room.seats >= VERY_LARGE ? '<span class="br-cat vl">Very large</span>' : '<span class="br-cat l">Large</span>';
      const rows = own.map((s) => `<tr>
          <td class="nowrap"><span class="yr-dot y${s.year}"></span><b>${esc(labelOf(s))}</b></td>
          <td class="c-name cname">${esc(s.name)}</td>
          <td class="num"><b>${s.quota ?? '–'}</b>${overQuota(s, room) ? ' <span class="badge bad">more than seats</span>' : ''}</td>
          <td class="num">${s.slots.length} h</td>
          <td class="c-time small">${esc(A.slotsLabel(s.slots))}</td></tr>`).join('');
      return `<section class="card br-card">
        <div class="br-head">
          <h3 class="br-name">${esc(room.id)} <small>${room.seats} seats · ${esc(room.type)}</small></h3>
          ${cat}
          <span class="br-count">${own.length} ${state.kind === 'all' ? 'section' : 'lecture'}${own.length === 1 ? '' : 's'}</span>
        </div>
        <div class="br-hours">
          <span>Hours in use a week:</span>
          <span class="meter"><i style="width:${Math.min(100, Math.round((hours / HOURS_PER_ROOM) * 100))}%"></i></span>
          <b>${hours} h</b><span>of ${HOURS_PER_ROOM} h</span>
        </div>
        ${state.view === 'week' ? weekGrid(room, own)
          : own.length ? `<div class="table-wrap" style="border:0;border-radius:0"><table class="data">
          <thead><tr><th>Class</th><th class="c-name">Course name</th><th class="num">Quota</th><th class="num">Hours</th><th class="c-time">Time in this room</th></tr></thead>
          <tbody>${rows}</tbody></table></div>` : '<p class="br-empty">Nothing held here.</p>'}
      </section>`;
    }).join('');

    $('#foot').innerHTML = `What each big room holds now, from SU's class search, ${esc(data?.termName || '')}. Quotas are section capacities
      there (– = not known). Rooms are the teaching rooms in SU's room list with ${LARGE}+ seats.
      Large = ${LARGE}–${VERY_LARGE - 1} seats, Very large = ${VERY_LARGE}+. A room offers ${HOURS_PER_ROOM} hours a week
      (Mon–Fri 08:40–19:30, minus the Friday 12:40–14:30 break). Chip colour = course year (from the course number;
      500+ = graduate). Red outline = quota above the room's seats; red cell = more than one class at that hour.`;
  }

  $('#kind').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (b) { state.kind = b.dataset.kind; render(); }
  });
  $('#view').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) { state.view = b.dataset.view; render(); }
  });
  $('#years').addEventListener('click', (e) => {
    const b = e.target.closest('[data-year]');
    if (!b) return;
    const y = b.dataset.year;
    if (state.hide.has(y)) state.hide.delete(y); else state.hide.add(y);
    render();
  });
  A.tip(document.querySelector('main'));
  render();
})();
