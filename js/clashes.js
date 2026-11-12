/* Required-course clashes: every program × entry year × semester of the suggested plan,
   checked for a clash-free choice of sections (js/times.js). */
(() => {
  'use strict';

  const A = window.SUAdmin;
  const T = window.SUTimes;
  const P = window.SUPlan;
  const { S, esc } = A;
  const $ = (sel) => document.querySelector(sel);
  const SCHEDULE_TERMS = new Set(A.SCHEDULES.map((d) => d.term));

  // ---------- Analysis ----------
  const timedOnly = (code) => !P.isSlot(code) && !S.isArrangedCourse(code) && !S.isSummerCourse(code);
  function courseFor(src, code) {
    const c = T.lookup(src, code);
    return c && { ...c, code, base: c.code };
  }
  const clashFree = (courses) => T.alternatives(courses, new Map(), { max: 1 }).list.length > 0;

  // Which components of two courses overlap in the least-overlap choice of sections, and when.
  function pairDetail(src, a, b) {
    const ca = courseFor(src, a);
    const cb = courseFor(src, b);
    const { picks } = T.solve(a === b ? [ca] : [ca, cb]);
    const parts = new Map();
    const hours = new Set();
    for (const x of picks) {
      for (const y of picks) {
        if (x === y || (a !== b && x.code === y.code) || (a === b && x.type === y.type)) continue;
        if (a !== b && x.code !== a) continue;
        const shared = x.section.slots.filter((s) => y.section.slots.includes(s));
        if (!shared.length) continue;
        shared.forEach((s) => hours.add(s));
        for (const p of [x, y]) parts.set(`${p.code}|${p.type}`, p);
      }
    }
    const comps = [...parts.values()].map((p) => {
      const c = p.code === a ? ca : cb;
      const g = c.groups.find((gr) => gr.type === p.type);
      return { code: p.code, type: p.type, sections: g.sections };
    });
    return { comps, hours: [...hours] };
  }

  const planCache = new Map();
  function analysePlan(pid, entry) {
    const key = `${pid}|${entry}`;
    if (planCache.has(key)) return planCache.get(key);
    const plan = P.suggest(pid, entry);
    const dodged = P.suggest(pid, entry, { dodge: true });
    const where = (sems, code) => sems.findIndex((s) => s.includes(code));
    const sems = [];
    for (let i = 0; i < P.SEMESTERS; i++) {
      const term = P.semesterTerm(entry, i);
      const src = T.sourceFor(term);
      const codes = plan[i].filter((c) => !P.isSlot(c));
      const timed = codes.filter(timedOnly);
      const courses = [];
      const missing = [];
      for (const code of timed) {
        const c = courseFor(src, code);
        if (c) courses.push(c); else missing.push(code);
      }
      const ok = clashFree(courses);
      const pairs = [];
      if (!ok) {
        for (let x = 0; x < courses.length; x++) {
          if (!clashFree([courses[x]])) pairs.push([courses[x].code, courses[x].code]);
          for (let y = x + 1; y < courses.length; y++) {
            if (!clashFree([courses[x], courses[y]])) pairs.push([courses[x].code, courses[y].code].sort(A.byCode));
          }
        }
      }
      // No single pair always clashes, but the whole set does: name the courses that overlap
      // in the choice of sections with the fewest overlapping hours.
      let group = null;
      if (!ok && !pairs.length) {
        const { picks } = T.solve(courses);
        const cl = T.clashes(picks);
        group = { codes: [...new Set(cl.flatMap((p) => [p.a, p.b]))].sort(A.byCode), when: A.slotsLabel(cl.flatMap((p) => p.slots)) };
      }
      const moved = ok ? [] : codes.filter((c) => where(dodged, c) !== i).map((c) => ({ code: c, to: where(dodged, c) }));
      sems.push({
        i, term, season: A.seasonOf(term), now: SCHEDULE_TERMS.has(term), src, codes, courses, missing,
        arranged: codes.filter((c) => S.isArrangedCourse(c)), ok, pairs, group, moved,
        electives: plan[i].length - codes.length,
      });
    }
    const res = { pid, entry, sems, bad: sems.filter((s) => !s.ok).length };
    planCache.set(key, res);
    return res;
  }

  // Every program × entry year, and the fix list of pairs across all of them.
  const ALL = [];
  for (const p of A.PROGRAMS) for (const t of A.TERMS) if (S.termsFor(p.id).some((x) => x.term === t.term)) ALL.push(analysePlan(p.id, t.term));

  // ---------- State ----------
  const state = {
    program: A.remember('clash-program', ''),
    nowOnly: A.remember('clash-now', false),
    pick: A.remember('clash-pick', null), // { pid, entry }
  };
  if (!A.PROGRAMS.some((p) => p.id === state.program)) state.program = '';

  // ---------- Rendering ----------
  const semLabel = (s) => `${P.semesterTitle(s.i)}`;
  const nowBadge = (s) => (s.now ? `<span class="badge now" title="Students who started in this year take this semester in ${esc(S.termName(s.term))}">this year</span>` : '');
  const courseLine = (code) => `<b class="code">${esc(code)}</b> <span class="muted">${esc(A.courseName(code))}</span>`;

  function sectionsHtml(comp) {
    return comp.sections.map((sec) => {
      const times = sec.meetings.filter((m) => m.start >= 0 && m.day <= 4)
        .map((m) => `${A.meetingLabel(m)}${m.place ? ` <span class="muted">${esc(m.place)}</span>` : ''}`).join('; ') || 'TBA';
      return `<li><span class="sec">${esc(A.sectionName(sec.group))}</span> <span class="muted small">CRN ${esc(sec.crn)}</span> · ${times}</li>`;
    }).join('');
  }

  function pairHtml(d, a, b) {
    const title = a === b
      ? `${courseLine(a)}: its own parts always overlap`
      : `${courseLine(a)} <span class="x">×</span> ${courseLine(b)}`;
    return `<div class="pair">
      <div class="pair-title">${title}</div>
      <div class="pair-when"><span class="badge bad">Overlap</span> ${esc(A.slotsLabel(d.hours))}</div>
      <div class="comps">${d.comps.map((c) => `<div class="comp">
        <div class="comp-name">${esc(c.code)} ${esc(A.typeName(c.type))} <span class="muted small">(${c.sections.length} section${c.sections.length === 1 ? '' : 's'}${c.sections.length > 1 ? ', all overlap' : ''})</span></div>
        <ul class="secs">${sectionsHtml(c)}</ul></div>`).join('')}</div>
    </div>`;
  }

  function visibleSems(r) {
    return r.sems.filter((s) => !state.nowOnly || s.now);
  }
  const plans = () => ALL.filter((r) => !state.program || r.pid === state.program);

  function renderTiles() {
    const rs = plans();
    const sems = rs.flatMap(visibleSems);
    const bad = sems.filter((s) => !s.ok);
    const pairs = new Set(bad.flatMap((s) => s.pairs.map((p) => `${s.season}|${p.join('|')}`)));
    const nowBad = bad.filter((s) => s.now).length;
    $('#tiles').innerHTML = `
      <div class="tile"><b>${sems.length}</b><span>semesters checked (${rs.length} plans)</span></div>
      <div class="tile"><b>${bad.length}</b><span>semesters with a clash</span></div>
      <div class="tile"><b>${pairs.size}</b><span>course pairs that always overlap</span></div>
      <div class="tile"><b>${nowBad}</b><span>clashing semesters students take this year</span></div>`;
  }

  function renderFixList() {
    const items = new Map();
    for (const r of plans()) {
      for (const s of visibleSems(r)) {
        const add = (key, make) => {
          if (!items.has(key)) items.set(key, { ...make(), affected: [] });
          items.get(key).affected.push({ r, s });
        };
        for (const [a, b] of s.pairs) add(`${s.season}|${a}|${b}`, () => ({ season: s.season, a, b, src: s.src }));
        if (s.group) add(`${s.season}|set|${s.group.codes.join('|')}`, () => ({ season: s.season, set: s.group, src: s.src }));
      }
    }
    const list = [...items.values()].sort((x, y) => y.affected.some((f) => f.s.now) - x.affected.some((f) => f.s.now)
      || y.affected.length - x.affected.length);
    if (!list.length) {
      $('#fix-list').innerHTML = `<div class="card empty">No clashes${state.nowOnly ? ' in the semesters students take this year' : ''}. 🎉</div>`;
      return;
    }
    $('#fix-list').innerHTML = list.map((it) => {
      const body = it.set
        ? `<div class="pair"><div class="pair-title">${it.set.codes.map(courseLine).join(', ')}</div>
            <div class="pair-when"><span class="badge warn">Together</span> Every two of them fit, but not all at once. Closest choice still overlaps: ${esc(it.set.when)}</div></div>`
        : pairHtml(pairDetail(it.src, it.a, it.b), it.a, it.b);
      const who = it.affected.map(({ r, s }) => `<button type="button" class="who${s.now ? ' now' : ''}" data-pid="${esc(r.pid)}" data-entry="${esc(r.entry)}"
        title="${esc(A.programName(r.pid))}, started ${esc(A.entryLabel(r.entry))}: ${esc(semLabel(s))}${s.now ? ` (${esc(S.termName(s.term))})` : ''}">${esc(r.pid.toUpperCase())} ${esc(r.entry.slice(0, 4))} · ${esc(semLabel(s).replace('Year ', 'Y'))}</button>`).join('');
      return `<article class="card fix">
        <div class="fix-head"><span class="badge plain">${esc(it.season)}</span>
          <span class="muted small">${it.affected.length} plan${it.affected.length === 1 ? '' : 's'}${it.affected.some((f) => f.s.now) ? ' · <b class="now-text">students hit it this year</b>' : ''}</span></div>
        ${body}
        <div class="who-list">${who}</div>
      </article>`;
    }).join('');
  }

  function renderMatrix() {
    const progs = A.PROGRAMS.filter((p) => !state.program || p.id === state.program);
    const head = `<tr><th>Program</th>${A.TERMS.map((t) => `<th class="num">${esc(A.entryLabel(t.term))}</th>`).join('')}</tr>`;
    const rows = progs.map((p) => `<tr><th scope="row" class="prog">${esc(p.name)}</th>${A.TERMS.map((t) => {
      const r = ALL.find((x) => x.pid === p.id && x.entry === t.term);
      if (!r) return '<td class="num muted">–</td>';
      const n = visibleSems(r).filter((s) => !s.ok).length;
      const picked = state.pick?.pid === p.id && state.pick?.entry === t.term;
      return `<td class="num"><button type="button" class="cell ${n ? 'bad' : 'ok'}${picked ? ' picked' : ''}" data-pid="${esc(p.id)}" data-entry="${esc(t.term)}"
        aria-label="${esc(p.name)}, ${esc(A.entryLabel(t.term))}: ${n} semesters with a clash">${n || '✓'}</button></td>`;
    }).join('')}</tr>`).join('');
    $('#matrix').innerHTML = `<table class="data matrix">${head}${rows}</table>`;
  }

  function renderDetail() {
    let pick = state.pick;
    if (!pick || !ALL.some((r) => r.pid === pick.pid && r.entry === pick.entry) || (state.program && pick.pid !== state.program)) {
      const pool = plans();
      const first = pool.find((r) => r.bad) || pool[0];
      pick = first ? { pid: first.pid, entry: first.entry } : null;
    }
    if (!pick) { $('#detail').innerHTML = ''; return; }
    state.pick = pick;
    const r = analysePlan(pick.pid, pick.entry);
    $('#detail-title').textContent = `${A.programName(r.pid)}, started ${A.entryLabel(r.entry)}`;
    $('#detail').innerHTML = `<div class="sem-grid">${r.sems.map((s) => {
      const res = s.ok ? T.alternatives(s.courses, new Map(), { max: T.MAX_ALTS }) : null;
      const status = s.ok
        ? `<span class="badge ok">${res.list.length}${res.complete ? '' : '+'} clash-free timetable${res.list.length === 1 ? '' : 's'}</span>`
        : '<span class="badge bad">Clash</span>';
      const problems = s.ok ? '' : `${s.pairs.map(([a, b]) => pairHtml(pairDetail(s.src, a, b), a, b)).join('')}${s.group
        ? `<div class="pair"><div class="pair-title">${s.group.codes.map(courseLine).join(', ')}</div><div class="pair-when"><span class="badge warn">Together</span> fit two at a time, not all at once (closest: ${esc(s.group.when)})</div></div>` : ''}
        ${s.moved.length ? `<p class="moved small">SU Planner dodges this by moving ${s.moved.map((m) => `<b>${esc(m.code)}</b> to ${esc(m.to >= 0 ? P.semesterTitle(m.to) : 'another semester')}`).join(', ')}.</p>` : ''}`;
      const extra = [
        s.missing.length && `Not on the ${esc(s.season)} schedule: ${s.missing.map(esc).join(', ')}`,
        s.arranged.length && `${s.arranged.map(esc).join(', ')}: times arranged after registration`,
        s.electives && `${s.electives} elective placeholder${s.electives === 1 ? '' : 's'} (not checked)`,
      ].filter(Boolean).map((t) => `<li>${t}</li>`).join('');
      return `<article class="card sem${s.ok ? '' : ' has-clash'}">
        <div class="sem-head"><b>${esc(semLabel(s))}</b> <span class="muted small">${esc(S.termName(s.term))}</span> ${nowBadge(s)}</div>
        <div class="sem-status">${status}</div>
        <ul class="sem-courses">${s.courses.map((c) => `<li>${courseLine(c.code)}</li>`).join('') || '<li class="muted">No timed required courses</li>'}</ul>
        ${problems}
        ${extra ? `<ul class="sem-extra small muted">${extra}</ul>` : ''}
      </article>`;
    }).join('')}</div>`;
  }

  function render() {
    A.save('clash-program', state.program);
    A.save('clash-now', state.nowOnly);
    renderTiles();
    renderFixList();
    renderMatrix();
    renderDetail();
    A.save('clash-pick', state.pick);
  }

  // ---------- Controls ----------
  $('#program').innerHTML = `<option value="">All programs</option>${S.PROGRAMS.faculties.map((f) => `<optgroup label="${esc(f.name)}">${f.programs.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}`;
  $('#program').value = state.program;
  $('#now-only').checked = state.nowOnly;
  $('#program').addEventListener('change', (e) => { state.program = e.target.value; render(); });
  $('#now-only').addEventListener('change', (e) => { state.nowOnly = e.target.checked; render(); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pid]');
    if (!b) return;
    state.pick = { pid: b.dataset.pid, entry: b.dataset.entry };
    renderMatrix();
    renderDetail();
    A.save('clash-pick', state.pick);
    $('#detail-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  render();
})();
