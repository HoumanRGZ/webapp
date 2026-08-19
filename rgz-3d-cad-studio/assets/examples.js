/* RGZ 3D CAD Studio — predesigned plates from "100 Exercícios AutoCAD"
   (12CAD / cadin360 style: mm, lines, arcs, fillets, arrays, mirror).
   Each builder uses the same public APIs a student uses in the sketcher. */
(function () {
  "use strict";

  function catalog(U) {
    function freshXY(name) {
      U.newDesignFresh();
      var sk = U.startSketchOnDatum("xy");
      U.S.design.name = name;
      return sk;
    }
    function pad(sk, L, name) {
      U.closeSketchToPad();
      var f = U.S.design.features[U.S.design.features.length - 1];
      if (f) {
        f.L = L;
        if (name) f.name = name;
      }
      return f;
    }

    return [
      {
        id: "ex01-rect-plate",
        level: "2D · book plates",
        name: "01 — Rectangular plate 100 × 60",
        tools: "Rectangle · Pad",
        blurb: "First plate in every 100-exercise book: a 100 × 60 mm rectangle, padded 8 mm.",
        build: function () {
          var sk = freshXY("Ex.01 Rectangular plate");
          sk.entities.push(U.mkEnt("rect", { cx: 50, cy: 30, w: 100, h: 60 }));
          pad(sk, 8, "Pad.1");
        }
      },
      {
        id: "ex02-l-bracket",
        level: "2D · book plates",
        name: "02 — L-bracket 80 × 50 × 20",
        tools: "Line · Coincident · Pad",
        blurb: "L-profile drawn as six connected lines (the AutoCAD LINE workflow), then padded 10 mm.",
        build: function () {
          var sk = freshXY("Ex.02 L-bracket");
          var pts = [[0, 0], [80, 0], [80, 20], [20, 20], [20, 50], [0, 50]];
          for (var i = 0; i < pts.length; i++) {
            var a = pts[i], b = pts[(i + 1) % pts.length];
            sk.entities.push(U.mkEnt("line", { a: a, b: b }));
          }
          pad(sk, 10, "Pad.1");
        }
      },
      {
        id: "ex03-fillet-holes",
        level: "2D · book plates",
        name: "03 — Plate 80 × 50, R8, 4 × Ø8",
        tools: "Rectangle · Corner (FILLET) · Hole · Pad",
        blurb: "Classic gasket plate: filvar every corner R8, four through holes Ø8 inset 12 mm.",
        build: function () {
          var sk = freshXY("Ex.03 Filleted plate 80×50 R8");
          var plate = U.mkEnt("rect", { cx: 40, cy: 25, w: 80, h: 50 });
          sk.entities.push(plate);
          U.selectEntity(plate.id);
          U.filletPolyAll(plate, "fillet2d", 8);
          [[12, 12], [68, 12], [68, 38], [12, 38]].forEach(function (p) {
            sk.entities.push(U.mkEnt("hole", { cx: p[0], cy: p[1], r: 4, hType: "through" }));
          });
          pad(sk, 10, "Pad.1");
        }
      },
      {
        id: "ex04-flange",
        level: "2D · book plates",
        name: "04 — Flange Ø80, 6 × Ø8 on PCD 55",
        tools: "Circle · Hole · Polar ARRAY · Pad",
        blurb: "Bolt circle: one hole at (27.5, 0), polar array ×6, Ø30 bore.",
        build: function () {
          var sk = freshXY("Ex.04 Flange Ø80 PCD 55");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 40 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 15, hType: "through" }));
          var h = U.mkEnt("hole", { cx: 27.5, cy: 0, r: 4, hType: "through" });
          sk.entities.push(h);
          U.selectEntity(h.id);
          U.arraySelection({ mode: "polar", n: 6, ang: 360, center: [0, 0] });
          pad(sk, 12, "Pad.1");
        }
      },
      {
        id: "ex05-slot",
        level: "2D · book plates",
        name: "05 — Slotted plate 70 × 40",
        tools: "Rectangle · Slot · Pad",
        blurb: "Obround slot 40 × 10 through a 70 × 40 plate (the SLOT tool).",
        build: function () {
          var sk = freshXY("Ex.05 Slotted plate");
          sk.entities.push(U.mkEnt("rect", { cx: 35, cy: 20, w: 70, h: 40 }));
          var hw = 5, hl = 15, cx = 35, cy = 20, pts = [], i;
          for (i = 0; i <= 12; i++) {
            var t = -Math.PI / 2 + i / 12 * Math.PI;
            pts.push([cx + hl + hw * Math.cos(t), cy + hw * Math.sin(t)]);
          }
          for (i = 0; i <= 12; i++) {
            var t = Math.PI / 2 + i / 12 * Math.PI;
            pts.push([cx - hl + hw * Math.cos(t), cy + hw * Math.sin(t)]);
          }
          sk.entities.push(U.mkEnt("poly", { pts: pts, closed: true, kind: "slot" }));
          pad(sk, 8, "Pad.1");
        }
      },
      {
        id: "ex06-mirror",
        level: "2D · book plates",
        name: "06 — Symmetric wing (MIRROR)",
        tools: "Polygon · MIRROR · Pad",
        blurb: "Draw the right half, AutoCAD MIRROR across the Y axis, pad the closed pair.",
        build: function () {
          var sk = freshXY("Ex.06 Mirror wing");
          var leaf = U.mkEnt("poly", {
            pts: [[0, 0], [40, 0], [40, 12], [18, 12], [18, 28], [0, 28]],
            closed: true, kind: "free"
          });
          sk.entities.push(leaf);
          U.selectEntity(leaf.id);
          U.mirrorCopySelection("h");
          pad(sk, 6, "Pad.1");
        }
      },
      {
        id: "ex07-line-arc",
        level: "2D · book plates",
        name: "07 — Line–arc U-plate R10",
        tools: "Line · Corner FILLET · Pad",
        blurb: "Two lines filleted R10 (open arc, not a pie), closed with the far sides — every 2D workbook plate.",
        build: function () {
          var sk = freshXY("Ex.07 Line-arc U-plate");
          var a = U.mkEnt("line", { a: [0, 0], b: [40, 0] });
          var b = U.mkEnt("line", { a: [0, 0], b: [0, 30] });
          sk.entities.push(a, b);
          U.filletTwoLines(a, b, 10);
          sk.entities.push(U.mkEnt("line", { a: [40, 0], b: [40, 30] }));
          sk.entities.push(U.mkEnt("line", { a: [0, 30], b: [40, 30] }));
          pad(sk, 12, "Pad.1");
        }
      },
      {
        id: "ex08-chamfer",
        level: "2D · book plates",
        name: "08 — Chamfered plate 60 × 40, C6",
        tools: "Rectangle · Chamfer · Pad",
        blurb: "AutoCAD CHAMFER ▸ Polyline, 6 mm on every corner.",
        build: function () {
          var sk = freshXY("Ex.08 Chamfered plate");
          var plate = U.mkEnt("rect", { cx: 30, cy: 20, w: 60, h: 40 });
          sk.entities.push(plate);
          U.selectEntity(plate.id);
          U.filletPolyAll(plate, "chamfer2d", 6);
          pad(sk, 8, "Pad.1");
        }
      },
      {
        id: "ex09-offset",
        level: "2D · book plates",
        name: "09 — Offset frame (8 mm wall)",
        tools: "Rectangle · Offset · Pad",
        blurb: "Outer 80 × 50, OFFSET 8 mm inward — the wall becomes the pad profile (nested void).",
        build: function () {
          var sk = freshXY("Ex.09 Offset frame");
          var outer = U.mkEnt("rect", { cx: 40, cy: 25, w: 80, h: 50 });
          sk.entities.push(outer);
          U.selectEntity(outer.id);
          U.S.ui.offsetD = 8;
          U.offsetAtPoint([40, 25]); /* inside → shrink */
          pad(sk, 6, "Pad.1");
        }
      },
      {
        id: "ex10-hex",
        level: "2D · book plates",
        name: "10 — Hexagon AF 40 + centre hole",
        tools: "N-gon · Hole · Pad",
        blurb: "Regular hexagon (across flats 40 mm) with a Ø16 through hole.",
        build: function () {
          var sk = freshXY("Ex.10 Hexagon AF40");
          var r = 20 / Math.cos(Math.PI / 6); /* AF 40 → vertex radius */
          var pts = [], n = 6, i;
          for (i = 0; i < n; i++) {
            var a = -Math.PI / 2 + i / n * 2 * Math.PI;
            pts.push([r * Math.cos(a), r * Math.sin(a)]);
          }
          sk.entities.push(U.mkEnt("poly", { pts: pts, closed: true, kind: "ngon", meta: { n: 6 } }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 8, hType: "through" }));
          pad(sk, 10, "Pad.1");
        }
      },
      {
        id: "ex11-rect-array",
        level: "2D · book plates",
        name: "11 — Hole grid 3 × 2 (ARRAY)",
        tools: "Rectangle · Hole · Rectangular ARRAY · Pad",
        blurb: "Base 90 × 50 with one Ø8 hole, rectangular array 3×2 at 28 × 22 mm.",
        build: function () {
          var sk = freshXY("Ex.11 Rectangular array");
          sk.entities.push(U.mkEnt("rect", { cx: 45, cy: 25, w: 90, h: 50 }));
          var h = U.mkEnt("hole", { cx: 17, cy: 14, r: 4, hType: "through" });
          sk.entities.push(h);
          U.selectEntity(h.id);
          U.arraySelection({ mode: "rect", nx: 3, ny: 2, dx: 28, dy: 22 });
          pad(sk, 8, "Pad.1");
        }
      },
      {
        id: "ex12-constraints",
        level: "2D · book plates",
        name: "12 — Constrained rectangle (H / V / Equal)",
        tools: "Line · Horiz · Vert · Equal · Coincident · Pad",
        blurb: "Four lines, then H / V / Equal / Coincident — the sketcher workflow the book never names.",
        build: function () {
          var sk = freshXY("Ex.12 Constrained rectangle");
          var A = U.mkEnt("line", { a: [0, 0], b: [70, 0] });
          var B = U.mkEnt("line", { a: [70, 0], b: [70, 40] });
          var C = U.mkEnt("line", { a: [70, 40], b: [0, 40] });
          var D = U.mkEnt("line", { a: [0, 40], b: [0, 0] });
          sk.entities.push(A, B, C, D);
          U.selectEntity(A.id); U.applyGeo("h");
          U.selectEntity(C.id); U.applyGeo("h");
          U.selectEntity(B.id); U.applyGeo("v");
          U.selectEntity(D.id); U.applyGeo("v");
          U.S.selSet = [A.id, C.id]; U.S.selEnt = C.id; U.applyGeo("eq");
          pad(sk, 8, "Pad.1");
        }
      },
      {
        id: "ex13-bush-shaft",
        level: "3D · book parts",
        name: "13 — Bush (SHAFT / revolve)",
        tools: "Rectangle · Centerline · Shaft",
        blurb: "Rectangle beside a vertical centreline, revolved 360° — the first 3D plate in the book.",
        build: function () {
          var sk = freshXY("Ex.13 Bush / shaft");
          sk.entities.push(U.mkEnt("rect", { cx: 18, cy: 12, w: 16, h: 24 }));
          sk.entities.push(U.mkEnt("cline", { a: [0, -4], b: [0, 30] }));
          U.revolveSketch(sk.id, "shaft");
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) { f.angle = 360; f.name = "Shaft.1"; }
        }
      },
      {
        id: "ex14-pocket",
        level: "3D · book parts",
        name: "14 — Pocketed block",
        tools: "Rectangle · Pad · Pocket",
        blurb: "80 × 50 × 16 block with a 40 × 24 pocket 8 mm deep (the 3D pocket plate).",
        build: function () {
          var sk = freshXY("Ex.14 Pocketed block");
          sk.entities.push(U.mkEnt("rect", { cx: 40, cy: 25, w: 80, h: 50 }));
          pad(sk, 16, "Pad.1");
          var host = U.S.design.features[0];
          var psk = U.newSketchOnPlane(
            { kind: "xy", origin: [0, 0, 16], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], topOf: host.id, z: 16 },
            host.id, "Sketch.2"
          );
          psk.entities.push(U.mkEnt("rect", { cx: 40, cy: 25, w: 40, h: 24 }));
          U.pocketFromSketch(psk.id);
          var pk = U.S.design.features[U.S.design.features.length - 1];
          if (pk) pk.L = 8;
        }
      },
      {
        id: "ex15-rib",
        level: "3D · book parts",
        name: "15 — Thin rib (open polyline)",
        tools: "Polygon (open) · Rib",
        blurb: "Open 3-point web thickened 4 mm and extruded 20 mm — CATIA Rib / the book’s thin-wall plate.",
        build: function () {
          var sk = freshXY("Ex.15 Rib");
          sk.entities.push(U.mkEnt("poly", { pts: [[0, 0], [50, 0], [50, 30]], closed: false, kind: "free" }));
          U.ribFromSketch(sk.id);
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) { f.t = 4; f.L = 20; }
        }
      }
    ];
  }

  window.RGZCAD_EXAMPLES = catalog;

  function examplesHtml(list) {
    var h = "";
    var last = "";
    list.forEach(function (ex) {
      if (ex.level !== last) {
        if (last) h += "</div>";
        h += '<h4 class="rgzcad-listhead">' + ex.level + "</h4><div class=\"rgzcad-elist\">";
        last = ex.level;
      }
      h += '<button type="button" class="row" data-exopen="' + ex.id + '">' +
        "<span>▭ " + ex.name + "</span><small>" + ex.tools + "</small></button>";
    });
    if (last) h += "</div>";
    return h;
  }

  function openExamples() {
    var U = window.__rgzcad1;
    if (!U) return;
    var root = document.querySelector("[data-rgzcad]");
    if (!root) return;
    var md = root.querySelector("[data-examples-modal]");
    if (!md) {
      md = document.createElement("div");
      md.className = "rgzcad-modal";
      md.setAttribute("data-examples-modal", "");
      md.hidden = true;
      md.innerHTML =
        '<div class="rgzcad-modal-card wide">' +
        '<button type="button" class="rgzcad-x" data-examples-close aria-label="Close">×</button>' +
        "<h3>Example plates</h3>" +
        '<p class="sub">Predesigned parts from <b>100 Exercícios AutoCAD</b> — the same role as the ready-made circuits in Hydraulic / Pneumatic Studio. Click one to load it (it replaces the current unsaved part).</p>' +
        '<div class="rgzcad-designs-body" data-examples-body></div>' +
        "</div>";
      root.appendChild(md);
      md.addEventListener("click", function (e) { if (e.target === md) md.hidden = true; });
      md.querySelector("[data-examples-close]").addEventListener("click", function () { md.hidden = true; });
    }
    var list = catalog(U);
    var body = md.querySelector("[data-examples-body]");
    body.innerHTML = examplesHtml(list);
    body.querySelectorAll("[data-exopen]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-exopen");
        var ex = list.filter(function (x) { return x.id === id; })[0];
        if (!ex) return;
        try {
          ex.build();
          md.hidden = true;
          U.renderAll();
          if (window.__rgzcadBuild3d) window.__rgzcadBuild3d(true);
          U.setStep(U.S.design.features.length ? "model" : "sketch");
          U.skFit();
          U.note("Loaded “" + ex.name + "” — " + ex.blurb);
        } catch (err) {
          U.note("Could not build that plate: " + (err && err.message ? err.message : err));
        }
      });
    });
    md.hidden = false;
  }

  function bootExamples() {
    var root = document.querySelector("[data-rgzcad]");
    if (!root) return;
    root.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-examples]") : null;
      if (t && root.contains(t)) openExamples();
    });
    window.__rgzcadOpenExamples = openExamples;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootExamples);
  else bootExamples();
})();
