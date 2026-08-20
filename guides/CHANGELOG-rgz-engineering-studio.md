# RGZ Engineering Studio — modification summary (version kept at 1.0.0)

Deliverable: `rgz-engineering-studio.zip` (proper ZIP, upload via WP Admin → Plugins → Add New → Upload).

## 1. Symbols — ISO 1219 compliance (both studios)
Replaced the component symbol renderer (hydraulic + pneumatic) with an ISO 1219-1 / 1219-2 compliant library:
- Pumps/motors: circle with solid energy triangle (apex outward = pump, inward = hydraulic motor); empty triangles for pneumatic energy; diagonal arrow = variable displacement.
- Pressure valves (relief, sequence, reducing, counterbalance, unloading): square with internal flow arrow + spring + dashed pilot line (internal/external as appropriate) + external drain where required.
- Check & pilot-operated check valves: correct seat + spring + pilot, free-flow toward apex.
- Flow control: two venturi arcs + diagonal adjustment arrow. Filter: diamond with dashed center line. Cooler: square with two arrows pointing OUT; heater: arrows IN. Accumulator/receiver, reservoir (clean open-top tank), cylinders (solid piston, spring return for single-acting), junctions (solid dot), pneumatic exhaust (open triangle) vs silencer (filled triangle), compressor symbol, QEV, shuttle/two-pressure (AND/OR), vacuum ejector, PLC/sensors/electrical symbols. Sidebar mini-icons updated to match.
- Counterbalance bypass check direction corrected (free flow = valve side → cylinder side).

## 2. Pre-designed circuits — audited all 114 and fixed the broken ones
Hydraulic (61):
- Simple-08 "Regenerative cylinder extension": removed the junction that shorted P→T; true regenerative-center 4/3.
- Intermediate: 13 of 15 circuits were placeholders that didn't match their names — fully rebuilt (pressure-switch auto-retract, PLC dwell w/ timer, two-cylinder sequence via sequence valve, motor start/stop + flow switch, accumulator clamp + PS, counterbalance lift + limit switches, meter-out, reducing branch + transducer, regenerative fast approach w/ electric changeover, flow divider sync monitoring, pilot-check load-hold + emergency 2/2 release, temperature alarm + cooler bypass, semi-auto press).
- Auto-return circuits now stop at home position instead of looping forever.
- Proportional-03: reducing valve external drain was unconnected — connected to tank. Proportional-05 false-positive validation fixed: relief valve T may connect to the power-pack tank port.
- Cartridge: V1 is solenoid-operated in all variants except the pilot-operated one (was pilot-operated everywhere with no pilot source); logic-press 2nd cartridge pilot connected; unloading valve external pilot connected; shuttle-valve pilot-selection circuit rewired so the shuttle is fed from P and V1.A (sensors only monitor).

Pneumatic (53):
- Simple-08 "Quick exhaust fast cylinder extension" was a broken copy of the hydraulic regenerative circuit — rebuilt with a real quick-exhaust valve at the cap port.
- Simple-05: "5/3 exhaust centre" used a hydraulic tandem centre — now the correct exhaust centre (A/B→exhaust, P blocked).
- Simple-01: added the promised FRL + distribution point. Fixed mismatched internal project names (4/2→5/2 etc.).
- Intermediate: same 13 placeholder circuits rebuilt as real pneumatic circuits (incl. receiver clamp, fast-approach via exhaust-side bypass + flow control, aftercooler bypass + temperature alarm, pilot-check load-hold with emergency dump). "Regenerative fast approach" (a hydraulic-only concept) renamed to "Fast approach with electric changeover to working speed".
- Advanced: aftercooler + filter moved to the supply side (was filter + cooler on the exhaust line); common exhaust manifold now has a silencer.
- Festo: indirect control was drawn as direct control — rebuilt (3/2 push-button piloting a 5/2 air-pilot valve); time-delay return rebuilt (SET button, roller end switch, time-delay valve, double-pilot 5/2); relay latch given a real seal-in contact; dead R/S exhaust connections fixed; several overlapping symbols repositioned.

## 3. Validation
- All 114 built-in circuits now pass the plugin's own design audit with 0 blocking errors (verified in a headless harness rendering every circuit).
- Version strings unchanged: header `Version: 1.0.0`, `VERSION = '1.0.0'` (both apps), README.

## 4. Update 2 — simulation worker + cartridge symbols
- **"Web Worker solver failed" fixed.** Two separate bugs: (a) the pneumatic worker's inline script called `computePneumatics(...)` but that function was never defined under that name (pre-existing, broken in the shipped original); (b) both workers broke in any minified rebuild because the solver function was renamed while the call text inside the worker template was not. Both worker scripts now inject the solver as a name-free `const solver = <fn>` — immune to minification. Verified headless: hydraulic and pneumatic workers both execute and return real metrics.
- **Cartridge valves redrawn per ISO 1219.** Logic/slip-in cartridge now uses the ISO logic-element symbol (box with solid double-headed flow arrow + spring box + dashed X pilot). All non-ISO letter labels (LC-DB, LC-UNL, LC-SEQ, LC-DR, CLH, CNV, M-SR, OR, 2/2) removed. Cartridge check = standard check valve; relief/sequence = ISO pressure-valve symbol; reducing = normally-open arrow + outlet pilot + drain; unloading gains its external X pilot; 2/2 solenoid cartridge = proper two-box open/blocked symbol with ISO solenoid + spring; shuttle valve = ISO seats+ball symbol. Counterbalance keeps the corrected bypass direction (free flow valve-side → cylinder-side).
- All 114 circuits re-validated: 0 title mismatches, 0 blocking errors. Version remains 1.0.0.

## 5. Update 3 — DIN cartridge symbols, animated spools, cylinder rod fix
- Cartridge valves redrawn in the **DIN (DIN 24342) style** per user preference: poppet cone seated against a seat line with stem and spring, dashed control pilots and external X pilot where applicable; sleeve drawn as dashed envelope. Covers logic element, check, relief, reducing, sequence, unloading, counterbalance, 2/2 solenoid, needle and shuttle cartridges.
- **Animated spool animation:** directional valve boxes now slide horizontally with the spool position (left state shifts the box row left, right state right, centre unchanged), while ports and actuation glyphs stay fixed — FluidSIM-style during simulation and when toggling the valve via sidebar controls. This applies to 2-, 3-, 4-, 5- and 6-port valves in both studios.
- **Cylinder rod bug fixed:** piston now travels across the full barrel during simulation AND the rod tip moves with it (rod keeps constant length and visibly extends out of the body), previously the rod contracted while extending.
- All 114 circuits re-validated; workers verified running; version still 1.0.0.

---

# Update 4 — Spool direction fix, true DIN cartridge symbols, Mechanical Deck, tutorials & Learning Hub

## Simulation: directional valve slide direction — corrected
When you select a spool state (left/right) the box train now slides **opposite** to the previous build
(i.e. the physically correct FluidSIM-style motion): the box of the selected side moves **onto the ports**.
* `LEFT` state → train translates `+boxWidth` (left box sits on the ports).
* `CENTER` → no translation. * `RIGHT` → train translates `-boxWidth` (right box on the ports).
Applied identically to the Hydraulic and Pneumatic builds (both 2-position and 3-position valves).

## Cartridge valves: redrawn exactly like the DIN reference (right-hand symbol)
Cartridge family redesigned to the DIN poppet-element style from the DIN/ISO comparison sheet:
* Exposed **outline cone** (apex toward A) + **seat line** + small poppet travel arrow.
* Perched **control cover box** on top (pilot port X enters the box top) containing the closing
  arrow and/or the adjustable spring with diagonal adjustability arrow.
* Per-type pilot/drain wiring as before, but in DIN style:
  * logic element: X pilot → box top; arrow + spring in box
  * check valve: cone + closing spring only
  * relief / unloading: spring box, dashed inlet pilot (relief) / external pilot (unloading)
  * reducing: dashed pilot from outlet + external drain downward («T»)
  * sequence: dashed inlet pilot + external drain downward («T»)
  * counterbalance: external pilot, bypass line with free-flow **B→A** check triangle
  * 2/2 solenoid cartridge: solenoid box at upper-left (wired from E), return spring above the seat
* Port letters (A/B, P/T, X, E) shown automatically by the app's own port labels.
* The ISO-style square body + inline spring drawings were removed; dashed cartridge envelopes
  removed for a clean sketch-like look; manifold block keeps its dash-dot boundary.
* Matching sidebar icons redrawn for all 11 cartridge types.

## NEW: Mechanical Engineering Deck (landing page system)
A complete, admin-controlled landing page framework for a growing family of engineering apps (10+ ready):
* New shortcode `[rgz_mechanical_deck]`: gradient hero (title/subtitle/accent — all editable),
  live search, category filter chips, responsive app cards (icon, accent color, badges,
  description, *Open app* / *Coming soon*, *▶ Guided tour*), and a Learning Hub promo band.
* Apps are managed entirely from the backend — every future app you add appears on the deck
  in seconds (title, description, category incl. custom, 16 built-in SVG icons, accent color,
  launch URL, badge, visibility, drag-to-reorder, duplicate).

## NEW: Professional backend with modern UI/UX
* **Overview dashboard** (the plugin's main menu page is now a real dashboard): KPI cards
  (apps on deck, total apps, lessons, tours enabled), quick-action cards to every admin screen
  and to the public pages, shortcode reference with one-click *Copy* buttons.
* New submenu **Mechanical Deck** with tabbed UI — *Apps* (live editor with instant frontend
  preview), *Appearance*, *Tutorials*, *Data* (JSON export / import / factory reset) —
  saved via scope-aware forms so one tab never clobbers another tab's settings.
* New submenu **Learning Hub** — lesson CRUD: title, topic, level, reading time, summary and
  HTML content with `rgzl-formula` / `rgzl-tip` helper blocks, publish/hide switch, delete.
* Custom modern admin design system (`assets/admin-deck.css/js`): dark gradient heros, stat
  cards, pill tabs, toggle switches, drag & drop, icon picker with live preview.

## NEW: Guided first-visit tutorials (skippable)
* Both studios now show an interactive 10-step spotlight tour on a visitor's first visit:
  welcome → circuit library → search → symbol library → canvas → properties → validate →

  simulate → messages → file menu.
* Skippable at any time (**Skip tour** button, **Esc**, or clicking the dim) — remembered per
  visitor (localStorage; never shows again). Full keyboard support (←/→/Enter/Esc).
* Switches in *Mechanical Deck → Tutorials* enable/disable each tour from the backend.
  Replay any time via `?rgz_tour=1` appended to the studio URL (the deck's *▶ Guided tour*
  button does exactly this).

## NEW: Learning Hub (hydraulics & pneumatics learning material)
* New shortcode `[rgz_learning_hub]`: 15 seeded expert lessons (7 hydraulics, 7 pneumatics,
  1 general) — Pascal's law, pumps & flow, cylinders, pressure valves, DCV/ISO symbols,
  flow control, oil & filtration — compressed air, FRL units, actuators, valves 3/2–5/3,
  logic & sequence circuits, sizing & leakage — plus an ISO 1219-1 reading guide.
* Topic and level filters, live search, reading-time badges, elegant modal reader, and
  *Mark as read* progress tracked per visitor (localStorage).
* All lessons editable from the backend; add as many as you want.

## Verification (automated, this update)
* Real PHP 8.2 (php-wasm) integration tests with WP stubs — 30+ assertions: shortcode
  registration, deck/learn rendering, settings save scoping (appearance↔tours), app JSON
  sanitization (XSS stripped, bad icon/color/URL rejected), lesson CRUD, all admin screens
  fatal-free, tutorial flags, version 1.0.0 everywhere — **all passed**.
* jsdom tests of the tour engine — auto-start, 10-step walk to finish, localStorage flag,
  `?rgz_tour=1` force, skip/Esc, admin disable — **all passed**.
* Symbol dumps re-rendered and visually verified for the full cartridge family and for all
  three spool states of a 4/3 valve (translate +68/0/−68).

Plugin remains **version 1.0.0** as requested.

---

# Update 5 — Welcome popup onboarding, deck with two tabs, 📖 Learning links & 2× bigger library
(still version **1.0.0**)

## First-visit onboarding: auto-tour replaced by a welcome popup
* The old auto-starting tour (which did not run reliably and needed a separate *tour key* per app)
  is gone — together with the **▶ Guided tour** button and the whole tourKey concept.
* Instead, on a visitor's **first visit** each studio shows an elegant **welcome popup** with an
  app icon and **two buttons**:
  * **Go to [App name]** — dismisses the popup and starts using the app,
  * **▶ Start tutorial** — launches the step-by-step spotlight tour on demand.
* The popup text is **editable from the backend** (*Mechanical Deck → Tutorials*), per studio.
* Shown once per visitor (localStorage `rgz.welcome.v2.*`, immune to private-mode storage errors).
  The admin switches still enable/disable the whole welcome/tour flow, and `?rgz_tour=1`
  (or `?rgz_tour=hydraulic` / `?rgz_tour=pneumatic`) forces the tour directly for testing.
* Popup appears after a short beat, is localStorage-throw tolerant and independent of the app
  DOM — so it works even if the app UI is still booting.

## Mechanical Deck now has two tabs: **Apps** and **Learning**
* The Learning Hub (exactly the same format as `[rgz_learning_hub]` — topic/level chips, search,
  modal reader, read-progress) now lives **inside the deck** as its second tab, showing the
  lesson count on the tab bubble (30).
* Deep links: `#learn` opens the Learning tab; `#learn-hydraulics`, `#learn-pneumatics`,
  `#learn-general` open it **pre-filtered** to that topic.
* App cards lost the *▶ Guided tour* button and gained a **📖 Learning** button instead:
  clicking it on e.g. the Hydraulic Studio card opens the Learning tab already filtered to
  hydraulics topics. The topic per app is selectable in the backend (*Learning topic* on each
  app card editor); saved legacy `tourKey` values migrate automatically
  (`hydraulic → hydraulics`, `pneumatic → pneumatics`).

## Learning library doubled: 15 → **30 lessons**
* 16 new expert lessons were added, informed by the scope of kianhydraulic.com's FESTO training
  posts (all original English writing): hydraulic power-unit anatomy, accumulators, cavitation/
  micro-dieseling, pressure drop & line sizing, hose routing practice, NG6/NG10 & manifold
  mounting, cylinder selection & buckling, systematic hydraulic troubleshooting, proportional
  valves & amplifier parameters (ramp/deadband/gain/dither), advanced fluids (fire-resistant
  types), mobile vs industrial hydraulics — compressors & air production, vacuum technology &
  grippers, electropneumatics, pneumatic maintenance & troubleshooting — plus a formula cheat
  sheet collecting the 12 formulas that drive the simulators.
* New admin button **↓ Load missing default lessons** (Learning Hub list) seeds any deleted
  default lessons back without touching your custom or edited ones.

## Design matched to houmanrgz.ir
* Deck accent default is now your Elementor crimson **#eb4e3c** (still a per-deck setting).
* Buttons are now pill-shaped with 2px borders like your site's buttons: primary = filled accent,
  ghost = outline that fills red on hover; tab bar is an Elementor-style pill (active tab =
  accent with count bubble).

## Verification (automated, this update)
* Real PHP 8.2 (php-wasm) integration suite extended to **74 assertions**: tabs markup,
  `#learn-<topic>` links, learnTopic sanitize + legacy tourKey migration, welcome-text save in
  the tours scope, tourText localized into both studio configs, 30 default lessons,
  seed-missing restore, version 1.0.0 everywhere — **all passed**.
* jsdom welcome-popup suite (**28 assertions**): popup timing, both buttons, editable text,
  persistence, tutorial-off mode, forced launches, X/Esc/backdrop close, full 10-step tour walk.
* jsdom deck-tab suite (**20 assertions**): tab switching, 📖 Learning pre-filtered handoff,
  deep links on load and on hashchange, apps/learn pane isolation.
* Worker solver + spool-slide suites re-run — green.

Plugin remains **version 1.0.0** as requested.

---

# Update 6 — Illustrated lessons & full coverage of your Festo course library
(still version **1.0.0**)

## Learning materials now have pictures
* Every lesson can have a **cover image** (`cover` field, editable in the lesson form) — shown
  on the learning card and at the top of the reader modal (skipped automatically if the same
  image already appears inside the text).
* **49 bundled artworks** ship inside the plugin (`assets/learn/`):
  * **39 hand-built technical drawings (SVG)** — ISO-style schematics: Pascal pistons, pump
    group + relief, cylinder areas, 4/3 spool with correct port layout, relief/reducing valves,
    flow controls, oil & viscosity window, NG6 manifold, buckling modes, cavitation, velocity
    classes, accumulator, valves and logic symbols, vacuum gripper, ring-main distribution,
    relay & sequence ladders, electro-hydraulic/-pneumatic circuits, characteristic curves,
    closed-loop block diagram, displacement-step diagram, safety pictograms…
  * **10 realistic AI photos (JPG)** — hydraulic power unit, accumulator station, proportional
    valve on manifold, excavator, FRL unit, compressor room, filter service, pressure-test
    troubleshooting, vacuum gripper, control cabinet with relays/PLC.
* New content helper: `<figure class="rgzl-fig"><img …><figcaption>…</figcaption></figure>`
  (mentioned in the admin form hint). Inline figures added to all new lessons.

## Full coverage of your 5 Festo training books — **16 new lessons (46 total)**
Grounded in the table of contents of the uploads (TP101/TP201/TP501/TP701):
* **Electrics bridge (general):** *Electricity basics for fluid-power technicians* (DC circuits,
  Ohm, solenoid, measuring), *Pushbuttons, switches & industrial sensors* (NO/NC, reed,
  inductive, capacitive, optical, pressure switch), *Relays, contactors & the self-latching rung*.
* **Electro-pneumatics:** *Electro-pneumatics I* (solenoid valve control), *Electro-pneumatics II*
  (relay sequences, timers, counters, A+ B+ B− A− ladder).
* **Pneumatics deepening:** *Time-delay, pressure-sequence & quick-exhaust circuits*,
  *Multi-actuator circuits: signal overlap & cascade*, *Compressed-air networks* (ring main,
  drops, drains). Rodless cylinders & rotary actuators added to the actuators lesson.
* **Electro-hydraulics:** *Electro-hydraulics I* (solenoid + Boolean control), *Electro-hydraulics II*
  (latching & pressure-/path-dependent sequences).
* **Hydraulics hardware:** *Hydraulic motors* (torque/speed from Δp & Vg), *Gauges, sensors &
  test points* (measuring discipline).
* **Proportional hydraulics:** *Characteristic curves & dynamics* (hysteresis, inversion,
  response threshold, step response, dither), *Proportional control in practice: open & closed loops*
  (signal chain, speed profiles, positioning).
* **General:** *Function diagrams & control documentation*, *Safety first* (stored energy,
  injection jets, electricity).

## Admin: one-click library maintenance
* New **⟳ Refresh factory lessons** button (next to "Load missing default lessons"): rewrites
  the text + pictures of all factory lessons to the latest shipped version — your custom lessons
  and each lesson's publish state are preserved. Cover-image field added to the lesson editor.

## Verification (automated, this update)
* 39 SVG figures validated as XML + spot-rendered and visually reviewed; all 46 cover/figure
  references inside rendered markup resolve to existing files (automated sweep).
* PHP integration suite (real PHP 8.2) extended: 46 default lessons, cover rendering in deck
  and hub, `rgzl-cover` + asset URLs present, lesson form cover field, seed-restore, refresh
  semantics (rewrites factory texts, keeps publish state + custom lessons) — **all passed**.
* Deck jsdom suite extended: cover on card + cover in reader modal — **all passed**.

Plugin remains **version 1.0.0** as requested.

---

# April 2026 — Update 6 (pictures in lessons + full Festo-book topic coverage)

- [x] **Pictures in every lesson — 49 artworks**: 39 hand-built technical SVG drawings (ISO 1219 symbols, circuit diagrams, characteristic curves, function diagrams, FRL/valve/pump cutaways …) + 10 AI-generated photorealistic photos (power pack, compressor station, proportional valve, control cabinet, mobile crane hydraulics, vacuum gripper …). All stored locally in `assets/learn/` — no hotlinks. Every one of the 46 lessons now has a 16:9 **card cover** image; new lessons also embed figures **inside** the text via `<figure class="rgzl-fig">`, and the read modal shows the cover as a hero when the body has no figure.
- [x] **Learning library grew 30 → 46 lessons and now covers all 5 uploaded Festo books end-to-end**: 16 new lessons — electrical fundamentals / switches & sensors / relays & contactors (TP 201 + Electro-Hydraulics Part B), electro-pneumatic circuits + sequences, time-delay & pressure-stage controls, multi-actuator overlap (TP 101/201), air generation & distribution (TP 101/201), electro-hydraulic circuits + sequences (Electro-Hydraulics), hydraulic motors & speed control + measurement & testing (TP 501 §14–15), proportional characteristic curves + closed-loop positioning (TP 701), function diagrams + safety (all books). Existing lessons extended (rodless & rotary actuators, etc.).
- [x] **[Refresh factory lessons]** button in Learning Hub admin: rewrites all 46 factory lessons' texts & covers to the latest version while preserving custom lessons and published/hidden states.
- [x] Tests: harness extended (cover card render, modal cover fallback, cover schema, refresh semantics 46+1, seed-restore 46) — all pass; front-end previews rebuilt (`preview-learning-hub.html` — deck pre-filtered to the Learning tab).

---

# August 2026 — Update 7 (real network simulation engine: adjustable components now work, per-point measurements)

Urgent physics fix after the report that adjustable elements (Adjustable Flow Control, Pressure Reducing Valve, …) had no effect and a gauge downstream of a closed-center valve showed the full power-pack pressure.

- [x] **The old "solver" was replaced by a true nodal network engine** (`rgzFluidSolve`, oil + air). Previously the simulators computed one global pressure/flow heuristically and painted it on every gauge — adjustable components were ignored entirely. Now every component port is a network node, every line a resistive edge, and the circuit is solved as a damped nonlinear system each frame: pressures, flows and speeds are different at every point of the circuit, exactly as in reality.
- [x] **Adjustable elements are now authoritative**: flow-control valves (meter-in / meter-out / pressure-compensated), pressure-reducing valves (regulated downstream with relief-to-tank behaviour), relief/unloading valves with real opening override, check & pilot-operated check valves, counterbalance & sequence valves, shut-off valves, cartridge variants, servo/proportional command, shuttle (OR) / two-pressure (AND), quick-exhaust, soft-start ramp, time-delay valve, flow divider, pressure compensator, intensifier, vacuum ejector — all respond live when their setting changes.
- [x] **Per-point measurement**: gauges, test points, pressure switches/transducers read the pressure at their own port; flow meters/switches read the flow through their own branch; line highlighting is per-line (flowing vs. pressurized vs. idle). A gauge downstream of a CLOSED-center valve now reads **0.0 bar** while the pump deadheads at its relief setting (the reported case, covered by automated tests at solver and UI level).
- [x] **Physically correct actuator behaviour**: cylinders run a force-balance root-find per tick with hydraulic-lock detection (sealed chambers stop), mass-conservation supply limits (a retracting/overrunning cylinder cannot move faster than the oil the pump can actually deliver to the filling chamber — no more phantom "vacuum-powered" speeds), cavitation floor, regenerative-center differential speed-up, end-stops and spring return; motors simulate torque back-pressure and stall correctly behind closed valves; accumulators charge/discharge and hold pressure.
- [x] **Pneumatics**: compressor cutout, FRL regulation to the set pressure, exhaust-throttle speed control, OR/AND logic, quick exhaust, receiver storage — all network-solved; air chambers use local-condition (compressibility) flow conversion.
- [x] **Warnings upgraded**: relief dead-head, missing relief protection, cavitation/starvation risk, excessive line velocity, over-pressure at pump outlets.
- [x] **Same engine everywhere**: the Web Worker simulates the identical function (`Function#toString` embedding, verified in tests), with the main-thread fallback for small screens; `dt` forwarding bug fixed (fallback previously ran with `dt=0`).

## Verification (automated, this update)
* **47 bespoke physics tests** (extend/retract speeds, deadhead & relief, meter-in/-out throttling, reducing-valve clamp & yield, variable-pump destroking, check blocking, regenerative speed-up, servo metering, closed-center lock + downstream gauge = 0, stalled motor behind closed valve, FRL = 6.00 bar, exhaust restrictor, OR/AND, time delay …) — **all passed**, both standalone and re-run against the extracted solver from the **minified production bundle**.
* UI end-to-end (jsdom, real app): "Motor start/stop" example shows HPU 167.4 bar / motor 0 rpm / flow switch 0.0 L/min (previously: 18 585 rpm of phantom flow); per-example badge sweeps show per-point values; **all passed**.
* Worker-blob harness: both Apps create workers, embed the engine, return the full metrics shape — **passed**.
* PHP integration (46 lessons, seed/refresh, version 1.0.0), deck tabs, spool translation tests — **all passed**.

Plugin remains **version 1.0.0** as requested.

**Update 7 follow-up (same day):** meter-out speed control fix — rod-side pressure intensification (pB ≈ pA × Aa/Ab) is now allowed to rise above the pump/relief ceiling, up to the cylinder area ratio. Previously the internal pressure clamp silently capped that back-pressure, so meter-out flow controls appeared to do nothing until extreme closings. Verified: 100/43/20 % openings run at full speed with elevated back-pressure (physically correct for a fixed pump), 6 % opening slows extend to ~80 mm/s (theory 81), 3 % to ~27 mm/s, throttling deadheads the pump at relief; retract-side metering behaves equivalently (−198 → −60 → −20 mm/s). Added regression test HYD 12; full suite now **51 physics tests** + all UI/PHP harnesses passing.

**Update 7, second follow-up (same day):** thorough meter-out/live-edit pass.
* Fixed the **hydraulic-lock false positive** that stopped tight-throttle circuits: "sealed chamber" detection used a fixed conductance threshold that tripped exactly when a flow control was nearly closed (its linearized conductance q/Δp falls with the flow), so meter-out at ~3 % could jam to 0 mm/s instead of crawling. Threshold now sits two orders of magnitude above the closed-valve leak conductance (2 × 10⁻⁵ vs 2.4 × 10⁻⁶ L/min/bar), and relief-valve below-crack leakage was moved to the same sealed class. Verified live in the app (user's own gesture: open example → Simulate → drag the opening slider): **meter-out 100 % = 133.6, 38 % = 133.6, 6 % = 80.6, 3 % = 27.0 mm/s** (theory 81 / 27); **meter-in 45 % → 5 %: 133.6 → 33.3 mm/s**, deadhead at relief while throttled.
* **Regenerative-center 4/3** confirmed against the ISO/Festo convention (regen position pressurizes A and B together, joining P-A-B, T blocked): the pre-designed example rapid-extends at **212 mm/s = Q/(Aa − Ab)** for its 80/50 mm cylinder — the differential fast traverse this valve type is built for. Live UI test covers it.
* New jsdom suites: `test-meterout-live.js` (fresh-load-per-opening live slider sweep on the pre-designed examples), `probe-edit.js` (single live edit gesture). Physics suite remains at **51 tests**; PHP/deck/spool/worker/badge harnesses all passing.

**Update 7, third follow-up (same day):** sequence clamp-and-work circuits redesigned — the working cylinder now returns fast.
* The pre-designed **"Sequence valve clamp-and-work circuit"** trapped the work cylinder's cap oil behind the sequence valve on the return stroke (a one-way sequence valve blocks reverse flow), so the work cylinder crept back at −0.2 mm/s — physically real for the old drawing, but a broken template. The circuit was redesigned the way the textbooks do it: a **bypass check valve (CV1) in parallel with the sequence valve** gives the cap oil a free return path while the forward (sequencing) direction is untouched. Extend order is preserved (clamp first, then work at the sequence setting), and both cylinders now retract at proper speed: clamp −290 → 0, work −88 mm/s (full −121 mm/s theory once it owns the whole 25 L/min pump flow). The identical flaw was fixed in **all five affected templates**, both apps: Hydraulic Simple "Sequence valve clamp-and-work" (CV1), **Pneumatic** Simple "Pneumatic sequence clamp-and-work" (CV1), **Intermediate** "Sequential two-cylinder electrohydraulic / electropneumatic circuit" in both apps (CV1 parallel to SV1 — C2 previously stayed stuck extended after the auto-retract sensor fired), and **Cartridge** "Cartridge sequence clamp-and-work circuit" (cartridge check CCV1 parallel to CSV1). Example auto-layout slots for check valves were moved up one row so the parallel branch no longer overlaps the sequence valve symbol.
* **New solver bug found & fixed while validating the cartridge variant**: `cartridgeManifoldBlock` (and pneumatic `valveTerminal`) were modeled as a common junction, shorting supply P to return T — every cartridge circuit deadheaded its pump at ~0 bar and nothing moved (C1 even drooped backward on extend). The manifold is now modeled as through-galleries (P↔A, T↔B), the valve terminal as supply gallery (P→A1..A4) with a common exhaust (B1..B4↔R).
* **Phantom-trapped-pressure fix (numerical)**: hard on/off check valves (open ⇔ `pA > pB + crack`) flip states when the opened valve equalises its ports; under the bisection probes of the cylinder root-solve the relaxation then froze the edge half-shut, producing an impossible 269 bar / 130 kN "trapped" reading behind an open bypass check. Check valves now switch with hysteresis (open at `pA > pB + cr`, close below `pB + 0.2·cr`), giving unique stable fixed points — the same retract now reads **9.1 bar system pressure / ~2 kN**, all speeds unchanged. A 3-pass unrelaxed re-evaluation of all on/off conductances at the converged point was added before readouts.
* Verified headlessly and live in the app (example → Simulate → flip V1 to retract): extend order clamp-first-then-work, retract both cylinders home at speed; cartridge circuit extends 133.6 / 215 sequences and retracts fully; backward check-valve isolation (accumulator held pressure) and forward free flow both covered by new tests (HYD 13 manifold, HYD 14 sequence retract incl. old-bug documentation, HYD 15 check fwd/reverse). Physics suite now **61 tests**, re-run against the minified production bundle; meter-out/meter-in/regen live sweeps, badges, worker, deck, spool, tour and PHP harnesses all passing.

**Update 7, fourth follow-up (same day):** readability of rotated symbols, pilot-operated check valve fix, and a DIN-correct cartridge/logic-valve pass.
* **Rotated components keep upright labels**: component names and port letters are now counter-rotated against the component body, so a 180°-rotated check valve (e.g. the bypass CCV1 in the sequence circuits) no longer shows upside-down text. Applied in both apps, for the symbol name and every port label.
* **Pilot-operated check valve really releases**: the pilot-release branch of the valve model was guarded by `pB > pA`, i.e. it only allowed the pilot to open the valve while back-pressure was still present. On the bench the pilot piston mechanically unseats the poppet regardless — so in \"Pilot-operated check valve load holding\" (Simple circuits) the return stroke stayed locked once the held cap pressure had leaked down, and the circuit sat stuck mid-stroke with the pump at relief. The guard is removed (only a 0.5 bar pilot-presence threshold remains): extend 134 mm/s → hold with 0 % drift → retract −198 mm/s back to 0 %, all against physical pressures. The **pneumatic twin** was stuck the same way (verified against the previous build); it now retracts too, and its demo load was corrected 400 kg → 150 kg — a 63 mm cylinder at 6 bar genuinely cannot lift 400 kg, so the pneumatic demo could never even show its extend phase.
* **Cartridge valves drawn to DIN (screw-in + slip-in):** the 2-way **logic cartridge** symbol is now the DIN 24342 / ISO 7368 seat element — cavity square with a solid poppet wedge on its seat, closing spring behind the poppet base, and the dashed **control cover** on top fed by pilot port **X** (pressurised X clamps the poppet shut, vented X lets it lift). The screw-in cartridge family (check, relief, reducing, sequence, unloading, counterbalance, 2/2 solenoid) got filled poppet wedges plus the dashed cavity outline, and the symbol-library thumbnails were updated to match. The logic valve's area ratio is now a first-class property (`Cover area ratio (X : A)`, default **1:2** — ratio 1 made closing physically impossible).
* **Logic-element physics rewritten**: the old law (`px + 0.3 > max(pA,pB)·0.6`) closed the valve at its own ~zero pressure drop, and under the geometric-mean relaxation the edge froze half-shut — an open bridge leg showed a phantom 258 bar back-pressure, and at low pilot pressure the piloted legs leaked and shorted the bridge. The element is now a Schmitt trigger on the real force balance (`px·ratio` vs `max(pA,pB,0)`, 0.3 bar band): close above line + 0.15 bar, re-open below line − 0.15 bar, hold in between — with definite states seeded open (X vented = free poppet).
* **New pre-designed circuit — \"Slip-in logic bridge press — poppet cartridges piloted by a small 4/3 DCV\"** (Cartridge valve manifold circuits): the old \"logic press\" example secretly bypassed its logic valves through a conventional 4/3 valve and trapped the pilot oil (2/2 poppet with no vent path — X could never release). It is now the canonical Rexroth-style architecture: **four 2-way poppet logic elements as a 4-way bridge** in/around the manifold (P→A, P→B, A→T, B→T) carrying the full 40 L/min, while the small 4/3 valve only pilots the control covers. LEFT = press stroke (P→A, B→T; X on the other two covers clamps them), RIGHT = retract, CENTRE (float) vents every cover — all four poppets open, the bridge unloads the pump P→T at **0.8 bar** and the 2.5 t platen sinks freely. Verified on the network solver: extend at **57.6 bar** load pressure / 132 mm/s (not relief!), deadhead press force at **217.6 bar ≈ 109 kN**, rod side 0.4 bar on the open return leg, float-centre unload < 5 bar, full retract. Heavy-duty set: 80/45 mm × 450 stroke cylinder, 2 500 kg press load, 40 L/min / 210 bar power pack.
* New tests **HYD 16** (PO check extend/hold/retract from the shipped example model) and **HYD 17** (logic-bridge pressure levels incl. the phantom-back-pressure regression); physics suite now **74 tests**, all re-run against the minified production bundle; sequence-live, meter-out-live, badges, worker, deck, spool, tour and PHP harnesses all passing. Workspace cleaned (archived renders, patch scratch, uploaded photo sheets and ~18 MB of stale artefacts removed per request).

Plugin remains **version 1.0.0** as requested.

**Update 7, fifth follow-up (same day):** user-reported mega-fix round (7 items) — electrical/PLC engine, flow divider, selectable valve blocks, blind plug, rotating readouts, user profiles + designer-track learning content.
* **(3) Electrical/PLC elements are now fully functional — not decorative.** A real scan-based control engine (`rgzElectricalScan`) runs every simulation tick in both apps and replaces the old hardcoded two-hand hack: sensors (reed/limit/proximity, pressure & temperature switches with proper Schmitt-trigger hysteresis — pickup at setpoint, dropout at 95%), push-buttons (NO/NC honoured), emergency stops (NC, normally true, false when pressed), solenoids and relays, timer relays (driven by PLC `start`/`reset` rungs, elapsed when sim-time ≥ delay), and 2-position memory valves. **The PLC is genuinely programmable**: rungs in the form `CONDITION -> TARGET action` (latched, last-match-wins) and `Q1 = condition` (combinatorial), conditions as `A AND B OR NOT C`, targets by label (V1, Y1, T1, Q2…) or by electrical wiring (PLC inputs I1–I4 read whatever is wired to them, outputs Q1–Q4 drive what they are wired to). DCVs understand extend/retract/stop (=left/right/center) respecting each valve's left/center/right blocks; solenoids understand on/off and drive their valve by the coil-bucket rules (single-solenoid+spring valves return on de-energize, spring-side corrected to left when the spring is on the left — verified in the load-hold example). Solenoids gained a **targetControl** property (which valve they shift), fresh solenoids default to OFF so they no longer grab valves uninvited, and PLC program descriptions gained a grammar hint in the inspector. **All 15+15 example circuits (both apps) were rebuilt on the canonical rungs**, and their 17+17 direct sensor→valve shortcuts were nulled so the physical chain sensor → PLC → coil → valve is the only path. Litmus proof (automated): deleting PLC1 from the electrohydraulic auto-return example stops the sequence exactly as the user demanded.
* **(2) Flow divider now really divides — two cylinders stay synchronized.** The divider is modeled as a controlled current-source triplet (in sink + two issued branch flows) plus primer conductances for the physical path, with a once-per-tick outer-loop controller (measure offered input, grow issue to match; shrink follows loads; combiner snap-arm for reverse flow; fill-side ceiling computed from branch cylinder area ratios so meter-out retract cannot cavitate the filling side; ~2 % dashed simulated balance error documented like the real spool tolerances). Verified from the shipped example model: at 25 L/min both cylinders run at exactly 106 mm/s and track within 0–100 % stroke for loads 160/160, 160/60 and **320/40 kg**, retract −142/−142 mm/s, no warnings.
* **(5) Directional valves: left and right blocks freely selectable.** Same full block set as the center position — parallel / crossover / open / tandem / float / regenerative / closed-per-port — per envelope, 2/2 and 3/2 valves guarded correctly (no tandem without a T port), legacy drawings without the new properties keep their old behaviour, and the ISO symbol on canvas now **draws the selected blocks** (crossed paths for crossover, T-bar for tandem, Y-junction for regenerative, caps for closed ports) in every position, verified visually via rendered SVGs.
* **(1) Readout badges stay readable on rotated components**: the numeric output badge (mm/s, bar, L/min, rpm…) is counter-rotated against the component now — the label text was already fixed in the previous round, the dynamic readout badge was missed and is fixed this round, both apps.
* **(4) Blind plug element added** (Lines category, both fluids): plugs any unused valve/manifold port with a single connection pin, seals it in the network solver (no phantom venting to tank anymore), proper palette + canvas symbols.
* **(6) User profiles on the main deck — integrated with both studio accounts.** The deck's new **Profile tab** recognizes the existing Hydraulic/Pneumatic Studio sign-ins (same signed account tokens — no second account system), shows an editable profile (**First name, Surname, E-mail (locked to the account), Phone, Company**), **all saved circuits from both studios** (name · date · size, from the studio submission tables), and **learning progress** (bar, read-lesson list) that is now persisted on the **WordPress backend** (`rgz_mech_deck_profiles` option, keyed by md5(email) — no manual DB setup needed) and synced back into the browser's read flags on any device. New public AJAX endpoints (`rgz_deck_profile`, `rgz_deck_profile_save`, `rgz_deck_progress_save`, nonce `rgz_deck_public`, config `RGZDeckConfig`) enforce token signature + expiry. "Mark as read" now stores progress server-side when signed in.
* **Learning Hub content editing upgraded (6b)**: the lesson form now has a **WordPress media-library picker** for the cover image and for inserting styled `<figure class="rgzl-fig">` images into the content, one-click **block templates** (formula box / tip box / step list), and the hint text documents inline `style="…"` HTML styling — full HTML bodies remain supported and sanitized via `wp_kses_post` as before.
* **(7) 8 new practical "Designer track" lessons** appended (54 lessons total): hydraulics H1–H6 take the reader through a complete machine design with worked numbers (load → bore & system pressure; flow/speed & line sizing with the √ formula; DCV positions and **selectable left/center/right blocks**; meter-in/out commissioning procedure with calibration table; relief 1.15× rule, reducing branches & accumulator sizing with gas-law math; verification capstone — power/heat/BOM against a full press circuit), pneumatics P1–P2 (axis sizing with the load-factor rule, conductance/air-consumption checks, exhaust throttling; and the designer's sequence method — displacement-step diagram → sensor placement → signal-overlap check → PLC rungs exercised live in the Studio). Every track lesson ends with a numbered **"🏗 Studio exercise"** so learning immediately becomes practiced design skill.
* **Verification (automated, this round)**: physics suite re-run against the **minified production bundle extracted from the shipped zip — 84/84 passed** (incl. new HYD 18 flow-divider synchronization, HYD 19 selectable left/right blocks); UI harnesses all green (PLC engine 10/10 incl. PLC-deleted litmus, two-hand clamp 8/8 with race-free polling, badges, tour, sequence-ui, meter-out live sweep, spool ±68 px transforms preserved, block drawer render, deck tabs); PHP integration suite extended & all passing (54 lessons, profile save/progress/fetch round-trips with real HMAC token verification, forged-token & bad-nonce rejection, Profile tab markup, media-library tooling, version 1.0.0); jsdom deck-profile suite (sign-in fallback, token fetch, profile paint, save round-trip, progress sync) all passing. Workspace tidy.

Plugin remains **version 1.0.0** as requested.

**Update 7, sixth follow-up (same day):** integration round 2 — deck accounts done right (sign in/up/out, avatars), top-bar profile + My Designs popup with AutoCAD-style blueprint previews and one-click reopen in the studio, the Learning Hub grown into a 320-lesson encyclopedia (≥150 per subject), and a live unit converter synced to the site design.
* **(1) Sign in / sign up / sign out on the Mechanical Deck.** A user chip now sits at the very top of the deck (as on every serious site). Signed-out visitors get a **Sign in button** that opens a popup with **Sign in** and **Create account** tabs; the deck authenticates against **both** studio account systems at once (one e-mail + password = one account across the Hydraulic and the Pneumatic Studio — register falls back to sign-in when the account already exists server-side). Tokens are stored in the same localStorage keys the studios use, so the user is signed in everywhere. **Sign out** lives in the dropdown and clears the session everywhere.
* **(2) 60 selectable avatars.** The profile editor popup contains a picker grid of **60 preset avatars** (15 professional icons × 4 gradient palettes); the selected avatar is stored with the server-side profile (`avatar` field, whitelisted), appears in the top chip (otherwise initials) and in the dropdown header.
* **(3) Profile moved to the top; "My Designs" in the same dropdown; designs reopen INSIDE the studio with a schematic preview.** The old Profile tab is gone. The top-left chip opens a dropdown with **Edit Profile** (popup, not a page — display name, phone, company, avatar, learning progress bar) and **My Designs** (popup). My Designs lists every saved circuit from both studios — each as an **AutoCAD-style blueprint card**: because saved designs are client-side AES-encrypted, the apps now upload a compact engineering **geometry sketch** (component rectangles + connection lines, solved port anchors) at save time; the deck renders these as live SVG thumbnails tinted per discipline, grid background included. Clicking a card **opens the corresponding studio page with that exact design loaded** (deep link `…#rgz-open=<id>`; both apps parse the hash, fetch the design, ask the design password if encrypted, and load it — continue designing immediately).
* **(4) Learning Hub × 6 growth: 54 → 329 lessons — 169 hydraulics & 153 pneumatics (≥150 each).** A new `rgz-learning-library.php` ships **275 structured lessons generated from one professional template** (What it is / How it works / formula / Key parameters & selection / **Typical applications in circuits** / 🏗 Studio exercise). Content: **139 hydraulics** lessons — every studio element (power packs, all pump types, cylinders, DCVs, proportional/servo, all valve families, accumulator & safety block, filtration, cooling, hoses/pipes, cartridge valves, sensors…) plus **41 real circuit-design patterns** (open/closed center, hi-lo & unloading, meter-in/out/bleed-off, regenerative, clamp-then-work sequencing, flow-divider & series sync, counterbalance, load-sensing & LUDV, decompression, two-hand, dump safety, kidney loop, commissioning, test points, energy audit, and a ten-step design capstone) plus **26 fundamentals** (p×Q power, efficiency, natural frequency, orifice law, ISO 4406 & beta ratios, cavitation, gas laws, buckling, tank design, heat budget, failure-mode reading, maintenance); **136 pneumatics** lessons — compressors, dryers (refrigeration/adsorption/membrane), FRL & regulators, soft-start & dump safety valves, 3/2 & 5/2 & 5/3 valves incl. memory, throttle-check, quick exhaust, shuttle AND/OR, timers/counters, silencers, every actuator type (SA/DA, cushioned, compact, guided, rodless, rotary, grippers, stopper, air muscles), vacuum technology (ejectors/cups/switches/reserve), tubing & valve terminals, sensors — plus **40 circuit patterns** (direct/indirect control, latching, auto-return, two-hand anti-tie-down, dwell timers, quick-exhaust tuning, pressure sequences, the full **cascade method A+ B+ B− A−**, multi-pressure, oscillating, vacuum pick-and-place, E-stop + restart interlock, energy tricks, PLC mapping…) plus **26 fundamentals** (Nl/min conversion, consumption math, price per bar, leak economics, regulator droop, dew point, choked flow, cylinder sizing, stick-slip, air-vs-electric economics…). Every lesson ends with a **Studio exercise** so reading instantly becomes circuit-design practice. Existing installs get the new lessons **automatically** via a versioned auto-sync merge (factory `LESSONS_VER`, admin lessons untouched, hidden lessons kept).
* **(5) Unit converter tab.** New **Converter** tab in the deck: choose a physical quantity (17 of them — pressure, flow, volume, length, area, force, torque, speed, power, energy, mass, temperature, displacement, viscosity dynamic & kinematic, density, rotational speed/angle…), type a value, pick input/output units — the result computes **live on every keystroke** with proper affine handling for °C/°F/K, engineering precision formatting, one-click **unit swap**, copy button and a live equivalence formula line (e.g. `1 bar = 14.503773 psi`). All math is client-side and instant, styled exactly to the site (accent variable, cards and chips like the deck).
* **Verification (automated, this round)**: PHP integration suite re-run & all passing (329 defaults; **169/153 per-topic counts ≥150**, 81 circuit-pattern lessons, 275 lessons with applications sections, auto-sync merge incl. custom-lesson preservation, deck top-bar/modal/converter markup, profile/progress round-trips, forged-token & bad-nonce rejection, version 1.0.0). jsdom deck e2e **32/32** (auth modal → both studio endpoints → tokens, 60-avatar picker, dropdown actions, designs modal blueprint cards + deep links, converter checks incl. 1 bar = 14.503773 psi & 100 °C = 212 °F). Physics suite **84/84** re-run against the minified bundle now shipped in the zip; PLC 10/10, two-hand 8/8, badges/sequence/meter-out/spool/blocks/tour/worker suites green (legacy profile-pane suite retired in favor of the modal e2e).

Plugin remains **version 1.0.0** as requested.

**Update 8:** user-requested follow-up round (5 items) — full physical-quantity converter with classified dropdown, readable auth button colors, pictures for every learning lesson, variable work loads (time/position profiles) for cylinders and motors in both apps, and user-defined simulation charts with SVG/CSV export.
* **(1) Unit converter completed + classified dropdown.** The quantity picker is now a proper **`<optgroup>`-classified dropdown** (custom accent arrow, styled group headers): **"Fluid power & flow"** (pressure; volume flow L/min·GPM·m³/h·CFM; **mass flow** kg/s·kg/h·t/h·lb/min·Nm³/h(air); pump displacement cm³/rev·in³/rev), **"Mechanics"** (length, area, volume, mass, density, force, torque, speed, **acceleration** incl. g, **moment of inertia** kg·m²·lb·ft², power, energy, rotational speed, angle), **"Thermal"** (temperature °C/°F/K with affine math, **specific heat** kJ/kg·K·BTU/lb·°F, **heat flux** W/m²·BTU/h·ft²), **"Electrical & magnetic"** (current, voltage, resistance, frequency, charge/Ah, capacitance, inductance, magnetic flux density T/G) and **"Light & optics"** (**luminous flux** lm, **luminous intensity** cd, **illuminance** lx/ft-candle, **luminance** nit/foot-lambert, radiant flux W, optical power density W/m²·mW/cm²) — **34 quantities / 100+ units**, live on every keystroke as before, with sensible default unit pairs per quantity, swap and copy buttons and the live equivalence line.
* **(2) Auth colors readable.** The deck's sign-in/up buttons are no longer identical: **Sign in = accent #EB4E3C**, **Create account = deep navy #0f172a** (hover #1e293b), the active auth tab is accent-underlined, and the **Sign out** dropdown item is permanently red-tinted (pale red background, #b91c1c label, red icon, solid red hover) so the dangerous action is unmistakable.
* **(3) Pictures for every learning lesson.** A small illustration engine (`rgz_ll_svg_open` / `rgz_ll_sym` / `rgz_ll_figure` / `rgz_ll_cover` in `rgz-learning-library.php`) draws **hand-built blueprint-style SVGs** (340×210 canvas, site-accent strokes, corner caption): **~55 ISO-style symbol painters** reusing the studio schematic vocabulary (pumps/motors, cylinders, every valve envelope family, FRL, accumulator, filters, coolers, sensors…), so **each element lesson shows its component symbol as a hero figure** (white circle backdrop, 1.9× scale); **each circuit-pattern lesson gets a mini schematic** — pump/compressor → control valve → actuator with the pattern's key element highlighted in accent plus an OIL/AIR SUPPLY caption; **each fundamentals lesson gets a glyph + curve chart card** (p–Q line, efficiency hill, orifice parabola, filter β-curve, gas-law isotherms, dew-point curve…). All **275 encyclopedia lessons** now render an inline SVG figure, and every lesson card carries a **series cover** (6 new `assets/learn/cov-*.svg` covers: hyd/pne × elements/circuits/fundamentals). Fully inline (no network), `wp_kses`-safe, and visual output verified by re-rendering with resvg.
* **(4) Variable work loads (position- or time-based) for cylinders AND motors, both apps.** Every cylinder and motor property panel gained **"Load over cycle"**: `constant` (as before), **`time-based`** or **`position-based`**, plus **"Load profile points"** — one `x, y` pair per line: for time mode `seconds, kg` (motors: `seconds, N·m`); for position mode `0..1 stroke fraction, kg` (motors: `0..1 per-revolution fraction, N·m`, angle taken from the integrated shaft angle). The solver's `profileVal()` linearly interpolates between points and clamps at the ends, and the effective load is evaluated **every tick** — so a press that meets its workpiece mid-stroke, or a winch whose torque rises per revolution, now drives the working pressure up and down exactly as on the bench. Physics note kept honest in tests: below ~620 kg on a 63 mm bore the cylinder is supply-limited (v = Q/A, chamber at the valve-drop ceiling) and only then force balance engages — profile tests therefore ramp 200 → 3000 kg and assert the supply-limited 19.5 bar → force-engaged 100.5 bar transition (motor: 5 → 40 N·m lifts pump pressure 33 → 101 bar).
* **(5) User-defined charts, delivered by the app.** A new **"📈 Charts"** toolbar button (both studios, next to Stop) opens the chart designer. While any simulation runs, a recorder captures **one telemetry sample per frame** (10 ms sim-time stride, 30 000-sample cap, auto-restart on a new run) for **every channel**: system pressure/total & active flow/power (plus oil temperature in the Hydraulic Studio), per-cylinder **position % · speed · force · cap-end pressure**, per-motor **rpm · flow · rotation deg**, per-gauge/switch/transducer/test-point pressure, per-flowmeter/switch flow, accumulator pressure & charge flow. In the designer the user picks the **X axis** (Time default, or **any channel**) and any number of **Y series** on the left axis plus one optional **right-axis** series, then **renders** an interactive SVG (nice 1/2/2.5/5 ticks, grid, color legend, axis labels with units, dual scales, HoumanRGZ watermark) — exactly the requested "cylinder position (Y) vs time (X)", or transposed pressure-vs-position curves, mixed axes, anything. **Export SVG** downloads a standalone vector chart (`rgz-hydraulic-chart.svg` / `rgz-pneumatic-chart.svg`), **Export CSV** downloads the recorded data with labeled+unit-ed headers, **Clear data** resets the record; a gentle live-refresh keeps the preview moving while the sim runs.
* **Verification (automated, this round)**: physics suite **93/93** — run twice, once against the source solver and once against the **minified production bundle shipped in the zip** (new HYD 20 time-based cylinder load profile, HYD 21 position-based profile, HYD 22 motor torque profile); new jsdom chart suite **30/30** (both studios: channel catalogue, recorder capture, X-as-channel render, two-series + right-axis render, CSV/SVG downloads with correct file names, clear + keep-recording, oil-temperature hidden in pneumatics); deck e2e **37/37** (34 quantities ≥5 classified groups incl. Fluid/Light, 1000 lx ≈ 92.9 fc, 2 g = 19.6133 m/s², 120 kg/h ≈ 4.409 lb/min); PHP integration suite all passing (275/275 lessons with inline figure + series cover, auth color markup, converter select); PLC 10/10, two-hand 8/8, badges, sequence-ui, meter-out live, spool, blocks, tour, worker (HYD+PNE) all green; chart SVG eyeball-verified via resvg render.

Plugin remains **version 1.0.0** as requested.

---

**Update 9, seventh follow-up (same day):**

Item-by-item fixes from the user's live-site feedback (he reported: converter+charts OK; auth colors, lesson artwork, variable-load guidance and the hero Topics stat not OK):

1. **Auth / profile colors (live-site fix).** Root causes found via the live page: the three deck modals (auth / profile / designs) were rendered *outside* the `<section class="rgzd" style="--rgzd-accent:…">` scope, so every accent-dependent rule (active tab, the Sign-in button, input focus rings) resolved to nothing → white-on-white, invisible. Fixes: (a) all three modals moved inside the accent section, (b) each `.rgzpm-backdrop` now also carries its own inline `--rgzd-accent` (admin accent respected), (c) deck.css contrast-hardening: inputs get explicit white bg + `#cbd5e1` border + dark text, active tab and Sign-in button have explicit `var(--rgzd-accent, #eb4e3c)` fallbacks, Sign-out menu item keeps its permanent red-tint style.
2. **Learning content images/SVGs (live-site fix, two root causes).** (a) At display time the lessons ran through `wp_kses_post()`, whose allow-list has **no SVG elements** — every inline lesson figure was silently stripped on the live page even though it was stored correctly. New `rgz_deck_kses_lesson()` helper = post allow-list + full SVG vocabulary (svg/g/path/rect/circle/ellipse/line/polyline/polygon/text/tspan/defs/marker/use/gradients/clippath + their attributes); used both at save (`sanitize_lesson`) and at display (lesson `<template>` render). (b) The lessons auto-sync only *merged new* lessons, leaving pre-existing DB lessons with stale text/covers forever. `LESSONS_VER` bumped 7 → 8 and the sync now *refreshes* factory lessons in place (content + covers, inline SVG figures), while preserving the admin's publish/hidden flags and any custom lessons (reuses `seed_default_lessons(true)`; version marked first to avoid re-entrancy). Test harness now simulates real `wp_kses_post` SVG-stripping so the display path is guarded by a regression test.
3. **Variable loads: teach-by-example.** Two new ready circuits — Hydraulics: *"Variable load press — load rises with piston position"* (4/3 + 63/36 cylinder, profile `0,200 → 0.5,800 → 1,3000` kg position-based, gauge + on-canvas 3-step teaching label); Pneumatics: *"Variable load — time-based load ramp on a 5/2 cylinder"* (profile `0,20 → 2,60 → 4,120` kg). The property-panel `loadProfile` textareas now show an in-field example placeholder (`0, 200 / 2, 3000` kg; `0, 5 / 2, 40` N·m) via new placeholder support in both apps' property editors. Example-count badges are now dynamic (`${…}.length`) instead of the stale hard-coded "45".
4. **Hero "1 Topics" bug.** The stat counted *app categories* (both apps are "Fluid Power" → 1). It now counts distinct lesson subjects (`hydraulics`,`pneumatics`; `general` excluded) → **2 Topics**.

**New automated coverage:** `test-varload-ui.js` (17 asserts: example registration, teaching label on canvas, placeholder wiring, simulation records telemetry in both studios); `test-wp.js` +6 (stale-lesson refresh with SVG rebuild, cover refresh, hidden-flag preservation, hub display containing `<svg`, Topics = 2, modal nesting + inline accent); `test-wp.js` kses stub now strips SVG like production WordPress; `test-charts.js` de-raced clear/restart checks.

**Verification:** solver 93/93 (source and shipped bundle), charts 30/30, variable-load 17/17, deck e2e 37/37, PLC 10/10, two-hand 8/8, worker OK (HYD + PNE), all UI suites pass, `ALL PHP INTEGRATION TESTS PASSED`.

**Update 10:**
1. Converter relocated out of its tab and pinned everywhere: the Converter tab is gone; the full classified unit converter now lives inside the hero (right column, always visible on desktop), plus a collapsible "Engineering unit converter" panel right after the tab bar for mobile widths (< 1024 px) and for compact embeds. `deck.js` now initialises every `[data-rgz-conv]` instance (hero + mobile) instead of the first match, so both are live at once.
2. Learning artwork rebuilt as true ISO 1219-1 / DIN schematics: 22 figures replaced by a new symbol-engineered set (pumps/motors with correct energy triangles, 4/3-3/2-5/2 valves with proper boxes/ports/actuation, relief vs reducing with dashed pilots, one-way flow control, cylinders, accumulator, FRL service unit, shuttles, ejector, proper relay ladders and complete electro-hydraulic/electro-pneumatic mini-circuits).
3. Animated learning GIFs added (6 self-drawn loops, no external assets): cylinder work cycle, spool shifting inside the 4/3 body, relief valve popping at its setting, continuous pump loop, pneumatic A+ B+ B− A− sequence, 5/2 port swap. Wired into 9 flagship factory lessons (auto-refreshed via LESSONS_VER 9) and ~30 library lessons through a new `rgz_ll_anim_for()` map, with an "▶ animated" badge style.
4. Charts overhaul: editable chart title + X/left/right axis captions (persisted per studio), unit-aware default axis labels (mixed units no longer stack into one caption), Live-preview toggle with auto-render, watermark `houmanrgz.ir · RGZ ENGINEERING` across the plot in preview AND SVG export, capture instant stamped in the export footer.
5. Chart data correctness for variable loads: solver now reports metrics.time, per-cylinder applied load (loadKg) and per-motor load/hydraulic torque (loadNm / torqueNm); new chart channels "applied load (kg)", "load torque (N·m)", "hydraulic torque (N·m)". The recorder timestamps rows from the solver's own clock, so Worker-mode charts record true sim time.
6. Formula load profiles: cylinder/motor load profiles now accept full math in **t** (seconds) **and x** (stroke or revolution fraction 0..1) at the same time — e.g. `1200 + 900*sin(2*pi*0.5*t) + 2200*x^2` — with ~25 functions (sin cos tan sqrt exp ln log abs min max pow floor ceil round sign clamp step pulse ramp hypot fract if(cond,a,b), comparisons, ^, %), plus constants pi/e/tau. Legacy point tables keep working unchanged; unparseable profiles fall back to the constant load with a clear warning. New "formula (t & x)" option on all 6 actuator property editors with teaching labels, plus a new Advanced example "Variable load formula — sine dance press".

**Update 11:** App-extensibility release — adding the NEXT full app is now a documented, hook-driven, two-guide process.

- **Two guides ship with the plugin** (`docs/`): `ADDING-AN-APP.md` (site-owner walkthrough: 5-step recipe, field reference, roadmap/draft workflow, learning link, backup/restore, troubleshooting, FAQ, hand-off brief) and `APP-DEVELOPMENT-GUIDE.md` (programmer & AI-agent guide: repo/file map, architecture, two integration levels, complete rgz_deck_* hook reference, studio contracts — shortcode/studio_url/token/design shapes, coding rules, build+test+ship workflow, acceptance checklist, grep cheat-sheet).
- **Starter plugin scaffold** `docs/starter-plugin/rgz-app-template.php`: ready-to-rename companion plugin — shortcode + filemtime-versioned assets + studio_url() auto-detection + admin page under the RGZ menu + nonce-secured AJAX demo + automatic deck-card registration. Rename map included.
- **Extension API (8 new filters, zero breaking changes):** `rgz_deck_apps` (cards from code, id-deduped, admin edits win), `rgz_deck_app_categories`, `rgz_deck_icons` (also extends the save-validation whitelist), `rgz_deck_learn_topics` (flows into lesson sanitizer, card dropdown and hub topic chips), `rgz_deck_topic_accents`, `rgz_deck_tour_enabled`, `rgz_deck_tour_text`, `rgz_deck_profile_designs` (studio designs inside the deck profile modal).
- **Admin UX:** new **Guides** tab in Mechanical Deck manager (5-step recipe, developer block with docs links and the rgz_deck_apps snippet); **＋ Add app (starter template)** button inserts a pre-filled example card; Overview screen gains a "Guides & developer docs" card linking both guides and the starter plugin; README extended; learn-hub topic chips/accents now render dynamically from `learn_topics()` with a safe accent fallback.
- Tests: test-wp.js stubs now implement functional add_filter/apply_filters (filters really execute in php-wasm); +30 extensibility assertions (hook presence, docs/starter shipped, merge+dedupe runtime, custom topic/icon validation runtime, hub chip runtime, Guides tab render, overview docs card). Full battery green: test-wp ALL PASS, deck, deck-e2e 39/39. app.min.js untouched (md5 be461e7c4a80eb9194c4486c81369337).

**Update 12:** App Packages — the in-plugin app installer (replaces the companion-plugin approach as THE way to add a full app).

- **New subsystem `rgz-app-packages.php` (`RGZ_Mech_App_Packages`):** developers deliver ONE zip — `rgz-app.json` (manifest with the **developer-chosen shortcode**) + `app.php` (+ assets). Site owner installs it in *WP Admin → RGZ Engineering Studio → Mechanical Deck → Apps → **Install app package (.zip)*** (new manager card with upload form + installed-packages table: shortcode with copy button, ok/warning/error runtime badges, app-page detection, overwrite and remove actions).
- **Auto-registration:** installed packages live in `wp-content/uploads/rgz-apps/<id>/` (survive plugin updates), their entry files are included every request with `try/catch(\Throwable)` (broken code = red admin badge, never a site fatal), and the manifest shortcode is registered automatically (class+render / render-function / self-registered fallback with warning). Deck cards are auto-created from the manifest (`get_apps()` merge, id-deduped, admin-edited copies win) and **auto-linked** to the published page containing the shortcode — "Coming soon" until the owner creates the page.
- **Safety:** manage_options + nonce; zip manifest located at root or single top folder; `validate_manifest()` (id/name/shortcode/entry rules + reserved shortcode list); collision checks (core shortcodes + other packages, self-overwrite aware); safe manual extraction (zip-slip, file-count and size limits); entry file test-loaded before activation (skipped on overwrite); `.htaccess` blocks direct web execution of package PHP; uninstall removes files + registry + card. Installer admin notices incl. detailed rejection reasons.
- **Developer path replaced everywhere:** new `docs/app-package-template/` (`rgz-app.json`, working demo `app.php`, README) + ready-to-install `docs/app-package-template.zip`; README, Guides tab (5-step package recipe + manifest snippet) and Overview card now point to it; old companion-plugin template removed (hooks remain as documented advanced route).
- **Guides rewritten to the new flow:** `docs/ADDING-AN-APP.md` (install recipe, installer troubleshooting table, auto-linking, overwrite/remove, safety notes) and `docs/APP-DEVELOPMENT-GUIDE.md` (complete package contract §2: zip layout, manifest reference, entry-file contract, runtime model, assets, deliverable checklist; hooks kept as optional deep integration §3).
- **Tests (test-wp.js):** stubs now include wp_upload_dir/shortcode_exists/wp_nonce_url/sanitize_file_name/current_time; handlers gained a `RGZ_PKG_TEST` redirect seam; new assertions cover manifest accept/reject cases, shortcode collision semantics, loader e2e with a real on-disk package (shortcode registered, broken entry flagged not fatal), deck-card merge + admin-override dedupe, upload handler e2e with REAL zips via wasm ZipArchive (install/files/exists/overwrite), bad-manifest and zip-slip rejection using a hand-crafted raw zip (mkZipRaw). Full battery: test-wp ALL PASS, deck, deck-e2e 39/39, lints OK. app.min.js untouched (md5 be461e7c4a80eb9194c4486c81369337).

**Update 13:** RGZ 3D CAD Studio — reworked app package + new core backend module (`rgz-cad-studio.php`), CAD topic in the Learning Hub, deck integration. (Shipped together with the v2 `rgz-3d-cad-studio.zip` app package — install BOTH.)

- **New core module `rgz-cad-studio.php` (`RGZ_CAD_Studio_Plugin`)** — the server side of the 3D CAD Studio, mirroring the hydraulic/pneumatic modules: `rgz_cad_accounts` + `rgz_cad_designs` tables (dbDelta, schema option), HMAC bearer tokens (`|rgz-cad-account-token`, 30-day expiry), ajax `rgz_cad_{me,login,register,logout,save_design,my_designs,get_design,delete_design}` (save supports update-in-place when re-saving a loaded design; 128 KB JSON limit with a basic validity check), admin submenu **RGZ 3D CAD** under the plugin menu (stats cards, account cards with search, designs table, download-JSON / delete with nonces).
- **Deck integration (Mechanical Deck):** account identity loop accepts the `ctoken` third token source (null-safe loops), *My designs* modal gains the CAD list (`data-rgz-designs="cad"`), and the module registers the documented filters: `rgz_deck_learn_topics` (+**CAD & Design** topic), `rgz_deck_topic_accents` (+#EB4E3C), `rgz_deck_profile_designs` (CAD rows open as `<app-url>#rgz-open=<id>` deep links). `LESSONS_VER` 9→10 forces a factory re-seed on existing sites.
- **Learning Hub gains a CAD & Design topic with categories/levels:** 7 new library lessons (`rgz_ll_cad_lessons()` — ISO 128 line types, ISO 129-1/406 dimensioning, ISO 2768-1, ISO 286 fits, ISO 1101 GD&T, ISO 128-30/216 projection & sheets, ISO 7200/5455 title blocks & scales) spanning beginner→advanced, procedural isometric figure for `cad-*` ids, new cover `assets/learn/cov-cad-elements.svg`. (In-app app package keeps its own tutorial cards; the hub shows the same curriculum structured and leveled.)
- **App package v2 fixes (the visible ones):** 3D-unavailable path no longer shows raw jargon — hidden-by-default plain-language note ("The live 3D preview could not start… sketching and the ISO drawing still work"), renderer creation fully guarded so steps 1 & 4 keep working without GPU access; stylesheet now enqueued on `wp_enqueue_scripts` (was too late in `<head>` on some themes) with a kept footer fallback; fullscreen toggle re-clicks/exits correctly incl. the CSS fallback (+Esc); perf/hardware chips removed from the UI entirely (jargon-free copy in app, deck card and manifest).
- **App package v2 tools (CATIA/SolidWorks-class subset, all client-side):** 9 sketch tools (rectangle, circle, free polygon, regular N-gon, 3-point arc, slot/obround, ellipse, spline, drill hole), vertex editing (drag/insert/delete), 2D fillet & chamfer on corners, horizontal/vertical mirror, construction centerlines, undo/redo (Ctrl+Z/Y), hole types (through / blind / counterbore / countersink with Ø, depth and angle callouts), rectangular pockets, orthographic camera ↔ perspective, 4 standard views, wireframe/shadow/grid toggles, clipping section view with axis+position slider, 2-point measure tool, JSON open/import, account save (see module above), fullscreen like the other studios.
- **Exactness:** analytic volume/area for every feature (blind πr²d, counterbore π(R²−r²)·d, countersink frustum, pocket w·h·d — verified against the tessellated model in tests); tolerance formatting rounds at the tolerance's own decimals (H7 `+0.015` prints correctly); sheet scale chosen per part size (no more overflowing or tiny drawings).
- **Tests:** package battery now 143 checks (A: jargon-free markup/manifest + 19 markup hooks + 8 css rules; B: exact-volumes incl. blind/counterbore/countersink/pocket; C: real zip through the installer — full control/account/jargon/ajax-localize assertions; D: jsdom live drive — fallback notice plain-language, 9+8 tools wired, fullscreen toggles twice, auth modal tabs, counterbore `⌴` callout on the sheet). test-wp.js gained an in-memory wpdb + the missing WP stubs; CAD tests prove boot/hooks, tables, hub topic/accent/7 leveled lessons/covers/modal merge, the full ajax lifecycle (register→save→list→get→update-in-place→delete, bad-token guarded, wrong-password login) and the admin page render. All suites green; app.min.js untouched (md5 be461e7c4a80eb9194c4486c81369337).

**Update 14:** RGZ 3D CAD Studio v3 — **feature-tree edition** (full rewrite of the app package after the round-3 review: CATIA/SolidWorks-style specification tree, multi-entity editable sketches, real 3D-mode editing, plain-mouse Select tool, studio-consistent UI without in-app learning material, and a much more responsive rendering loop). Plugin side: the CAD design validator now accepts the v2 (feature-tree) model — **install BOTH the updated plugin zip and the v3 app package zip.**

App package v3 (rgz-3d-cad-studio.zip):
- **Specification tree (CATIA PartDesign style):** left sidebar lists `Sketch.1…n` and `Pad.1 / Pocket.1…` as a real feature tree with rename/delete, active-node highlighting and one-click isolation; every 3D feature references its sketch. Context panel shows Sketch / Entity / Feature / Part cards depending on what is selected — exactly the PartDesign workflow.
- **Multi-entity sketches, each element editable separately:** a sketch now holds any mix of independent profiles and holes (rectangle, circle, free polygon, N-gon, arc, slot, ellipse, spline, drill hole, centerline). The **Select tool (plain mouse, default)** clicks/drags any entity, drags vertices, double-clicks an edge to insert a vertex, applies corner fillet/chamfer and mirrors entities — in 2D and 3D alike. The rectangle complaint is fixed *by construction*: drawn shapes are closed profiles from the first click; open 3+ point polylines are auto-closed on "Close sketch → Pad", and self-intersecting ("bowtie") contours are refused with a clear message instead of producing garbage solids.
- **Real 3D-mode editing:** pocket (cut) features carved analytically, edge **chamfer & fillet** on any pad/pocket, hole types through/blind/counterbore/countersink with proper ⌴/⌵/↧ callouts, and **Sketch on face** — pick a flat face of the 3D model (top/bottom or planar side wall, tangent plane auto-computed) to place a new sketch and pad/pocket it (Pad.2 on top of Pad.1 …). Curved faces are politely refused. Features rebuild independently (per-feature geometry cache keyed by payload signature) so editing one sketch no longer rebuilds the whole part.
- **UI matched to the other studio apps & learning removed:** the in-app tutorial section is gone — the hero links to the **CAD & Design course in the Learning Hub** (`/mechanical-engineering-deck/#learn-cad`); same dark studio theme, tokenised accent #EB4E3C, same account chip / modals / fullscreen as the hydraulic & pneumatic studios.
- **"Very very smoother":** on-demand rendering everywhere (no idle requestAnimationFrame spin — frames render only when something changes; static shadow maps; rAF dirty-flag 2D redraw), per-feature mesh caching, and a local in-page tessellator mirroring the worker so simple edits don't even pay a worker round-trip.
- **ISO drawing sheet covers the whole tree:** every feature's profiles, hole rings and counterbore rings are drawn (pocket cuts with dashed hidden lines), dims + H7 `+0.015` bilateral tolerance now print at the tolerance's own decimals, title block row collision fixed ("Scale … · Sheet A4" / "Tol ISO 2768-mK" no longer overlap), PNG/SVG export unchanged.
- **Tests:** package battery now **161 checks, all passing** (A: manifest/markup/css hooks incl. tree, face-sketch tools, select mode; B: exact analytic volumes incl. counterbore-over-cut and chamfer/fillet bevels; C: real zip through the plugin installer — tree + 3D tools rendered server-side, learning section absent, hub link present; D: jsdom live drive — rectangle-is-closed proof, multi-profile sketch, open-poly auto-close, bowtie rejection, armed face-pick → sketch on face → Pad.2, pocket reduces analytic volume, v1→v2 design migration, sheet assertions, account modals). `test-wp.js` e2e re-proven with a v2 sketches payload (`reg|save|my1|get|v2ok|junk|still1|del|guard|login|badpass`) — old v1 saved designs still load and migrate. Deck copy fix: stray CJK characters in the HFA-fluid lesson replaced ("steelworks and press lines"). app.min.js untouched (md5 be461e7c4a80eb9194c4486c81369337).

**Update 14 follow-up (same day):** fixed a blocking UI regression reported on first live test — in the 2D Sketch step, drags rotated the 3D view instead of drawing. Cause: the 3D viewport layer (`[data-gl]`, stacked above the sketch canvas in the same stack) was never hidden per step, so its orbit controls swallowed every pointer event; the 2D/3D toolbars likewise never switched. New `applyStepUI()` (called from `setStep`, incl. boot) shows exactly one pointer layer per step — sketch: 2D canvas + sketch toolbar shown, 3D layer/toolbar hidden; model/modify: 3D layer + 3D toolbar shown, canvas hidden; drawing: sheet only — and `resizeGL` (now exported on `__rgzcad2`) re-measures the 3D viewport right after it is unhidden. Phase D gained 5 per-step layer-visibility assertions incl. the exact 'back to sketch, rectangle draws, not orbits' round-trip; battery now **166 checks, all passing** (jsdom has no real stacking, hence the escape — covered contractually now).

**Update 14, second follow-up (same day):** round-3 live-test fixes, all in the app package.

- **Blurry sketch canvas fixed (root cause found):** `skResize()` was never called at boot — the canvas kept its 300×150 HTML-attribute default backing store, CSS-stretched ~4–5× over the real pane (classic canvas blur). It is now sized at boot AND every time the sketch step becomes visible, with the DPR cap raised 1.5 → 3 for high-density displays. Regressions locked by a backing-store-size assertion.
- **Circle inside a rectangle = hole after pad (CATIA nesting rule):** sketches now classify contours by containment parity — a closed profile inside another becomes a **void**, one level deeper a **solid island**, disjoint profiles stay separate bosses. Applied consistently in the geometry worker, the in-page fallback tessellator, the analytic volume/area (`featureVol`, `partVol`, area estimates — now signed), and the 2D editor (even-odd shading shows the void *while sketching*). Drill holes placed inside a void are ignored by the mesh (no double-cut). Exact volumes proven: rect 60×40 + Ø20 void, L 20 → 41.73 cm³ (ideal 41.72); +Ø8 island → 42.73; two bosses → 56.00.
- **Mouse-wheel zoom added** to the sketch editor: exponential zoom (0.25–160 px/mm) anchored to the cursor, pixel/line delta modes handled, clamped; assertion proves the cursor anchor stays put.
- **Sketches fully user-controlled:** every sketch node in the specification tree now has a × delete button (removes the sketch AND its dependent features, undo-safe via history); previously only features had one, so stray sketches were unremovable. The ≥1-sketch guard note remains.
- Battery now **176 checks, all passing** (worker: nested-void/island/disjoint cases; live: void volume via featureVol, tree delete incl. feature cascade, wheel zoom + anchor, crisp backing store). PHP integration suite: ALL PASS.

**Update 14, third follow-up (same day) — the CATIA PartDesign tool-set expansion.** The user re-forwarded the three CATIA PartDesign references (NIAR Wichita State PartDesign & Sketcher tutorial, pdhonline g350, yvonet EDU PDG A); the workbench feature list was audited against them and the following are now implemented in the app package (all client-side, exact analytic volumes, mirrored between the geometry worker and the in-page fallback tessellator):

- **Shaft & Groove (revolve / revolved cut):** profiles revolve about a **vertical centreline** drawn with the ⌖ tool (axis read from the sketch), angle 1–360° editable on the feature card. Nested contours revolve correctly (inner contour = toroidal void). Pappus-exact volumes (proven: r∈[20,30]×h10 block → 15.708 cm³; 180° → exactly half; centroid-torus void exact). Profiles crossing the axis are refused with a plain-language error.
- **Rib (thin pad):** an open polyline thickens into a web (±t/2 miter-joined offset ring, butt ends) and extrudes — thickness & length on the feature card, exact volume (40-line × t 4 × L 10 → 1600 mm³).
- **Draft angle (dress-up on pads):** walls lean by 0–30° via layered miter-offset ring loft; Simpson-exact volume over the offset-area law (40×40×10 @ 10° → 14.631 cm³); impossible drafts (top profile would vanish — including the miter-inversion case that can grow a square back CCW) are refused by shrink+containment+sign checks.
- **Shell:** hollows a pad to a wall thickness, open at the top (bottom plate + wall band, voids and drills pierce both); exact volume (60×40×20 t=2 → 11.712 cm³); over-thick shells refused.
- **Rectangular & circular patterns** on every feature (count/spacing or instances/total angle; 2×3 → ×6 badge on the tree; volume/mass multiply): geometry is instance-merged into the feature soup — picking, section, STL and stats see real triangles.
- **Mirror part** (YZ / XZ, world space): mirrored copy appended with corrected winding & mirrored normals; volume/mass double; STL export includes the mirrored solid.
- **Thread / Tap (cosmetic, ISO 261):** per-hole toggle with auto coarse pitch by diameter (M10 → 1.5 mm); drawing callout switches to the ISO metric designation `M10 × 1.5 ↧ depth`.
- **Where things live:** sketch card gains Shaft/Groove (shown when the sketch has a vertical centreline + closed profile) and Rib (shown for open polylines); the feature card gains Dress-up (draft/shell — one at a time, edge finish pauses while either is set) and Repeat blocks; the Part card gains the mirror toggle next to the material; revolve/rib angles, pattern counts and the ×instance volume line all editable on the cards. Old designs load unchanged (normalizeDesign defaults every new field).
- **Coverage notes (honest):** Loft/multi-sections solids and path-swept Slots are the remaining PartDesign basics not yet implemented — they need a cross-section morphing engine; patterns of *features* (not bodies), draft on pockets, and threads render as callouts/geometry per industry cosmetic-thread practice.
- **Tests:** battery now **197 checks, all passing** — worker: revolve/partial/void/cross-axis error/draft/steep-draft error/shell/thick-shell error exact cases; live: shaft via centreline sketch + angle halving + groove sign, rib volume, rect & circ pattern counts with ×6 tree badge, draft/shell Simpson laws via featureVol, mirror doubling, M-thread callout in the SVG sheet, and worker↔local parity on the revolve path. PHP suite: ALL PASS.

Plugin remains **version 1.0.0** as requested.

**Update 15 (same week) — workspace & flow release for RGZ 3D CAD Studio** (app package only; plugin zip unchanged). Direct answers to the five live-test complaints:

1. **Fresh start + a real New button.** The app no longer force-loads the last browser session at boot — it opens light with a fresh empty part, exactly like the other studios. If an autosaved design exists, a **↩ Resume last design** chip appears in the header and restores it on demand; a prominent **＋ New part** button now lives in the header (and still in the Account card) with a guard confirm, full history reset, and immediate autosave overwrite. Proven live in the harness with a seeded localStorage: boot stays fresh, Resume restores the stored design once, New resets to an empty sketch.
2. **The flow is now a 3-step pipeline — Sketch → 3D Features → ISO Drawing.** The confusing fourth "Modify" step (a duplicate 3D state users could not distinguish) is gone; dress-up, face tools, section and measure live on the 3D step where they belong. Tour, tooltips and stagenotes rewritten to narrate the pipeline.
3. **Every tool is individually visible — and explains itself.** New **Make-3D feature rail** pinned to the right of the sketch viewport: Pad, Pocket, Shaft, Groove, Rib are *always* shown as separate buttons (no more conditional buttons hidden inside cards — the "I cannot find some of them" complaint). Clicking one without its precondition prints a plain-language explanation ("draw a vertical centreline first…", "a pocket needs an existing solid…") instead of silently doing nothing. New **dress-up group on the 3D toolbar**: Chamfer, Fillet, Draft, Shell, Pattern, Mirror apply to the selected feature with sensible defaults and stay editable on its card and the tree afterwards (draft⇄shell stay mutually exclusive; mirror is part-level). Pocket/groove on an empty part are politely refused.
4. **Space usage.** The work grid now uses `align-items:stretch`: the specification tree and the properties panel share the full viewport row height with internal scrolling (no more white gaps under the tree), the treelist flex-fills its column, and the viewport height follows the visitor's screen (`clamp(480px, 100vh - 268px, 900px)`), with a taller `100vh - 248px` rule in fullscreen. Responsive breakpoints adjusted for the 3-step bar.
5. **Tour "Next" button fixed (root cause found).** The tour overlay is appended to `<body>`, outside the `.rgzcad` root — so `var(--rgzc-accent)` was *undefined* there and the button rendered with a transparent fill and white text on a white card. All accent uses in the tour (spotlight ring, dots, Next) are now hardcoded `#EB4E3C` with a hover state; a guard in the test suite fails if any tour rule ever reads the token again.

- **Tests:** battery now **231 checks, all passing (was 197)** — phase A: rail/dress/resume/new hooks, 3-step-count assertion, tour-accent & stretch-layout CSS guards; phase D: seeded-localStorage fresh-boot/Resume/New round-trip, per-step visibility of the new rail, rail feature-buttons incl. the self-explaining Shaft-without-centreline case, and the full dress-up click-through (draft 3°, shell exclusivity, chamfer edges, mirror toggle). PHP integration suite: ALL PASS; app.min.js untouched (md5 be461e7c4a80eb9194c4486c81369337).

Plugin remains **version 1.0.0** as requested.

**Update 16 (same week) — full sketcher tool-set + CATIA datum-plane start** (app package only; plugin zip unchanged). Answers the "I should not have to enumerate tools — make it a *complete* app" round. After auditing the CATIA V5 Sketcher toolbars (Profile / Operation / Relimitations / Transformation / Sketch-tools) against the app, the complete workbench is now implemented:

- **The app starts like CATIA: 3D view, empty tree, pickable datum planes.** No default sketch is forced: the specification tree begins empty with a hint; three colored datum planes (blue XY flat, green XZ front, red YZ side) float in the 3D view with hover highlight; a click (not a drag — drags still orbit) picks the plane and *then* Sketch.1 is added to the tree and the 2D editor opens on it. "＋ Sketch" in the tree re-enters the plane-pick state; sketch-on-face is unchanged; deleting all sketches returns to the plane-pick state; Resume/New account for it. Pads on XZ/YZ extrude along their plane normal exactly like XY (analytic volume proven: 600 mm² × 20 = 12.000 cm³ on the upright plane).
- **New draw tools:** **Line** (drag segments, stays active for chaining; endpoint fields, length/angle readout, draggable, selected-endpoint handles) and **Point** (reference/center marker, construction role — never part of the solid). Existing: rectangle, circle, polygon, N-gon, arc, slot, ellipse, spline, drill hole, centerline.
- **CATIA Operation toolbar, fully implemented:** **Corner (2D fillet)** and **Chamfer** promoted from the panel to the toolbar (select a profile → arm → click a vertex; radii from the panel); **Trim** (click two lines → both extend/trim to their intersection corner, parallel lines refused politely, tool stays active); **Break** (click a line to split it; click a closed ring to open it into a chain at the break point; click an open chain to split it in two); **Offset** (parallel copy of the selected line/circle/rectangle/polygon placed on the *clicked side* — miter-exact: 60×40 rect offset 5 mm inward → 1500 mm²; inward-collapsing offsets refused); **Construction toggle** (any element becomes dashed reference geometry, automatically excluded from every profile/pad — the CATIA construction/standard element switch).
- **Transformations:** rotate & scale about the entity center from every entity card (rectangles scale typed; rotating a rectangle converts it to a free polygon with area preserved; circles/holes scale radii), plus the existing mirror ↕↔ — geometric parity with CATIA's Transformation group (Translate = drag move, which every entity already supports).
- **Control:** every element — line endpoints, point coords, profile dims, holes, thread, tolerances — stays numerically editable at all times; every new tool prints plain-language guidance instead of silently failing; undo/redo covers everything.
- **Tour & hints updated** for the new start flow and tool-set.
- **Honest remainder (not yet in):** Loft (multi-section solid), path-swept Slot, and the automatic geometric-constraint solver (coincidence/parallel/tangent badges) — the app instead exposes exact numeric editing of every element; these three are the next candidates.
- **Tests:** battery now **263 checks, all passing (was 231)** — phase D: 3D plane-pick boot with empty tree, datum click → Sketch.1 → 2D editor, New/Resume through the new start state, trim corner + parallel guard, line break, ring break → open chain, offset inward/outward with exact areas + clicked-side check, construction exclusion from profiles, scale/rotate with area preservation, XZ-plane pad volume law, delete-to-zero-sketches → back to plane pick, and full cleanup. qa-render-sheet drives the new start flow. PHP suite: ALL PASS; app.min.js untouched (md5 be461e7c4a80eb9194c4486c81369337).

Plugin remains **version 1.0.0** as requested.

---

## Update 17 (2026-08-08) — CATIA-class sketcher core

Driven by the developer's own deep-dive of the CATIA V5 Sketcher/PartDesign workflow; the
whole tool-set now behaves like the V5 toolbars, not just shares their names.

**1 — Multi-select (Sketcher search + Ctrl behavior)**
- Ctrl/Shift+click toggles elements in and out of an ordered selection set (first = reference).
- Rubber-box select on empty canvas: drag left→right = window (fully inside), right→left =
  crossing (touched), exactly like CATIA's selection trap. Selected rows highlight in the list,
  the panel shows the whole set, and Delete/Backspace removes the set.
- Locked (Fix) elements stay put during box moves and are reported instead of silently moving.

**2 — Trim rebuilt to CATIA semantics; Quick Trim added**
- Trim (Relimitations ▸ Trim): click element 1 on the part to KEEP, then element 2 — both cut
  or extend to their intersection, centerlines act as fixed boundaries (never modified).
- New Quick Trim: ONE click erases exactly the clicked piece, bounded by the nearest crossings
  on both sides; no crossings → element deleted. Works against lines, centerlines, circles,
  holes and every polygon edge.
- Old behavior (blind "corner near-end move", looked broken on touching/overshooting lines) removed.

**3 — Line-drawn shapes are real profiles**
- Squares & co. drawn with the Line tool (or open polyline chains) whose endpoints connect are
  now closed profiles: shaded in the editor, counted in the tree, padded/pocketed/revolved with
  exact analytic volumes. Implemented as planar face extraction (endpoint stitching 0.5 mm +
  half-edge left-face walk) — chords between real junctions split faces like CATIA, dangling
  legs are ignored, self-crossing chains stay open and reported honestly.

**4 — Per-edge 3D Fillet / Chamfer**
- ◺/◜ in the 3D toolbar now arm CATIA edge picking: hover pre-highlights the vertical edge,
  click marks it (orange), click again unmarks; Apply on the feature card dresses exactly the
  picked edges — convex AND concave corners, clamped tangent length, exact analytic volumes
  (¼-cylinder / ½d²·sinθ × L), entries listed and individually removable on the card.
- Whole top/bottom rim stayed where CATIA keeps it: the card's "Edge finish" select.

**5 — Geometric constraints**
- New constraint group (H, V, Parallel, Perpendicular, Equal length, Coincident, Concentric,
  Tangent, Fix) applied dialog-box style to the selection; remembered per element with canvas
  badges and removable chips in the panel. Fix locks against edits.
- While drawing lines the app auto-detects near-H/V intent, snaps to the axis and applies the
  constraint (CATIA orange-glyph behavior); Shift forces H/V, Shift+rect draws a square.

**6 — Hole correctness**
- Holes validate against real material: outside the solid (or inside a nested void) they cut
  nothing, the volume math reflects it, and placement fires a plain-language warning at drop
  time (sketch tool AND 3D "Hole on face") — previously the volume was silently over-subtracted.

**Tests:** package battery 313 checks (was 263), incl. chain-face extraction (square/chord/house/
dangling), keep-side & centerline trim, quick-trim middle/end/delete, window/crossing select,
all 9 constraints with exact geometry assertions, per-edge chamfer+fillet volumes (worker parity),
hole in/out-of-material volume rules, save/load round-trip of edge ops and constraint badges.

---

## Update 18 (2026-08-08) — universal Trim / Quick Trim / Break (closed shapes included)

Trim+QuickTrim+Break now treat every sketch element as the CURVES it is made of —
exactly CATIA's model (a CATIA rectangle is four curves; a CATIA circle is one closed curve):

- **Trim (2-pick) works against closed shapes**: line × circle, line × rectangle/polygon edge,
  circle × circle all pair up. Both elements cut/extend to their intersection (nearest of the
  two intersection points to the second click), clicked sides kept, centerlines stay fixed.
  CATIA consequences, not failures: a trimmed circle becomes an open arc chain, a trimmed ring
  becomes an open chain, and closed-profile status re-evaluates immediately (pad/pockets update).
- **Quick Trim on any curve piece**: lines, circles, rectangle & polygon edges — the clicked
  piece is erased between its nearest crossings with the whole sketch (circles become arcs;
  rings open at the gap; open chains split into two; no crossings → element deleted).
- **Break on circles**: opens them at the click into an arc chain (close again with Coincident).
- **Curves, not types**: rectangle edges are individually picked (hover/click resolves the exact
  edge); circles are picked on their band; non-intersecting pairs report clearly and touch nothing.
- The classification of what counts as a closed surface is **derived after every modification**
  (planar face extraction from Update 17) — non-predefined shapes assembled from any mix of
  lines, arc chains and polyline chains behave like first-class profiles throughout.

Tests: 324 package checks (was 313), incl. line×circle / line×rect-edge trim keep-side,
circle→arc-chain conversion, quick-trim of arcs/edges, break-on-circle, honest no-intersection
refusal, and profile re-evaluation after each modification.

---

## Update 19 (2026-08-18) — 3D feature tree with Definition dialogs · ISO multi-view drafting · sketch constraint engine · pocket/hole geometry truth pass

**1. CATIA-style specification tree for all 3D actions.** Every 3D operation now lives in a
persistent tree (pads, pockets, shafts, grooves, ribs, holes, chamfers, fillets, drafts, shells,
patterns, mirror, with dress-up operations shown as child nodes of their parent feature).
Every node carries a ⚙ **Definition** popup — exactly CATIA's double-click-to-redefine idea:

- **Hole Definition**: type (through / blind / counterbore / countersink), diameter, depth,
  counterbore Ø/depth, countersink angle — plus **ISO metric threads M3–M24 (coarse)** with
  automatic tap-drill diameter that stays locked to the selected thread.
- **Pad/Pocket/Shaft/Groove/Rib**: length/depth, draft angle, direction flip, sketch linkage.
- **Chamfer / Fillet / Draft / Shell / Pattern / Mirror**: size/angle/thickness/count/spacing/
  plane, editable after creation; the model regenerates from the definition, not from scratch.

**2. Standard ISO drafting with user-chosen views.** The drawing sheet is now a real
ISO 128 first-angle projection sheet: tick any combination of **Front / Back / Top / Bottom /
Left / Right / Isometric** and the sheet lays out exactly those views (first-angle placement
rule + projection symbol + view labels). A raster **z-buffer hidden-line removal** engine
classifies every edge segment as visible (solid, thick outline / thin interior) or hidden
(ISO dashed), with centerlines on revolved features/holes and ISO 129-1 dimensions
(length/width/height + hole callouts with fits) anchored to the front-most picked view.

**3. Sketch constraints that behave like CATIA's.** Full DOF engine in the sketcher:
under-constrained elements solve and stay draggable; **fully constrained turns green**,
locked/fixed turns violet; **over-constraint is refused** with a clear message, redundant
constraints are detected before applying. Tangency generalized to **circle–rectangle-side,
circle–circle, circle–slot and side-locked cases** (the carrier edge is remembered, so a circle
tangent to a rectangle side stays tangent to THAT side when the rectangle moves/resizes).
Dragging or numerically editing any entity re-imposes all rules on the whole sketch, and
measured sizes are shown as colored labels (toggleable) so the driven geometry is visible.

**4. Geometry truth pass (3D correctness).**

- **Pockets now genuinely carve the host pad.** A latent Vector2-vs-array mismatch in the
  cut-containment gate meant pocket contours never became holes in the extruded top slab —
  fixed in both the main thread and the geometry worker, and the pocket feature no longer
  double-draws its own recess shell when the host already carves it.
- **Overlapping / tangent hole & pocket contours are boolean-merged** (2D polygon union)
  before extrusion, so a hole crossing a pocket rim produces a single clean merged opening
  instead of tessellation garbage and phantom chord lines in the drawings.
- **Blind holes and counterbores open correctly**: a region-based cap filter strips cap
  triangles that leave the true face region (profile − voids − cuts − hole disks at that z),
  opening recess tops while keeping floors and ledges.
- **Drawing cleanliness**: inter-slab seam lines and cap-bridge chord artifacts eliminated by
  a pairwise coplanar-opposite-normal interface rule (internal seams dropped, real rims kept)
  plus collinear coverage de-duplication of hidden runs under visible ones.

**Tests:** package battery **363 checks** (was 324), incl. pocket-carve tessellation with rim
verts at the pocket level, long solid rim runs in the top view, dashed pocket-floor line in the
front view, boolean-merged hole+pocket area equality, and zero non-unit normals over
hole/pocket/through/counterbore payload variants (worker parity).
