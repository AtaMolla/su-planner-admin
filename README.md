# SU Planner Admin

The staff side of [SU Planner](https://atamolla.github.io/su-planner/): six views that help Sabancı
University (SU) administration see the course schedule and the curricula at a glance.
Live at https://atamolla.github.io/su-planner-admin/.

It uses only SU's public data: the class schedule, the degree-requirement pages and the room list.
Plain HTML, CSS and JavaScript: no build step, no libraries, no server code.

## Open it

Double-click `index.html` (it opens Big rooms). It works straight from disk because the data files are `.js` files, not
fetched JSON. Or serve it locally, which always shows the latest version of every file:

```
python tools/serve.py
```

then open http://localhost:8766/.

## The views

### Required-course clashes (`clashes.html`)

- For each of the 12 undergraduate programs and each entry year (Fall 2020 to Fall 2026), it builds
  the suggested 4-year plan SU Planner gives students and checks every Fall/Spring semester against
  this year's class schedule (Fall semesters against Fall 2026-27, Spring against Spring 2026-27).
- A semester **clashes** when no choice of sections (lecture, recitation, lab…) lets a student take
  all of its required courses without two of them meeting at the same time. The search is the same
  one SU Planner uses to list every clash-free timetable (`js/times.js`).
- **Fix list**: the course pairs whose sections always overlap, with the parts that overlap, every
  section's CRN, hours and room, and which plans put them together. Pairs that students hit this
  year (the semesters current students take in Fall 2026-27 or Spring 2026-27) come first.
  When every two courses fit but the whole set doesn't, the set is listed instead.
- **By program and entry year**: how many of the 8 semesters clash. Click a square to see that plan
  semester by semester, with the number of clash-free timetables, the overlap details, and how SU
  Planner dodges the clash for students (by moving a course to a later semester).
- "Only semesters students take this year" narrows everything to the current cohorts.
- The plan here stays in curriculum order (required courses in prerequisite order, by course level,
  in a season they run in). SU Planner's own suggestion moves a course that would clash to a later
  semester; that hides the clash from students, so this view doesn't do it. Elective placeholders,
  PROJ courses (times arranged after registration) and summer internships (x95) aren't checked.

### Course overview (`courses.html`)

- Every undergraduate course in the degree requirements or on this year's schedule (about 850).
- For each: which programs list it and as what (chips coloured by role: required, required from a
  choose-from list, core, area, university; free electives are counted), prerequisites, SU / ECTS
  credits, and how many sections it has in Fall and Spring (`+` = it also has recitations or labs).
- Search by code or name; filter by entry year, program, role, term it runs in and level; sort by any
  column. Click a course for its Engineering / Basic Science ECTS, the courses it opens, the full list of
  programs, and every section with CRN, times, room and instructor.

### Room and time usage (`rooms.html`)

- Heatmaps from the meeting places and times in the class schedule, for Fall or Spring:
  rooms in use per hour of the week, each building's share of rooms in use per hour, and one row per
  room showing the hours it has a class (darker = more sections at once). Hover a square for details.
- Filter by building and room type; sort rooms by use, name or seats. Tiles give the room-hours of
  class a week, the peak hour, the average use from 08:40 to 17:30, and rooms with no class at all.
- "FMAN" in the Fall schedule is the Business School building (SBS). Room types and seats come from
  SU's room list (FASS, FENS, SBS, UC). Exams, events and one-off bookings aren't in the schedule.

### Curriculum changes (`changes.html`)

- A grid of programs × entry-year steps (2020→21 … 2025→26) with the number of changes in each step.
- Pick a program (or a double major or minor) and two entry years: the overall difference, then year
  by year. Changes are requirement groups added or removed or renamed, minimum credits, total SU / ECTS,
  Engineering / Basic Science minimums, and courses added to or removed from each group.
- Free-elective and faculty-course lists hold hundreds of courses and change with the catalog, so they
  are folded and not counted in the grid.

## Data

Copied from SU Planner, which has the scripts that read them from SU's public pages:

- `data/courses.js`: Fall 2026-2027 sections (`tools/build_data.py`)
- `data/schedule-202602.js`: Spring 2026-2027 sections from SU's class search (`tools/build_schedule.py 202602`)
- `data/requirements.js`: the 12 programs, double majors and minors for entry years Fall 2020–2026, and
  the course catalog `[name, SU, ECTS, Engineering ECTS, Basic Science ECTS, prerequisites]`
  (`tools/build_requirements.py 202601 7`, about ten minutes; prerequisites come from SU's
  registration system, Banner)
- `data/rooms.js`: rooms with type, seats and equipment (`tools/build_rooms.py`)

### Timetable model (`model.html`)

- Results of the IE 312 class scheduling model (integer program in Gurobi, `class_scheduling.py` in
  the term project folder `ie312-class-scheduling`, next to this repo). Running it rewrites
  `data/model-result.js`.
- Tiles: class hours kept at SU's time, classes moved, locked first-year classes, teaching rooms.
- Week grids, SU timetable next to the model: classes per hour that need a room of a given size (by
  quota) against the rooms that big. Red = more classes than rooms, so some must move.
- Class list: the moved classes with SU time, model time and the rule their SU time breaks; or every
  class, with a search box.

### Big rooms (`bigrooms.html`)

- The Large (81–150 seats) and Very large (151+) teaching rooms, biggest first; rooms with the same
  seats share a card.
- Each room lists the Fall sections whose quota needs it: above the next smaller room's seats, up to
  this room's (FASS G062, 172 seats, gets quotas 131–172 because FENS L045 has 130). A quota bigger
  than every room is listed under the biggest one.
- Hours bar: weekly hours of the classes that need this size or bigger, against what the rooms this
  size or bigger offer (53 h each: Mon–Fri 08:40–18:40 minus the Friday 12:40–14:30 break).
- Quotas come from `data/quota.js`, written by the term project's `get_capacity.py` (SU's class search).

### New schedule (`newschedule.html`)

- The Fall timetable the term project's model builds. Stage 1 picks each class's hours, and stage 2
  gives each hour a room. Data: `data/model-result.js`.
- **Week by room:** one week grid per teaching room, coloured by course year. Markers show what
  changed from SU's timetable:
  - **+** = a new hour for that class
  - **→** = same hour, but the class moved into this room
  - struck-out chip = the class was here at SU, and the model put it somewhere else
- **Changes list:** every class with a new time or a new room, SU vs model side by side.
- Filters: building, rooms with changes only, and a course search.
- Tiles: hours kept at SU's time, classes moved, new rooms, classes in one room all week, and
  student clash hours (SU → model).

Rules carried over from SU Planner: PROJ 302 isn't a separate class (it is PROJ 201); x95 courses are
summer internships; a Spring course with no Spring schedule loaded uses the Fall times.

After changing CSS, JS or data, run `python tools/bump_version.py` before uploading, so browsers
(and GitHub Pages, which caches for 10 minutes) don't mix old and new files.

## Files

- `bigrooms.html`, `newschedule.html` and, under `others.html`, `clashes.html`, `courses.html`, `rooms.html`, `changes.html`, `model.html`: the views, one script and one
  stylesheet each in `js/` and `css/`
- `css/admin.css`: shared look (top bar, controls, tables, chips, heatmap cells)
- `js/common.js`: shared helpers (time labels, room names, heatmap colours, tooltips)
- `js/plan-core.js`: SU Planner's suggested 4-year plan as a standalone function
- `js/shared.js`, `js/programs.js`, `js/times.js`: from SU Planner (requirement helpers, program list,
  class times and the clash-free timetable search)
- `data/quota.js`: section quotas (seats) from SU's class search, written by the term project
- `data/model-result.js`: written by the term project's model, read by `model.html` and `newschedule.html`
- `tools/`: data scripts (`build_rooms.py --filter` re-applies the teaching-room filter), `serve.py` (local server without caching), `bump_version.py`
