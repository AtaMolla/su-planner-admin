/* Big rooms page: the Large and Very large rooms (81+ seats) and the Fall classes that need each one.
   A class needs a room with at least its quota in seats, so a room's classes are those whose quota is
   above the next smaller room's seats (FASS G062, 172 seats, takes quotas 131–172 because the next
   smaller room, FENS L045, has 130). Quotas: data/quota.js (SU's class search, from the term project). */
(() => {
  'use strict';

  const A = window.SUAdmin;
  const { esc, ROWS } = A;
  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => n.toLocaleString('en');

  // Size categories, same limits as the Categories sheet of SU_courses_and_classrooms.xlsx
  const LARGE = 81;
  const VERY_LARGE = 151;
  const HOURS_PER_ROOM = 53; // Mon–Fri 08:40–18:40 = 55 hours, minus the Friday 12:40–14:30 break

  const RD = window.ROOM_DATA || { rooms: [] };
  const QUOTA = window.SECTION_QUOTA?.quota || {};
  const data = window.COURSE_DATA;

  // ---------- Rooms: group rooms with the same seats ----------
  const rooms = RD.rooms.map(([b, code, name, type, seats]) => ({ id: `${b} ${code}`, name, type: type || 'Other', seats }));
  const seatValues = [...new Set(rooms.map((r) => r.seats))].sort((a, b) => a - b);
  const below = (s) => seatValues.filter((v) => v < s).pop() || 0;
  const biggest = seatValues[seatValues.length - 1] || 0;
  const groups = seatValues.filter((s) => s >= LARGE).reverse().map((s) => ({
    seats: s, min: below(s) + 1, rooms: rooms.filter((r) => r.seats === s),
  }));

  // ---------- Sections with a fixed time and a quota ----------
  const sections = [];
  for (const c of data?.courses || []) {
    for (const cl of c.classes) {
      for (const s of cl.sections) {
        const quota = QUOTA[s.crn];
        if (!quota) continue;
        const slots = new Set();
        const where = new Set();
        let hours = 0;
        const seen = new Set();
        for (const m of s.schedule) {
          if (m.start < 0 || m.day < 0 || m.day > 4) continue;
          const room = A.roomOf(data.places[m.place]);
          if (room) where.add(room.id);
          const key = `${m.day}-${m.start}-${m.duration}`;
          if (seen.has(key)) continue; // the same meeting is listed once per room
          seen.add(key);
          hours += m.duration;
          for (let k = 0; k < m.duration; k++) slots.add(m.day * ROWS + m.start + k);
        }
        if (!hours) continue; // time to be announced
        sections.push({
          code: c.code, name: A.courseName(c.code) || c.name, type: cl.type, group: s.group, crn: s.crn,
          quota, hours, slots: [...slots], rooms: [...where].sort(),
        });
      }
    }
  }

  const state = { kind: A.remember('bigrooms-kind', 'all') };
  const shown = () => sections.filter((s) => state.kind === 'all' || s.type === '');
  const fits = (s, g, i) => s.quota >= g.min && (s.quota <= g.seats || (i === 0 && s.quota > biggest));

  function render() {
    A.save('bigrooms-kind', state.kind);
    const list = shown();
    $('#kind').innerHTML = [['all', 'All sections'], ['lecture', 'Lectures only']]
      .map(([id, label]) => `<button type="button" data-kind="${id}" aria-pressed="${id === state.kind}">${label}</button>`).join('');

    const needBig = list.filter((s) => s.quota >= (groups[groups.length - 1]?.min || LARGE));
    const bigRooms = groups.reduce((n, g) => n + g.rooms.length, 0);
    const need = needBig.reduce((h, s) => h + s.hours, 0);
    const have = bigRooms * HOURS_PER_ROOM;
    $('#tiles').innerHTML = `
      <div class="tile"><b>${bigRooms}</b><span>Large and Very large rooms (${LARGE}+ seats)</span></div>
      <div class="tile"><b>${needBig.length}</b><span>${state.kind === 'all' ? 'sections' : 'lectures'} with a quota that needs one</span></div>
      <div class="tile"><b class="${need > have ? 'bad-n' : ''}">${fmt(need)} h <small class="muted">of ${fmt(have)} h</small></b><span>weekly hours they need, of what the big rooms offer</span></div>`;

    $('#rooms').innerHTML = groups.map((g, i) => {
      const own = list.filter((s) => fits(s, g, i)).sort((a, b) => b.quota - a.quota || A.byCode(a.code, b.code));
      // hours check: classes that need this size or bigger vs rooms this size or bigger
      const needUp = list.filter((s) => s.quota >= g.min).reduce((h, s) => h + s.hours, 0);
      const roomsUp = groups.slice(0, i + 1).reduce((n, x) => n + x.rooms.length, 0);
      const haveUp = roomsUp * HOURS_PER_ROOM;
      const over = needUp > haveUp;
      const cat = g.seats >= VERY_LARGE ? '<span class="br-cat vl">Very large</span>' : '<span class="br-cat l">Large</span>';
      const names = g.rooms.map((r) => r.id).join(', ');
      const range = g.min === g.seats ? `Quota ${g.seats}` : `Quota ${g.min}–${g.seats}`;
      const rows = own.map((s) => {
        const here = s.rooms.filter((r) => g.rooms.some((x) => x.id === r));
        const label = `${s.code}${s.type ? ` ${A.typeName(s.type)}` : ''}${s.group && s.group !== '0' ? ` ${s.group}` : ''}`;
        return `<tr>
          <td class="nowrap"><b>${esc(label)}</b></td>
          <td class="c-name cname">${esc(s.name)}</td>
          <td class="num"><b>${s.quota}</b>${s.quota > biggest ? ' <span class="badge bad">bigger than any room</span>' : ''}</td>
          <td class="num">${s.hours} h</td>
          <td class="c-time small">${esc(A.slotsLabel(s.slots))}</td>
          <td class="small ${here.length ? 'here' : ''}">${esc(s.rooms.join(', ') || '–')}${here.length ? ' ✓' : ''}</td></tr>`;
      }).join('');
      return `<section class="card br-card">
        <div class="br-head">
          <h3 class="br-name">${esc(names)} <small>${g.seats} seats · ${esc([...new Set(g.rooms.map((r) => r.type))].join(', '))}</small></h3>
          ${cat}
          <span class="br-range" title="Quota above the next smaller room (${g.min - 1} seats), up to this room's ${g.seats}">${range}</span>
          <span class="br-count">${own.length} ${state.kind === 'all' ? 'section' : 'lecture'}${own.length === 1 ? '' : 's'}</span>
        </div>
        <div class="br-hours">
          <span>Hours a week, classes that need ${g.seats < biggest ? `${g.min}+ seats` : 'this room'}:</span>
          <span class="meter${over ? ' over' : ''}"><i style="width:${Math.min(100, Math.round((needUp / haveUp) * 100))}%"></i></span>
          <b class="${over ? 'bad' : ''}">${fmt(needUp)} h</b>
          <span>of ${fmt(haveUp)} h in ${roomsUp} room${roomsUp === 1 ? '' : 's'} this size or bigger${over ? ' — not enough' : ''}</span>
        </div>
        ${own.length ? `<div class="table-wrap" style="border:0;border-radius:0"><table class="data">
          <thead><tr><th>Class</th><th class="c-name">Course name</th><th class="num">Quota</th><th class="num">Hours</th><th class="c-time">SU time (Fall)</th><th>Room now</th></tr></thead>
          <tbody>${rows}</tbody></table></div>` : `<p class="br-empty">No class needs exactly this size (quotas ${g.min}–${g.seats}).</p>`}
      </section>`;
    }).join('');

    $('#foot').innerHTML = `Quotas are section capacities on SU's class search, ${esc(data?.termName || '')}. Rooms are the teaching
      rooms in SU's room list (no gallery, lobby, stands or rooms with 18 seats or fewer); rooms with the same seats share a card.
      Large = ${LARGE}–${VERY_LARGE - 1} seats, Very large = ${VERY_LARGE}+. A room offers ${HOURS_PER_ROOM} hours a week
      (Mon–Fri 08:40–18:40, minus the Friday 12:40–14:30 break). ✓ = the class meets in this room now.`;
  }

  $('#kind').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (b) { state.kind = b.dataset.kind; render(); }
  });
  render();
})();
