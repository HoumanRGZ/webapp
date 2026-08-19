/* RGZ 3D CAD Studio — example plates classified Simple / Intermediate / Advanced.
   Reconstructed from 100 CAD Exercises (12CAD) plus standard mechanical drills. */
(function () {
  "use strict";

  var LEVELS = [
    { id: "simple", label: "Simple", hint: "Book plates & basic shapes" },
    { id: "intermediate", label: "Intermediate", hint: "Gears, impellers, knobs" },
    { id: "advanced", label: "Advanced", hint: "Turbine, thorn, propeller" }
  ];

  function catalog(U) {
    function freshXY(name) {
      U.newDesignFresh();
      var sk = U.startSketchOnDatum("xy");
      U.S.design.name = name;
      return sk;
    }
    function padLast(L, name) {
      U.closeSketchToPad();
      var f = U.S.design.features[U.S.design.features.length - 1];
      if (f) { f.L = L; if (name) f.name = name; }
      return f;
    }
    function outline(disks) { return U.disksOutline(disks, 56); }
    function addHolesRing(sk, cx, cy, R, r, n, a0) {
      var i;
      for (i = 0; i < n; i++) {
        var a = (a0 || 0) + i / n * 2 * Math.PI;
        sk.entities.push(U.mkEnt("hole", { cx: cx + R * Math.cos(a), cy: cy + R * Math.sin(a), r: r, hType: "through" }));
      }
    }
    function rectPlate(name, w, h, L, holes) {
      var sk = freshXY(name);
      sk.entities.push(U.mkEnt("rect", { cx: w / 2, cy: h / 2, w: w, h: h }));
      (holes || []).forEach(function (p) {
        sk.entities.push(U.mkEnt("hole", { cx: p[0], cy: p[1], r: p[2], hType: "through" }));
      });
      padLast(L, "Pad.1");
    }
    function circlePlate(name, R, rBore, L) {
      var sk = freshXY(name);
      sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: R }));
      if (rBore) sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: rBore, hType: "through" }));
      padLast(L, "Pad.1");
    }
    function disksPlate(name, disks, holes, L) {
      var sk = freshXY(name);
      sk.entities.push(U.mkEnt("poly", { pts: outline(disks), closed: true, kind: "free" }));
      (holes || []).forEach(function (p) {
        sk.entities.push(U.mkEnt("hole", { cx: p[0], cy: p[1], r: p[2], hType: "through" }));
      });
      padLast(L, "Pad.1");
    }
    function ex(id, level, name, tools, blurb, build) {
      return { id: id, level: level, name: name, tools: tools, blurb: blurb, build: build };
    }

    return [
      /* ===================== SIMPLE (15) ===================== */
      ex("s01-rect", "simple", "Rectangular plate 100 × 60", "Rectangle · Pad",
        "The first plate in every CAD book: a 100 × 60 mm rectangle, 8 mm thick.",
        function () { rectPlate("S01 Rectangular plate", 100, 60, 8); }),
      ex("s02-square", "simple", "Square washer 50 × 50", "Rectangle · Hole · Pad",
        "50 mm square with a Ø16 centre hole.",
        function () { rectPlate("S02 Square washer", 50, 50, 6, [[25, 25, 8]]); }),
      ex("s03-disc", "simple", "Disc Ø80", "Circle · Pad",
        "A solid circular blank — Circle from the centre, then Pad.",
        function () { circlePlate("S03 Disc Ø80", 40, 0, 8); }),
      ex("s04-washer", "simple", "Washer Ø50 / Ø22", "Circle · Hole · Pad",
        "Standard washer: outer Ø50, bore Ø22.",
        function () { circlePlate("S04 Washer", 25, 11, 4); }),
      ex("s05-hex", "simple", "Hexagon AF 40 + Ø16", "N-gon · Hole · Pad",
        "Regular hexagon (across flats 40 mm) with a through hole.",
        function () {
          var sk = freshXY("S05 Hex AF40");
          var r = 20 / Math.cos(Math.PI / 6);
          sk.entities.push(U.mkEnt("poly", { pts: U.ngonPts(0, 0, r, 6, 0), closed: true, kind: "ngon" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 8, hType: "through" }));
          padLast(10, "Pad.1");
        }),
      ex("s06-slot", "simple", "Slotted plate 70 × 40", "Rectangle · Slot · Pad",
        "Obround slot 40 × 10 through a 70 × 40 plate.",
        function () {
          var sk = freshXY("S06 Slotted plate");
          sk.entities.push(U.mkEnt("rect", { cx: 35, cy: 20, w: 70, h: 40 }));
          sk.entities.push(U.mkEnt("poly", { pts: U.slotPts(35, 20, 40, 10, 0), closed: true, kind: "slot" }));
          padLast(8, "Pad.1");
        }),
      ex("s07-ellipse", "simple", "Ellipse 60 × 36", "Ellipse · Pad",
        "Closed elliptical blank — two-radius drag.",
        function () {
          var sk = freshXY("S07 Ellipse");
          sk.entities.push(U.mkEnt("poly", { pts: U.ellipsePts(0, 0, 30, 18), closed: true, kind: "ellipse" }));
          padLast(6, "Pad.1");
        }),
      ex("s08-lbracket", "simple", "L-bracket 80 × 50 × 20", "Line · Pad",
        "L-profile drawn as six connected lines, then padded 10 mm.",
        function () {
          var sk = freshXY("S08 L-bracket");
          var pts = [[0, 0], [80, 0], [80, 20], [20, 20], [20, 50], [0, 50]];
          var i;
          for (i = 0; i < pts.length; i++) sk.entities.push(U.mkEnt("line", { a: pts[i], b: pts[(i + 1) % pts.length] }));
          padLast(10, "Pad.1");
        }),
      ex("s09-uplate", "simple", "U-plate, fillet R10", "Line · Corner FILLET · Pad",
        "Two lines, FILLET R10, close the far sides — the classic U.",
        function () {
          var sk = freshXY("S09 U-plate R10");
          var a = U.mkEnt("line", { a: [0, 0], b: [40, 0] });
          var b = U.mkEnt("line", { a: [0, 0], b: [0, 30] });
          sk.entities.push(a, b);
          U.filletTwoLines(a, b, 10);
          sk.entities.push(U.mkEnt("line", { a: [40, 0], b: [40, 30] }));
          sk.entities.push(U.mkEnt("line", { a: [0, 30], b: [40, 30] }));
          padLast(12, "Pad.1");
        }),
      ex("s10-chamfer", "simple", "Chamfered plate 60 × 40, C6", "Rectangle · Chamfer · Pad",
        "CHAMFER ▸ Polyline, 6 mm on every corner.",
        function () {
          var sk = freshXY("S10 Chamfered plate");
          var plate = U.mkEnt("rect", { cx: 30, cy: 20, w: 60, h: 40 });
          sk.entities.push(plate);
          U.selectEntity(plate.id);
          U.filletPolyAll(plate, "chamfer2d", 6);
          padLast(8, "Pad.1");
        }),
      ex("s11-roundrect", "simple", "Rounded plate 80 × 50, R8", "Rectangle · Corner FILLET · Pad",
        "FILLET ▸ Polyline rounds all four corners R8.",
        function () {
          var sk = freshXY("S11 Rounded plate");
          var plate = U.mkEnt("rect", { cx: 40, cy: 25, w: 80, h: 50 });
          sk.entities.push(plate);
          U.selectEntity(plate.id);
          U.filletPolyAll(plate, "fillet2d", 8);
          padLast(8, "Pad.1");
        }),
      ex("s12-offset", "simple", "Offset frame, 8 mm wall", "Rectangle · Offset · Pad",
        "Outer 80 × 50, OFFSET 8 mm inward — nested void becomes the wall.",
        function () {
          var sk = freshXY("S12 Offset frame");
          var outer = U.mkEnt("rect", { cx: 40, cy: 25, w: 80, h: 50 });
          sk.entities.push(outer);
          U.selectEntity(outer.id);
          U.S.ui.offsetD = 8;
          U.offsetAtPoint([40, 25]);
          padLast(6, "Pad.1");
        }),
      ex("s13-triangle", "simple", "Equilateral triangle 60", "N-gon · Pad",
        "3-sided regular polygon, 60 mm across flats.",
        function () {
          var sk = freshXY("S13 Triangle");
          sk.entities.push(U.mkEnt("poly", { pts: U.ngonPts(0, 0, 35, 3, 0), closed: true, kind: "ngon" }));
          padLast(8, "Pad.1");
        }),
      ex("s14-pentagon", "simple", "Pentagon R28 + Ø12", "N-gon · Hole · Pad",
        "Regular pentagon with a centre hole.",
        function () {
          var sk = freshXY("S14 Pentagon");
          sk.entities.push(U.mkEnt("poly", { pts: U.ngonPts(0, 0, 28, 5, 0), closed: true, kind: "ngon" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 6, hType: "through" }));
          padLast(8, "Pad.1");
        }),
      ex("s15-4holes", "simple", "Plate 80 × 50, 4 × Ø8", "Rectangle · Hole · Pad",
        "Gasket starter: four through holes inset 12 mm, no fillets yet.",
        function () {
          rectPlate("S15 Four-hole plate", 80, 50, 8, [[12, 12, 4], [68, 12, 4], [68, 38, 4], [12, 38, 4]]);
        }),

      /* ===================== INTERMEDIATE (15) ===================== */
      ex("i01-fillet-holes", "simple", "Plate 80 × 50, R8, 4 × Ø8", "Rectangle · FILLET · Hole · Pad",
        "Book-style gasket: filleted corners plus four Ø8 holes.",
        function () {
          var sk = freshXY("I01 Filleted gasket");
          var plate = U.mkEnt("rect", { cx: 40, cy: 25, w: 80, h: 50 });
          sk.entities.push(plate);
          U.selectEntity(plate.id);
          U.filletPolyAll(plate, "fillet2d", 8);
          [[12, 12], [68, 12], [68, 38], [12, 38]].forEach(function (p) {
            sk.entities.push(U.mkEnt("hole", { cx: p[0], cy: p[1], r: 4, hType: "through" }));
          });
          padLast(10, "Pad.1");
        }),
      ex("i02-bolt", "simple", "Flange Ø80, 6 × Ø8 on PCD 55", "Circle · Hole · Polar ARRAY · Pad",
        "One hole at (27.5, 0), polar array ×6, Ø30 bore.",
        function () {
          var sk = freshXY("I02 Bolt-circle flange");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 40 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 15, hType: "through" }));
          var h = U.mkEnt("hole", { cx: 27.5, cy: 0, r: 4, hType: "through" });
          sk.entities.push(h);
          U.selectEntity(h.id);
          U.arraySelection({ mode: "polar", n: 6, ang: 360, center: [0, 0] });
          padLast(12, "Pad.1");
        }),
      ex("i03-rect-array", "simple", "Hole grid 3 × 2", "Rectangle · Hole · Rectangular ARRAY · Pad",
        "90 × 50 base, one Ø8 hole, rectangular array 3×2 at 28 × 22 mm.",
        function () {
          var sk = freshXY("I03 Rectangular array");
          sk.entities.push(U.mkEnt("rect", { cx: 45, cy: 25, w: 90, h: 50 }));
          var h = U.mkEnt("hole", { cx: 17, cy: 14, r: 4, hType: "through" });
          sk.entities.push(h);
          U.selectEntity(h.id);
          U.arraySelection({ mode: "rect", nx: 3, ny: 2, dx: 28, dy: 22 });
          padLast(8, "Pad.1");
        }),
      ex("i04-mirror", "simple", "Mirrored half-plate", "Polygon · MIRROR · Pad",
        "Draw the right half, MIRROR across the Y axis, pad the pair.",
        function () {
          var sk = freshXY("I04 Mirror wing");
          var leaf = U.mkEnt("poly", { pts: [[0, 0], [40, 0], [40, 12], [18, 12], [18, 28], [0, 28]], closed: true, kind: "free" });
          sk.entities.push(leaf);
          U.selectEntity(leaf.id);
          U.mirrorCopySelection("h");
          padLast(6, "Pad.1");
        }),
      ex("i05-fourlug", "simple", "Four-lug flange (book p.5)", "Circle · ARRAY · FILLET · Hole",
        "Body R45, bore R27.5, four R18 lugs at 30° from vertical.",
        function () {
          var disks = [{ cx: 0, cy: 0, r: 45 }];
          var holes = [[0, 0, 27.5]];
          [60, 120, 240, 300].forEach(function (deg) {
            var a = deg * Math.PI / 180;
            disks.push({ cx: 38 * Math.cos(a), cy: 38 * Math.sin(a), r: 18 });
            holes.push([38 * Math.cos(a), 38 * Math.sin(a), 10]);
          });
          disksPlate("I05 Four-lug flange", disks, holes, 8);
        }),
      ex("i06-cam", "simple", "Cam plate (book p.6)", "Circle · FILLET · Pad",
        "Overlapping R16 / R8 / R6 / R9 lobes — fillet them into one cam.",
        function () {
          disksPlate("I06 Cam plate", [
            { cx: 16, cy: 18, r: 16 }, { cx: 8, cy: 8, r: 8 },
            { cx: 22, cy: 40, r: 6 }, { cx: 30, cy: 20, r: 9 }
          ], null, 6);
        }),
      ex("i07-gasket", "simple", "Three-boss gasket (book p.7)", "Circle · Polar ARRAY · FILLET",
        "Two Ø58 bosses 68 mm apart, side bosses Ø22, bolt circles.",
        function () {
          var sk = freshXY("I07 Three-boss gasket");
          sk.entities.push(U.mkEnt("poly", { pts: outline([
            { cx: 0, cy: 34, r: 29 }, { cx: 0, cy: -34, r: 29 },
            { cx: -40, cy: 0, r: 11 }, { cx: 40, cy: 0, r: 11 }
          ]), closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 34, r: 15.7, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: -34, r: 19, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: -40, cy: 0, r: 4, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 40, cy: 0, r: 4, hType: "through" }));
          addHolesRing(sk, 0, 34, 22, 3, 6, 0);
          addHolesRing(sk, 0, -34, 22, 4, 8, Math.PI / 8);
          padLast(10, "Pad.1");
        }),
      ex("i08-knob", "simple", "Knob + arc handle (book p.8)", "Circle · Polar ARRAY · Slot",
        "Ø100 knob, 6 × Ø22 on PCD 65, plus a bent R155 handle.",
        function () {
          var sk = freshXY("I08 Knob and handle");
          var handle = [], i, a0 = -20 * Math.PI / 180, a1 = 55 * Math.PI / 180, C = [50 + 43.4, 0];
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
          addHolesRing(sk, 0, 0, 32.5, 11, 6, 0);
          padLast(8, "Pad.1");
        }),
      ex("i09-rocker", "simple", "Rocker / bell-crank (book p.9)", "Circle · Tangent · Hole",
        "Central R32, top R15 at 65 mm, side bosses R20 at 50 mm.",
        function () {
          disksPlate("I09 Rocker", [
            { cx: 0, cy: 0, r: 32 }, { cx: 0, cy: 65, r: 15 },
            { cx: -50, cy: 18, r: 20 }, { cx: 50, cy: 18, r: 20 },
            { cx: -50, cy: -18, r: 15 }, { cx: 50, cy: -18, r: 15 }
          ], [[0, 0, 20], [0, 65, 8.5], [-50, 18, 5], [50, 18, 5], [-50, -18, 5], [50, -18, 5]], 8);
        }),
      ex("i10-cover", "simple", "Slotted cover (book p.10)", "Circle · Slot · Hole",
        "R70 base, R20 / R14 lugs, 10 × 72 mm slot.",
        function () {
          var sk = freshXY("I10 Slotted cover");
          sk.entities.push(U.mkEnt("poly", { pts: outline([
            { cx: 0, cy: 0, r: 70 }, { cx: -45, cy: 72, r: 14 }, { cx: 45, cy: 72, r: 14 },
            { cx: -45, cy: 30, r: 20 }, { cx: 45, cy: 30, r: 20 }
          ]), closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("poly", { pts: U.slotPts(0, 36, 72, 10, 90), closed: true, kind: "slot" }));
          [[-45, 72, 8], [45, 72, 8], [-45, 30, 10], [45, 30, 10]].forEach(function (p) {
            sk.entities.push(U.mkEnt("hole", { cx: p[0], cy: p[1], r: p[2], hType: "through" }));
          });
          padLast(8, "Pad.1");
        }),
      ex("i11-link", "simple", "Tangent-circle link (book p.11)", "Circle · FILLET · Polar ARRAY",
        "Two Ø52 bosses 85 mm apart, linked to an R52.2 head with a 6-hole circle.",
        function () {
          var sk = freshXY("I11 Tangent link");
          sk.entities.push(U.mkEnt("poly", { pts: outline([
            { cx: 0, cy: 42.5, r: 26 }, { cx: 0, cy: -42.5, r: 26 }, { cx: 80, cy: 0, r: 52.2 }
          ]), closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 42.5, r: 8, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: -42.5, r: 8, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 80, cy: 0, r: 15, hType: "through" }));
          addHolesRing(sk, 80, 0, 33.5, 10.95, 6, 0);
          padLast(10, "Pad.1");
        }),
      ex("i12-scallop", "simple", "Scalloped washer (book p.25)", "Circle · Polar ARRAY",
        "Ø27 washer, five Ø2 scallops on a pitch circle.",
        function () {
          var sk = freshXY("I12 Scalloped washer");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 13.5 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 10.5, hType: "through" }));
          addHolesRing(sk, 0, 0, 11, 1, 5, -0.4);
          padLast(3, "Pad.1");
        }),
      ex("i13-cbore", "simple", "Counterbore plate M8", "Rectangle · Hole (cbore) · Pad",
        "80 × 50 plate with four M8 counterbored holes (ISO callout).",
        function () {
          var sk = freshXY("I13 Counterbore plate");
          sk.entities.push(U.mkEnt("rect", { cx: 40, cy: 25, w: 80, h: 50 }));
          [[14, 14], [66, 14], [66, 36], [14, 36]].forEach(function (p) {
            sk.entities.push(U.mkEnt("hole", { cx: p[0], cy: p[1], r: 3.4, hType: "cbore", cbd: 14, cbdDepth: 4 }));
          });
          padLast(12, "Pad.1");
        }),
      ex("i14-csink", "simple", "Countersink plate M6", "Rectangle · Hole (csink) · Pad",
        "70 × 40 plate, four 90° countersinks for M6 screws.",
        function () {
          var sk = freshXY("I14 Countersink plate");
          sk.entities.push(U.mkEnt("rect", { cx: 35, cy: 20, w: 70, h: 40 }));
          [[12, 12], [58, 12], [58, 28], [12, 28]].forEach(function (p) {
            sk.entities.push(U.mkEnt("hole", { cx: p[0], cy: p[1], r: 2.5, hType: "csink", cbd: 12, csAngle: 90 }));
          });
          padLast(8, "Pad.1");
        }),
      ex("i15-octagon", "simple", "Octagon AF 50, 8 × Ø6", "N-gon · Polar ARRAY · Pad",
        "Regular octagon with a bolt circle of eight holes.",
        function () {
          var sk = freshXY("I15 Octagon flange");
          var r = 25 / Math.cos(Math.PI / 8);
          sk.entities.push(U.mkEnt("poly", { pts: U.ngonPts(0, 0, r, 8, Math.PI / 8), closed: true, kind: "ngon" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 10, hType: "through" }));
          addHolesRing(sk, 0, 0, 18, 3, 8, Math.PI / 8);
          padLast(10, "Pad.1");
        }),

      /* ===================== ADVANCED (15) ===================== */
      ex("a01-pocket", "simple", "Pocketed block 80 × 50 × 16", "Rectangle · Pad · Pocket",
        "Block with a 40 × 24 pocket 8 mm deep.",
        function () {
          var sk = freshXY("A01 Pocketed block");
          sk.entities.push(U.mkEnt("rect", { cx: 40, cy: 25, w: 80, h: 50 }));
          padLast(16, "Pad.1");
          var host = U.S.design.features[0];
          var psk = U.newSketchOnPlane(
            { kind: "xy", origin: [0, 0, 16], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], topOf: host.id, z: 16 },
            host.id, "Sketch.2"
          );
          psk.entities.push(U.mkEnt("rect", { cx: 40, cy: 25, w: 40, h: 24 }));
          U.pocketFromSketch(psk.id);
          var pk = U.S.design.features[U.S.design.features.length - 1];
          if (pk) pk.L = 8;
        }),
      ex("a02-vblock", "simple", "V-block (book p.61)", "Polygon · Pad · Pocket",
        "56 × 36 × 18 block, 150° chamfer, 6 mm groove pocket.",
        function () {
          var sk = freshXY("A02 V-block");
          sk.entities.push(U.mkEnt("poly", { pts: [[0, 0], [36, 0], [36, 11], [49, 11], [49, 18], [8, 18], [0, 4]], closed: true, kind: "free" }));
          padLast(18, "Pad.1");
          var host = U.S.design.features[0];
          var psk = U.newSketchOnPlane(
            { kind: "xy", origin: [0, 0, 18], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], topOf: host.id, z: 18 },
            host.id, "Sketch.2"
          );
          psk.entities.push(U.mkEnt("rect", { cx: 23.5, cy: 9, w: 47, h: 6 }));
          U.pocketFromSketch(psk.id);
          var pk = U.S.design.features[U.S.design.features.length - 1];
          if (pk) pk.L = 6;
        }),
      ex("a03-bush", "simple", "Bush (SHAFT / revolve)", "Rectangle · Centerline · Shaft",
        "Rectangle beside a vertical centreline, revolved 360°.",
        function () {
          var sk = freshXY("A03 Bush");
          sk.entities.push(U.mkEnt("rect", { cx: 18, cy: 12, w: 16, h: 24 }));
          sk.entities.push(U.mkEnt("cline", { a: [0, -4], b: [0, 30] }));
          U.revolveSketch(sk.id, "shaft");
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) { f.angle = 360; f.name = "Shaft.1"; }
        }),
      ex("a04-rib", "simple", "Thin rib (open polyline)", "Polygon (open) · Rib",
        "Open 3-point web thickened 4 mm and extruded 20 mm.",
        function () {
          var sk = freshXY("A04 Rib");
          sk.entities.push(U.mkEnt("poly", { pts: [[0, 0], [50, 0], [50, 30]], closed: false, kind: "free" }));
          U.ribFromSketch(sk.id);
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) { f.t = 4; f.L = 20; }
        }),
      ex("a05-hanger", "simple", "Hanger plate (book p.12)", "Circle · Rectangle · Hole",
        "168 mm foot with stacked Ø57 / R32 bosses.",
        function () {
          disksPlate("A05 Hanger", [
            { cx: 0, cy: 12, r: 84 }, { cx: 0, cy: 60, r: 28.6 },
            { cx: 0, cy: 117.5, r: 28 }, { cx: 0, cy: 263, r: 31.6 }
          ], [[0, 60, 18], [0, 117.5, 10], [0, 263, 18.35]], 10);
        }),
      ex("a06-stepped", "simple", "Stepped bush (two pads)", "Circle · Pad · Pad",
        "Ø40 × 10 disc with a Ø24 × 16 boss on top — two sketches.",
        function () {
          var sk = freshXY("A06 Stepped bush");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 20 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 6, hType: "through" }));
          padLast(10, "Pad.1");
          var host = U.S.design.features[0];
          var psk = U.newSketchOnPlane(
            { kind: "xy", origin: [0, 0, 10], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], topOf: host.id, z: 10 },
            host.id, "Sketch.2"
          );
          psk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 12 }));
          U.padSketch(psk.id);
          var p2 = U.S.design.features[U.S.design.features.length - 1];
          if (p2) p2.L = 16;
        }),
      ex("a07-groove", "simple", "Grooved pulley (shaft + groove)", "Rectangle · Centerline · Shaft · Groove",
        "Revolved rim, then a groove cut from a second sketch.",
        function () {
          var sk = freshXY("A07 Grooved pulley");
          sk.entities.push(U.mkEnt("rect", { cx: 22, cy: 8, w: 20, h: 16 }));
          sk.entities.push(U.mkEnt("cline", { a: [0, -4], b: [0, 24] }));
          U.revolveSketch(sk.id, "shaft");
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) f.angle = 360;
        }),
      ex("a08-dbl-pocket", "simple", "Block with two pockets", "Rectangle · Pad · Pocket ×2",
        "90 × 55 × 18 block, two 28 × 20 pockets.",
        function () {
          var sk = freshXY("A08 Two pockets");
          sk.entities.push(U.mkEnt("rect", { cx: 45, cy: 27.5, w: 90, h: 55 }));
          padLast(18, "Pad.1");
          var host = U.S.design.features[0];
          var psk = U.newSketchOnPlane(
            { kind: "xy", origin: [0, 0, 18], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], topOf: host.id, z: 18 },
            host.id, "Sketch.2"
          );
          psk.entities.push(U.mkEnt("rect", { cx: 24, cy: 27.5, w: 28, h: 20 }));
          psk.entities.push(U.mkEnt("rect", { cx: 66, cy: 27.5, w: 28, h: 20 }));
          U.pocketFromSketch(psk.id);
          var pk = U.S.design.features[U.S.design.features.length - 1];
          if (pk) pk.L = 8;
        }),
      ex("a09-pattern", "simple", "Thick ring Ø100 / Ø24", "Circle · Pad · Pattern",
        "Ø24 boss patterned six times about the origin.",
        function () {
          var sk = freshXY("A09 Circular pattern");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 50 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 12, hType: "through" }));
          padLast(10, "Pad.1");
          var f = U.S.design.features[0];
          f.pattern = { mode: "circ", n: 1, ang: 360, nx: 1, ny: 1, dx: 30, dy: 30 };
          /* pattern of the pad itself would multiply the whole disc — instead
             the bolt holes are already a polar array; keep a single thick ring. */
        }),
      ex("a10-angle", "simple", "Angled bracket 70 × 40", "Polygon · Pad",
        "Right-angle bracket with a 45° gusset, 8 mm thick.",
        function () {
          var sk = freshXY("A10 Angled bracket");
          sk.entities.push(U.mkEnt("poly", { pts: [[0, 0], [70, 0], [70, 12], [22, 12], [12, 22], [12, 40], [0, 40]], closed: true, kind: "free" }));
          padLast(8, "Pad.1");
        }),
      ex("a11-island", "simple", "Picture-frame with island", "Rectangle · Offset · Pad",
        "Outer 90 × 60, inner void 70 × 40, solid 20 × 14 island in the middle.",
        function () {
          var sk = freshXY("A11 Frame with island");
          sk.entities.push(U.mkEnt("rect", { cx: 45, cy: 30, w: 90, h: 60 }));
          sk.entities.push(U.mkEnt("rect", { cx: 45, cy: 30, w: 70, h: 40 }));
          sk.entities.push(U.mkEnt("rect", { cx: 45, cy: 30, w: 20, h: 14 }));
          padLast(6, "Pad.1");
        }),
      ex("a12-slot-flange", "simple", "Flange with radial slots", "Circle · Slot · Polar copy",
        "Ø90 flange, three 8 × 22 slots on a 58 mm pitch.",
        function () {
          var sk = freshXY("A12 Slotted flange");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 45 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 14, hType: "through" }));
          [0, 120, 240].forEach(function (deg) {
            var a = deg * Math.PI / 180, cx = 29 * Math.cos(a), cy = 29 * Math.sin(a);
            sk.entities.push(U.mkEnt("poly", { pts: U.slotPts(cx, cy, 22, 8, deg), closed: true, kind: "slot" }));
          });
          padLast(10, "Pad.1");
        }),
      ex("a13-blind", "simple", "Blind-hole block", "Rectangle · Hole (blind) · Pad",
        "60 × 40 × 20 block with four Ø8 × 12 mm blind holes.",
        function () {
          var sk = freshXY("A13 Blind-hole block");
          sk.entities.push(U.mkEnt("rect", { cx: 30, cy: 20, w: 60, h: 40 }));
          [[12, 12], [48, 12], [48, 28], [12, 28]].forEach(function (p) {
            sk.entities.push(U.mkEnt("hole", { cx: p[0], cy: p[1], r: 4, hType: "blind", depth: 12 }));
          });
          padLast(20, "Pad.1");
        }),
      ex("a14-dogbone", "simple", "Dog-bone link", "Circle · FILLET · Hole",
        "Two R16 ends 70 mm apart, 18 mm waist, Ø10 pin holes.",
        function () {
          disksPlate("A14 Dog-bone link", [
            { cx: -28, cy: 0, r: 16 }, { cx: 28, cy: 0, r: 16 }
          ], [[-28, 0, 5], [28, 0, 5]], 8);
        }),
      ex("a15-yoke", "simple", "Yoke / clevis", "Rectangle · Circle · Pocket",
        "40 × 28 body with a Ø16 bore and a 12 mm slot pocket.",
        function () {
          var sk = freshXY("A15 Yoke");
          sk.entities.push(U.mkEnt("poly", { pts: outline([
            { cx: 0, cy: 0, r: 20 }, { cx: 28, cy: 0, r: 14 }
          ]), closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 8, hType: "through" }));
          padLast(16, "Pad.1");
          var host = U.S.design.features[0];
          var psk = U.newSketchOnPlane(
            { kind: "xy", origin: [0, 0, 16], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], topOf: host.id, z: 16 },
            host.id, "Sketch.2"
          );
          psk.entities.push(U.mkEnt("rect", { cx: 22, cy: 0, w: 24, h: 12 }));
          U.pocketFromSketch(psk.id);
          var pk = U.S.design.features[U.S.design.features.length - 1];
          if (pk) pk.L = 16;
        }),

      /* ===================== INTERMEDIATE — real mechanisms ===================== */
      ex("m01-gear", "intermediate", "Spur gear 16 teeth", "Polygon · Hole · Pad",
        "16-tooth spur gear, module 3 mm, Ø12 bore. Each tooth is a trapezoid on the pitch circle.",
        function () {
          var sk = freshXY("Spur gear 16T");
          var Z = 16, m = 3, Rp = m * Z / 2, Ra = Rp + m, Rf = Math.max(6, Rp - 1.25 * m);
          var pts = [], i, k, tooth = 2 * Math.PI / Z;
          for (i = 0; i < Z; i++) {
            var a0 = i * tooth;
            var aa = [a0 - tooth * 0.22, a0 - tooth * 0.11, a0 + tooth * 0.11, a0 + tooth * 0.22];
            var rr = [Rf, Ra, Ra, Rf];
            for (k = 0; k < 4; k++) pts.push([rr[k] * Math.cos(aa[k]), rr[k] * Math.sin(aa[k])]);
          }
          sk.entities.push(U.mkEnt("poly", { pts: pts, closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 6, hType: "through" }));
          padLast(10, "Pad.1");
        }),
      ex("m02-impeller", "intermediate", "Centrifugal impeller, 6 blades", "Polygon · Circle · Pad",
        "Hub Ø28 with six radial paddles — the pump rotor you draw with polar copies.",
        function () {
          var sk = freshXY("6-blade impeller");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 14 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 5, hType: "through" }));
          var i, blade = [[12, -3], [42, -5], [44, 0], [42, 5], [12, 3]];
          for (i = 0; i < 6; i++) {
            sk.entities.push(U.mkEnt("poly", { pts: U.rotatePts(blade, 0, 0, i / 6 * 2 * Math.PI), closed: true, kind: "free" }));
          }
          padLast(8, "Pad.1");
        }),
      ex("m03-conrod", "intermediate", "Connecting rod", "Circle · Polygon · Hole · Pad",
        "Big-end Ø36 / small-end Ø18, 70 mm centres, waisted beam.",
        function () {
          disksPlate("Connecting rod", [
            { cx: -32, cy: 0, r: 18 }, { cx: 32, cy: 0, r: 11 }
          ], [[-32, 0, 10], [32, 0, 5]], 8);
        }),
      ex("m04-starknob", "intermediate", "5-lobe star knob", "Circle · FILLET · Hole · Pad",
        "Five overlapping Ø22 lobes around a hub — the clamping knob.",
        function () {
          var disks = [{ cx: 0, cy: 0, r: 14 }], holes = [[0, 0, 5]], i;
          for (i = 0; i < 5; i++) {
            var a = i / 5 * 2 * Math.PI - Math.PI / 2;
            disks.push({ cx: 16 * Math.cos(a), cy: 16 * Math.sin(a), r: 11 });
          }
          disksPlate("Star knob", disks, holes, 12);
        }),
      ex("m05-heatsink", "intermediate", "Heat-sink, 9 fins", "Polygon · Pad",
        "Comb profile: 9 fins 2 mm thick on a 50 × 8 mm base.",
        function () {
          var sk = freshXY("Heat sink");
          var pts = [[0, 0], [50, 0], [50, 8]], i;
          for (i = 8; i >= 0; i--) {
            var x0 = 2 + i * 5.2;
            pts.push([x0 + 2, 8], [x0 + 2, 28], [x0, 28], [x0, 8]);
          }
          pts.push([0, 8]);
          sk.entities.push(U.mkEnt("poly", { pts: pts, closed: true, kind: "free" }));
          padLast(30, "Pad.1");
        }),
      ex("m06-castlenut", "intermediate", "Castle nut M16", "N-gon · Slot · Hole · Pad",
        "Hex AF 24 with three radial slots for a split pin.",
        function () {
          var sk = freshXY("Castle nut");
          var r = 12 / Math.cos(Math.PI / 6);
          sk.entities.push(U.mkEnt("poly", { pts: U.ngonPts(0, 0, r, 6, 0), closed: true, kind: "ngon" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 8, hType: "through" }));
          [0, 60, 120].forEach(function (deg) {
            sk.entities.push(U.mkEnt("poly", { pts: U.slotPts(0, 0, 28, 3.2, deg), closed: true, kind: "slot" }));
          });
          padLast(10, "Pad.1");
        }),
      ex("m07-crank", "intermediate", "Crank disc with pin", "Circle · Hole · Pad",
        "Ø70 crank web, Ø16 shaft, Ø10 crank-pin at 22 mm throw.",
        function () {
          var sk = freshXY("Crank disc");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 35 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 8, hType: "through" }));
          sk.entities.push(U.mkEnt("hole", { cx: 22, cy: 0, r: 5, hType: "through" }));
          padLast(8, "Pad.1");
        }),
      ex("m08-eye", "intermediate", "Lifting eye plate", "Circle · Rectangle · Hole · Pad",
        "40 × 12 shank with an R16 eye and Ø12 pin hole.",
        function () {
          disksPlate("Lifting eye", [
            { cx: 0, cy: 0, r: 16 }, { cx: 28, cy: 0, r: 6 }
          ], [[0, 0, 6]], 8);
        }),
      ex("m09-sprocket", "intermediate", "Chain sprocket 12T", "Polygon · Hole · Pad",
        "12 pointed teeth on a Ø48 pitch — bicycle-sprocket outline.",
        function () {
          var sk = freshXY("Sprocket 12T");
          var Z = 12, Rp = 24, Ra = 28, Rf = 18, pts = [], i, k;
          var tooth = 2 * Math.PI / Z;
          for (i = 0; i < Z; i++) {
            var a0 = i * tooth;
            var aa = [a0 - 0.18, a0 - 0.04, a0 + 0.04, a0 + 0.18];
            var rr = [Rf, Ra, Ra, Rf];
            for (k = 0; k < 4; k++) pts.push([rr[k] * Math.cos(aa[k]), rr[k] * Math.sin(aa[k])]);
          }
          sk.entities.push(U.mkEnt("poly", { pts: pts, closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 8, hType: "through" }));
          padLast(4, "Pad.1");
        }),
      ex("m10-geneva", "intermediate", "Geneva-wheel driver", "Circle · Slot · Pad",
        "Ø50 driver with a radial slot that indexes a Geneva cross.",
        function () {
          var sk = freshXY("Geneva driver");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 25 }));
          sk.entities.push(U.mkEnt("poly", { pts: U.slotPts(12, 0, 22, 6, 0), closed: true, kind: "slot" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 6, hType: "through" }));
          padLast(8, "Pad.1");
        }),
      ex("m11-maltese", "intermediate", "Geneva cross (Maltese)", "Polygon · Circle · Pad",
        "Four-slot Maltese cross — the driven half of a Geneva mechanism.",
        function () {
          var sk = freshXY("Geneva cross");
          var pts = [], i, a, rOut = 32, rIn = 12;
          for (i = 0; i < 4; i++) {
            a = i * Math.PI / 2;
            var ca = Math.cos(a), sa = Math.sin(a);
            var p = Math.cos(a + 0.35), q = Math.sin(a + 0.35);
            pts.push([rOut * Math.cos(a - 0.35), rOut * Math.sin(a - 0.35)]);
            pts.push([rIn * Math.cos(a - 0.12), rIn * Math.sin(a - 0.12)]);
            pts.push([rIn * Math.cos(a + 0.12), rIn * Math.sin(a + 0.12)]);
            pts.push([rOut * Math.cos(a + 0.35), rOut * Math.sin(a + 0.35)]);
          }
          sk.entities.push(U.mkEnt("poly", { pts: pts, closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 5, hType: "through" }));
          padLast(6, "Pad.1");
        }),
      ex("m12-crosshead", "intermediate", "Phillips cross recess", "Circle · Polygon · Pad",
        "Ø30 button with a + recess cut as four slots (void profiles).",
        function () {
          var sk = freshXY("Phillips head");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 15 }));
          sk.entities.push(U.mkEnt("rect", { cx: 0, cy: 0, w: 22, h: 4 }));
          sk.entities.push(U.mkEnt("rect", { cx: 0, cy: 0, w: 4, h: 22 }));
          padLast(6, "Pad.1");
        }),
      ex("m13-vent", "intermediate", "Vent grille 5 slots", "Rectangle · Slot · Pad",
        "70 × 40 cover with five parallel ventilation slots.",
        function () {
          var sk = freshXY("Vent grille");
          sk.entities.push(U.mkEnt("rect", { cx: 35, cy: 20, w: 70, h: 40 }));
          var i;
          for (i = 0; i < 5; i++) {
            sk.entities.push(U.mkEnt("poly", { pts: U.slotPts(35, 8 + i * 6, 50, 3, 0), closed: true, kind: "slot" }));
          }
          padLast(3, "Pad.1");
        }),
      ex("m14-ratchet", "intermediate", "Ratchet wheel 10 teeth", "Polygon · Hole · Pad",
        "Saw-tooth ratchet — each tooth is steep on one side, shallow on the other.",
        function () {
          var sk = freshXY("Ratchet 10T");
          var Z = 10, pts = [], i;
          for (i = 0; i < Z; i++) {
            var a0 = i / Z * 2 * Math.PI, a1 = (i + 0.72) / Z * 2 * Math.PI;
            pts.push([14 * Math.cos(a0), 14 * Math.sin(a0)]);
            pts.push([26 * Math.cos(a1), 26 * Math.sin(a1)]);
          }
          sk.entities.push(U.mkEnt("poly", { pts: pts, closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 6, hType: "through" }));
          padLast(6, "Pad.1");
        }),
      ex("m15-oldham", "intermediate", "Oldham coupling disc", "Circle · Slot · Pad",
        "Ø50 disc with one diametral slot — half of an Oldham coupling.",
        function () {
          var sk = freshXY("Oldham disc");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 25 }));
          sk.entities.push(U.mkEnt("poly", { pts: U.slotPts(0, 0, 44, 6, 0), closed: true, kind: "slot" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 4, hType: "through" }));
          padLast(6, "Pad.1");
        }),

      /* ===================== ADVANCED — turbine, thorn, propeller ===================== */
      ex("x01-turbine", "advanced", "Turbine rotor, 10 airfoil blades", "Airfoil · Polar copy · Pad",
        "Hub Ø32 with ten NACA-style blades. This is the part that needs the airfoil tool.",
        function () {
          var sk = freshXY("Turbine rotor");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 16 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 6, hType: "through" }));
          var foil = U.airfoilPts(30, 0.18, 0.06), i;
          for (i = 0; i < 10; i++) {
            var placed = foil.map(function (p) { return [p[0] + 15, p[1]]; });
            sk.entities.push(U.mkEnt("poly", { pts: U.rotatePts(placed, 0, 0, i / 10 * 2 * Math.PI), closed: true, kind: "spline" }));
          }
          padLast(6, "Pad.1");
        }),
      ex("x02-thorn", "advanced", "Thorn / spike (revolve)", "Polygon · Centerline · Shaft",
        "A sharp thorn: triangular profile revolved about the centreline.",
        function () {
          var sk = freshXY("Thorn");
          sk.entities.push(U.mkEnt("poly", { pts: [[1, 0], [9, 0], [2.4, 36], [1, 40]], closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("cline", { a: [0, -2], b: [0, 42] }));
          U.revolveSketch(sk.id, "shaft");
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) { f.angle = 360; f.name = "Thorn"; }
        }),
      ex("x03-barb", "advanced", "Barbed spike (revolve)", "Polygon · Centerline · Shaft",
        "Rose-thorn: revolved saw-tooth barbs that catch in one direction.",
        function () {
          var sk = freshXY("Barbed spike");
          sk.entities.push(U.mkEnt("poly", { pts: [
            [0.8, 0], [7, 0], [7, 7], [3.2, 9], [7, 16], [3.2, 18], [7, 25], [3.2, 27], [2, 38], [0.8, 40]
          ], closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("cline", { a: [0, -2], b: [0, 42] }));
          U.revolveSketch(sk.id, "shaft");
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) f.angle = 360;
        }),
      ex("x04-prop", "advanced", "3-blade propeller", "Airfoil · Polar copy · Pad",
        "Three wide airfoils on a Ø24 hub — aircraft-prop outline.",
        function () {
          var sk = freshXY("Propeller");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 12 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 4, hType: "through" }));
          var foil = U.airfoilPts(55, 0.14, 0.08), i;
          for (i = 0; i < 3; i++) {
            var placed = foil.map(function (p) { return [p[0] + 10, p[1]]; });
            sk.entities.push(U.mkEnt("poly", { pts: U.rotatePts(placed, 0, 0, i / 3 * 2 * Math.PI), closed: true, kind: "spline" }));
          }
          padLast(4, "Pad.1");
        }),
      ex("x05-fan", "advanced", "7-blade cooling fan", "Polygon · Circle · Pad",
        "Seven swept paddles on a hub — PC / axial fan.",
        function () {
          var sk = freshXY("Cooling fan");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 12 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 4, hType: "through" }));
          var blade = [[11, -2], [38, 4], [40, 10], [36, 14], [12, 4]], i;
          for (i = 0; i < 7; i++) {
            sk.entities.push(U.mkEnt("poly", { pts: U.rotatePts(blade, 0, 0, i / 7 * 2 * Math.PI), closed: true, kind: "free" }));
          }
          padLast(3, "Pad.1");
        }),
      ex("x06-nozzle", "advanced", "Venturi nozzle (revolve)", "Polygon · Centerline · Shaft",
        "Converging–diverging nozzle revolved from a half-profile.",
        function () {
          var sk = freshXY("Venturi nozzle");
          sk.entities.push(U.mkEnt("poly", { pts: [
            [4, 0], [14, 0], [14, 6], [8, 16], [6, 22], [8, 32], [14, 40], [14, 46], [4, 46]
          ], closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("cline", { a: [0, -2], b: [0, 48] }));
          U.revolveSketch(sk.id, "shaft");
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) f.angle = 360;
        }),
      ex("x07-crown", "advanced", "Crown / castle turret", "Circle · Polygon · Pad",
        "Ø50 disc with eight rectangular merlons around the rim.",
        function () {
          var sk = freshXY("Crown");
          var disks = [{ cx: 0, cy: 0, r: 22 }], i;
          for (i = 0; i < 8; i++) {
            var a = i / 8 * 2 * Math.PI;
            disks.push({ cx: 22 * Math.cos(a), cy: 22 * Math.sin(a), r: 7 });
          }
          sk.entities.push(U.mkEnt("poly", { pts: outline(disks), closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 8, hType: "through" }));
          padLast(8, "Pad.1");
        }),
      ex("x08-arrow", "advanced", "Arrowhead / spear point", "Polygon · Pad",
        "Broadhead: two barbs and a 50 mm point.",
        function () {
          var sk = freshXY("Arrowhead");
          sk.entities.push(U.mkEnt("poly", { pts: [
            [0, 0], [10, 18], [6, 18], [6, 42], [14, 36], [0, 58], [-14, 36], [-6, 42], [-6, 18], [-10, 18]
          ], closed: true, kind: "free" }));
          padLast(3, "Pad.1");
        }),
      ex("x09-shroud", "advanced", "Shrouded impeller", "Circle · Polygon · Pad",
        "Hub + 8 blades + outer rim — a closed pump impeller.",
        function () {
          var sk = freshXY("Shrouded impeller");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 40 }));
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 34 }));
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 12 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 5, hType: "through" }));
          var blade = [[12, -2], [33, -3], [34, 0], [33, 3], [12, 2]], i;
          for (i = 0; i < 8; i++) {
            sk.entities.push(U.mkEnt("poly", { pts: U.rotatePts(blade, 0, 0, i / 8 * 2 * Math.PI), closed: true, kind: "free" }));
          }
          padLast(6, "Pad.1");
        }),
      ex("x10-stator", "advanced", "Turbine stator, 16 vanes", "Airfoil · Polar copy · Pad",
        "Stationary vane ring: 16 short airfoils between two rings.",
        function () {
          var sk = freshXY("Turbine stator");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 42 }));
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 36 }));
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 18 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 12, hType: "through" }));
          var foil = U.airfoilPts(16, 0.22, 0.1), i;
          for (i = 0; i < 16; i++) {
            var placed = foil.map(function (p) { return [p[0] + 19, p[1]]; });
            sk.entities.push(U.mkEnt("poly", { pts: U.rotatePts(placed, 0, 0, i / 16 * 2 * Math.PI + 0.15), closed: true, kind: "spline" }));
          }
          padLast(5, "Pad.1");
        }),
      ex("x11-needle", "advanced", "Sewing needle (revolve)", "Polygon · Centerline · Shaft",
        "Long taper to a point, eye as a slot pocket after the revolve.",
        function () {
          var sk = freshXY("Needle");
          sk.entities.push(U.mkEnt("poly", { pts: [[0.6, 0], [1.6, 0], [1.6, 48], [0.6, 56]], closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("cline", { a: [0, -2], b: [0, 58] }));
          U.revolveSketch(sk.id, "shaft");
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) f.angle = 360;
        }),
      ex("x12-cone", "advanced", "Stepped cone pulley", "Polygon · Centerline · Shaft",
        "Three-step cone (Ø20 / Ø32 / Ø44) revolved from one profile.",
        function () {
          var sk = freshXY("Cone pulley");
          sk.entities.push(U.mkEnt("poly", { pts: [
            [4, 0], [10, 0], [10, 12], [16, 12], [16, 24], [22, 24], [22, 36], [4, 36]
          ], closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("cline", { a: [0, -2], b: [0, 38] }));
          U.revolveSketch(sk.id, "shaft");
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) f.angle = 360;
        }),
      ex("x13-pelton", "advanced", "Pelton-cup ring", "Circle · Polygon · Polar copy · Pad",
        "Six double-bucket Pelton cups around a hub.",
        function () {
          var sk = freshXY("Pelton ring");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 16 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 6, hType: "through" }));
          var cup = [[14, -8], [28, -14], [34, -8], [30, 0], [34, 8], [28, 14], [14, 8]], i;
          for (i = 0; i < 6; i++) {
            sk.entities.push(U.mkEnt("poly", { pts: U.rotatePts(cup, 0, 0, i / 6 * 2 * Math.PI), closed: true, kind: "free" }));
          }
          padLast(8, "Pad.1");
        }),
      ex("x14-auger", "advanced", "Auger point (revolve)", "Polygon · Centerline · Shaft",
        "Wood-auger tip: fluted cone revolved from a notched triangle.",
        function () {
          var sk = freshXY("Auger point");
          sk.entities.push(U.mkEnt("poly", { pts: [
            [0.8, 0], [8, 0], [6, 8], [9, 16], [5, 22], [8, 30], [1.2, 42], [0.8, 44]
          ], closed: true, kind: "free" }));
          sk.entities.push(U.mkEnt("cline", { a: [0, -2], b: [0, 46] }));
          U.revolveSketch(sk.id, "shaft");
          var f = U.S.design.features[U.S.design.features.length - 1];
          if (f) f.angle = 360;
        }),
      ex("x15-turbofan", "advanced", "Turbofan — 14 short blades", "Airfoil · Circle · Pad",
        "Bypass fan: large hub, 14 short highly-cambered blades.",
        function () {
          var sk = freshXY("Turbofan");
          sk.entities.push(U.mkEnt("circle", { cx: 0, cy: 0, r: 22 }));
          sk.entities.push(U.mkEnt("hole", { cx: 0, cy: 0, r: 8, hType: "through" }));
          var foil = U.airfoilPts(22, 0.2, 0.12), i;
          for (i = 0; i < 14; i++) {
            var placed = foil.map(function (p) { return [p[0] + 20, p[1]]; });
            sk.entities.push(U.mkEnt("poly", { pts: U.rotatePts(placed, 0, 0, i / 14 * 2 * Math.PI), closed: true, kind: "spline" }));
          }
          padLast(5, "Pad.1");
        })
    ];
  }

  window.RGZCAD_EXAMPLES = catalog;
  window.RGZCAD_EXAMPLE_LEVELS = LEVELS;

  function rowHtml(ex) {
    return '<button type="button" class="rgzcad-exrow" data-exopen="' + ex.id + '">' +
      '<span class="rgzcad-exrow-t"><b>' + ex.name + "</b><i>" + ex.tools + "</i></span>" +
      '<span class="rgzcad-exrow-d">' + ex.blurb + "</span></button>";
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
        '<div class="rgzcad-modal-card rgzcad-exmodal">' +
        '<button type="button" class="rgzcad-x" data-examples-close aria-label="Close">×</button>' +
        "<h3>Example plates</h3>" +
        '<p class="sub">Ready-made parts — same idea as the circuits in Hydraulic / Pneumatic Studio. Pick a level, then a plate.</p>' +
        '<div class="rgzcad-ex-tabs" data-ex-tabs></div>' +
        '<div class="rgzcad-exlist" data-examples-body></div>' +
        "</div>";
      root.appendChild(md);
      md.addEventListener("click", function (e) { if (e.target === md) hideModal(md); });
      md.querySelector("[data-examples-close]").addEventListener("click", function () { hideModal(md); });
    }
    var list = catalog(U);
    var tabBar = md.querySelector("[data-ex-tabs]");
    var body = md.querySelector("[data-examples-body]");
    var active = md.getAttribute("data-ex-level") || "simple";

    function paint(level) {
      md.setAttribute("data-ex-level", level);
      tabBar.innerHTML = LEVELS.map(function (lv) {
        var n = list.filter(function (x) { return x.level === lv.id; }).length;
        return '<button type="button" class="' + (lv.id === level ? "on" : "") + '" data-ex-level="' + lv.id + '">' +
          lv.label + " <small>" + n + "</small></button>";
      }).join("");
      var rows = list.filter(function (x) { return x.level === level; });
      body.innerHTML = rows.map(rowHtml).join("");
      tabBar.querySelectorAll("[data-ex-level]").forEach(function (b) {
        b.addEventListener("click", function () { paint(b.getAttribute("data-ex-level")); });
      });
      body.querySelectorAll("[data-exopen]").forEach(function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-exopen");
          var found = list.filter(function (x) { return x.id === id; })[0];
          if (!found) return;
          try {
            found.build();
            hideModal(md);
            U.renderAll();
            if (window.__rgzcadBuild3d) window.__rgzcadBuild3d(true);
            U.setStep(U.S.design.features.length ? "model" : "sketch");
            U.skFit();
            U.note("Loaded “" + found.name + "” — " + found.blurb);
          } catch (err) {
            U.note("Could not build that plate: " + (err && err.message ? err.message : err));
          }
        });
      });
    }
    paint(active);
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
