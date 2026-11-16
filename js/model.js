/* Timetable model page: results of the IE 312 class scheduling model (data/model-result.js,
   written by class_scheduling.py in the term project folder). */
(() => {
  'use strict';

  const A = window.SUAdmin;
  const { esc, DAYS, ROWS } = A;
  const $ = (sel) => document.querySelector(sel);
  const R = window.MODEL_RESULT;
  const HOURS = 11; // the model plans 08:40 … 18:40
  const slotLabel = (x) => `${DAYS[Math.floor(x / ROWS)]} ${A.rowStart(x % ROWS)}`;
  const fmt = (n) => n.toLocaleString('en');

  if (!R) {
    $('main').insertAdjacentHTML('beforeend', '<p class="empty">No model results yet. Run class_scheduling.py in the term project folder.</p>');
    return;
  }

  // ---------- Classes ----------
  // [name, codes, quota, flags, rooms now, SU slots, model slots | null]
  const classes = R.classes.map(([name, codes, quota, flags, rooms, now, model]) => ({
    name, codes, quota, rooms, now, model: model || now, moved: !!model,
    fixed: !!(flags & 1), lab: !!(flags & 2), campus: !!(flags & 4),
  }));
  const blocked = new Set(R.settings.blocked);
  // Two room pools in the model: labs for lab classes, the other rooms for the other classes
  const roomsWith = (k) => (R.rooms ? R.rooms.filter(([, lab, s]) => !lab && s >= k).length : R.roomSeats.filter((s) => s >= k).length);
  const nonLabRooms = roomsWith(0);
  // Objective: -10 x demand for every class hour at 08:40 and at 18:40
  const EDGE = new Set([0, 10]);                       // rows 08:40 and 18:40
  const atEdge = (x) => EDGE.has(x % ROWS);
  const totalHours = classes.reduce((s, c) => s + c.now.length, 0);
  const kept = classes.reduce((s, c) => s + c.now.filter((x) => c.model.includes(x)).length, 0);
  const moved = classes.filter((c) => c.moved);

  // Classes at each slot, per timetable: slot -> [class]
  function bySlot(key) {
    const m = new Map();
    for (const c of classes) {
      if (!c.campus) continue;
      for (const x of c[key]) { if (!m.has(x)) m.set(x, []); m.get(x).push(c); }
    }
    return m;
  }
  const AT = { now: bySlot('now'), model: bySlot('model') };

  // Why did the model move this class? Look for a rule SU's time breaks.
  function reason(c) {
    for (const x of c.now) {
      if (blocked.has(x)) return `SU time ${slotLabel(x)} is in the Friday break`;
    }
    const edge = c.now.find(atEdge);
    if (edge !== undefined) return `SU time ${slotLabel(edge)} is an 08:40 or 18:40 hour (penalty −10 × demand)`;
    let best = null;
    if (!c.lab) {
      for (const x of c.now) {
        const here = (AT.now.get(x) || []).filter((o) => !o.lab);
        // room size levels at or below this class's quota (k = 0 means any room)
        const levels = [...new Set(here.map((o) => o.quota).filter((q) => q <= c.quota))].sort((a, b) => b - a);
        for (const k of levels) {
          const need = here.filter((o) => o.quota >= k).length;
          const have = roomsWith(k);
          if (need > have && (!best || k > best.k)) { best = { k, need, have, x }; break; }
        }
      }
    } else {
      for (const x of c.now) {
        const labs = (AT.now.get(x) || []).filter((o) => o.lab).length;
        if (labs > R.labs) return `${slotLabel(x)}: ${labs} lab classes, only ${R.labs} labs`;
      }
    }
    if (best) return `${slotLabel(best.x)}: ${best.need} classes need ${best.k}+ seats, only ${best.have} rooms have that many`;
    return 'No rule broken: SU\'s times are not in the goal, so any free time scores the same';
  }

  // ---------- Tiles ----------
  const fixedN = classes.filter((c) => c.fixed).length;
  $('#tiles').innerHTML = `
    <div class="tile"><b>${fmt(kept)} <small class="muted">of ${fmt(totalHours)}</small></b><span>class hours kept at SU's time (${Math.round((kept / totalHours) * 100)}%)</span></div>
    <div class="tile"><b>${moved.length}</b><span>classes moved, of ${fmt(classes.length)}</span></div>
    <div class="tile"><b>${fixedN}</b><span>first-year classes locked</span></div>
    <div class="tile"><b>${R.roomSeats.length}</b><span>teaching rooms (${R.labs} labs)</span></div>
    <div class="tile"><b>${R.seconds} s</b><span>${esc(R.status.toLowerCase())} · ${fmt(R.variables)} variables</span></div>`;

  // ---------- Week grids ----------
  const SIZES = [
    { id: 'any', label: 'Any room', k: 0 }, { id: '60', label: '60+', k: 60 }, { id: '100', label: '100+', k: 100 },
    { id: '150', label: '150+', k: 150 }, { id: '200', label: '200+', k: 200 }, { id: 'lab', label: 'Labs', lab: true },
  ];
  const state = { size: A.remember('model-size', '200'), show: A.remember('model-show', 'moved'), q: '' };
  if (!SIZES.some((s) => s.id === state.size)) state.size = '200';

  function countAt(key, x, size) {
    const here = AT[key].get(x) || [];
    return size.lab ? here.filter((c) => c.lab) : here.filter((c) => !c.lab && c.quota >= size.k);
  }

  function grid(key, size, have) {
    let peak = 1;
    for (let d = 0; d < DAYS.length; d++) for (let r = 0; r < HOURS; r++) peak = Math.max(peak, countAt(key, d * ROWS + r, size).length);
    const max = Math.max(have, peak);
    return `<thead><tr><th></th>${DAYS.map((d) => `<th>${d}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: HOURS }, (_, r) => `<tr><th scope="row">${A.rowStart(r)}</th>${DAYS.map((_, d) => {
      const x = d * ROWS + r;
      if (blocked.has(x)) return '<td class="blocked" data-tip="<b>Friday break</b><br>No classes (prayer time)">–</td>';
      const list = countAt(key, x, size);
      const n = list.length;
      const over = n > have;
      // list the classes for the size filters (the "any room" list would be too long)
      const names = size.k || size.lab
        ? list.slice(0, 12).map((c) => `${c.name} (${c.quota})`).join('<br>') + (n > 12 ? `<br>+${n - 12} more` : '')
        : '';
      const tipText = `<b>${slotLabel(x)}</b><br>${n} class${n === 1 ? '' : 'es'} need ${size.lab ? 'a lab' : size.k ? `${size.k}+ seats` : 'a room'}, ${have} ${size.lab ? 'labs' : 'rooms fit'}${over ? '<br><b>Too many: some must move</b>' : ''}${names ? `<br>${names}` : ''}`;
      return `<td class="${over ? 'over' : n ? '' : 'zero'}" style="${over ? '' : A.heatStyle(n, max)}" tabindex="0" data-tip="${esc(tipText)}">${n}</td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
  }

  function renderGrids() {
    const size = SIZES.find((s) => s.id === state.size);
    const have = size.lab ? R.labs : roomsWith(size.k);
    $('#size').innerHTML = SIZES.map((s) => `<button type="button" data-size="${s.id}" aria-pressed="${s.id === state.size}">${esc(s.label)}</button>`).join('');
    $('#grid-sub').textContent = size.lab
      ? `Lab classes in each hour. There are ${have} labs, so a red square is an hour with too many lab classes.`
      : `Non-lab classes in each hour that need ${size.k ? `a room with ${size.k}+ seats` : 'a room'} (by quota). ${have} non-lab rooms ${size.k ? `have ${size.k}+ seats` : 'in total'}, so a red square is an hour with more classes than rooms.`;
    $('#g-su').innerHTML = grid('now', size, have);
    $('#g-model').innerHTML = grid('model', size, have);
    $('#grid-legend').innerHTML = `${A.rampLegend(have, 'classes')}<span class="key"><i class="k-over"></i>more classes than rooms</span><span class="key"><i class="k-blocked"></i>Friday break</span>`;
  }

  // ---------- Class list ----------
  const roomText = (c) => (c.rooms.length ? c.rooms.map(([p, s]) => `${p}${s ? ` (${s})` : ''}`).join(', ') : '–');
  const norm = (s) => s.toLowerCase().replace(/\s+/g, '');

  function renderList() {
    $('#show').innerHTML = [['moved', `Moved (${moved.length})`], ['all', `All (${fmt(classes.length)})`]]
      .map(([id, label]) => `<button type="button" data-show="${id}" aria-pressed="${id === state.show}">${esc(label)}</button>`).join('');
    const q = norm(state.q);
    let list = state.show === 'moved' ? moved : classes;
    if (q) list = list.filter((c) => norm(c.name).includes(q) || c.codes.some((k) => norm(k).includes(q)));
    list = [...list].sort((a, b) => A.byCode(a.name, b.name));
    $('#list-sub').textContent = state.show === 'moved'
      ? 'Classes whose time the model changed, and the rule their SU time breaks. Quota = seats on SU\'s class search; room seats in brackets.'
      : 'Every class the model planned. Locked = first-year course, kept at its SU time.';
    if (!list.length) { $('#list').innerHTML = '<tbody><tr><td class="empty">No classes match.</td></tr></tbody>'; return; }
    $('#list').innerHTML = `<thead><tr><th>Class</th><th class="num">Quota</th><th>Room now</th><th>SU time</th><th>Model time</th><th>${state.show === 'moved' ? 'Why it moved' : 'Status'}</th></tr></thead><tbody>${list.map((c) => {
      const name = c.codes.map(A.courseName).filter(Boolean)[0] || '';
      const status = c.moved ? `<span class="badge warn">Moved</span>` : c.fixed ? '<span class="badge now">Locked</span>' : '<span class="badge ok">Same</span>';
      return `<tr>
        <td class="nowrap"><b class="code">${esc(c.name)}</b>${name ? `<span class="cname">${esc(name)}</span>` : ''}</td>
        <td class="num">${c.quota || '–'}</td>
        <td class="small">${esc(roomText(c))}</td>
        <td class="when">${esc(A.slotsLabel(c.now))}</td>
        <td class="when ${c.moved ? 'new' : 'same'}">${c.moved ? esc(A.slotsLabel(c.model)) : 'same'}</td>
        <td class="why">${state.show === 'moved' ? esc(reason(c)) : status}</td></tr>`;
    }).join('')}</tbody>`;
  }

  // ---------- Rules ----------
  const S = R.settings;
  const rules = [
    [`First-year courses keep this term's SU times and rooms: every course numbered 101 or 102 and the first-year University Courses (${S.firstYear.join(', ')}).`, true],
    ['Every class gets all its weekly hours.', true],
    ['An instructor teaches one lecture at a time (instructors don\'t attend labs or recitations).', true],
    [`Student groups (a course's lecture with its own recitations and labs; each program's same-year required courses) shouldn't overlap: each clash hour costs ${S.groupPenalty ?? '?'} in the goal.`, S.useGroups],
    ['A lecture is only placed when its instructor is available.', true],
    [`Non-lab classes: at most ${nonLabRooms} in any hour (number of non-lab teaching rooms).`, true],
    ['Room size: in every hour, non-lab classes with a quota of k or more ≤ non-lab rooms with k or more seats.', true],
    [`Labs: at most ${R.labs} lab classes in any hour, and lab classes with a quota of k or more ≤ labs with k or more seats.`, true],
    ['A class meets at most as many hours a day as it does now (at least 2).', true],
    [`An instructor lectures at most ${S.maxDaily} hours a day.`, true],
    ['No classes on Friday 12:40–14:30 (prayer break).', true],
    ['Binary variables.', true],
    ['On each day a class meets in one block of back-to-back hours (no gaps).', true],
    ['Classes only in SU\'s teaching hours, Mon–Fri 08:40–19:30.', true],
  ];
  $('#rules').innerHTML = rules.map(([t, on]) => `<li class="${on ? '' : 'off'}">${esc(t)}${on ? '' : ' <span class="badge plain">off for now</span>'}</li>`).join('');
  const D = R.demand;
  const demandText = D?.on && D.majors?.length
    ? `demand = 1, except each major's 3rd-year required courses, which get the average quota of those courses
       (summed when several majors require one): ${D.majors.map(([m, v, cs]) => `${esc(m.toUpperCase())} ${v} (${esc(cs.join(', '))})`).join('; ')}`
    : 'demand = 1 for every class';
  $('#foot').innerHTML = `Goal: maximize −10 × demand for every class hour at 08:40 and at 18:40, minus the student clash penalty.
    SU's own times are not rewarded, so the model moves classes freely inside the rules. ${demandText}.
    Teaching rooms leave out ${esc(S.removedRooms.join(', '))} and rooms with fewer than ${S.minSeats} seats.
    ${esc(R.termName)} schedule, model run ${esc(R.run)}. To update this page, run <code>class_scheduling.py</code> in the term project folder.`;

  // ---------- Events ----------
  $('#size').addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (b) { state.size = b.dataset.size; A.save('model-size', state.size); renderGrids(); }
  });
  $('#show').addEventListener('click', (e) => {
    const b = e.target.closest('[data-show]');
    if (b) { state.show = b.dataset.show; A.save('model-show', state.show); renderList(); }
  });
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; renderList(); });
  A.tip(document.querySelector('main'));
  renderGrids();
  renderList();
})();
