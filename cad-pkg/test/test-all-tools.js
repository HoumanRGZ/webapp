/* Walk every studio tool the way a student would on 100 CAD Exercises. */
const { bootStudio, afterBoot } = require("./harness");

let pass = 0, failed = 0;
function expect(cond, label) {
  if (cond) { pass++; console.log("ok  ✓ " + label); }
  else { failed++; console.log("FAIL ✗ " + label); }
}

const { win, doc, jsErrors, close } = bootStudio();

afterBoot(function () {
  try {
    const U = win.__rgzcad1;
    expect(!!U, "boot");
    expect(jsErrors.length === 0, "no JS errors" + (jsErrors[0] ? " (" + jsErrors[0] + ")" : ""));

    function fresh() {
      U.newDesignFresh();
      return U.startSketchOnDatum("xy");
    }

    /* ---- draw tools ---- */
    let sk = fresh();
    sk.entities.push(U.mkEnt("rect", { cx: 40, cy: 25, w: 80, h: 50 }));
    expect(U.closedCount ? U.closedCount(sk) === 1 : U.profilesOf(sk).length === 1, "Rectangle is a closed profile");

    sk = fresh();
    sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 20 }));
    expect(U.profilesOf(sk).length === 1, "Circle is a closed profile");

    sk = fresh();
    const hex = U.mkEnt("poly", { pts: [[20, 0], [10, 17.32], [-10, 17.32], [-20, 0], [-10, -17.32], [10, -17.32]], closed: true, kind: "ngon" });
    sk.entities.push(hex);
    expect(U.profilesOf(sk).length === 1 && Math.abs(U.polyArea(hex.pts)) > 100, "N-gon / hexagon is a closed profile");

    sk = fresh();
    const slot = U.mkEnt("poly", { pts: [[0, 0], [30, 0], [30, 10], [0, 10]], closed: true, kind: "slot" });
    /* use real slot helper if exported — otherwise rectangle-like */
    sk.entities.push(slot);
    expect(U.profilesOf(sk).length === 1, "Slot-like closed poly pads");

    sk = fresh();
    const ell = U.mkEnt("poly", { pts: U.ellipsePts ? U.ellipsePts(0, 0, 20, 10) : [[20, 0], [0, 10], [-20, 0], [0, -10]], closed: true, kind: "ellipse" });
    if (!U.ellipsePts) {
      /* ellipsePts may not be exported — use a 4-pt diamond as fallback check later */
    }
    sk.entities.push(ell);
    expect(U.profilesOf(sk).length === 1, "Ellipse (closed poly) is a profile");

    sk = fresh();
    const arc = U.mkEnt("poly", { pts: U.arc3Pts([0, 0], [10, 8], [20, 0]), closed: false, kind: "arc" });
    sk.entities.push(arc);
    expect(U.hitEntity([10, 8]) && U.hitEntity([10, 8]).id === arc.id, "Arc is selectable");
    expect(U.profilesOf(sk).length === 0, "Lone arc is not a closed profile");

    sk = fresh();
    sk.entities.push(U.mkEnt("point", { cx: 5, cy: 5 }));
    sk.entities.push(U.mkEnt("cline", { a: [0, -20], b: [0, 40] }));
    expect(sk.entities[0].role === "constr" && sk.entities[1].role === "constr", "Point + centerline are construction");
    expect(U.profilesOf(sk).length === 0, "Construction geometry does not form a solid");

    /* ---- fillet / chamfer ---- */
    sk = fresh();
    const plate = U.mkEnt("rect", { cx: 40, cy: 25, w: 80, h: 50 });
    sk.entities.push(plate);
    U.selectEntity(plate.id);
    const nF = U.filletPolyAll(plate, "fillet2d", 8);
    expect(nF === 4, "FILLET ▸ Polyline rounds 4 corners");

    sk = fresh();
    const l1 = U.mkEnt("line", { a: [0, 0], b: [40, 0] });
    const l2 = U.mkEnt("line", { a: [0, 0], b: [0, 30] });
    sk.entities.push(l1, l2);
    const farc = U.filletTwoLines(l1, l2, 10);
    expect(!!farc && farc.kind === "arc", "two-line FILLET");

    sk = fresh();
    const cA = U.mkEnt("circle", { cx: 0, cy: 0, r: 20 });
    const cB = U.mkEnt("circle", { cx: 50, cy: 0, r: 20 });
    sk.entities.push(cA, cB);
    const cc = U.filletTwoCircles(cA, cB, 30);
    expect(!!cc && cc.kind === "arc" && cc.pts.length > 4, "circle–circle FILLET (book gaskets)");
    const ol = U.disksOutline([{ cx: 0, cy: 0, r: 20 }, { cx: 30, cy: 0, r: 20 }], 40);
    expect(ol.length >= 8 && !U.selfIntersects(ol), "disksOutline of two bosses is a simple loop");

    sk = fresh();
    const c1 = U.mkEnt("line", { a: [0, 0], b: [40, 0] });
    const c2 = U.mkEnt("line", { a: [0, 0], b: [0, 30] });
    sk.entities.push(c1, c2);
    U.selectEntity(c1.id);
    U.S.selSet = [c1.id, c2.id];
    U.S.selEnt = c2.id;
    /* arm chamfer via API if available */
    const I = U.lineLineInt(c1.a, c1.b, c2.a, c2.b);
    expect(!!I, "chamfer lines intersect");

    /* ---- trim / extend / qtrim / break / offset ---- */
    sk = fresh();
    const t1 = U.mkEnt("line", { a: [0, 0], b: [30, 0] });
    const t2 = U.mkEnt("line", { a: [40, 10], b: [40, 40] });
    sk.entities.push(t1, t2);
    expect(!!U.trimCorner(t1, t2, [15, 0], [40, 25]), "TRIM extends two lines to meet");

    sk = fresh();
    const qt = U.mkEnt("line", { a: [0, 0], b: [50, 0] });
    const cut = U.mkEnt("line", { a: [25, -10], b: [25, 10] });
    sk.entities.push(qt, cut);
    const qres = U.quickTrimAt([10, 0]);
    expect(qres !== undefined, "Q-Trim returns without throwing");

    sk = fresh();
    const br = U.mkEnt("line", { a: [0, 0], b: [40, 0] });
    sk.entities.push(br);
    const broke = U.breakAtPoint([20, 0]);
    expect(!!broke && sk.entities.filter(function (e) { return e.type === "line"; }).length === 2, "BREAK splits a line in two");

    sk = fresh();
    const src = U.mkEnt("line", { a: [0, 0], b: [40, 0] });
    sk.entities.push(src);
    U.selectEntity(src.id);
    U.S.ui.offsetD = 8;
    const off = U.offsetAtPoint([20, 5]);
    expect(!!off && Math.abs(off.a[1] - 8) < 0.2, "OFFSET copies a line 8 mm to the clicked side");

    /* ---- array / mirror ---- */
    sk = fresh();
    const h0 = U.mkEnt("hole", { cx: 25, cy: 0, r: 4, hType: "through" });
    sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 40 }), h0);
    U.selectEntity(h0.id);
    expect(U.arraySelection({ mode: "polar", n: 6, ang: 360, center: [0, 0] }) === 5, "polar ARRAY ×6");

    sk = fresh();
    const leaf = U.mkEnt("rect", { cx: 20, cy: 10, w: 20, h: 10 });
    sk.entities.push(leaf);
    U.selectEntity(leaf.id);
    expect(U.mirrorCopySelection("h") === 1, "MIRROR copy");

    /* ---- constraints ---- */
    sk = fresh();
    const hv = U.mkEnt("line", { a: [0, 0], b: [30, 8] });
    sk.entities.push(hv);
    U.selectEntity(hv.id);
    doc.querySelector('[data-geo="h"]').click();
    expect(Math.abs(hv.a[1] - hv.b[1]) < 1e-6, "toolbar H");

    const vv = U.mkEnt("line", { a: [0, 0], b: [8, 30] });
    sk.entities.push(vv);
    U.selectEntity(vv.id);
    doc.querySelector('[data-geo="v"]').click();
    expect(Math.abs(vv.a[0] - vv.b[0]) < 1e-6, "toolbar V");

    const a = U.mkEnt("line", { a: [0, 0], b: [20, 0] });
    const b = U.mkEnt("line", { a: [0, 10], b: [10, 20] });
    sk.entities.push(a, b);
    U.S.selSet = [a.id, b.id]; U.S.selEnt = b.id;
    U.applyGeo("par");
    const angA = Math.atan2(a.b[1] - a.a[1], a.b[0] - a.a[0]);
    const angB = Math.atan2(b.b[1] - b.a[1], b.b[0] - b.a[0]);
    expect(Math.abs(Math.sin(angA - angB)) < 0.05, "Parallel constraint");

    const p1 = U.mkEnt("line", { a: [0, 0], b: [20, 0] });
    const p2 = U.mkEnt("line", { a: [5, 5], b: [5, 25] });
    sk.entities.push(p1, p2);
    U.S.selSet = [p1.id, p2.id]; U.S.selEnt = p2.id;
    U.applyGeo("perp");
    const d = (p1.b[0] - p1.a[0]) * (p2.b[0] - p2.a[0]) + (p1.b[1] - p1.a[1]) * (p2.b[1] - p2.a[1]);
    expect(Math.abs(d) < 20, "Perpendicular constraint (dot ≈ 0)");

    const e1 = U.mkEnt("line", { a: [0, 0], b: [20, 0] });
    const e2 = U.mkEnt("line", { a: [0, 10], b: [8, 10] });
    sk.entities.push(e1, e2);
    U.S.selSet = [e1.id, e2.id]; U.S.selEnt = e2.id;
    U.applyGeo("eq");
    expect(Math.abs(Math.hypot(e2.b[0] - e2.a[0], e2.b[1] - e2.a[1]) - 20) < 0.2, "Equal length");

    const ci1 = U.mkEnt("circle", { cx: 0, cy: 0, r: 10 });
    const ci2 = U.mkEnt("circle", { cx: 15, cy: 4, r: 5 });
    sk.entities.push(ci1, ci2);
    U.S.selSet = [ci1.id, ci2.id]; U.S.selEnt = ci2.id;
    U.applyGeo("con");
    expect(Math.abs(ci2.cx) < 1e-6 && Math.abs(ci2.cy) < 1e-6, "Concentric");

    const lnT = U.mkEnt("line", { a: [0, 0], b: [40, 0] });
    const crT = U.mkEnt("circle", { cx: 20, cy: 12, r: 8 });
    sk.entities.push(lnT, crT);
    U.S.selSet = [lnT.id, crT.id]; U.S.selEnt = crT.id;
    U.applyGeo("tan");
    expect(Math.abs(Math.abs(crT.cy) - crT.r) < 0.2, "Tangent circle to line");

    /* ---- pad + ISO ---- */
    sk = fresh();
    sk.entities.push(U.mkEnt("rect", { cx: 40, cy: 25, w: 80, h: 50 }));
    U.closeSketchToPad();
    expect(U.S.design.features.length === 1, "Pad from rectangle");
    U.setStep("drawing");
    const svg = (doc.querySelector("[data-sheet]") || {}).innerHTML || "";
    expect(/<svg[\s\S]*<\/svg>/.test(svg) && (svg.match(/<line /g) || []).length >= 8, "ISO drawing of the pad");

    /* ---- shaft (revolve) ---- */
    sk = fresh();
    sk.entities.push(U.mkEnt("rect", { cx: 20, cy: 10, w: 20, h: 20 }));
    sk.entities.push(U.mkEnt("cline", { a: [0, -5], b: [0, 30] }));
    U.revolveSketch(sk.id, "shaft");
    const shaft = U.S.design.features[U.S.design.features.length - 1];
    expect(shaft && shaft.type === "shaft", "Shaft (revolve) created");

    /* ---- rib ---- */
    sk = fresh();
    sk.entities.push(U.mkEnt("poly", { pts: [[0, 0], [40, 0], [40, 20]], closed: false, kind: "free" }));
    U.ribFromSketch(sk.id);
    const rib = U.S.design.features[U.S.design.features.length - 1];
    expect(rib && rib.type === "rib", "Rib from open polyline");

    /* ---- construction toggle ---- */
    sk = fresh();
    const cons = U.mkEnt("rect", { cx: 10, cy: 10, w: 10, h: 10 });
    sk.entities.push(cons);
    U.selectEntity(cons.id);
    U.toggleCons(cons);
    expect(!!cons.cons, "Constr. toggle marks geometry as construction");

    /* ---- toolbar buttons present ---- */
    ["line", "rect", "circle", "poly", "ngon", "arc", "slot", "ellipse", "spline", "point", "cline", "hole"].forEach(function (k) {
      expect(!!doc.querySelector('[data-tool="' + k + '"]'), "tool button " + k);
    });
    ["corner", "chamfer", "trim", "qtrim", "break", "offset", "array", "mirror2", "cons"].forEach(function (k) {
      expect(!!doc.querySelector('[data-op2="' + k + '"]'), "op button " + k);
    });
    ["pad", "pocket", "shaft", "groove", "rib"].forEach(function (k) {
      expect(!!doc.querySelector('[data-featmk="' + k + '"]'), "3D button " + k);
    });

    console.log("\n== all tools: " + pass + " passed, " + failed + " failed ==");
  } catch (e) {
    failed++;
    console.log("FAIL ✗ suite threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e));
    console.log("\n== all tools: " + pass + " passed, " + failed + " failed ==");
  }
  close();
  process.exit(failed ? 1 : 0);
}, 500);
