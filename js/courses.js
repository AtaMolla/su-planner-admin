/* Course overview: every course with its programs and roles, prerequisites, credits and sections. */
(() => {
  'use strict';

  const A = window.SUAdmin;
  const T = window.SUTimes;
  const { S, esc } = A;
  const $ = (sel) => document.querySelector(sel);
  const CATALOG = S.REQUIREMENTS.catalog || {};
  const ROLE_ORDER = ['required', 'requirement', 'core', 'area', 'university', 'free'];
  const ROLE_NAME = {
    required: 'Required', requirement: 'Required (choose from a list)', core: 'Core elective',
    area: 'Area elective', university: 'University course', free: 'Free elective', other: 'Other',
  };
  const level = (code) => (code.split(' ')[1] || '')[0] || '';

  // ---------- Courses: the catalog, plus scheduled undergraduate courses it lacks ----------
  const byBase = new Map();
  for (const code of Object.keys(CATALOG)) if (!byBase.has(S.baseCode(code))) byBase.set(S.baseCode(code), code);
  const codes = new Set(Object.keys(CATALOG));
  for (const src of [T.fall, T.spring]) {
    for (const code of src?.byCode.keys() || []) {
      if (codes.has(code) || byBase.has(code) || Number(level(code)) >= 5) continue;
      codes.add(code);
    }
  }
  // Courses whose prerequisites name a course: code -> [later courses]
  const opens = new Map();
  for (const [code, c] of Object.entries(CATALOG)) {
    for (const g of c[5] || []) for (const p of g) {
      if (S.baseCode(p) === S.baseCode(code)) continue;
      const k = byBase.get(S.baseCode(p)) || p;
      if (!opens.has(k)) opens.set(k, []);
      if (!opens.get(k).includes(code)) opens.get(k).push(code);
    }
  }

  function sectionInfo(src, code) {
    const c = T.lookup(src, code);
    if (!c) return null;
    const main = c.groups.find((g) => g.type === '') || c.groups[0];
    return { course: c, main: main ? main.sections.length : 0, parts: c.groups.map((g) => `${A.typeName(g.type)} ${g.sections.length}`) };
  }

  const COURSES = [...codes].map((code) => {
    const c = CATALOG[code];
    const fall = sectionInfo(T.fall, code);
    const spring = sectionInfo(T.spring, code);
    return {
      code, name: c?.[0] || fall?.course.name || spring?.course.name || '',
      su: c?.[1] ?? null, ects: c?.[2] ?? null, eng: c?.[3] ?? 0, basic: c?.[4] ?? 0,
      prereq: A.prereqText(code), fall, spring, level: level(code),
      search: S.fold(`${code} ${c?.[0] || fall?.course.name || spring?.course.name || ''}`),
    };
  }).sort((a, b) => A.byCode(a.code, b.code));

  // ---------- Roles for an entry year: code -> [{pid, kind}] ----------
  const roleCache = new Map();
  function rolesFor(entry) {
    if (roleCache.has(entry)) return roleCache.get(entry);
    const roles = new Map();
    for (const p of A.PROGRAMS) {
      const cats = S.sortedCategories(p.id, entry);
      if (!cats) continue;
      const seen = new Set();
      for (const cat of cats) {
        if (cat.kind === 'faculty') continue;
        const kind = ROLE_ORDER.includes(cat.kind) ? cat.kind : 'free';
        for (const raw of cat.courses) {
          const code = codes.has(raw) ? raw : (byBase.get(S.baseCode(raw)) || raw);
          if (seen.has(code)) continue;
          seen.add(code);
          if (!roles.has(code)) roles.set(code, []);
          roles.get(code).push({ pid: p.id, kind, cat: cat.name });
        }
      }
    }
    roleCache.set(entry, roles);
    return roles;
  }

  // ---------- State ----------
  const state = {
    q: '', entry: A.remember('courses-entry', A.TERMS[0].term), program: A.remember('courses-program', ''),
    role: A.remember('courses-role', ''), offered: A.remember('courses-offered', ''), level: A.remember('courses-level', ''),
    sort: A.remember('courses-sort', 'code'), dir: A.remember('courses-dir', 1), open: new Set(),
  };
  if (!A.TERMS.some((t) => t.term === state.entry)) state.entry = A.TERMS[0].term;

  function matches(c, roles) {
    if (state.q && !c.search.includes(state.q)) return false;
    if (state.level && c.level !== state.level) return false;
    const f = !!c.fall;
    const s = !!c.spring;
    const off = { fall: f, spring: s, both: f && s, 'fall-only': f && !s, 'spring-only': s && !f, neither: !f && !s }[state.offered];
    if (state.offered && !off) return false;
    const mine = (roles.get(c.code) || []).filter((r) => !state.program || r.pid === state.program);
    if (state.role === 'none') return !mine.length;
    if (state.role === 'required') return mine.some((r) => r.kind === 'required' || r.kind === 'requirement');
    if (state.role === 'free') return mine.length > 0 && mine.every((r) => r.kind === 'free');
    if (state.role) return mine.some((r) => r.kind === state.role);
    if (state.program) return mine.length > 0;
    return true;
  }

  // Chips for program-specific roles; university and free electives are summarised.
  function rolesHtml(list) {
    if (!list?.length) return '<span class="muted small">not in any program</span>';
    const own = list.filter((r) => !['university', 'free'].includes(r.kind))
      .sort((a, b) => ROLE_ORDER.indexOf(a.kind) - ROLE_ORDER.indexOf(b.kind));
    const uni = list.filter((r) => r.kind === 'university');
    const free = list.filter((r) => r.kind === 'free');
    const chips = own.map((r) => `<span class="chip ${r.kind}" title="${esc(A.programName(r.pid))}: ${esc(r.cat)}">${esc(r.pid.toUpperCase())}</span>`);
    if (uni.length) chips.push(`<span class="chip university" title="University course in ${uni.length} programs">University${uni.length < A.PROGRAMS.length ? ` · ${uni.length}` : ''}</span>`);
    if (free.length) chips.push(`<span class="free-n" title="${esc(free.map((r) => r.pid.toUpperCase()).join(', '))}">free in ${free.length}</span>`);
    return `<div class="chips">${chips.join('')}</div>`;
  }
  const ownCount = (list) => (list || []).filter((r) => r.kind !== 'free').length;

  const secCell = (x) => (x ? `<span class="secn" title="${esc(x.parts.join(', '))}">${x.main}${x.parts.length > 1 ? '<sup>+</sup>' : ''}</span>` : '<span class="muted">–</span>');
  const credits = (c) => (c.su == null ? '<span class="muted">–</span>' : `${c.su}<span class="muted small"> / ${c.ects ?? '–'}</span>`);

  function sectionsHtml(x, label) {
    if (!x) return `<div class="secs-box"><b>${label}</b><p class="muted small">Not on the schedule.</p></div>`;
    return `<div class="secs-box"><b>${label}</b>${x.course.groups.map((g) => `
      <div class="part-name">${esc(A.typeName(g.type))} · ${g.sections.length} section${g.sections.length === 1 ? '' : 's'}</div>
      <table class="secs-t"><tbody>${g.sections.map((s) => `<tr>
        <td class="nowrap"><b>${esc(A.sectionName(s.group))}</b></td>
        <td class="muted nowrap">${esc(s.crn)}</td>
        <td>${s.meetings.map((m) => `${esc(A.meetingLabel(m))}${m.place ? ` <span class="muted">${esc(m.place)}</span>` : ''}`).join('<br>') || 'TBA'}</td>
        <td class="muted">${esc(s.instructor)}</td></tr>`).join('')}</tbody></table>`).join('')}</div>`;
  }

  function detailHtml(c, roles) {
    const list = roles.get(c.code) || [];
    const byKind = ROLE_ORDER.map((k) => [k, list.filter((r) => r.kind === k)]).filter(([, l]) => l.length);
    const op = (opens.get(c.code) || []).sort(A.byCode);
    return `<div class="detail">
      <div class="facts">
        <div><span class="muted">Credits</span> ${c.su ?? '–'} SU · ${c.ects ?? '–'} ECTS${c.eng || c.basic ? ` <span class="muted">(Engineering ${c.eng}, Basic Science ${c.basic} ECTS)</span>` : ''}</div>
        <div><span class="muted">Needs</span> ${esc(c.prereq || 'nothing')}</div>
        <div><span class="muted">Opens</span> ${op.length ? op.map(esc).join(', ') : 'nothing'}</div>
        ${byKind.map(([k, l]) => `<div><span class="muted">${esc(ROLE_NAME[k])}</span> ${l.map((r) => esc(A.programName(r.pid))).join(', ')}</div>`).join('')}
      </div>
      <div class="secs-cols">${sectionsHtml(c.fall, 'Fall 2026-27')}${sectionsHtml(c.spring, 'Spring 2026-27')}</div>
    </div>`;
  }

  const LIMIT = 400;
  let shown = LIMIT;
  function render() {
    for (const k of ['entry', 'program', 'role', 'offered', 'level', 'sort', 'dir']) A.save(`courses-${k}`, state[k]);
    const roles = rolesFor(state.entry);
    const key = {
      code: (c) => c.code, name: (c) => c.name.toLowerCase(), su: (c) => c.su ?? -1,
      programs: (c) => ownCount(roles.get(c.code)), fall: (c) => c.fall?.main ?? -1, spring: (c) => c.spring?.main ?? -1,
    }[state.sort];
    const rows = COURSES.filter((c) => matches(c, roles)).sort((a, b) => {
      const x = key(a);
      const y = key(b);
      const d = typeof x === 'string' ? (state.sort === 'code' ? A.byCode(x, y) : x.localeCompare(y)) : x - y;
      return d * state.dir || A.byCode(a.code, b.code);
    });
    $('#count').textContent = `${rows.length} course${rows.length === 1 ? '' : 's'}`;
    const th = (k, label, cls = '') => `<th class="${cls}" aria-sort="${state.sort === k ? (state.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}">${label}${state.sort === k ? (state.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
    if (!rows.length) { $('#list').innerHTML = '<div class="empty">No course matches.</div>'; return; }
    $('#list').innerHTML = `<table class="data courses">
      <thead><tr>${th('code', 'Course')}${th('su', 'SU / ECTS', 'num')}${th('programs', 'Programs')}<th>Prerequisites</th>${th('fall', 'Fall', 'num')}${th('spring', 'Spring', 'num')}</tr></thead>
      <tbody>${rows.slice(0, shown).map((c) => {
        const open = state.open.has(c.code);
        return `<tr class="row${open ? ' open' : ''}" data-code="${esc(c.code)}" tabindex="0" aria-expanded="${open}">
          <td class="c-course"><b class="code">${esc(c.code)}</b> <span class="cname">${esc(c.name)}</span></td>
          <td class="num c-cr">${credits(c)}</td>
          <td class="c-prog">${rolesHtml(roles.get(c.code))}</td>
          <td class="c-pre small">${esc(c.prereq) || '<span class="muted">–</span>'}</td>
          <td class="num c-fall"><span class="ph">Fall </span>${secCell(c.fall)}</td>
          <td class="num c-spring"><span class="ph">Spring </span>${secCell(c.spring)}</td></tr>
          ${open ? `<tr class="detail-row"><td colspan="6">${detailHtml(c, roles)}</td></tr>` : ''}`;
      }).join('')}</tbody></table>
      ${rows.length > shown ? `<div class="more"><button type="button" id="more">Show all ${rows.length}</button></div>` : ''}`;
  }

  // ---------- Controls ----------
  $('#entry').innerHTML = A.TERMS.map((t) => `<option value="${esc(t.term)}">${esc(A.entryLabel(t.term))}</option>`).join('');
  $('#program').innerHTML = `<option value="">All programs</option>${A.PROGRAMS.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}`;
  for (const k of ['entry', 'program', 'role', 'offered', 'level']) {
    const el = $(`#${k}`);
    el.value = state[k];
    el.addEventListener('change', () => { state[k] = el.value; shown = LIMIT; render(); });
  }
  let timer = 0;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = S.fold(e.target.value); shown = LIMIT; render(); }, 120);
  });
  const toggle = (row) => {
    const code = row.dataset.code;
    if (state.open.has(code)) state.open.delete(code); else state.open.add(code);
    render();
    document.querySelector(`tr.row[data-code="${CSS.escape(code)}"]`)?.focus();
  };
  $('#list').addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      const k = sortBtn.dataset.sort;
      state.dir = state.sort === k ? -state.dir : (['code', 'name'].includes(k) ? 1 : -1);
      state.sort = k;
      render();
      return;
    }
    if (e.target.closest('#more')) { shown = Infinity; render(); return; }
    const row = e.target.closest('tr.row');
    if (row) toggle(row);
  });
  $('#list').addEventListener('keydown', (e) => {
    const row = e.target.closest('tr.row');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(row); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); $('#q').focus(); }
  });
  render();
})();
