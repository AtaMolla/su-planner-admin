/* New schedule page: the timetable the IE 312 class scheduling model builds (data/model-result.js,
   written by class_scheduling.py in the term project folder). Stage 1 = each class's hours,
   stage 2 = the room of each hour. Shown room by room as week grids, or as a list of changes. */
(() => {
  'use strict';

  const A = window.SUAdmin;
  const { esc, ROWS } = A;
  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => n.toLocaleString('en');
  const R = window.MODEL_RESULT;
  const GRID_ROWS = 11; // the model plans 08:40 … 18:40
  // Same page, two tabs: "current" = SU's timetable this term, otherwise the model's new schedule
  const CURRENT = document.body.dataset.mode === 'current';

  if (!R || !R.rooms || !R.classes?.length || R.classes[0].length < 9) {
    $('main').insertAdjacentHTML('beforeend', '<p class="empty">No room results yet. Run class_scheduling.py (stage 2) in the term project folder.</p>');
    return;
  }

  const norm = (p) => (p ? A.roomOf(p)?.id || p : null);
  const YEARS = [['1', '1st year'], ['2', '2nd year'], ['3', '3rd year'], ['4', '4th year'], ['g', 'Graduate']];
  const yearOf = (code) => {
    const d = Number((String(code).match(/\d/) || ['1'])[0]);
    return d >= 5 ? 'g' : String(Math.max(1, d));
  };
  // "CS303-B" -> "CS 303 B", "MATH409-0/MATH555-0" -> "MATH 409 / MATH 555"
  const labelOf = (name) => name.split('/').map((s) => s.replace(/_\d+$/, '').replace(/-0$/, '').replace(/-/, ' ')
    .replace(/^([A-Z]+)/, '$1 ')).join(' / ');
  const blocked = new Set(R.settings.blocked);
  // "MATH101R-A1" -> course "MATH 101R", section "A1"; "MATH409-0/MATH555-0" -> "MATH 409 / MATH 555", ""
  function courseAndSection(name, codes) {
    const parts = name.replace(/_\d+$/, '').split('/').map((p) => {
      const code = [...codes].sort((a, b) => b.length - a.length).find((k) => p.startsWith(k.replace(/\s+/g, ''))) || '';
      const [type, group = ''] = p.slice(code.replace(/\s+/g, '').length).split('-');
      return { course: code ? `${code}${type}` : p.split('-')[0], sec: group === '0' ? '' : group };
    });
    return { course: [...new Set(parts.map((x) => x.course))].join(' / '), sec: parts[0].sec };
  }

  // ---------- Classes ----------
  // [name, codes, quota, flags, rooms now, SU slots, model slots | null, model room per model slot, SU room per SU slot]
  const classes = R.classes.map(([name, codes, quota, flags, , now, model, mrooms, suRoom]) => {
    const slots = model || now;
    const at = new Map(slots.map((x, i) => [x, mrooms ? mrooms[i] : null]));   // model: slot -> room
    const was = new Map(now.map((x, i) => [x, norm(suRoom?.[i])]));             // SU: slot -> room
    const suRooms = new Set([...was.values()].filter(Boolean));
    const used = new Set([...at.values()].filter(Boolean));
    return {
      name, label: labelOf(name), codes, quota, now, slots, at, was, campus: !!(flags & 4), lab: !!(flags & 2),
      fixed: !!(flags & 1), year: yearOf(codes[0]), course: A.courseName(codes[0]),
      newTime: !!model, newRoom: !!mrooms && [...used].some((r) => !suRooms.has(r)), oneRoom: used.size === 1,
      text: `${codes.join(' ')} ${labelOf(name)} ${name}`.toLowerCase().replace(/\s+/g, ''),
      ...courseAndSection(name, codes), subject: codes[0].split(' ')[0],
    };
  });
  const subjects = [...new Set(classes.map((c) => c.subject))].sort();
  const placed = classes.filter((c) => c.campus);
  const totalHours = classes.reduce((s, c) => s + c.now.length, 0);
  const kept = classes.reduce((s, c) => s + c.now.filter((x) => c.at.has(x)).length, 0);

  // ---------- Rooms ----------
  const rooms = R.rooms.map(([id, lab, seats]) => ({ ...A.roomOf(id), lab, seats, here: new Map(), gone: new Map() }))
    .sort((a, b) => a.building.localeCompare(b.building) || A.byCode(a.code, b.code));
  const room = new Map(rooms.map((r) => [r.id, r]));
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const c of placed) {
    if (CURRENT) {
      // SU's timetable as it is this term: each class in its SU room at its SU hours
      for (const [x, r] of c.was) if (room.has(r)) push(room.get(r).here, x, c);
      continue;
    }
    for (const [x, r] of c.at) if (room.has(r)) push(room.get(r).here, x, c);
    // SU had it in this room at this hour, the model doesn't: a faded "moved away" chip
    for (const [x, r] of c.was) if (room.has(r) && c.at.get(x) !== r) push(room.get(r).gone, x, c);
  }
  const buildings = [...new Set(rooms.map((r) => r.building))];

  // building, "with changes" and the search are shared by both schedule tabs, so switching compares the same rooms
  const VIEW_KEY = CURRENT ? 'cs-view' : 'ns-view';
  const VIEWS = CURRENT ? [['time', 'By time'], ['week', 'By room']] : [['time', 'By time'], ['week', 'By room'], ['list', 'Changes list']];
  const state = {
    view: A.remember(VIEW_KEY, 'time'),
    only: A.remember('ns-only', 'all'),
    bld: A.remember('ns-bld', 'all'),
    subj: A.remember('ns-subj', 'all'),
    q: '',
  };
  if (!VIEWS.some(([v]) => v === state.view)) state.view = 'time';

  // ---------- Year and program filters (shared by both schedule tabs) ----------
  state.hide = new Set(A.remember('ns-hide-years', []));          // course years to hide
  state.prog = A.remember('ns-prog', 'all');                      // program id or 'all'
  state.entry = A.remember('ns-entry', A.TERMS[0]?.term);         // the program's curriculum of this entry year
  state.cats = new Set(A.remember('ns-cats', ['req', 'core', 'area']));
  if (state.prog !== 'all' && !A.PROGRAMS.some((p) => p.id === state.prog)) state.prog = 'all';
  const KINDS = [['req', 'Required'], ['core', 'Core'], ['area', 'Area']];
  const KIND_OF = { required: 'req', requirement: 'req', core: 'core', area: 'area' };
  let progKind = new Map();                                       // course code -> 'req' | 'core' | 'area'
  let planSem = new Map();                                        // course code -> semester 0..7 of the suggested plan
  function loadProgram() {
    progKind = new Map();
    planSem = new Map();
    if (state.prog === 'all') return;
    const terms = A.S.termsFor(state.prog).map((t) => t.term);
    if (!terms.includes(state.entry)) state.entry = terms[0];
    for (const cat of A.S.requirementsFor(state.prog, state.entry) || []) {
      const k = KIND_OF[A.S.categoryKind(cat)];
      if (!k) continue;
      for (const code of cat.courses) {
        const key = A.S.canonicalCode(code);
        const old = progKind.get(key);
        if (!old || KINDS.findIndex(([v]) => v === k) < KINDS.findIndex(([v]) => v === old)) progKind.set(key, k);
      }
    }
    // the suggested 8-semester plan, as SU Planner builds it (js/plan-core.js), for this curriculum
    if (window.SUPlan) {
      SUPlan.suggest(state.prog, state.entry).slice(0, 8).forEach((sem, i) => {
        for (const code of sem) if (!SUPlan.isSlot(code)) planSem.set(A.S.canonicalCode(code), i);
      });
    }
  }
  loadProgram();
  // semester of a class in the suggested plan (its earliest course code there), or undefined
  const planOf = (c) => {
    const s = c.codes.map((code) => planSem.get(A.S.canonicalCode(code))).filter((v) => v !== undefined);
    return s.length ? Math.min(...s) : undefined;
  };
  const planLabel = (i) => `Y${Math.floor(i / 2) + 1} ${i % 2 ? 'Spring' : 'Fall'}`;
  state.season = A.remember('ns-season', 'any');                  // 'any' | 'fall' | 'spring': the plan's semesters
  const kindOf = (c) => {
    let best = null;
    for (const code of c.codes) {
      const k = progKind.get(A.S.canonicalCode(code));
      if (k && (!best || KINDS.findIndex(([v]) => v === k) < KINDS.findIndex(([v]) => v === best))) best = k;
    }
    return best;
  };
  // With a program: "Plan: Fall / Spring" shows the suggested plan's courses of that season (whatever
  // their category); otherwise the Required / Core / Area toggles decide.
  const progShown = (c) => {
    if (state.prog === 'all') return true;
    if (state.season !== 'any') {
      const p = planOf(c);
      return p !== undefined && (p % 2 ? 'spring' : 'fall') === state.season;
    }
    return state.cats.has(kindOf(c));
  };
  const shown = (c) => !state.hide.has(c.year) && progShown(c);
  const kindTag = (c) => {
    if (state.prog === 'all') return '';
    const k = kindOf(c);
    const p = planOf(c);
    return (k ? `<span class="tg-k k-${k}">${KINDS.find(([v]) => v === k)[1]}</span>` : '')
      + (p !== undefined ? `<span class="tg-p ${p % 2 ? 'spring' : 'fall'}" title="Suggested plan: ${SUPlan.semesterTitle(p)}">${planLabel(p)}</span>` : '');
  };
  if (state.subj !== 'all' && !subjects.includes(state.subj)) state.subj = 'all';
  const normQ = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  $('#q').value = A.remember('ns-q', '');
  state.q = normQ($('#q').value);
  if (state.bld !== 'all' && !buildings.includes(state.bld)) state.bld = 'all';

  const matches = (c) => !state.q || c.text.includes(state.q);
  const changed = (c) => c.newTime || c.newRoom;
  // "Mon 10:40–12:30 FASS G062, Wed 10:40–11:30 FASS G062": runs of back-to-back hours in one room
  function runs(slots, roomAt) {
    const s = [...slots].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let j = i;
      while (j + 1 < s.length && s[j + 1] === s[j] + 1 && Math.floor(s[j + 1] / ROWS) === Math.floor(s[i] / ROWS)
        && roomAt.get(s[j + 1]) === roomAt.get(s[i])) j++;
      out.push({ from: s[i], to: s[j], room: roomAt.get(s[i]) || 'no campus room', slots: s.slice(i, j + 1) });
      i = j;
    }
    return out;
  }
  const runText = (r) => `${A.DAYS[Math.floor(r.from / ROWS)]} ${A.rowStart(r.from % ROWS)}–${A.rowEnd(r.to % ROWS)}`;
  const whereText = (slots, roomAt) => runs(slots, roomAt).map((r) => `${runText(r)} ${r.room}`).join(', ');

  function tipFor(rm, d, r, here, gone) {
    let t = `<b>${esc(rm.id)} · ${A.DAY_NAMES[d]} ${A.rowStart(r)}–${A.rowEnd(r)}</b>`;
    if (!here.length && !gone.length) return t + '<br>Free';
    for (const c of here) {
      t += `<br><b>${esc(c.label)}</b> · quota ${c.quota || '?'} · ${esc(c.course)}`;
      if (changed(c)) t += `<br>&nbsp;&nbsp;SU: ${esc(whereText(c.now, c.was))}<br>&nbsp;&nbsp;Model: ${esc(whereText(c.slots, c.at))}`;
      else if (CURRENT) t += '<br>&nbsp;&nbsp;Same time and room in the model';
    }
    for (const c of gone) t += `<br><s>${esc(c.label)}</s> was here at SU, model: ${esc(whereText(c.slots, c.at))}`;
    return t;
  }

  function chip(c, cls) {
    const dim = state.q && !matches(c) ? ' dim' : state.q ? ' hit' : '';
    return `<span class="wk-chip y${c.year}${cls}${dim}">${esc(c.label)}</span>`;
  }

  function weekGrid(rm) {
    let html = '<div class="wk"><div class="wk-h"></div>' + A.DAY_NAMES.map((d) => `<div class="wk-h">${d}</div>`).join('');
    for (let r = 0; r < GRID_ROWS; r++) {
      html += `<div class="wk-t">${A.rowStart(r)}</div>`;
      for (let d = 0; d < 5; d++) {
        const x = d * ROWS + r;
        const here = (rm.here.get(x) || []).filter(shown);
        const gone = (rm.gone.get(x) || []).filter(shown);
        const brk = blocked.has(x);
        const cls = here.length > 1 ? 'over' : here.length ? 'some' : brk ? 'brk' : '';
        html += `<div class="wk-c ${cls}" data-tip="${esc(tipFor(rm, d, r, here, gone))}">`
          + (brk && !here.length ? '<span class="wk-brk">break</span>' : '')
          + here.map((c) => chip(c, CURRENT ? '' : !c.now.includes(x) ? ' nt' : c.was.get(x) !== rm.id ? ' nr' : '')).join('')
          + gone.map((c) => chip(c, ' ghost')).join('')
          + '</div>';
      }
    }
    return html + '</div>';
  }

  // ---------- By time: Mon–Fri × 08:40–18:40, every class meeting at that hour, grouped by course ----------
  const nowAt = new Map();
  const modelAt = new Map();
  for (const c of classes) {
    for (const x of c.now) push(nowAt, x, c);
    for (const x of c.slots) push(modelAt, x, c);
  }
  const markAt = (c, x) => {
    if (CURRENT) return '';
    if (!c.now.includes(x)) return 'nt';                                   // new hour
    if (c.campus && c.at.get(x) && c.at.get(x) !== c.was.get(x)) return 'nr';  // same hour, new room
    return '';
  };
  function timeCell(x) {
    const keep = (c) => shown(c) && (state.subj === 'all' || c.subject === state.subj) && matches(c)
      && (state.only !== 'changed' || changed(c));
    const items = (CURRENT ? nowAt : modelAt).get(x)?.filter(keep).map((c) => ({ c, mark: markAt(c, x) })) || [];
    if (!CURRENT) {   // classes SU has at this hour and the model moved away: struck out
      for (const c of nowAt.get(x) || []) if (!c.slots.includes(x) && keep(c)) items.push({ c, mark: 'ghost' });
    }
    const groups = new Map();
    for (const it of items) push(groups, it.c.course, it);
    const n = items.filter((it) => it.mark !== 'ghost').length;
    const html = [...groups.entries()].sort((a, b) => A.byCode(a[0], b[0])).map(([course, list]) => {
      list.sort((a, b) => A.byCode(a.c.sec, b.c.sec));
      const c0 = list[0].c;
      const tip = `<b>${esc(course)}</b> · ${esc(c0.course === course ? A.courseName(c0.codes[0]) : '')}`
        + list.map(({ c, mark }) => {
          const room = CURRENT ? c.was.get(x) : mark === 'ghost' ? c.was.get(x) : c.at.get(x);
          let line = `<br>${esc(c.label)} · quota ${c.quota || '?'} · ${esc(room || 'no campus room')}`;
          if (mark === 'ghost') line += ` · <i>model: ${esc(whereText(c.slots, c.at))}</i>`;
          else if (changed(c)) line += `<br>&nbsp;&nbsp;SU: ${esc(whereText(c.now, c.was))}<br>&nbsp;&nbsp;Model: ${esc(whereText(c.slots, c.at))}`;
          return line;
        }).join('');
      const secs = list.filter((it) => it.c.sec).map(({ c, mark }) => `<span class="tg-s ${mark}">${esc(c.sec)}</span>`).join('');
      const solo = list.length === 1 && !list[0].c.sec ? ` ${list[0].mark}` : '';
      return `<div class="tg-g" data-tip="${esc(tip)}"><span class="wk-chip y${c0.year}${solo}">${esc(course)}</span>${kindTag(c0)}${secs}</div>`;
    }).join('');
    return { n, html };
  }
  function renderTime() {
    let html = '<div class="card tg-card"><div class="tg"><div class="tg-h"></div>' + A.DAY_NAMES.map((d) => `<div class="tg-h">${d}</div>`).join('');
    for (let r = 0; r < GRID_ROWS; r++) {
      html += `<div class="tg-t">${A.rowStart(r)}</div>`;
      for (let d = 0; d < 5; d++) {
        const x = d * ROWS + r;
        if (blocked.has(x)) { html += '<div class="tg-c brk"><span class="wk-brk">break</span></div>'; continue; }
        const cell = timeCell(x);
        html += `<div class="tg-c">${cell.n ? `<span class="tg-n">${cell.n}</span>` : ''}${cell.html}</div>`;
      }
    }
    return html + '</div></div>';
  }

  function renderWeek() {
    const visibleRooms = rooms.filter((rm) => {
      if (state.bld !== 'all' && rm.building !== state.bld) return false;
      const all = [...[...rm.here.values()].flat(), ...[...rm.gone.values()].flat()].filter(shown);
      if ((state.prog !== 'all' || state.hide.size) && !all.length) return false;
      if (state.only === 'changed' && !rm.gone.size && !all.some(changed)) return false;
      if (state.q && !all.some(matches)) return false;
      return true;
    });
    if (!visibleRooms.length) return '<p class="empty">No rooms match.</p>';
    return visibleRooms.map((rm) => {
      const hours = [...rm.here.values()].reduce((s, l) => s + l.length, 0);
      const have = 5 * GRID_ROWS - blocked.size;
      const ids = new Set([...rm.here.values()].flat());
      const nChg = new Set([...[...rm.here.values()].flat().filter(changed), ...[...rm.gone.values()].flat()]).size;
      return `<section class="card br-card">
        <div class="br-head">
          <h3 class="br-name">${esc(rm.id)} <small>${rm.seats} seats</small></h3>
          ${rm.lab ? '<span class="ns-badge lab">Lab</span>' : ''}
          ${nChg ? `<span class="ns-badge chg">${nChg} ${CURRENT ? `class${nChg === 1 ? '' : 'es'} change in the model` : `change${nChg === 1 ? '' : 's'}`}</span>` : ''}
          <span class="br-count">${ids.size} class${ids.size === 1 ? '' : 'es'}</span>
        </div>
        <div class="br-hours">
          <span>Hours in use a week:</span>
          <span class="meter"><i style="width:${Math.min(100, Math.round((hours / have) * 100))}%"></i></span>
          <b>${hours} h</b><span>of ${have} h</span>
        </div>
        ${weekGrid(rm)}
      </section>`;
    }).join('');
  }

  function renderList() {
    const inBld = (c) => state.bld === 'all'
      || [...c.at.values(), ...c.was.values()].some((r) => r && A.roomOf(r)?.building === state.bld);
    const list = classes.filter((c) => changed(c) && shown(c) && matches(c) && inBld(c))
      .sort((a, b) => b.newTime - a.newTime || A.byCode(a.name, b.name));
    if (!list.length) return '<p class="empty">No changed classes match.</p>';
    const cell = (c, slots, roomAt, other, otherAt) => runs(slots, roomAt).map((r) => {
      const diff = r.slots.some((x) => otherAt.get(x) !== roomAt.get(x) || !other.includes(x));
      return `<span class="run${diff ? ' diff' : ''}">${runText(r)} <span class="rm">${esc(r.room)}</span></span>`;
    }).join('');
    return `<section class="card"><div class="table-wrap"><table class="data ns-list">
      <thead><tr><th>Class</th><th class="num">Quota</th><th>SU timetable</th><th>Model</th><th>Change</th></tr></thead>
      <tbody>${list.map((c) => `<tr>
        <td><span class="yr-dot y${c.year}"></span><b>${esc(c.label)}</b><span class="cname c-name">${esc(c.course)}</span></td>
        <td class="num">${c.quota || '–'}</td>
        <td>${cell(c, c.now, c.was, c.slots, c.at)}</td>
        <td>${cell(c, c.slots, c.at, c.now, c.was)}</td>
        <td class="chg">${c.newTime ? '<span class="badge warn">new time</span> ' : ''}${c.newRoom ? '<span class="badge now">new room</span>' : ''}</td>
      </tr>`).join('')}</tbody></table></div></section>`;
  }

  function render() {
    A.save(VIEW_KEY, state.view);
    A.save('ns-only', state.only);
    A.save('ns-bld', state.bld);
    A.save('ns-subj', state.subj);
    A.save('ns-hide-years', [...state.hide]);
    A.save('ns-prog', state.prog);
    A.save('ns-entry', state.entry);
    A.save('ns-cats', [...state.cats]);
    $('#years').innerHTML = YEARS.map(([id, label]) =>
      `<button type="button" data-year="${id}" class="yr y${id}" aria-pressed="${!state.hide.has(id)}" title="${state.hide.has(id) ? 'Show' : 'Hide'} ${label} courses">${label}</button>`).join('');
    $('#prog').innerHTML = '<option value="all">All programs</option>'
      + A.PROGRAMS.map((p) => `<option value="${esc(p.id)}"${p.id === state.prog ? ' selected' : ''}>${esc(p.short)} – ${esc(p.name)}</option>`).join('');
    const progOn = state.prog !== 'all';
    $('#entry').hidden = !progOn;
    $('#cats').hidden = !progOn;
    if (progOn) {
      $('#entry').innerHTML = A.S.termsFor(state.prog).map((t) =>
        `<option value="${t.term}"${t.term === state.entry ? ' selected' : ''}>Curriculum: ${esc(A.entryLabel(t.term))} entry</option>`).join('');
      $('#cats').innerHTML = KINDS.map(([k, label]) => {
        const n = [...progKind.values()].filter((v) => v === k).length;
        return `<button type="button" data-cat="${k}" aria-pressed="${state.cats.has(k)}"><span class="tg-k k-${k}">${label}</span> ${n}</button>`;
      }).join('');
      const nPlan = (odd) => [...planSem.values()].filter((i) => i % 2 === odd).length;
      $('#season').innerHTML = [['any', 'Any'], ['fall', `Plan: Fall (${nPlan(0)})`], ['spring', `Plan: Spring (${nPlan(1)})`]]
        .map(([v, label]) => `<button type="button" data-season="${v}" aria-pressed="${state.season === v}">${label}</button>`).join('');
      $('#cats').classList.toggle('off', state.season !== 'any');
    }
    $('#season').hidden = !progOn;
    A.save('ns-season', state.season);
    const seg = (id, key, opts) => {
      $(id).innerHTML = opts.map(([v, label]) => `<button type="button" data-v="${v}" aria-pressed="${state[key] === v}">${label}</button>`).join('');
    };
    const time = state.view === 'time';
    seg('#view', 'view', VIEWS);
    $('#view').hidden = false;
    seg('#only', 'only', time ? [['all', 'All classes'], ['changed', CURRENT ? 'Changed in the model' : 'Only changes']]
      : [['all', 'All rooms'], ['changed', 'With changes']]);
    $('#only').hidden = state.view === 'list';
    $('#bld').hidden = time;
    $('#bld').innerHTML = `<option value="all">All buildings</option>`
      + buildings.map((b) => `<option value="${esc(b)}"${b === state.bld ? ' selected' : ''}>${esc(A.BUILDINGS[b] ? `${b} – ${A.BUILDINGS[b]}` : b)}</option>`).join('');
    $('#subj').hidden = !time;
    $('#subj').innerHTML = `<option value="all">All subjects</option>`
      + subjects.map((s) => `<option value="${esc(s)}"${s === state.subj ? ' selected' : ''}>${esc(s)}</option>`).join('');

    const years = '';   // the year buttons above double as the colour key
    $('#legend').innerHTML = CURRENT ? years
      : time ? years
        + '<span class="k"><span class="wk-chip y2">MATH 201</span><span class="tg-s nt">A</span> new hour</span>'
        + '<span class="k"><span class="wk-chip y2">MATH 201</span><span class="tg-s nr">A</span> same hour, new room</span>'
        + '<span class="k"><span class="wk-chip y2">MATH 201</span><span class="tg-s ghost">A</span> at this hour at SU, not in the model</span>'
      : state.view === 'week' ? years
        + '<span class="k"><span class="wk-chip y2 nt">CS 300</span> new hour</span>'
        + '<span class="k"><span class="wk-chip y2 nr">CS 300</span> same hour, new room</span>'
        + '<span class="k"><span class="wk-chip y2 ghost">CS 300</span> here at SU, not in the model</span>'
      : '';
    $('#out').innerHTML = time ? renderTime() : state.view === 'week' ? renderWeek() : renderList();
  }

  // ---------- Tiles and footnote (do not change with the filters) ----------
  const clash = R.groups?.clash;
  const edgeHours = (key) => placed.reduce((s, c) => s + c[key].filter((x) => x % ROWS === 0 || x % ROWS === GRID_ROWS - 1).length, 0);
  if (CURRENT) {
    const inRooms = rooms.reduce((s, rm) => s + [...rm.here.values()].reduce((t, l) => t + l.length, 0), 0);
    const busy = rooms.filter((rm) => [...rm.here.values()].some((l) => l.length > 1)).length;
    $('#tiles').innerHTML = `
      <div class="tile"><b>${fmt(placed.length)}</b><span>classes with a campus room (${R.rooms.length} rooms, ${R.labs} of them labs)</span></div>
      <div class="tile"><b>${fmt(inRooms)} h</b><span>class hours in these rooms a week</span></div>
      <div class="tile"><b>${fmt(edgeHours('now'))} h</b><span>class hours at 08:40 or 18:40 (model: ${fmt(edgeHours('slots'))} h)</span></div>
      <div class="tile"><b>${classes.filter(changed).length}</b><span>classes the model gives a new time or room</span></div>
      ${clash ? `<div class="tile"><b>${clash[0]}</b><span>student clash hours (model: ${clash[1]})</span></div>` : ''}
      ${busy ? `<div class="tile"><b>${busy}</b><span>rooms with two classes at the same hour somewhere</span></div>` : ''}`;
    $('#foot').innerHTML = `SU's own ${esc(R.termName)} timetable, with the same rooms, filters and colours as the New schedule tab, so the two
      can be compared room by room (the building, "with changes" and search choices carry over between the tabs). Hover a cell to
      see where the model puts that class. Rooms are SU's teaching rooms (no stands, lobbies or rooms with ${R.settings.minSeats - 1} seats or
      fewer); classes held elsewhere are not shown. Chip colour = course year; red cell = two classes in the room at that hour.`;
  }
  if (!CURRENT) $('#tiles').innerHTML = `
    <div class="tile"><b>${fmt(placed.length)}</b><span>classes with a campus room (${R.rooms.length} rooms, ${R.labs} of them labs)</span></div>
    <div class="tile"><b>${fmt(kept)} <small class="muted">of ${fmt(totalHours)} h</small></b><span>class hours kept at SU's time</span></div>
    <div class="tile"><b>${fmt(placed.reduce((s, c) => s + c.slots.filter((x) => x % ROWS === 0 || x % ROWS === GRID_ROWS - 1).length, 0))} h</b><span>class hours at 08:40 or 18:40 (SU: ${fmt(placed.reduce((s, c) => s + c.now.filter((x) => x % ROWS === 0 || x % ROWS === GRID_ROWS - 1).length, 0))} h)</span></div>
    <div class="tile"><b>${classes.filter((c) => c.newTime).length}</b><span>classes at a new time</span></div>
    <div class="tile"><b>${classes.filter((c) => c.newRoom).length}</b><span>classes in a room they don't use at SU</span></div>
    <div class="tile"><b>${placed.filter((c) => c.oneRoom).length}</b><span>classes in one room all week</span></div>
    ${clash ? `<div class="tile"><b class="${clash[1] < clash[0] ? 'good' : ''}">${clash[0]}<span class="arrow">→</span>${clash[1]}</b><span>student clash hours (SU → model)</span></div>` : ''}`;

  const s2 = R.stage2;
  if (!CURRENT) $('#foot').innerHTML = `Model run ${esc(R.run)}, ${esc(R.termName)}. Stage 1 (times): ${esc(R.status)} in ${R.seconds} s;
    goal = −10 × demand for every class hour at 08:40 and 18:40 (demand ${R.demand?.on ? 'from each major\'s 3rd-year required courses, 1 for the rest' : '= 1'}),
    SU's own times are not rewarded, first-year courses are locked to them.
    ${s2 ? `Stage 2 (rooms): ${esc(s2.status)} in ${s2.seconds} s, ${fmt(s2.variables)} variables.` : ''}
    Rooms are SU's teaching rooms (no stands, lobbies or rooms with ${R.settings.minSeats - 1} seats or fewer); lab classes
    use labs only, the other classes the other rooms, and every class gets a room with at least its quota in seats
    (capped at the biggest room of its kind). ${classes.length - placed.length} classes meet off campus or in rooms
    outside this list, so they have no room here. Chip colour = course year. "Here at SU" = SU's timetable had the class in this room
    at this hour and the model put it somewhere else. Student clash hours count the student groups of the model (a course's
    lecture with its own recitations and labs, and each program's same-year required courses).`;

  const pick = (id, key) => $(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) { state[key] = b.dataset.v; render(); }
  });
  pick('#view', 'view');
  pick('#only', 'only');
  $('#bld').addEventListener('change', (e) => { state.bld = e.target.value; render(); });
  $('#subj').addEventListener('change', (e) => { state.subj = e.target.value; render(); });
  $('#years').addEventListener('click', (e) => {
    const b = e.target.closest('[data-year]');
    if (!b) return;
    const y = b.dataset.year;
    if (state.hide.has(y)) state.hide.delete(y); else state.hide.add(y);
    render();
  });
  $('#prog').addEventListener('change', (e) => { state.prog = e.target.value; loadProgram(); render(); });
  $('#entry').addEventListener('change', (e) => { state.entry = e.target.value; loadProgram(); render(); });
  $('#season').addEventListener('click', (e) => {
    const b = e.target.closest('[data-season]');
    if (b) { state.season = b.dataset.season; render(); }
  });
  $('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    const k = b.dataset.cat;
    if (state.cats.has(k)) state.cats.delete(k); else state.cats.add(k);
    render();
  });
  let timer = 0;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = normQ(e.target.value); A.save('ns-q', e.target.value); render(); }, 150);
  });
  A.tip(document.querySelector('main'));
  render();
})();
