/* Helpers shared by the admin pages: escaping, tooltips, heatmap colours, class-time labels,
   room names. Load after data files and js/shared.js. */
window.SUAdmin = (() => {
  'use strict';

  const S = window.SUShared;
  const esc = S.esc;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const ROWS = 13; // hourly rows 08:40 … 20:40
  const pad = (n) => String(n).padStart(2, '0');
  const rowStart = (r) => `${pad(8 + r)}:40`;
  const rowEnd = (r) => `${pad(9 + r)}:30`;
  const byCode = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  const TYPE = { '': 'Lecture', R: 'Recitation', L: 'Lab', D: 'Discussion', E: 'Extra', S: 'Studio', N: 'Section', M: 'Module', FT: 'Field trip' };
  const typeName = (t) => TYPE[t] || t || 'Lecture';
  // Section names: SU calls a course's only section "0".
  const sectionName = (g) => (!g || g === '0' ? 'only' : g);

  // Programs in picker order, with short labels for chips: cs -> CS.
  const PROGRAMS = S.PROGRAMS.faculties.flatMap((f) => f.programs.map((p) => ({ ...p, faculty: f.name, short: p.id.toUpperCase() })));
  const programName = (id) => PROGRAMS.find((p) => p.id === id)?.name || id;
  const TERMS = S.REQUIREMENTS.terms; // entry years, newest first
  const entryLabel = (term) => `Fall ${term.slice(0, 4)}`;

  // The class schedules: Fall = data/courses.js, Spring = newest data/schedule-YYYY02.js.
  const SCHEDULES = [];
  if (window.COURSE_DATA?.courses) SCHEDULES.push(window.COURSE_DATA);
  for (const [t, d] of Object.entries(window.SU_SCHEDULES || {})) if (d?.courses && !SCHEDULES.some((x) => x.term === t)) SCHEDULES.push(d);
  SCHEDULES.sort((a, b) => a.term.localeCompare(b.term));
  const seasonOf = (term) => (term.endsWith('01') ? 'Fall' : term.endsWith('02') ? 'Spring' : 'Summer');

  // "Mon 10:40–12:30"
  function meetingLabel(m) {
    if (m.start < 0 || m.day < 0 || m.day > 4) return 'TBA';
    return `${DAYS[m.day]} ${rowStart(m.start)}–${rowEnd(m.start + m.dur - 1)}`;
  }
  // Hour slots (day*ROWS+row) -> "Mon 17:40–18:30, Tue 09:40–11:30"
  function slotsLabel(slots) {
    const sorted = [...new Set(slots)].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < sorted.length; i++) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1 && Math.floor(sorted[j + 1] / ROWS) === Math.floor(sorted[i] / ROWS)) j++;
      const day = Math.floor(sorted[i] / ROWS);
      out.push(`${DAYS[day]} ${rowStart(sorted[i] % ROWS)}–${rowEnd(sorted[j] % ROWS)}`);
      i = j;
    }
    return out.join(', ');
  }

  // Place names differ by term: "FMAN G062" (Fall) is "SBS G062" (Spring), "University Center G030" is UC.
  const BUILDING_ALIASES = [
    [/^FMAN /, 'SBS '], [/^University Center /, 'UC '], [/^School of Languages Building /, 'SL '],
    [/^Art and Research Center /, 'ARC '], [/^Information Center /, 'IC '], [/^Altunizade Campus /, 'ALTZ '],
  ];
  const BUILDINGS = {
    FASS: 'Faculty of Arts and Social Sciences', FENS: 'Faculty of Engineering and Natural Sciences',
    SBS: 'Sabancı Business School', UC: 'University Center', SL: 'School of Languages',
    ARC: 'Art and Research Center', IC: 'Information Center', ALTZ: 'Altunizade Campus (off campus)',
  };
  function roomOf(place) {
    let p = String(place || '').trim();
    if (!p) return null;
    for (const [re, to] of BUILDING_ALIASES) p = p.replace(re, to);
    const sp = p.indexOf(' ');
    if (sp < 0) return null;
    return { id: p, building: p.slice(0, sp), code: p.slice(sp + 1) };
  }

  // Sequential blue ramp, light -> dark (0 gets the neutral "empty" colour).
  const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
  function heatStyle(v, max) {
    if (!v || !max) return '';
    const k = Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 1) + 0.0001));
    return `background:${RAMP[k]};color:${k >= 6 ? '#fff' : '#18212b'}`;
  }
  function rampLegend(max, unit) {
    const steps = [0, 3, 6, 9, 12];
    return `<span class="legend-ramp">0 <i style="background:var(--s0)"></i>${steps.slice(1).map((k) => `<i style="background:${RAMP[k]}"></i>`).join('')} ${esc(String(max))} ${esc(unit)}</span>`;
  }

  // One tooltip element per page; elements with data-tip show it on hover / focus / tap.
  let tipEl = null;
  function tip(root) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'tip';
      tipEl.hidden = true;
      tipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tipEl);
    }
    const show = (el, x, y) => {
      tipEl.innerHTML = el.dataset.tip;
      tipEl.hidden = false;
      const w = tipEl.offsetWidth;
      const h = tipEl.offsetHeight;
      tipEl.style.left = `${Math.max(6, Math.min(window.innerWidth - w - 6, x + 12))}px`;
      tipEl.style.top = `${y + h + 18 > window.innerHeight ? y - h - 10 : y + 16}px`;
    };
    root.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-tip]');
      if (el) show(el, e.clientX, e.clientY); else tipEl.hidden = true;
    });
    root.addEventListener('mousemove', (e) => {
      const el = e.target.closest('[data-tip]');
      if (el && !tipEl.hidden) show(el, e.clientX, e.clientY);
    });
    root.addEventListener('mouseleave', () => { tipEl.hidden = true; });
    root.addEventListener('focusin', (e) => {
      const el = e.target.closest('[data-tip]');
      if (el) { const r = el.getBoundingClientRect(); show(el, r.left, r.bottom - 10); }
    });
    root.addEventListener('focusout', () => { tipEl.hidden = true; });
    window.addEventListener('scroll', () => { tipEl.hidden = true; }, { passive: true });
  }

  // Remember small view choices per page (program picked, filters…).
  function remember(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`su-admin:${key}`)) ?? fallback; } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(`su-admin:${key}`, JSON.stringify(value)); } catch { /* not saved */ }
  }

  const courseName = (code) => S.REQUIREMENTS.catalog?.[code]?.[0]
    || window.SUTimes?.lookup(window.SUTimes.fall, code)?.name || window.SUTimes?.lookup(window.SUTimes.spring, code)?.name || '';

  // Prerequisite groups as text: "CS 300 and (MATH 204 or MATH 201)".
  function prereqText(code) {
    const groups = (S.REQUIREMENTS.catalog?.[code]?.[5] || []).filter((g) => !g.some((p) => S.baseCode(p) === S.baseCode(code)));
    return groups.map((g) => (g.length > 1 ? `(${g.join(' or ')})` : g[0])).join(' and ');
  }

  return {
    S, esc, DAYS, DAY_NAMES, ROWS, pad, rowStart, rowEnd, byCode, typeName, sectionName, PROGRAMS, programName, TERMS, entryLabel,
    SCHEDULES, seasonOf, meetingLabel, slotsLabel, roomOf, BUILDINGS, RAMP, heatStyle, rampLegend, tip, remember, save,
    courseName, prereqText,
  };
})();
