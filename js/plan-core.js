/* The suggested 4-year plan, as SU Planner (plan.js `suggestPlan`) builds it for a student,
   without a double major or minor and without the browser's saved plan.
   Load after data files, js/shared.js and js/times.js.

   SUPlan.suggest(program, entry, { dodge }) -> [8 semesters of course codes]
   Codes starting with "~" are elective placeholders (worth 3 SU / 6 ECTS).
   `dodge: true` = like SU Planner: a required course that would clash in every section choice
   waits for a later semester. `dodge: false` (default here) = curriculum order only, so the
   clashes it would have dodged stay visible. Both keep courses in a season they run in. */
window.SUPlan = (() => {
  'use strict';

  const S = window.SUShared;
  const T = window.SUTimes || null;
  const { REQUIREMENTS, baseCode } = S;
  const CATALOG = REQUIREMENTS.catalog || {};
  const SEMESTERS = 8;
  const SUMMERS = 3;
  const SLOT_SU = 3;
  const SLOT_ECTS = 6;
  const LOAD_MIN = 15;
  const LOAD_MAX = 20;
  const byCode = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  const isSlot = (code) => code.startsWith('~');
  const slotCatId = (code) => code.split('~')[1] || '';
  let slotSeq = 0;
  const makeSlot = (catId) => `~${catId}~${(slotSeq++).toString(36)}`;
  const courseNumber = (code) => code.split(' ')[1] || '';
  const isSpringCode = (code) => /2[A-Z]?$/.test(courseNumber(code));
  const isSummer = (i) => i >= SEMESTERS;
  const position = (i) => (isSummer(i) ? 2 * (i - SEMESTERS) + 1.5 : i);
  // Prerequisites are AND-of-OR groups; a course listed as its own prerequisite is ignored.
  const prereqOf = (code) => (CATALOG[code]?.[5] || []).filter((g) => !g.some((p) => baseCode(p) === baseCode(code)));

  function info(code) {
    if (isSlot(code)) return { name: '', su: SLOT_SU, ects: SLOT_ECTS };
    const c = CATALOG[code];
    return c ? { name: c[0], su: c[1] ?? 0, ects: c[2] ?? 0 } : { name: '', su: 0, ects: 0 };
  }

  // Term code of plan entry i for a student who started in `entry` (a Fall term, '202301').
  function semesterTerm(entry, i) {
    const start = Number(entry.slice(0, 4));
    if (isSummer(i)) return `${start + (i - SEMESTERS)}03`;
    return `${start + Math.floor(i / 2)}${i % 2 ? '02' : '01'}`;
  }
  const semesterTitle = (i) => (isSummer(i) ? `Summer after Year ${i - SEMESTERS + 1}` : `Year ${Math.floor(i / 2) + 1} ${i % 2 ? 'Spring' : 'Fall'}`);

  // Earliest Fall/Spring by course level (0 = Year 1 Fall).
  function earliestSemester(code) {
    const num = courseNumber(code);
    if (num.startsWith('49')) return SEMESTERS - 2;
    const level = Number(num[0]);
    if (level >= 4) return 5;
    if (level === 3) return 3;
    return 2;
  }

  function suggest(program, entry, { dodge = false } = {}) {
    const cats = S.sortedCategories(program, entry);
    if (!cats) return null;
    const exclusive = cats.filter((c) => c.kind !== 'faculty');
    const inCat = (cat, code) => cat.set.has(code) || cat.set.has(baseCode(code));
    const sems = Array.from({ length: SEMESTERS + SUMMERS }, () => []);
    const N = SEMESTERS;
    const span = (from) => Array.from({ length: Math.max(0, N - from) }, (_, j) => from + j);
    const load = (s) => sems[s].reduce((t, code) => t + info(code).su, 0);
    const placed = new Map();
    const put = (code, s) => { sems[s].push(code); placed.set(baseCode(code), s); };
    const known = (code) => !!CATALOG[code];
    const term = (s) => semesterTerm(entry, s);

    // Each course counted once, in the first category that still needs credits.
    function allocate(plan) {
      const used = new Map(exclusive.map((c) => [c.id, { su: 0, n: 0 }]));
      const full = (c) => {
        const u = used.get(c.id);
        if (c.su != null) return u.su >= c.su;
        if (c.minCourses != null) return u.n >= c.minCourses;
        return false;
      };
      for (const sem of plan) {
        for (const code of sem) {
          const member = isSlot(code) ? exclusive.filter((c) => c.id === slotCatId(code)) : exclusive.filter((c) => inCat(c, code));
          const pick = member.find((c) => !full(c)) || member[member.length - 1];
          if (pick) { const u = used.get(pick.id); u.su += info(code).su; u.n++; }
        }
      }
      return used;
    }

    // 1. Freshman university courses fill Year 1.
    const uni = exclusive.find((c) => c.kind === 'university');
    const uniPool = uni ? uni.courses.filter(known) : [];
    for (const code of uniPool) if (courseNumber(code).startsWith('1')) put(code, isSpringCode(code) ? 1 : 0);

    // 2. Required courses, enough of each choose-from list, other non-HUM university courses.
    const queue = [];
    const queued = (code) => placed.has(baseCode(code)) || queue.includes(code);
    for (const cat of exclusive) {
      if (cat.kind === 'required') for (const code of cat.courses) if (known(code) && !queued(code)) queue.push(code);
    }
    for (const cat of exclusive) {
      if (cat.kind !== 'requirement') continue;
      let su = 0;
      let n = 0;
      for (const code of cat.courses) if (queued(code)) { su += info(code).su; n++; }
      for (const code of [...cat.courses].sort(byCode)) {
        if ((cat.su == null || su >= cat.su) && (cat.minCourses == null || n >= cat.minCourses)) break;
        if (!known(code) || queued(code)) continue;
        queue.push(code); su += info(code).su; n++;
      }
    }
    for (const code of uniPool) if (!queued(code) && !code.startsWith('HUM ')) queue.push(code);
    const summerCourses = queue.filter((c) => S.isSummerCourse(c));
    for (const c of summerCourses) queue.splice(queue.indexOf(c), 1);

    const inPlan = new Set([...placed.keys(), ...queue.map(baseCode)]);
    const ready = (code, s) => prereqOf(code).every((g) => {
      const mine = g.filter((p) => inPlan.has(baseCode(p)));
      return !mine.length || mine.some((p) => placed.has(baseCode(p)) && position(placed.get(baseCode(p))) < position(s));
    });
    const depth = new Map();
    const dependents = (code) => queue.filter((c) => prereqOf(c).some((g) => g.some((p) => baseCode(p) === baseCode(code))));
    const chain = (code, seen = new Set()) => {
      if (depth.has(code)) return depth.get(code);
      if (seen.has(code)) return 0;
      seen.add(code);
      const d = 1 + Math.max(0, ...dependents(code).map((c) => chain(c, seen)));
      depth.set(code, d);
      return d;
    };

    const queueSU = queue.reduce((t, c) => t + info(c).su, 0);
    const perSemester = Math.max(12, Math.ceil(queueSU / (N - 2)) + 3);
    let left = [...queue];
    for (let s = 2; s < N && left.length; s++) {
      const candidates = left
        .filter((c) => earliestSemester(c) <= s && ready(c, s) && (!T || T.offeredIn(c, term(s)) !== false))
        .sort((a, b) => chain(b) - chain(a) || byCode(a, b));
      let taken = 0;
      for (const code of candidates) {
        const su = info(code).su;
        if (taken > 0 && taken + su > perSemester) continue;
        if (dodge && T && !T.fits(code, sems[s], term(s))) continue;
        put(code, s);
        taken += su;
      }
      left = left.filter((c) => !placed.has(baseCode(c)));
    }
    for (const code of left) {
      const seasonOk = span(2).reverse().filter((s) => !T || T.offeredIn(code, term(s)) !== false);
      const s = seasonOk.find((x) => ready(code, x) && (!dodge || !T || T.fits(code, sems[x], term(x))))
        ?? seasonOk.find((x) => ready(code, x)) ?? seasonOk[0] ?? N - 1;
      put(code, s);
    }
    for (const code of summerCourses) {
      const done = (k) => prereqOf(code).every((g) => {
        const mine = g.filter((p) => placed.has(baseCode(p)));
        return !mine.length || mine.some((p) => position(placed.get(baseCode(p))) < position(SEMESTERS + k));
      });
      const order = / 395[A-Z]?$/.test(code) ? [2, 1, 0] : [1, 2, 0];
      put(code, SEMESTERS + (order.find(done) ?? SUMMERS - 1));
    }

    // 3. Elective placeholders up to each minimum and the program total.
    const slots = [];
    const used = allocate(sems);
    for (const kind of ['university', 'core', 'area', 'free']) {
      for (const cat of exclusive.filter((c) => c.kind === kind)) {
        const need = Math.max(0, (cat.su ?? 0) - (used.get(cat.id)?.su || 0));
        for (let k = Math.ceil(need / SLOT_SU); k > 0; k--) slots.push(makeSlot(cat.id));
      }
    }
    const total = S.totalsFor(program, entry).su || 0;
    const free = exclusive.find((c) => c.kind === 'free');
    const planned = () => sems.reduce((t, _, s) => t + load(s), 0) + slots.length * SLOT_SU;
    while (free && total && planned() < total) slots.push(makeSlot(free.id));

    for (let s = 2; s < N; s++) {
      let rest = slots.length * SLOT_SU;
      for (const t of span(s)) rest += load(t);
      const target = Math.min(LOAD_MAX, Math.max(LOAD_MIN, Math.ceil(rest / (N - s))));
      while (slots.length && load(s) < target && load(s) + SLOT_SU <= LOAD_MAX) sems[s].push(slots.shift());
    }
    while (slots.length) sems[span(2).reduce((a, b) => (load(b) < load(a) ? b : a))].push(slots.shift());
    return sems;
  }

  // Cached: the clash page builds 84 plans (12 programs × 7 entry years) per mode.
  const cache = new Map();
  function cachedSuggest(program, entry, opts = {}) {
    const key = `${program}|${entry}|${opts.dodge ? 1 : 0}`;
    if (!cache.has(key)) cache.set(key, suggest(program, entry, opts));
    return cache.get(key);
  }

  return { SEMESTERS, SUMMERS, info, isSlot, slotCatId, prereqOf, semesterTerm, semesterTitle, suggest: cachedSuggest };
})();
