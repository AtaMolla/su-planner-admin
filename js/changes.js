/* Curriculum changes by year: differences between a program's requirements for two entry years. */
(() => {
  'use strict';

  const A = window.SUAdmin;
  const { S, esc } = A;
  const $ = (sel) => document.querySelector(sel);
  const R = S.REQUIREMENTS;
  const FOLDED = new Set(['free', 'faculty']);
  const yearOf = (t) => t.slice(0, 4);

  const sourceOf = (key) => R.programs[key] || R.doubleMajors[key] || R.minors[key] || null;
  const nameOf = (key) => (R.programs[key] ? A.programName(key) : sourceOf(key)?.name || key);
  const yearsOf = (key) => S.termsFor(key).map((t) => t.term).sort(); // oldest first

  const courseHtml = (code) => {
    const c = R.catalog[code];
    return `<b class="code">${esc(code)}</b> <span class="muted">${esc(c?.[0] || '')}${c?.[1] != null ? ` · ${c[1]} SU` : ''}</span>`;
  };
  const minText = (c) => [c.su != null && `${c.su} SU`, c.ects != null && `${c.ects} ECTS`, c.minCourses != null && `${c.minCourses} courses`].filter(Boolean).join(', ') || 'no minimum';

  // ---------- Diff of two entry years ----------
  function diff(key, t1, t2) {
    const a = S.requirementsFor(key, t1) || [];
    const b = S.requirementsFor(key, t2) || [];
    const match = (cat, list) => list.find((x) => x.id === cat.id) || list.find((x) => x.name === cat.name);
    const groups = [];
    let count = 0;
    for (const cb of b) {
      const ca = match(cb, a);
      const kind = S.categoryKind(cb);
      if (!ca) {
        groups.push({ name: cb.name, kind, status: 'added', min: minText(cb), added: cb.courses, removed: [] });
        count++;
        continue;
      }
      const notes = [];
      if (ca.name !== cb.name) notes.push(`renamed from “${ca.name}”`);
      if (minText(ca) !== minText(cb)) notes.push(`minimum ${minText(ca)} → ${minText(cb)}`);
      const setA = new Set(ca.courses);
      const setB = new Set(cb.courses);
      const added = cb.courses.filter((c) => !setA.has(c)).sort(A.byCode);
      const removed = ca.courses.filter((c) => !setB.has(c)).sort(A.byCode);
      if (!notes.length && !added.length && !removed.length) continue;
      groups.push({ name: cb.name, kind, status: 'changed', notes, added, removed, size: [ca.courses.length, cb.courses.length] });
      // Free-elective and faculty-course lists change with the catalog; they are shown, not counted.
      count += notes.length + (FOLDED.has(kind) ? 0 : added.length + removed.length);
    }
    for (const ca of a) {
      if (match(ca, b)) continue;
      groups.push({ name: ca.name, kind: S.categoryKind(ca), status: 'removed', min: minText(ca), added: [], removed: ca.courses });
      count++;
    }
    const totals = [];
    const ta = S.totalsFor(key, t1);
    const tb = S.totalsFor(key, t2);
    for (const [k, label] of [['su', 'SU credits'], ['ects', 'ECTS']]) {
      if ((ta[k] ?? null) !== (tb[k] ?? null)) totals.push(`Total ${label}: ${ta[k] ?? 'not listed'} → ${tb[k] ?? 'not listed'}`);
    }
    const oa = new Map(S.overlaysFor(key, t1).map((o) => [o.name, o.ects]));
    const ob = new Map(S.overlaysFor(key, t2).map((o) => [o.name, o.ects]));
    for (const n of new Set([...oa.keys(), ...ob.keys()])) {
      if (oa.get(n) !== ob.get(n)) totals.push(`${n} ECTS minimum: ${oa.get(n) ?? 'none'} → ${ob.get(n) ?? 'none'}`);
    }
    count += totals.length;
    groups.sort((x, y) => S.categoryRank({ name: x.name }) - S.categoryRank({ name: y.name }));
    return { key, t1, t2, groups, totals, count };
  }

  function diffHtml(d) {
    if (!d.groups.length && !d.totals.length) return '<p class="muted none">No changes.</p>';
    const parts = [];
    if (d.totals.length) parts.push(`<ul class="diff totals">${d.totals.map((t) => `<li class="chg">${esc(t)}</li>`).join('')}</ul>`);
    for (const g of d.groups) {
      const head = `<div class="g-head"><b>${esc(g.name)}</b> ${g.status === 'added' ? `<span class="badge ok">new group · ${esc(g.min)}</span>`
        : g.status === 'removed' ? `<span class="badge bad">group removed · was ${esc(g.min)}</span>`
          : (g.notes || []).map((n) => `<span class="badge warn">${esc(n)}</span>`).join(' ')}</div>`;
      const items = [...g.added.map((c) => `<li class="add">${courseHtml(c)}</li>`), ...g.removed.map((c) => `<li class="del">${courseHtml(c)}</li>`)].join('');
      let body = '';
      if (g.status !== 'changed') {
        body = `<details class="fold"><summary>${g.status === 'added' ? g.added.length : g.removed.length} courses</summary><ul class="diff">${items}</ul></details>`;
      } else if (g.added.length || g.removed.length) {
        const summary = `${g.added.length ? `${g.added.length} added` : ''}${g.added.length && g.removed.length ? ', ' : ''}${g.removed.length ? `${g.removed.length} removed` : ''} (${g.size[0]} → ${g.size[1]} courses)`;
        body = FOLDED.has(g.kind) ? `<details class="fold"><summary>${summary}</summary><ul class="diff cols">${items}</ul></details>` : `<ul class="diff${g.added.length + g.removed.length > 10 ? ' cols' : ''}">${items}</ul>`;
      }
      parts.push(`<div class="group">${head}${body}</div>`);
    }
    return parts.join('');
  }

  // ---------- State ----------
  const state = { program: A.remember('changes-program', 'cs'), from: A.remember('changes-from', ''), to: A.remember('changes-to', '') };
  if (!sourceOf(state.program)) state.program = 'cs';

  function renderMatrix() {
    const years = A.TERMS.map((t) => t.term).sort();
    const steps = years.slice(1);
    const head = `<tr><th>Program</th>${steps.map((t, i) => `<th class="num">${yearOf(years[i])}→${yearOf(t).slice(2)}</th>`).join('')}</tr>`;
    const rows = A.PROGRAMS.map((p) => `<tr><th scope="row" class="prog">${esc(p.name)}</th>${steps.map((t, i) => {
      const d = diff(p.id, years[i], t);
      const picked = state.program === p.id && state.from === years[i] && state.to === t;
      return `<td class="num"><button type="button" class="cell${d.count ? ' has' : ''}${picked ? ' picked' : ''}" data-key="${esc(p.id)}" data-from="${esc(years[i])}" data-to="${esc(t)}"
        aria-label="${esc(p.name)}, ${yearOf(years[i])} to ${yearOf(t)}: ${d.count} changes">${d.count || '·'}</button></td>`;
    }).join('')}</tr>`).join('');
    $('#matrix').innerHTML = `<table class="data matrix">${head}${rows}</table>`;
  }

  function render() {
    const years = yearsOf(state.program);
    if (!years.includes(state.from)) state.from = years[0];
    if (!years.includes(state.to) || state.to <= state.from) state.to = years[years.length - 1];
    if (state.to === state.from && years.length > 1) state.to = years[years.indexOf(state.from) + 1] || years[years.length - 1];
    for (const k of ['program', 'from', 'to']) A.save(`changes-${k}`, state[k]);

    $('#program').value = state.program;
    $('#from').innerHTML = years.slice(0, -1).map((t) => `<option value="${esc(t)}">${esc(A.entryLabel(t))}</option>`).join('');
    $('#to').innerHTML = years.filter((t) => t > state.from).map((t) => `<option value="${esc(t)}">${esc(A.entryLabel(t))}</option>`).join('');
    $('#from').value = state.from;
    $('#to').value = state.to;
    renderMatrix();

    const name = nameOf(state.program);
    if (years.length < 2) {
      $('#net-title').textContent = name;
      $('#net').innerHTML = '<div class="card empty">Only one entry year on record.</div>';
      $('#steps').innerHTML = '';
      return;
    }
    const net = diff(state.program, state.from, state.to);
    $('#net-title').textContent = `${name}: ${A.entryLabel(state.from)} → ${A.entryLabel(state.to)}`;
    $('#net').innerHTML = `<div class="card">${diffHtml(net)}</div>`;
    const span = years.filter((t) => t >= state.from && t <= state.to);
    $('#steps').innerHTML = span.slice(1).map((t, i) => {
      const d = diff(state.program, span[i], t);
      return `<article class="card step${d.count ? '' : ' quiet'}"><div class="step-head"><b>${esc(A.entryLabel(span[i]))} → ${esc(A.entryLabel(t))}</b>
        <span class="badge ${d.count ? 'warn' : 'plain'}">${d.count} change${d.count === 1 ? '' : 's'}</span>${!d.count && d.groups.length ? ' <span class="muted small">(only the free-elective / faculty lists)</span>' : ''}</div>${diffHtml(d)}</article>`;
    }).join('');
  }

  // ---------- Controls ----------
  const opts = (obj) => Object.entries(obj).sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([k, p]) => `<option value="${esc(k)}">${esc(p.name)}</option>`).join('');
  $('#program').innerHTML = `${S.PROGRAMS.faculties.map((f) => `<optgroup label="${esc(f.name)}">${f.programs.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}
    <optgroup label="Double majors">${opts(R.doubleMajors)}</optgroup><optgroup label="Minors">${opts(R.minors)}</optgroup>`;
  $('#program').addEventListener('change', (e) => { state.program = e.target.value; render(); });
  $('#from').addEventListener('change', (e) => { state.from = e.target.value; render(); });
  $('#to').addEventListener('change', (e) => { state.to = e.target.value; render(); });
  $('#matrix').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    Object.assign(state, { program: b.dataset.key, from: b.dataset.from, to: b.dataset.to });
    render();
    $('#net-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  render();
})();
