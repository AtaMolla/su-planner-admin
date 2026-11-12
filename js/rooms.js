/* Room and time usage: heatmaps of rooms in use per hour of the week, per building and per room,
   from the meeting places and times in data/courses.js (Fall) and data/schedule-*.js (Spring). */
(() => {
  'use strict';

  const A = window.SUAdmin;
  const { esc, DAYS, ROWS } = A;
  const $ = (sel) => document.querySelector(sel);
  const SLOTS = DAYS.length * ROWS;
  const TEACH = new Set(['Classroom', 'TEAL Classroom', 'Auditorium']);
  const LAB = new Set(['Laboratory', 'Studio Room']);
  const slotLabel = (x) => `${A.DAY_NAMES[Math.floor(x / ROWS)]} ${A.rowStart(x % ROWS)}–${A.rowEnd(x % ROWS)}`;
  const pct = (v) => `${Math.round(v * 100)}%`;

  // ---------- Rooms from SU's room list (type, seats) ----------
  const RD = window.ROOM_DATA || { rooms: [] };
  const META = new Map(RD.rooms.map(([b, code, name, type, seats]) => [`${b} ${code}`, { building: b, code, name, type: type || 'Other', seats }]));

  // ---------- Occupancy per term: roomId -> slots[65] = [{code, type, groups}] ----------
  function occupancy(data) {
    const busy = new Map();
    for (const c of data.courses) {
      for (const cl of c.classes) {
        for (const s of cl.sections) {
          for (const m of s.schedule) {
            if (m.start < 0 || m.day < 0 || m.day > 4) continue;
            const room = A.roomOf(data.places[m.place]);
            if (!room) continue;
            if (!busy.has(room.id)) busy.set(room.id, { ...room, slots: Array.from({ length: SLOTS }, () => []) });
            const slots = busy.get(room.id).slots;
            for (let k = 0; k < m.duration && m.start + k < ROWS; k++) {
              const list = slots[m.day * ROWS + m.start + k];
              const same = list.find((x) => x.code === c.code && x.type === cl.type);
              if (same) { if (!same.groups.includes(s.group)) same.groups.push(s.group); } else list.push({ code: c.code, type: cl.type, groups: [s.group] });
            }
          }
        }
      }
    }
    return busy;
  }
  const TERMS = A.SCHEDULES.map((d) => ({ term: d.term, name: d.termName || A.S.termName(d.term), season: A.seasonOf(d.term), busy: occupancy(d) }));
  const usedEver = new Set(TERMS.flatMap((t) => [...t.busy.keys()]));

  // ---------- State ----------
  const state = {
    term: A.remember('rooms-term', TERMS[0]?.term), building: A.remember('rooms-building', ''),
    kind: A.remember('rooms-kind', 'all'), sort: A.remember('rooms-sort', 'busy'),
  };
  if (!TERMS.some((t) => t.term === state.term)) state.term = TERMS[0]?.term;

  // The rooms counted for the filters: rooms with a class this term, plus classrooms and halls
  // from SU's room list that have none (so idle rooms show up).
  function roomsFor(t) {
    const ids = new Set(t.busy.keys());
    for (const [id, m] of META) if (TEACH.has(m.type)) ids.add(id);
    return [...ids].map((id) => {
      const meta = META.get(id);
      const r = t.busy.get(id) || { ...A.roomOf(id), slots: Array.from({ length: SLOTS }, () => []) };
      return { ...r, type: meta?.type || '', seats: meta?.seats ?? null, used: r.slots.filter((x) => x.length).length };
    }).filter((r) => (!state.building || r.building === state.building)
      && (state.kind === 'all' || (state.kind === 'teach' ? TEACH.has(r.type) : LAB.has(r.type) && usedEver.has(r.id))));
  }

  // ---------- Rendering ----------
  const tipFor = (x, n, of, extra = '') => esc(`<b>${slotLabel(x)}</b><br>${n} of ${of} rooms in use${of ? ` (${pct(n / of)})` : ''}${extra}`);

  function renderTiles(t, rooms) {
    const per = Array.from({ length: SLOTS }, (_, x) => rooms.filter((r) => r.slots[x].length).length);
    const peak = per.reduce((b, v, x) => (v > per[b] ? x : b), 0);
    const day = [];
    for (let x = 0; x < SLOTS; x++) if (x % ROWS < 9) day.push(per[x]); // 08:40–17:30
    const avg = rooms.length ? day.reduce((s, v) => s + v, 0) / (day.length * rooms.length) : 0;
    const idle = rooms.filter((r) => !r.used).length;
    const hours = per.reduce((s, v) => s + v, 0);
    $('#tiles').innerHTML = `
      <div class="tile"><b>${rooms.length}</b><span>rooms counted</span></div>
      <div class="tile"><b>${hours}</b><span>room-hours of class a week</span></div>
      <div class="tile"><b>${per[peak]}</b><span>rooms at the peak, ${esc(slotLabel(peak).replace(/day /, ' ').replace(/–.*/, ''))}</span></div>
      <div class="tile"><b>${pct(avg)}</b><span>average use, 08:40–17:30</span></div>
      <div class="tile"><b>${idle}</b><span>rooms with no class at all</span></div>`;
    return per;
  }

  function renderWeek(rooms, per) {
    const max = Math.max(1, ...per);
    $('#week-sub').textContent = `Number of rooms with a class, out of ${rooms.length}.`;
    $('#week').innerHTML = `<thead><tr><th></th>${DAYS.map((d) => `<th>${d}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: ROWS }, (_, r) => `<tr><th scope="row">${A.rowStart(r)}</th>${DAYS.map((_, d) => {
      const x = d * ROWS + r;
      const v = per[x];
      return `<td class="${v ? '' : 'zero'}" style="${A.heatStyle(v, max)}" tabindex="0" data-tip="${tipFor(x, v, rooms.length)}">${v}</td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
    $('#week-legend').innerHTML = A.rampLegend(max, 'rooms');
  }

  function headRow() {
    return `<thead><tr><th></th>${DAYS.map((d) => `<th colspan="${ROWS}" class="day-h">${d}</th>`).join('')}<th></th></tr>
      <tr class="hours"><th></th>${DAYS.map(() => Array.from({ length: ROWS }, (_, r) => `<th${r ? '' : ' class="day-start"'}>${r % 2 || r > 10 ? '' : 8 + r}</th>`).join('')).join('')}<th class="tot-h">Used</th></tr></thead>`;
  }

  function renderBuildings(t) {
    // Every building, with the room-type filter (the building filter only marks a row).
    const saved = state.building;
    state.building = '';
    const rooms = roomsFor(t);
    state.building = saved;
    const groups = new Map();
    for (const r of rooms) {
      if (!groups.has(r.building)) groups.set(r.building, []);
      groups.get(r.building).push(r);
    }
    const order = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);
    $('#bld').innerHTML = headRow() + `<tbody>${order.map((b) => {
      const list = groups.get(b);
      let used = 0;
      const cells = Array.from({ length: SLOTS }, (_, x) => {
        const n = list.filter((r) => r.slots[x].length).length;
        used += n;
        const share = n / list.length;
        return `<td class="${n ? '' : 'zero'}${x % ROWS === 0 ? ' day-start' : ''}" style="${A.heatStyle(share, 1)}" data-tip="${esc(`<b>${b}</b> · `)}${tipFor(x, n, list.length)}"></td>`;
      }).join('');
      return `<tr class="${state.building === b ? 'picked' : ''}"><th scope="row" class="rlabel"><button type="button" data-building="${esc(b)}" title="${esc(A.BUILDINGS[b] || b)}">${esc(b)}</button> <span class="muted small">${list.length}</span></th>${cells}<td class="tot">${pct(used / (list.length * SLOTS))}</td></tr>`;
    }).join('')}</tbody>`;
    $('#bld-legend').innerHTML = `${A.rampLegend('100%', 'of the building\'s rooms')} <span class="muted small">· click a building to show only its rooms</span>`;
  }

  function renderRooms(rooms) {
    const sorters = {
      busy: (a, b) => b.used - a.used, idle: (a, b) => a.used - b.used,
      seats: (a, b) => (b.seats ?? -1) - (a.seats ?? -1), name: () => 0,
    };
    const list = [...rooms].sort((a, b) => sorters[state.sort](a, b) || A.byCode(a.id, b.id));
    const max = Math.max(1, ...list.flatMap((r) => r.slots.map((s) => s.reduce((t, c) => t + c.groups.length, 0))));
    if (!list.length) { $('#rooms').innerHTML = '<tbody><tr><td class="empty">No rooms match.</td></tr></tbody>'; return; }
    $('#rooms').innerHTML = headRow() + `<tbody>${list.map((r) => {
      const cells = r.slots.map((s, x) => {
        const n = s.reduce((t, c) => t + c.groups.length, 0);
        const what = s.map((c) => `${c.code}${c.type ? ` ${A.typeName(c.type)}` : ''} (${c.groups.map(A.sectionName).join(', ')})`).join('<br>');
        return `<td class="${n ? '' : 'zero'}${x % ROWS === 0 ? ' day-start' : ''}" style="${A.heatStyle(n, max)}"${n ? ` data-tip="${esc(`<b>${r.id}</b> · ${slotLabel(x)}<br>${what}`)}"` : ''}></td>`;
      }).join('');
      const label = `${r.id}${r.seats ? ` · ${r.seats} seats` : ''}${r.type ? ` · ${r.type}` : ''}`;
      return `<tr><th scope="row" class="rlabel" title="${esc(label)}">${esc(r.id)}${r.seats ? ` <span class="muted small">${r.seats}</span>` : ''}</th>${cells}<td class="tot">${r.used} h</td></tr>`;
    }).join('')}</tbody>`;
  }

  function render() {
    for (const k of ['term', 'building', 'kind', 'sort']) A.save(`rooms-${k}`, state[k]);
    const t = TERMS.find((x) => x.term === state.term);
    if (!t) return;
    $('#term').innerHTML = TERMS.map((x) => `<button type="button" data-term="${esc(x.term)}" aria-pressed="${x.term === state.term}">${esc(x.name)}</button>`).join('');
    const buildings = [...new Set(TERMS.flatMap((x) => [...x.busy.values()].map((r) => r.building)))].sort();
    $('#building').innerHTML = `<option value="">All buildings</option>${buildings.map((b) => `<option value="${esc(b)}">${esc(A.BUILDINGS[b] ? `${b} – ${A.BUILDINGS[b]}` : b)}</option>`).join('')}`;
    $('#building').value = state.building;
    const rooms = roomsFor(t);
    const per = renderTiles(t, rooms);
    renderWeek(rooms, per);
    renderBuildings(t);
    renderRooms(rooms);
  }

  $('#term').addEventListener('click', (e) => {
    const b = e.target.closest('[data-term]');
    if (b) { state.term = b.dataset.term; render(); }
  });
  $('#bld').addEventListener('click', (e) => {
    const b = e.target.closest('[data-building]');
    if (b) { state.building = state.building === b.dataset.building ? '' : b.dataset.building; render(); }
  });
  for (const k of ['building', 'kind', 'sort']) $(`#${k}`).addEventListener('change', (e) => { state[k] = e.target.value; render(); });
  $('#kind').value = state.kind;
  $('#sort').value = state.sort;
  A.tip(document.querySelector('main'));
  render();
})();
