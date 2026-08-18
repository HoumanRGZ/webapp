# RGZ 3D CAD Studio — AutoCAD exercise pass (2026-08-18)

Tested against plates from *100 CAD Exercises* (12CAD / JSCAD — lines, arcs, fillets, arrays, mirror). The live studio at houmanrgz.ir/rgz-3d-studio could not complete those drawings. Root causes and fixes:

## Bugs fixed

1. **2D fillet was geometrically wrong.** Corner/FILLET passed the *vertex* through `arc3Pts`, so a requested R3 on a 90° corner produced a ~R2.12 bulge through the corner — not a circular fillet. Fillet now places the centre on the interior bisector at `R / sin(θ/2)` and samples the *short* tangent arc (the old sampler took the 270° long way).
2. **ARC tool built a pie slice.** The 3-point arc was stored as a *closed* contour (arc + chord). AutoCAD ARC is an open curve. Arcs stay open and join neighbouring lines into a pad-able profile.
3. **Close sketch → Pad chord-closed every open polyline**, including arcs. Arcs are skipped.
4. **Open arcs could not be clicked** (`entPts` only returns closed loops). Hit-testing now uses the polyline points.
5. **`closeSketchToPad` crashed** on line-drawn profiles (`p.ent` is null for chain faces).

## AutoCAD tools added (the book actually uses these)

- **FILLET / CHAMFER of two selected lines** — trims both to the tangent points and inserts a true circular arc (or a chamfer leg).
- **FILLET ▸ Polyline** — with a rectangle or closed polygon selected, Corner/Chamfer rounds *every* vertex.
- **ARRAY** — rectangular (columns × rows + spacing) and polar (count + sweep about the selection / a centre). Bolt circles from exercise 12 now take one click.
- **MIRROR** — copy across the world Y or X axis (source kept), matching the centreline-symmetric plates.

## Verification

`work/test-autocad-exercises.js` reconstructs the book plates headlessly:

- 80×50 plate, R8 all corners, 4×Ø8 holes → pad volume exact
- two-line R10 fillet + closing lines → one closed profile, area exact
- open ARC is not a pie; Close sketch leaves it open
- polar ARRAY ×6 of a hole on a bolt circle, 60° spacing
- rectangular ARRAY 3×2
- MIRROR copy across the Y axis

**24 / 24 passed.**

## Install

Upload `rgz-3d-cad-studio.zip` in *WP Admin → RGZ Engineering Studio → Mechanical Deck → Apps → Install app package* (overwrite the existing 3D CAD package). Version stays **1.0.0**.
