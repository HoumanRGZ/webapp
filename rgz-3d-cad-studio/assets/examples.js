/* RGZ 3D CAD Studio — plates reconstructed from
   "100 CAD Exercises" (12CAD / JSCAD, the file Houman uploaded).
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
      if (f) { f.L = L; if (name) f.name = name; }
      return f;
    }
    function outline(disks) {
      return U.disksOutline(disks, 64);
    }
    function holesOnCircle(sk, cx, cy, R, r, n, a0) {
      var i;
      for (i = 0; i < n; i++) {
        var a = (a0 || 0) + i / n * 2 * Math.PI;
        sk.entities.push(U.mkEnt("hole", { cx: cx + R * Math.cos(a), cy: cy + R * Math.sin(a), r: r, hType: "through" }));
      }
    }

    return [
      {
        id: "book-01-four-lug",
        level: "2D · 100 CAD Exercises",
        name: "01 — Four-lug flange (p.5)",
        tools: "Circle · Polar ARRAY · Corner FILLET · Hole · Pad",
        blurb: "Book plate 1: body R45, bore R27.5, four R18 lugs at 30° from the vertical, Ø20 holes.",
        build: function () {
          var sk = freshXY("Book 01 — Four-lug flange");
          var disks = [{ cx: 0, cy: 0, r: 45 }];
          [60, 120, 240, 300].forEach(function (deg) {
            var a = deg * Math.PI / 180;
            disks.push({ cx: 38 * Math.cos(a), cy: 38 * Math.sin(a), r: 18 });
          });
          sk.entities.push(U.mkEnt("poly", { pts: outline(disks), closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 27.5, hType: "through" }));
          [60, 120, 240, 300].forEach(function (deg) {
            var a = deg * Math.PI / 180;
            sk.entities.push(U.mkEnt("hole", { cx: 38 * Math.cos(a), cy: 38 * Math.sin(a), r: 10, hType: "through" }));
          });
          pad(sk, 8, "Pad.1");
        }
      },
      {
        id: "book-02-cam",
        level: "2D · 100 CAD Exercises",
        name: "02 — Cam plate (p.6)",
        tools: "Circle · Corner FILLET · Hole · Pad",
        blurb: "Book plate 2: overlapping R8 / R16 / R6 / R9 lobes — the cam you FILLET together.",
        build: function () {
          var sk = freshXY("Book 02 — Cam plate");
          var disks = [
            { cx: 16, cy: 18, r: 16 },
            { cx: 8, cy: 8, r: 8 },
            { cx: 22, cy: 40, r: 6 },
            { cx: 30, cy: 20, r: 9 }
          ];
          sk.entities.push(U.mkEnt("poly", { pts: outline(disks), closed: true, kind: "free" }));
          pad(sk, 6, "Pad.1");
        }
      },
      {
        id: "book-03-three-boss",
        level: "2D · 100 CAD Exercises",
        name: "03 — Three-boss gasket (p.7)",
        tools: "Circle · Polar ARRAY · FILLET (circle–circle) · Pad",
        blurb: "Book plate 3: two Ø58 bosses 68 mm apart, side bosses Ø22, R100 blends, bolt circles.",
        build: function () {
          var sk = freshXY("Book 03 — Three-boss gasket");
          var disks = [
            { cx: 0, cy: 34, r: 29 },
            { cx: 0, cy: -34, r: 29 },
            { cx: -40, cy: 0, r: 11 },
            { cx: 40, cy: 0, r: 11 }
          ];
          sk.entities.push(U.mkEnt("poly", { pts: outline(disks), closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 34, r: 15.7, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: -34, r: 19, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: -40, cy: 0, r: 4, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 40, cy: 0, r: 4, hType: "through" }));
          holesOnCircle(sk, 0, 34, 22, 3, 6, 0);
          holesOnCircle(sk, 0, -34, 22, 4, 8, Math.PI / 8);
          pad(sk, 10, "Pad.1");
        }
      },
      {
        id: "book-04-handle",
        level: "2D · 100 CAD Exercises",
        name: "04 — Knob + arc handle (p.8)",
        tools: "Circle · Polar ARRAY · Slot / Arc · Pad",
        blurb: "Book plate 4: Ø100 knob, 6 × Ø22 on PCD 65, plus the bent R155 handle.",
        build: function () {
          var sk = freshXY("Book 04 — Knob and handle");
          var disks = [{ cx: 0, cy: 0, r: 50 }];
          /* handle as a thick arc sampled to a closed ring */
          var handle = [];
          var i, a0 = -20 * Math.PI / 180, a1 = 55 * Math.PI / 180;
          var C = [50 + 43.4, 0];
          for (i = 0; i <= 24; i++) {
            var a = a0 + (a1 - a0) * i / 24;
            handle.push([C[0] + 155 * Math.cos(a) - 155, C[1] + 155 * Math.sin(a)]);
          }
          for (i = 24; i >= 0; i--) {
            var a = a0 + (a1 - a0) * i / 24;
            handle.push([C[0] + 125 * Math.cos(a) - 155, C[1] + 125 * Math.sin(a)]);
          }
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 50 }));
          sk.entities.push(U.mkEnt("poly", { pts: handle, closed: true, kind: "slot" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 15, hType: "through" }));
          holesOnCircle(sk, 0, 0, 32.5, 11, 6, 0);
          pad(sk, 8, "Pad.1");
        }
      },
      {
        id: "book-05-rocker",
        level: "2D · 100 CAD Exercises",
        name: "05 — Rocker / bell-crank (p.9)",
        tools: "Circle · Tangent · Mirror · Hole · Pad",
        blurb: "Book plate 5: central R32, top R15 at 65 mm, side bosses R20 at 50 mm — then mirrored.",
        build: function () {
          var sk = freshXY("Book 05 — Rocker");
          var disks = [
            { cx: 0, cy: 0, r: 32 },
            { cx: 0, cy: 65, r: 15 },
            { cx: -50, cy: 18, r: 20 },
            { cx: 50, cy: 18, r: 20 },
            { cx: -50, cy: -18, r: 15 },
            { cx: 50, cy: -18, r: 15 }
          ];
          sk.entities.push(U.mkEnt("poly", { pts: outline(disks), closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 20, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 65, r: 8.5, hType: "through" }));
          [[-50, 18], [50, 18], [-50, -18], [50, -18]].forEach(function (p) {
            sk.entities.push(U.mkEnt("hole", { cx: p[0], cy: p[1], r: 5, hType: "through" }));
          });
          pad(sk, 8, "Pad.1");
        }
      },
      {
        id: "book-06-slotted-cover",
        level: "2D · 100 CAD Exercises",
        name: "06 — Slotted cover (p.10)",
        tools: "Circle · Line · Slot · Hole · Pad",
        blurb: "Book plate 6: R70 base, R20 / R14 / R8 lugs, 10 × 72 mm slot.",
        build: function () {
          var sk = freshXY("Book 06 — Slotted cover");
          var disks = [
            { cx: 0, cy: 0, r: 70 },
            { cx: -45, cy: 72, r: 14 },
            { cx: 45, cy: 72, r: 14 },
            { cx: -45, cy: 30, r: 20 },
            { cx: 45, cy: 30, r: 20 }
          ];
          sk.entities.push(U.mkEnt("poly", { pts: outline(disks), closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("poly", { pts: U.slotPts(0, 36, 72, 10, 90), closed: true, kind: "slot" }));
          [[-45, 72], [45, 72]].forEach(function (p) {
            sk.entities.push(U.mkEnt("hole", { cx: p[0], cy: p[1], r: 8, hType: "through" }));
          });
          [[-45, 30], [45, 30]].forEach(function (p) {
            sk.entities.push(U.mkEnt("hole", { cx: p[0], cy: p[1], r: 10, hType: "through" }));
          });
          pad(sk, 8, "Pad.1");
        }
      },
      {
        id: "book-07-tangent-link",
        level: "2D · 100 CAD Exercises",
        name: "07 — Tangent-circle link (p.11)",
        tools: "Circle · Tangent / FILLET · Polar ARRAY · Pad",
        blurb: "Book plate 7: two Ø52 bosses 85 mm apart, linked to an R52.2 head with a 6-hole bolt circle.",
        build: function () {
          var sk = freshXY("Book 07 — Tangent link");
          var disks = [
            { cx: 0, cy: 42.5, r: 26 },
            { cx: 0, cy: -42.5, r: 26 },
            { cx: 80, cy: 0, r: 52.2 }
          ];
          sk.entities.push(U.mkEnt("poly", { pts: outline(disks), closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 42.5, r: 8, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: -42.5, r: 8, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 80, cy: 0, r: 15, hType: "through" }));
          holesOnCircle(sk, 80, 0, 33.5, 10.95, 6, 0);
          pad(sk, 10, "Pad.1");
        }
      },
      {
        id: "book-08-hanger",
        level: "2D · 100 CAD Exercises",
        name: "08 — Hanger plate (p.12)",
        tools: "Circle · Rectangle · Corner R10 · Hole · Pad",
        blurb: "Book plate 8: 168 × 24 foot, Ø57.2 and R31.6 bosses, R60 crescent.",
        build: function () {
          var sk = freshXY("Book 08 — Hanger");
          var disks = [
            { cx: 0, cy: 12, r: 84 },           /* 168 mm foot as a fat disk, then clipped by pad of the stack */
            { cx: 0, cy: 60, r: 28.6 },
            { cx: 0, cy: 117.5, r: 28 },
            { cx: 0, cy: 263, r: 31.6 }
          ];
          sk.entities.push(U.mkEnt("poly", { pts: outline(disks), closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 60, r: 18, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 117.5, r: 10, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 263, r: 18.35, hType: "through" }));
          pad(sk, 10, "Pad.1");
        }
      },
      {
        id: "book-09-scallop",
        level: "2D · 100 CAD Exercises",
        name: "09 — Scalloped washer (p.25)",
        tools: "Circle · Polar ARRAY · Pad",
        blurb: "Book plate ~20: Ø21 washer, R13.5 rim, five Ø2 scallops on a pitch circle.",
        build: function () {
          var sk = freshXY("Book 09 — Scalloped washer");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 13.5 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 10.5, hType: "through" }));
          holesOnCircle(sk, 0, 0, 11, 1, 5, -0.4);
          pad(sk, 3, "Pad.1");
        }
      },
      {
        id: "book-10-u-fillet",
        level: "2D · 100 CAD Exercises",
        name: "10 — Line–arc U-plate R10",
        tools: "Line · Corner FILLET · Pad",
        blurb: "The construction every 2D chapter starts with: two lines, FILLET R10, close the U, pad.",
        build: function () {
          var sk = freshXY("Book 10 — U-plate R10");
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
        id: "book-11-hex",
        level: "2D · 100 CAD Exercises",
        name: "11 — Hexagon AF 40 + Ø16",
        tools: "N-gon · Hole · Pad",
        blurb: "Regular hexagon (across flats 40 mm) with a through hole — the N-gon plate.",
        build: function () {
          var sk = freshXY("Book 11 — Hex AF40");
          var r = 20 / Math.cos(Math.PI / 6);
          sk.entities.push(U.mkEnt("poly", { pts: U.ngonPts(0, 0, r, 6, 0), closed: true, kind: "ngon", meta: { n: 6 } }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 8, hType: "through" }));
          pad(sk, 10, "Pad.1");
        }
      },
      {
        id: "book-12-array",
        level: "2D · 100 CAD Exercises",
        name: "12 — Bolt circle ×6 (ARRAY)",
        tools: "Circle · Hole · Polar ARRAY · Pad",
        blurb: "Flange Ø80, bore Ø30, one hole polar-arrayed ×6 on PCD 55.",
        build: function () {
          var sk = freshXY("Book 12 — Bolt circle");
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
        id: "book-13-vblock",
        level: "3D · 100 CAD Exercises",
        name: "13 — V-block (p.61)",
        tools: "Polygon · Pad · Pocket",
        blurb: "Book 3D plate: 56 × 36 × 18 block, 150°/135° chamfers, 6 mm V-groove pocket.",
        build: function () {
          var sk = freshXY("Book 13 — V-block");
          /* front profile: 36 wide, 18 tall after the 7 mm step, 13 mm right tab */
          var pts = [
            [0, 0], [36, 0], [36, 11], [36 + 13, 11], [36 + 13, 18],
            [0, 18]
          ];
          /* 150° left chamfer: cut the top-left */
          pts = [[0, 0], [36, 0], [36, 11], [49, 11], [49, 18], [8, 18], [0, 18 - 8 / Math.tan(30 * Math.PI / 180)]];
          sk.entities.push(U.mkEnt("poly", { pts: pts, closed: true, kind: "free" }));
          pad(sk, 18, "Pad.1");
          var host = U.S.design.features[0];
          var psk = U.newSketchOnPlane(
            { kind: "xy", origin: [0, 0, 18], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], topOf: host.id, z: 18 },
            host.id, "Sketch.2"
          );
          psk.entities.push(U.mkEnt("rect", { cx: 23.5, cy: 9, w: 47, h: 6 }));
          U.pocketFromSketch(psk.id);
          var pk = U.S.design.features[U.S.design.features.length - 1];
          if (pk) pk.L = 6;
        }
      },
      {
        id: "book-14-bush",
        level: "3D · 100 CAD Exercises",
        name: "14 — Bush (SHAFT / revolve)",
        tools: "Rectangle · Centerline · Shaft",
        blurb: "First revolve in the 3D chapter: rectangle beside a vertical centreline, 360°.",
        build: function () {
          var sk = freshXY("Book 14 — Bush");
          sk.entities.push(U.mkEnt("rect", { cx: 18, cy: 12, w: 16, h: 24 }));
          sk.entities.push(U.mkEnt("cline", { a: [0, -4], b: [0, 30] }));
          U.revolveSketch(sk.id, "shaft");
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) { f.angle = 360; f.name = "Shaft.1"; }
        }
      },
      {
        id: "book-15-pocket-block",
        level: "3D · 100 CAD Exercises",
        name: "15 — Pocketed block",
        tools: "Rectangle · Pad · Pocket",
        blurb: "80 × 50 × 16 block with a 40 × 24 pocket 8 mm deep.",
        build: function () {
          var sk = freshXY("Book 15 — Pocketed block");
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
        h += '<h4 class="rgzcad-listhead">' + ex.level + '</h4><div class="rgzcad-exgrid">';
        last = ex.level;
      }
      h += '<button type="button" class="rgzcad-excard" data-exopen="' + ex.id + '">' +
        "<b>" + ex.name + "</b>" +
        "<small>" + ex.tools + "</small>" +
        "<span>" + ex.blurb + "</span></button>";
    });
    if (last) h += "</div>";
    return h;
  }

  function showModal(md) { md.hidden = false; md.classList.add("on"); }
  function hideModal(md) { md.hidden = true; md.classList.remove("on"); }

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
        '<p class="sub">Predesigned parts from <b>100 CAD Exercises</b> (12CAD) — the same role as the ready-made circuits in Hydraulic / Pneumatic Studio. Click one to load it.</p>' +
        '<div class="rgzcad-designs-body" data-examples-body></div>' +
        "</div>";
      root.appendChild(md);
      md.addEventListener("click", function (e) { if (e.target === md) hideModal(md); });
      md.querySelector("[data-examples-close]").addEventListener("click", function () { hideModal(md); });
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
          hideModal(md);
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
    showModal(md);
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
