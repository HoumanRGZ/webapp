/* ============================================================
   RGZ 3D CAD Studio — part 1 (v3 "feature tree" edition)
   Shared core: parametric model (sketches + feature tree),
   2D sketcher with multi-entity sketches, select tool,
   specification tree + properties panels, undo history.
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- tiny helpers ---------------- */
  function qs(r, s) { return r ? r.querySelector(s) : null; }
  function qsa(r, s) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function num(v, d) { v = parseFloat(v); return isFinite(v) ? v : d; }
  function fmt(v, dec) {
    dec = dec == null ? 2 : dec;
    if (!isFinite(v)) { return "0"; }
    var p = Math.pow(10, dec), r = Math.round(v * p) / p;
    var s = String(r);
    if (s.indexOf("e") !== -1) { s = r.toFixed(dec); }
    if (dec > 0 && s.indexOf(".") === -1) { s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
    return s;
  }
  var UID = 1;
  function uid(p) { return (p || "e") + (UID++) + "" + Math.floor(Math.random() * 1e4).toString(36); }

  /* ---------------- shared state ---------------- */
  var STEPS = [
    { id: "sketch", t: "Sketch" },
    { id: "model", t: "3D Features" },
    { id: "drawing", t: "ISO Drawing" }
  ];

  var MATS = {
    steel:   { label: "Steel S235",        color: 0xaab3bf, density: 7.85,  metal: 0.9,  rough: 0.35 },
    alu:     { label: "Aluminium 6082",    color: 0xd7dce3, density: 2.70,  metal: 0.85, rough: 0.42 },
    brass:   { label: "Brass CW614N",      color: 0xc9a24b, density: 8.50,  metal: 0.95, rough: 0.30 },
    copper:  { label: "Copper",            color: 0xc0693a, density: 8.96,  metal: 0.95, rough: 0.28 },
    plastic: { label: "POM (Delrin)",      color: 0xeef1f4, density: 1.41,  metal: 0.05, rough: 0.70 },
    print:   { label: "3D print PLA",      color: 0xe0664f, density: 1.24,  metal: 0.0,  rough: 0.85 }
  };

  var S = {
    step: "sketch",
    design: null,
    mode: "select",           /* select | rect | circle | poly | ngon | arc | slot | ellipse | spline | hole | cline */
    snap: true,
    selEnt: null,             /* selected entity id in active sketch (2D) */
    selFeat: null,            /* selected feature id (3D) */
    vertexMode: false,        /* editing polygon vertices of selEnt */
    armed3d: null,            /* null | 'facesketch' | 'holeface' */
    cam: { x: 0, y: 0, z: 1.35 },  /* 2D view */
    panelCtx: "part",         /* part | sketch | entity | feature | drawing */
    trimFirst: null,          /* armed trim: first line id */
    offEnt: null              /* armed offset: entity being offset */
  };
  S.step = "plane";           /* CATIA-style: the app STARTS in 3D with datum planes */

  /* ---------------- model v2 ---------------- */
  function basePlane() { return { kind: "xy", origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }; }

  function defaultDesign() {
    /* CATIA-style: the tree starts EMPTY — no default sketch.
       The user picks a datum plane in the 3D view; the sketch is then added. */
    return {
      v: 2, name: "Untitled part", units: "mm", serverId: null,
      sketches: [],
      features: [],
      activeSketch: null,
      material: "steel",
      mirror: { on: false, plane: "yz" },
      draw: fillDraw(null)
    };
  }

  /* drawing-sheet config with CATIA/ISO view selection (first-angle default set:
     FRONT + TOP + RIGHT + 3D — every view individually switchable) */
  function fillDraw(dr) {
    dr = dr || {};
    var defViews = { front: true, top: true, right: true, back: false, bottom: false, left: false, iso: true };
    var inV = dr.views || {}, views = {};
    Object.keys(defViews).forEach(function (k) { views[k] = (inV[k] === undefined) ? defViews[k] : !!inV[k]; });
    return {
      hidden: dr.hidden !== false, center: dr.center !== false, tolOn: dr.tolOn !== false,
      general: dr.general || "mK", scale: dr.scale || "auto", views: views
    };
  }

  /* migrate v1 designs (single outer + holes + pockets) into v2 trees */
  function migrate1to2(d) {
    var D = defaultDesign();
    D.name = d.name || D.name;
    D.material = d.material || "steel";
    D.draw = fillDraw(d.draw);
    var sk = { id: "sk1", name: "Sketch.1", plane: basePlane(), host: null, entities: [] };
    D.sketches.push(sk);
    D.activeSketch = sk.id;
    var L = num(d.pad && d.pad.L, 40);
    if (d.outer) {
      var o = d.outer;
      if (o.type === "rect") { sk.entities.push(mkEnt("rect", { cx: o.cx, cy: o.cy, w: o.w, h: o.h, tol: o.tol })); }
      else if (o.type === "circle") { sk.entities.push(mkEnt("circle", { cx: o.cx, cy: o.cy, r: o.r, tol: o.tol })); }
      else if (o.type === "poly" && o.pts) { sk.entities.push(mkEnt("poly", { pts: o.pts, closed: true, tol: o.tol })); }
    }
    (d.holes || []).forEach(function (h) {
      sk.entities.push(mkEnt("hole", {
        cx: h.cx, cy: h.cy, r: h.r, hType: h.type || "through", depth: h.depth,
        cbd: h.cbd, cbdDepth: h.cbdDepth, csAngle: h.csAngle, tol: h.tol
      }));
    });
    D.features.push({
      id: "f1", type: "pad", name: "Pad.1", sketchId: sk.id, L: L, dir: 1,
      edge: d.chamfer && d.chamfer.on ? { style: "chamfer", size: num(d.chamfer.t, 1) } : { style: "none", size: 1 },
      tol: (d.pad && d.pad.tol) || { on: false, plus: 0, minus: 0 }
    });
    /* old rectangular pockets → real pocket features with their own sketch on pad top */
    (d.pockets || []).forEach(function (pk, i) {
      var psk = { id: uid("sk"), name: "Sketch." + (D.sketches.length + 1),
        plane: { kind: "xy", origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], topOf: "f1", z: L },
        host: "f1", entities: [mkEnt("rect", { cx: pk.cx, cy: pk.cy, w: pk.w, h: pk.h })] };
      psk.plane.origin[2] = L;
      D.sketches.push(psk);
      D.features.push({ id: uid("f"), type: "pocket", name: "Pocket." + (i + 1), sketchId: psk.id, L: pk.depth || 5, dir: -1, edge: { style: "none", size: 1 }, tol: { on: false, plus: 0, minus: 0 } });
    });
    return D;
  }

  function normalizeDesign(d) {
    if (!d || typeof d !== "object") { return defaultDesign(); }
    if (d.v !== 2) { return migrate1to2(d); }
    var D = defaultDesign();
    var k;
    for (k in d) { if (Object.prototype.hasOwnProperty.call(d, k)) { D[k] = d[k]; } }
    D.sketches = (d.sketches || []).map(function (sk) {
      return {
        id: sk.id, name: sk.name || "Sketch", plane: sk.plane || basePlane(), host: sk.host || null,
        entities: (sk.entities || []).map(normalizeEnt).filter(Boolean)
      };
    });
    D.features = (d.features || []).map(function (f) {
      var t = f.type;
      if (["pad", "pocket", "shaft", "groove", "rib"].indexOf(t) === -1) { t = "pad"; }
      var revolve = t === "shaft" || t === "groove";
      var o = {
        id: f.id, type: t, name: f.name || (t.charAt(0).toUpperCase() + t.slice(1)),
        sketchId: f.sketchId, L: clamp(num(f.L, revolve ? 0 : 10), revolve ? 0 : 0.2, 5000), dir: f.dir === -1 ? -1 : 1,
        edge: (f.edge && f.edge.style ? f.edge : { style: "none", size: 1 }),
        tol: f.tol || { on: false, plus: 0, minus: 0 },
        pattern: (f.pattern && f.pattern.mode) ? f.pattern : mkPattern(),
        draftDeg: clamp(num(f.draftDeg, 0), 0, 30),
        shellT: clamp(num(f.shellT, 0), 0, 500),
        angle: clamp(num(f.angle, 360), 1, 360),
        axisX: num(f.axisX, 0),
        t: clamp(num(f.t, 4), 0.1, 200),
        edgeOps: (f.edgeOps || []).map(function (o2) {
          return { style: o2.style === "chamfer" ? "chamfer" : "fillet", ring: o2.ring | 0, vi: o2.vi | 0, r: num(o2.r, 3), d: num(o2.d, 2), ang: num(o2.ang, Math.PI / 2) };
        })
      };
      return o;
    });
    D.mirror = (d.mirror && d.mirror.on) ? { on: true, plane: d.mirror.plane === "xz" ? "xz" : "yz" } : { on: false, plane: "yz" };
    D.activeSketch = D.sketches.some(function (s) { return s.id === d.activeSketch; }) ? d.activeSketch : (D.sketches[0] ? D.sketches[0].id : null);
    D.draw = fillDraw(d.draw);
    return D;
  }

  /* ---------------- entities ---------------- */
  function mkEnt(type, p) {
    p = p || {};
    var e = { id: uid("e"), type: type, role: "profile", label: "" };
    if (type === "rect") { e.cx = num(p.cx, 30); e.cy = num(p.cy, 20); e.w = num(p.w, 20); e.h = num(p.h, 12); e.tol = p.tol || mkTolPair(); }
    else if (type === "circle") { e.cx = num(p.cx, 20); e.cy = num(p.cy, 20); e.r = num(p.r, 8); e.tol = p.tol || { d: mkTol() }; }
    else if (type === "poly") { e.pts = (p.pts || []).map(function (q) { return [num(q[0], 0), num(q[1], 0)]; }); e.closed = !!p.closed; e.kind = p.kind || "free"; e.meta = p.meta || null; e.tol = p.tol || mkTolPair(); }
    else if (type === "hole") { e.role = "hole"; e.cx = num(p.cx, 10); e.cy = num(p.cy, 10); e.r = num(p.r, 5); e.hType = p.hType || "through"; e.depth = num(p.depth, 10); e.cbd = num(p.cbd, 2 * e.r + 4); e.cbdDepth = num(p.cbdDepth, 3); e.csAngle = num(p.csAngle, 90); e.thread = p.thread || { on: false, pitch: stdPitch(2 * e.r) }; e.tol = p.tol || { d: mkTol() }; }
    else if (type === "cline") { e.role = "constr"; e.a = p.a ? [num(p.a[0], 0), num(p.a[1], 0)] : [0, 0]; e.b = p.b ? [num(p.b[0], 0), num(p.b[1], 0)] : [10, 10]; }
    else if (type === "line") { e.a = p.a ? [num(p.a[0], 0), num(p.a[1], 0)] : [0, 0]; e.b = p.b ? [num(p.b[0], 0), num(p.b[1], 0)] : [10, 0]; }
    else if (type === "point") { e.role = "constr"; e.cx = num(p.cx, 0); e.cy = num(p.cy, 0); }
    if (p.cons) { e.cons = true; }
    return e;
  }
  /* ISO 261 coarse pitch for a metric thread Ø (mm) */
  function stdPitch(d) {
    var tbl = [[3, 0.5], [4, 0.7], [5, 0.8], [6, 1], [8, 1.25], [10, 1.5], [12, 1.75], [16, 2], [20, 2.5], [24, 3], [30, 3.5], [36, 4]];
    var p = 4;
    for (var i = 0; i < tbl.length; i++) { if (d <= tbl[i][0] + 0.01) { p = tbl[i][1]; return p; } }
    return p;
  }
  function mkTol() { return { on: false, plus: 0.1, minus: 0.1 }; }
  function mkTolPair() { return { w: mkTol(), h: mkTol() }; }
  function normalizeEnt(e) {
    if (!e || !e.type) { return null; }
    var n = mkEnt(e.type, e);
    n.id = e.id || n.id; n.role = e.role || n.role; n.label = e.label || "";
    n.cons = !!e.cons;
    n.locked = !!e.locked;
    n.geo = (e.geo || []).map(function (g) { var o = { t: g.t, ref: g.ref || null, auto: !!g.auto }; if (g.edge != null) { o.edge = g.edge; } return o; });
    return n;
  }

  /* entity → closed 2D point loop (null for holes/clines/lines/points and for
     construction geometry — dashed reference entities are never part of a solid) */
  function entPts(e) {
    if (!e || e.role !== "profile" || e.cons) { return null; }
    if (e.type === "rect") { return [[e.cx - e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy + e.h / 2], [e.cx - e.w / 2, e.cy + e.h / 2]]; }
    if (e.type === "circle") {
      var pts = [], i, N = 28;
      for (i = 0; i < N; i++) { pts.push([e.cx + e.r * Math.cos(i / N * 2 * Math.PI), e.cy + e.r * Math.sin(i / N * 2 * Math.PI)]); }
      return pts;
    }
    if (e.type === "poly" && e.closed && e.pts.length >= 3) { return e.pts.slice(); }
    return null;
  }
  function polyArea(pts) {
    var a = 0, i, n = pts.length;
    for (i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
    return a / 2;
  }
  function bboxOf(pts) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  function pointInPoly(pts, x, y) {
    var inside = false, i, j;
    for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)) { inside = !inside; }
    }
    return inside;
  }

  /* nested-contour classification (CATIA rule): a closed profile drawn INSIDE
     another closed profile becomes a void; one more nesting level becomes a
     solid island again. depth = number of containing rings; even = solid. */
  function ringProbe(pts) {
    /* centroid of the first triangle fan — robustly inside for CAD polygons */
    var a = pts[0], b = pts[1], c = pts[2];
    return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
  }
  function classifyContours(profiles) {
    var items = [];
    (profiles || []).forEach(function (c) {
      if (!c || c.length < 3) { return; }
      var a = Math.abs(polyArea(c));
      if (a < 0.01) { return; }
      items.push({ pts: c, area: a, depth: 0, role: "solid", parent: -1 });
    });
    items.forEach(function (it, i) {
      var probe = ringProbe(it.pts), d = 0, best = -1, bestA = 1e18;
      items.forEach(function (o, j) {
        if (i === j || o.area <= it.area + 1e-9) { return; }
        if (pointInPoly(o.pts, probe[0], probe[1])) { d++; if (o.area < bestA) { bestA = o.area; best = j; } }
      });
      it.depth = d;
      it.role = (d % 2 === 0) ? "solid" : "hole";
      it.parent = best;
    });
    return items;
  }

  /* ngon / slot / ellipse helpers (used by tools) */
  function ngonPts(cx, cy, r, n, rot) {
    var pts = [], i;
    for (i = 0; i < n; i++) { var a = (rot || 0) + i / n * 2 * Math.PI - Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return pts;
  }
  function slotPts(cx, cy, len, w, angDeg) {
    var hw = w / 2, hl = len / 2 - hw, pts = [], a = (angDeg || 0) * Math.PI / 180, i;
    var ca = Math.cos(a), sa = Math.sin(a);
    function rot(x, y) { return [cx + x * ca - y * sa, cy + x * sa + y * ca]; }
    for (i = 0; i <= 10; i++) { var t = -Math.PI / 2 + i / 10 * Math.PI; pts.push(rot(hl + hw * Math.cos(t), hw * Math.sin(t))); }
    for (i = 0; i <= 10; i++) { var t2 = Math.PI / 2 + i / 10 * Math.PI; pts.push(rot(-hl + hw * Math.cos(t2), hw * Math.sin(t2))); }
    return pts;
  }
  function ellipsePts(cx, cy, rx, ry) {
    var pts = [], i, N = 36;
    for (i = 0; i < N; i++) { pts.push([cx + rx * Math.cos(i / N * 2 * Math.PI), cy + ry * Math.sin(i / N * 2 * Math.PI)]); }
    return pts;
  }
  function rotatePts(pts, cx, cy, ang) {
    var ca = Math.cos(ang), sa = Math.sin(ang);
    return (pts || []).map(function (p) {
      var dx = p[0] - cx, dy = p[1] - cy;
      return [cx + dx * ca - dy * sa, cy + dx * sa + dy * ca];
    });
  }
  /* NACA-style airfoil (closed). chord mm, t = max thickness as fraction (0.12 = 12%). */
  function airfoilPts(chord, t, camber) {
    chord = chord || 40; t = t == null ? 0.15 : t; camber = camber == null ? 0.04 : camber;
    var n = 22, pts = [], i, x, yt, yc;
    function thick(x) {
      return 5 * t * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
    }
    for (i = 0; i <= n; i++) {
      x = i / n; yt = thick(x) * chord; yc = 4 * camber * x * (1 - x) * chord;
      pts.push([x * chord, yc + yt]);
    }
    for (i = n - 1; i >= 1; i--) {
      x = i / n; yt = thick(x) * chord; yc = 4 * camber * x * (1 - x) * chord;
      pts.push([x * chord, yc - yt]);
    }
    return pts;
  }
  function arc3Pts(p1, p2, p3) {
    /* arc through 3 points → many points along the arc */
    var d = 2 * (p1[0] * (p2[1] - p3[1]) + p2[0] * (p3[1] - p1[1]) + p3[0] * (p1[1] - p2[1]));
    if (Math.abs(d) < 1e-9) { return [p1, p2, p3]; }
    var ux = ((p1[0] * p1[0] + p1[1] * p1[1]) * (p2[1] - p3[1]) + (p2[0] * p2[0] + p2[1] * p2[1]) * (p3[1] - p1[1]) + (p3[0] * p3[0] + p3[1] * p3[1]) * (p1[1] - p2[1])) / d;
    var uy = ((p1[0] * p1[0] + p1[1] * p1[1]) * (p3[0] - p2[0]) + (p2[0] * p2[0] + p2[1] * p2[1]) * (p1[0] - p3[0]) + (p3[0] * p3[0] + p3[1] * p3[1]) * (p2[0] - p1[0])) / d;
    var r = Math.hypot(p1[0] - ux, p1[1] - uy);
    var a1 = Math.atan2(p1[1] - uy, p1[0] - ux), a2 = Math.atan2(p2[1] - uy, p2[0] - ux), a3 = Math.atan2(p3[1] - uy, p3[0] - ux);
    function between(a, s, e, ccw) {
      if (ccw) { while (e < s) { e += 2 * Math.PI; } return a >= s && a <= e; }
      while (e > s) { e -= 2 * Math.PI; } return a <= s && a >= e;
    }
    var ccw = between(a2, a1, a3, true);
    var pts = [], N = 24, i, t;
    if (ccw) { var span = a3 - a1; while (span < 0) { span += 2 * Math.PI; } for (i = 0; i <= N; i++) { t = a1 + span * i / N; pts.push([ux + r * Math.cos(t), uy + r * Math.sin(t)]); } }
    else { var span2 = a1 - a3; while (span2 < 0) { span2 += 2 * Math.PI; } for (i = 0; i <= N; i++) { t = a1 - span2 * i / N; pts.push([ux + r * Math.cos(t), uy + r * Math.sin(t)]); } }
    return pts;
  }
  function catmullRom(pts, closed) {
    if (pts.length < 3) { return pts.slice(); }
    var out = [], i, j, SEG = 12;
    var P = pts.slice();
    for (i = 0; i < P.length - 1; i++) {
      var p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (j = 0; j < SEG; j++) {
        var t = j / SEG, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push(P[P.length - 1].slice());
    return out;
  }

  /* ---------------- lookups ---------------- */
  function D() { return S.design; }
  function sketch(id) {
    id = id || D().activeSketch;
    if (id) {
      for (var i = 0; i < D().sketches.length; i++) { if (D().sketches[i].id === id) { return D().sketches[i]; } }
    }
    return D().sketches.length ? D().sketches[0] : null;
  }
  function sketchById(id) { for (var i = 0; i < D().sketches.length; i++) { if (D().sketches[i].id === id) { return D().sketches[i]; } } return null; }
  function featureById(id) { for (var i = 0; i < D().features.length; i++) { if (D().features[i].id === id) { return D().features[i]; } } return null; }
  function entityById(sk, eid) { if (!sk) { return null; } var r = null; (sk.entities || []).forEach(function (e) { if (e.id === eid) { r = e; } }); return r; }
  function featureForSketch(skid) { for (var i = 0; i < D().features.length; i++) { if (D().features[i].sketchId === skid) { return D().features[i]; } } return null; }

  /* ------------------------------------------------------------------ */
  /* CATIA-grade sketch topology & operations (Update 17)                */
  /* ------------------------------------------------------------------ */

  /* open segments that can bound a profile: Line-tool segments + open
     polyline chains. Construction/centerline/hole geometry never bounds. */
  function chainSegments(sk) {
    var segs = [];
    (sk.entities || []).forEach(function (e) {
      if (e.cons || e.role === "constr" || e.role === "hole") { return; }
      if (e.type === "line") { segs.push([e.a, e.b]); }
      else if (e.type === "poly" && !e.closed && (e.pts || []).length >= 2) {
        for (var i = 0; i < e.pts.length - 1; i++) { segs.push([e.pts[i], e.pts[i + 1]]); }
      }
    });
    return segs;
  }

  /* Planar face extraction over the arrangement of open segments:
     endpoints within `tol` mm are stitched into shared nodes, then a
     half-edge walk (face kept on the left) finds the minimal CCW loops.
     Crossing-only segments are NOT auto-joined (same as CATIA: trim them
     first) — but a square drawn as four connected Line segments, or any
     connected mix of lines and open polyline chains, IS a closed
     profile and pads/pockets/revolves like any other. */
  function loopsFromChains(sk, tol) {
    tol = tol || 0.5;
    var nodes = [];
    function nodeAt(pp) {
      var i;
      for (i = 0; i < nodes.length; i++) {
        if (Math.hypot(nodes[i][0] - pp[0], nodes[i][1] - pp[1]) <= tol) { return i; }
      }
      nodes.push([pp[0], pp[1]]);
      return nodes.length - 1;
    }
    var edges = [];
    chainSegments(sk).forEach(function (sg) {
      if (Math.hypot(sg[1][0] - sg[0][0], sg[1][1] - sg[0][1]) < 1e-6) { return; }
      var a = nodeAt(sg[0]), b = nodeAt(sg[1]);
      if (a !== b) { edges.push([a, b]); }
    });
    if (!edges.length) { return []; }
    var adj = {};
    edges.forEach(function (ed, ei) {
      if (!adj[ed[0]]) { adj[ed[0]] = []; }
      if (!adj[ed[1]]) { adj[ed[1]] = []; }
      adj[ed[0]].push({ to: ed[1], edge: ei });
      adj[ed[1]].push({ to: ed[0], edge: ei });
    });
    Object.keys(adj).forEach(function (u) {
      adj[u].forEach(function (h) { h.ang = Math.atan2(nodes[h.to][1] - nodes[u][1], nodes[h.to][0] - nodes[u][0]); });
      adj[u].sort(function (x, y) { return x.ang - y.ang; });
    });
    function tkey(a2, b2) { return a2 + ">" + b2; }
    var visited = {}, loops = [];
    edges.forEach(function (ed) {
      [[ed[0], ed[1]], [ed[1], ed[0]]].forEach(function (dir) {
        if (visited[tkey(dir[0], dir[1])]) { return; }
        var startU = dir[0], startV = dir[1], u = startU, v = startV;
        var face = [startU], guard = 0, ok = false;
        while (guard++ < 400) {
          visited[tkey(u, v)] = true;
          face.push(v);
          var backAng = Math.atan2(nodes[u][1] - nodes[v][1], nodes[u][0] - nodes[v][0]); /* ray v -> u */
          var cand = adj[v] || [], best = null, bestTurn = 1e9;
          cand.forEach(function (h) {
            /* keep the face on the LEFT: sharpest clockwise turn from the
               reverse ray (the CCW predecessor of the back-edge at v) */
            var t = backAng - h.ang;
            while (t <= 1e-9) { t += 2 * Math.PI; }
            while (t > 2 * Math.PI + 1e-9) { t -= 2 * Math.PI; }
            if (t < bestTurn) { bestTurn = t; best = h; }
          });
          if (!best) { break; }
          var u2 = v, v2 = best.to;
          if (u2 === startU && v2 === startV) { visited[tkey(u2, v2)] = true; ok = true; break; }
          if (visited[tkey(u2, v2)] && !(u2 === startU && v2 === startV)) { break; } /* ran into an owned half-edge: not a fresh face */
          u = u2; v = v2;
        }
        if (ok && face.length >= 3) {
          if (face.length > 1 && face[0] === face[face.length - 1]) { face.pop(); }  /* no duplicated closing node */
          if (face.length >= 3) {
            var pts = face.map(function (ni) { return nodes[ni].slice(); });
            var a = polyArea(pts);
            if (a > Math.max(0.01, tol * tol)) { loops.push(pts); }
          }
        }
      });
    });
    return loops;
  }

  /* segment-segment intersection (bounded on both), else null */
  function segSegInt(p1, p2, p3, p4) {
    var d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (Math.abs(d) < 1e-12) { return null; }
    var t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
    var sv = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
    if (t < -1e-9 || t > 1 + 1e-9 || sv < -1e-9 || sv > 1 + 1e-9) { return null; }
    t = clamp(t, 0, 1);
    return { p: [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])], t: t };
  }
  /* all crossing parameters t in (0,1) of segment a-b against any entity */
  function crossingsWith(a, b, e2) {
    var out = [];
    function push1(ip) { if (ip && ip.t > 1e-4 && ip.t < 1 - 1e-4) { out.push(ip); } }
    if (!e2) { return out; }
    if (e2.type === "line" || e2.type === "cline") { push1(segSegInt(a, b, e2.a, e2.b)); return out; }
    if (e2.type === "circle" || e2.role === "hole") {
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var fx = a[0] - e2.cx, fy = a[1] - e2.cy;
      var A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - e2.r * e2.r;
      var disc = B * B - 4 * A * C;
      if (A > 1e-12 && disc > 0) {
        var sq = Math.sqrt(disc);
        [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].forEach(function (t) {
          if (t > 1e-4 && t < 1 - 1e-4) { out.push({ p: [a[0] + t * dx, a[1] + t * dy], t: t }); }
        });
      }
      return out;
    }
    var pts = entPts(e2) || (e2.type === "poly" ? e2.pts : null);
    if (pts && pts.length >= 2) {
      var n = pts.length, last = (e2.type === "poly" && !e2.closed) ? n - 1 : n;
      for (var i = 0; i < last; i++) { push1(segSegInt(a, b, pts[i], pts[(i + 1) % n])); }
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* universal curve model (Update 18): every sketch element decomposes  */
  /* into elementary curves — a CATIA rectangle IS four curves, a circle  */
  /* IS one closed curve. Trim/Quick-Trim/Break accept all of them.      */
  /* ------------------------------------------------------------------ */
  function entityCurvesOf(e) {
    if (!e) { return []; }
    if (e.type === "line" || e.type === "cline") { return [{ k: "seg", a: e.a, b: e.b, owner: e, edge: 0 }]; }
    if (e.type === "circle" || e.role === "hole") { return [{ k: "arc", cx: e.cx, cy: e.cy, r: e.r, owner: e, edge: 0 }]; }
    if (e.type === "rect") {
      var x0 = e.cx - e.w / 2, x1 = e.cx + e.w / 2, y0 = e.cy - e.h / 2, y1 = e.cy + e.h / 2;
      return [
        { k: "seg", a: [x0, y0], b: [x1, y0], owner: e, edge: 0 },
        { k: "seg", a: [x1, y0], b: [x1, y1], owner: e, edge: 1 },
        { k: "seg", a: [x1, y1], b: [x0, y1], owner: e, edge: 2 },
        { k: "seg", a: [x0, y1], b: [x0, y0], owner: e, edge: 3 }
      ];
    }
    if (e.type === "poly" && (e.pts || []).length >= 2) {
      var out2 = [], n = e.pts.length, last = e.closed ? n : n - 1;
      for (var i = 0; i < last; i++) { out2.push({ k: "seg", a: e.pts[i], b: e.pts[(i + 1) % n], owner: e, edge: i }); }
      return out2;
    }
    return [];
  }
  /* hit test that also resolves WHICH edge of a rect/poly was clicked */
  function hitCurve(wp) {
    var skc = sketch();
    if (!skc) { return null; }
    var i, e, best = null, bestD = 8 / S.cam.z;
    for (i = skc.entities.length - 1; i >= 0; i--) {
      e = skc.entities[i];
      if (e.role === "hole" || e.type === "circle") {
        var d0 = Math.abs(Math.hypot(wp[0] - e.cx, wp[1] - e.cy) - e.r);
        if (d0 < bestD) { best = { ent: e, edge: 0 }; bestD = d0; }   /* on the curve band, like CATIA pick */
      } else if (e.type === "point") {
        var dp = Math.hypot(wp[0] - e.cx, wp[1] - e.cy);
        if (dp < bestD) { best = { ent: e, edge: 0 }; bestD = dp; }
      } else {
        entityCurvesOf(e).forEach(function (cv) {
          var d = distToSeg(wp, cv.a, cv.b);
          if (d < bestD) { best = { ent: e, edge: cv.edge }; bestD = d; }
        });
      }
    }
    return best;
  }
  /* intersections of two elementary curves (bounded segs; arcs full) */
  function curveCurveInt(ca, cb) {
    var out = [];
    if (ca.k === "seg" && cb.k === "seg") {
      /* unbounded first (TRIM + EXTEND, like AutoCAD) — then fall back to the
         bounded crossing if the infinite lines are parallel / degenerate */
      var raw = lineLineInt(ca.a, ca.b, cb.a, cb.b);
      if (raw) { out.push(raw); }
      else {
        var ip = segSegInt(ca.a, ca.b, cb.a, cb.b);
        if (ip) { out.push(ip.p); }
      }
      return out;
    }
    if (ca.k !== cb.k) {
      var seg = ca.k === "seg" ? ca : cb, circ = ca.k === "arc" ? ca : cb;
      var dx = seg.b[0] - seg.a[0], dy = seg.b[1] - seg.a[1];
      var fx = seg.a[0] - circ.cx, fy = seg.a[1] - circ.cy;
      var A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - circ.r * circ.r;
      var disc = B * B - 4 * A * C;
      if (A > 1e-12 && disc >= 0) {
        var sq = Math.sqrt(disc);
        [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].forEach(function (t) {
          if (t >= -1e-9 && t <= 1 + 1e-9) { out.push([seg.a[0] + t * dx, seg.a[1] + t * dy]); }
        });
      }
      return out;
    }
    /* arc × arc */
    var ddx = cb.cx - ca.cx, ddy = cb.cy - ca.cy, D = Math.hypot(ddx, ddy);
    if (D < 1e-9 || D > ca.r + cb.r + 1e-9 || D < Math.abs(ca.r - cb.r) - 1e-9) { return out; }
    var a = (ca.r * ca.r - cb.r * cb.r + D * D) / (2 * D);
    var h2 = ca.r * ca.r - a * a;
    if (h2 < 0) { h2 = 0; }
    var xm = ca.cx + a * ddx / D, ym = ca.cy + a * ddy / D, hh = Math.sqrt(h2);
    out.push([xm - hh * ddy / D, ym + hh * ddx / D]);
    if (hh > 1e-9) { out.push([xm + hh * ddy / D, ym - hh * ddx / D]); }
    return out;
  }
  /* sample a CCW arc from angle a0 to angle a1 (counter-clockwise sweep) */
  function arcChainPts(cx, cy, r, a0, a1) {
    var span = a1 - a0;
    while (span < 0) { span += 2 * Math.PI; }
    var N = Math.max(6, Math.round(span / (Math.PI / 24)));
    var pts = [], i;
    for (i = 0; i <= N; i++) {
      var t = a0 + span * i / N;
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    return pts;
  }
  /* turn a circle entity into an open arc chain (CATIA: trimmed circle = arc) */
  function circleToChain(e, a0, a1) {
    e.type = "poly";
    e.kind = "arc";
    e.closed = false;
    e.pts = arcChainPts(e.cx, e.cy, e.r, a0, a1);
    delete e.r; delete e.cx; delete e.cy; delete e.tol;
    return e;
  }
  /* ring with the clicked edge trimmed at p, keeping the side clicked on:
     closed ring -> open chain that starts & ends exactly at p */
  function ringTrimAtEdge(e, k, p, keepStart) {
    var pts = e.pts, n = pts.length;
    var chain;
    if (keepStart) {
      chain = [p.slice(), pts[k].slice()];
      for (var i = k - 1; i >= 0; i--) { chain.push(pts[i].slice()); }
      for (var j = n - 1; j > k; j--) { chain.push(pts[j].slice()); }
    } else {
      chain = [p.slice(), pts[(k + 1) % n].slice()];
      for (var m = k + 2; m < n + k + 1; m++) { chain.push(pts[m % n].slice()); }
    }
    chain.push(p.slice());
    e.pts = chain; e.closed = false; e.kind = "free";
    return e;
  }
  /* open chain trimmed at edge k param point p -> split into two chains */
  function chainTrimAtEdge(e, k, p, keepStart, skc) {
    var pts = e.pts;
    var head = pts.slice(0, k + 1).map(function (q) { return q.slice(); });
    var tail = pts.slice(k + 1).map(function (q) { return q.slice(); });
    var first = keepStart ? head.concat([p.slice()]) : [p.slice()].concat(tail);
    var rest = keepStart ? [p.slice()].concat(tail) : head.concat([p.slice()]);
    e.pts = first;
    if (rest.length >= 2) {
      var nb = mkEnt("poly", { pts: rest, closed: false, kind: e.kind || "free", cons: e.cons });
      skc.entities.push(nb);
      return nb;
    }
    return null;
  }
  /* all intersection points of an entity with the REST of the sketch */
  function allIntsOf(sk, owner) {
    var out = [];
    var mine = entityCurvesOf(owner);
    (sk.entities || []).forEach(function (other) {
      if (other.id === owner.id) { return; }
      entityCurvesOf(other).forEach(function (cb) {
        mine.forEach(function (ca) {
          curveCurveInt(ca, cb).forEach(function (pt) { out.push({ p: pt, edge: ca.edge }); });
        });
      });
    });
    return out;
  }

  /* hole center must sit in real material: inside a solid classified ring
     and NOT inside that ring's direct voids (worker-compatible rule) */
  function holeHasMaterial(items, h) {
    var inMat = false;
    items.forEach(function (it, i2) {
      if (it.role !== "solid") { return; }
      if (!pointInPoly(it.pts, h.cx, h.cy)) { return; }
      var inVoid = false;
      items.forEach(function (h3) {
        if (h3.role === "hole" && h3.parent === i2 && pointInPoly(h3.pts, h.cx, h.cy)) { inVoid = true; }
      });
      if (!inVoid) { inMat = true; }
    });
    return inMat;
  }

  /* profiles / holes grouped per sketch (local 2D) */
  function profilesOf(sk) {
    var out = [];
    sk.entities.forEach(function (e) {
      var pts = entPts(e);
      if (pts) { out.push({ ent: e, pts: pts, area: Math.abs(polyArea(pts)), ccw: polyArea(pts) > 0 }); }
    });
    /* faces bounded by connected Line segments / open chains (Update 17):
       a square drawn with the Line tool IS a closed profile */
    loopsFromChains(sk).forEach(function (pts) {
      if (selfIntersects(pts)) { return; }
      out.push({ ent: null, pts: pts, area: Math.abs(polyArea(pts)), ccw: true, chain: true });
    });
    return out;
  }
  function holesOf(sk) {
    var hs = [];
    sk.entities.forEach(function (e) { if (e.role === "hole") { hs.push(e); } });
    return hs;
  }

  /* world mapping for any plane */
  function worldOf(plane, a, b) {
    return [
      plane.origin[0] + plane.u[0] * a + plane.v[0] * b,
      plane.origin[1] + plane.u[1] * a + plane.v[1] * b,
      plane.origin[2] + plane.u[2] * a + plane.v[2] * b
    ];
  }
  function normalOf(plane) { return plane.n; }

  /* top z of a feature's solid (its extrusion direction tip) */
  function featureTip(f) {
    var sk = sketchById(f.sketchId);
    if (!sk) { return 0; }
    var n = normalOf(sk.plane);
    var d = f.type === "pocket" ? -1 : (f.dir === -1 ? -1 : 1);
    return [sk.plane.origin[0] + n[0] * f.L * d, sk.plane.origin[1] + n[1] * f.L * d, sk.plane.origin[2] + n[2] * f.L * d];
  }

  /* miter ring offset (mirrors the geometry worker): d > 0 shrinks the ring */
  function offsetRing(pts, d) {
    var n = pts.length, out = [], i;
    for (i = 0; i < n; i++) {
      var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      var e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], l1 = Math.hypot(e1x, e1y) || 1;
      var e2x = p2[0] - p1[0], e2y = p2[1] - p1[1], l2 = Math.hypot(e2x, e2y) || 1;
      var n1x = -e1y / l1, n1y = e1x / l1, n2x = -e2y / l2, n2y = e2x / l2;
      var nx = n1x + n2x, ny = n1y + n2y;
      var k = 1 + n1x * n2x + n1y * n2y;
      var ff = k > 1e-4 ? 1 / k : 3; if (ff > 3) { ff = 3; } if (ff < 0) { ff = 3; }
      out.push([p1[0] + nx * d * ff, p1[1] + ny * d * ff]);
    }
    return out;
  }
  function ringCentroid(pts) {
    var a = 0, cx = 0, cy = 0, i, p, q, w;
    for (i = 0; i < pts.length; i++) {
      p = pts[i]; q = pts[(i + 1) % pts.length]; w = p[0] * q[1] - q[0] * p[1];
      a += w; cx += (p[0] + q[0]) * w; cy += (p[1] + q[1]) * w;
    }
    a /= 2;
    if (Math.abs(a) < 1e-12) { return [pts[0][0], pts[0][1]]; }
    return [cx / (6 * a), cy / (6 * a)];
  }

  /* feature volume (mm³, analytic; pads/shafts/ribs +, pockets/grooves −) */
  function featureVol(f) {
    var sk = sketchById(f.sketchId);
    if (!sk) { return 0; }
    var sign = (f.type === "pocket" || f.type === "groove") ? -1 : 1;
    if (f.type === "rib") {
      var rr = ribRingOf(f);
      return rr ? sign * Math.abs(polyArea(rr)) * f.L : 0;
    }
    var prof = profilesOf(sk), hs = holesOf(sk);
    var items = classifyContours(prof.map(function (p) { return p.pts; }));
    var A = 0; items.forEach(function (it) { A += it.role === "solid" ? it.area : -it.area; });
    if (!prof.length || A <= 0) { return 0; }
    if (f.type === "shaft" || f.type === "groove") {
      /* Pappus: V = A · 2π·d_centroid · (angle/360), voids signed off */
      var angF = clamp(num(f.angle, 360), 1, 360) / 360, ax = num(f.axisX, 0), VR = 0;
      items.forEach(function (it) {
        var c = ringCentroid(it.pts);
        VR += (it.role === "solid" ? 1 : -1) * it.area * 2 * Math.PI * Math.abs(c[0] - ax) * angF;
      });
      return sign * Math.max(0, VR);
    }
    var v;
    var drafted = f.type === "pad" && num(f.draftDeg, 0) > 0;
    var shelled = f.type === "pad" && !drafted && num(f.shellT, 0) > 0;
    if (drafted) {
      /* Simpson over the signed offset-area law (wall leans tan(draft)) */
      var tan = Math.tan(clamp(f.draftDeg, 0, 30) * Math.PI / 180);
      var sA = function (z) {
        var s = 0;
        items.forEach(function (it) { s += (it.role === "solid" ? 1 : -1) * Math.abs(polyArea(offsetRing(it.pts, z * tan))); });
        return s;
      };
      v = f.L / 6 * (sA(0) + 4 * sA(f.L / 2) + sA(f.L));
      hs = [];
    } else if (shelled) {
      var t = clamp(f.shellT, 0.2, Math.max(0.2, f.L - 0.2));
      v = 0;
      items.forEach(function (it) {
        if (it.role === "solid") {
          var Ai = Math.abs(polyArea(offsetRing(it.pts, t)));
          v += it.area * t + Math.max(0, it.area - Ai) * (f.L - t);
        } else { v -= it.area * f.L; }
      });
    } else {
      v = A * f.L;
    }
    if (f.type === "pad") {
      hs.forEach(function (h) {
        if (!holeHasMaterial(items, h)) { return; }   /* a hole outside the material removes nothing */
        var rr = h.r;
        if (h.hType === "blind") { v -= Math.PI * rr * rr * Math.min(h.depth, f.L); }
        else if (h.hType === "cbore") { var R = Math.max(h.cbd / 2, rr + 0.2); v -= Math.PI * rr * rr * f.L + Math.PI * (R * R - rr * rr) * Math.min(h.cbdDepth, f.L); }
        else if (h.hType === "csink") { var R2 = Math.max(h.cbd / 2, rr + 0.2); var hC = (R2 - rr) / Math.tan((h.csAngle * Math.PI / 180) / 2); v -= Math.PI * rr * rr * f.L + Math.max(0, (Math.PI * hC / 3) * (R2 * R2 + R2 * rr + rr * rr) - Math.PI * rr * rr * hC); }
        else { v -= Math.PI * rr * rr * f.L; }
      });
      if (!drafted && !shelled) {
        (f.edgeOps || []).forEach(function (op) {
          v -= edgeOpSignedArea(op) * f.L;
        });
      }
      if (f.edge && f.edge.style !== "none" && !drafted && !shelled) {
        /* bevel wedge approximation: perimeter * size²/2 top edge */
        var per = 0; prof.forEach(function (p) { for (var i = 0; i < p.pts.length; i++) { var q = p.pts[(i + 1) % p.pts.length]; per += Math.hypot(q[0] - p.pts[i][0], q[1] - p.pts[i][1]); } });
        var sz = Math.min(f.edge.size, f.L / 2);
        v -= per * sz * sz * (f.edge.style === "chamfer" ? 0.5 : 0.43);
      }
    }
    return sign * v;
  }
  /* material mirror toggle (design-level): 1 = normal, 2 = mirrored copy added */
  function mirrorFactor() { var m = D().mirror; return (m && m.on) ? 2 : 1; }
  function partVol() { var v = 0; D().features.forEach(function (f) { v += featureVol(f) * instCountOf(f); }); return Math.max(0, v * mirrorFactor()); }
  function partAreaEstimate() {
    var est = 0;
    D().features.forEach(function (f) {
      var sk = sketchById(f.sketchId); if (!sk) { return; }
      var prof = profilesOf(sk); if (!prof.length) { return; }
      var A = 0, per = 0;
      classifyContours(prof.map(function (p) { return p.pts; })).forEach(function (it) {
        A += it.role === "solid" ? it.area : -it.area;
        for (var i = 0; i < it.pts.length; i++) { var q = it.pts[(i + 1) % it.pts.length]; per += Math.hypot(q[0] - it.pts[i][0], q[1] - it.pts[i][1]); }
      });
      est += (2 * A + per * f.L) * instCountOf(f);
    });
    return est * mirrorFactor();
  }

  /* ---------------- tolerance helpers (shared with drawing) ---------------- */
  function iso2768(dim, grade) {
    var tables = {
      f: [[0.5, 3, 0.05], [3, 6, 0.05], [6, 30, 0.1], [30, 120, 0.15], [120, 400, 0.2], [400, 1000, 0.3], [1000, 2000, 0.5], [2000, 4000, 0.8]],
      m: [[0.5, 3, 0.1], [3, 6, 0.1], [6, 30, 0.2], [30, 120, 0.3], [120, 400, 0.5], [400, 1000, 0.8], [1000, 2000, 1.2], [2000, 4000, 2]],
      c: [[0.5, 3, 0.2], [3, 6, 0.3], [6, 30, 0.5], [30, 120, 0.8], [120, 400, 1.2], [400, 1000, 2], [1000, 2000, 3], [2000, 4000, 4]],
      v: [[0.5, 3, 0.5], [3, 6, 0.5], [6, 30, 1], [30, 120, 1.5], [120, 400, 2.5], [400, 1000, 4], [1000, 2000, 6], [2000, 4000, 8]]
    };
    var t = tables[grade === "f" ? "f" : grade === "c" ? "c" : grade === "v" ? "v" : "m"], i;
    for (i = 0; i < t.length; i++) { if (dim > t[i][0] && dim <= t[i][1]) { return t[i][2]; } }
    return t[t.length - 1][2];
  }
  function tolText(tol, val) {
    if (!tol || !tol.on) { return fmt(val); }
    var p = +tol.plus || 0, m = +tol.minus || 0;
    if (Math.abs(p - m) < 1e-9) { return fmt(val) + " ±" + fmt(p, 3); }
    return fmt(val, 3) + " +" + fmt(p, 3) + "/–" + fmt(m, 3);
  }
  function autoTol() {
    var g = (D().draw.general || "mK").charAt(0) || "m";
    return function (dim) { return iso2768(dim, g); };
  }

  /* ---------------- history ---------------- */
  var hist = { stack: [], i: -1 };
  function snapshot() { return JSON.stringify({ design: D(), step: S.step }); }
  function pushHist() {
    hist.stack = hist.stack.slice(0, hist.i + 1);
    hist.stack.push(snapshot());
    if (hist.stack.length > 60) { hist.stack.shift(); }
    hist.i = hist.stack.length - 1;
    saveSoon();
  }
  function restoreHist(k) {
    if (k < 0 || k >= hist.stack.length) { return; }
    try {
      var s = JSON.parse(hist.stack[k]);
      S.design = normalizeDesign(s.design);
      hist.i = k; S.selEnt = null; S.selSet = []; S.selFeat = null;
      renderAll(); saveSoon();
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
    } catch (e) {}
  }
  function undo() { restoreHist(hist.i - 1); }
  function redo() { restoreHist(hist.i + 1); }

  /* ---------------- persistence ---------------- */
  var saveT = null;
  function saveDesign() {
    try { localStorage.setItem("rgzcad.design.v2", JSON.stringify(D())); } catch (e) {}
  }
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(saveDesign, 400); }
  /* the app ALWAYS opens with a fresh empty part (light, like the other
     studios) — the browser autosave becomes an on-demand "Resume" action */
  function readAutosave() {
    var d = null;
    try {
      d = JSON.parse(localStorage.getItem("rgzcad.design.v2") || "null");
      if (!d) {
        var old = JSON.parse(localStorage.getItem("rgzcad.design") || "null");
        if (old) { d = migrate1to2(old); }
      }
    } catch (e) { d = null; }
    if (!d) { return null; }
    try { return normalizeDesign(d); } catch (e2) { return null; }
  }
  function designDirty(d2) {
    if (!d2) { return false; }
    if (d2.features && d2.features.length) { return true; }
    return (d2.sketches || []).some(function (s2) { return (s2.entities || []).length > 0; });
  }
  function updateResumeChip(show) {
    var b = qs(document, "[data-resume]");
    if (b) { b.hidden = !show; }
  }
  function resumeDesign() {
    var d2 = readAutosave();
    if (!d2 || !designDirty(d2)) {
      updateResumeChip(false);
      note("No stored design found in this browser anymore.");
      return;
    }
    S.design = d2;
    S.selEnt = null; S.selSet = []; S.selFeat = null;
    hist.stack = [snapshot()]; hist.i = 0;
    setStep(d2.features.length ? "model" : (d2.sketches.length ? "sketch" : "plane"));
    renderAll(); skFit();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
    updateResumeChip(false);
    note("Resumed \"" + (d2.name || "the last design") + "\" from this browser — the ＋ New part button starts over anytime.");
  }
  function newDesignFresh() {
    if (designDirty(D()) && !window.confirm("Start a new empty part? The current design is replaced (it stays in My designs if you saved it to your account).")) { return; }
    S.design = defaultDesign();
    S.selEnt = null; S.selSet = []; S.selFeat = null;
    hist.stack = [snapshot()]; hist.i = 0;
    saveDesign();
    updateResumeChip(false);
    setStep("plane");
    renderAll();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
    note("New empty part — pick a datum plane in the 3D view to start Sketch.1.");
  }

  function applyLoadedDesign(d, serverId) {
    S.design = normalizeDesign(d);
    if (serverId) { S.design.serverId = serverId; }
    S.selEnt = null; S.selSet = []; S.selFeat = null;
    pushHist();
    setStep(S.design.sketches.length ? "sketch" : "plane");
    renderAll();
    skFit();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
  }

  /* ---------------- step flow ---------------- */
  function applyStepUI() {
    /* per-step layer switching: the 3D viewport and the 2D canvas share the
       same stack — exactly one may be visible & hit-testable at a time,
       otherwise the 3D orbit controls swallow the sketch pointer events */
    var root = document.querySelector("[data-rgzcad]");
    if (!root) { return; }
    var st = S.step;
    var is2d = st === "sketch", is3d = st === "model" || st === "plane";
    var c = qs(root, "[data-sketch-canvas]"); if (c) { c.hidden = !is2d; }
    var mb = qs(root, "[data-modebar]"); if (mb) { mb.hidden = !is2d; }
    var mk = qs(root, "[data-makebar]"); if (mk) { mk.hidden = !is2d; }
    var g = qs(root, "[data-gl]"); if (g) { g.hidden = !is3d; }
    var gb = qs(root, "[data-glbar]"); if (gb) { gb.hidden = st !== "model"; }
    var ph = qs(root, "[data-planehint]"); if (ph) { ph.hidden = st !== "plane"; }
    var sh = qs(root, "[data-sheet]"); if (sh) { sh.style.display = st === "drawing" ? "block" : "none"; if (st !== "drawing") { sh.innerHTML = ""; } }
    if (is2d) { skResize(); }
  }
  function renderDrawingSheet() {
    var rs = window.__rgzcadRenderSheet || (window.__rgzcad3 && window.__rgzcad3.renderSheet);
    if (typeof rs === "function") {
      try { rs(); } catch (err) {
        var host = qs(document, "[data-sheet]");
        if (host) {
          host.style.display = "block";
          host.innerHTML = '<div class="rgzcad-empty" style="margin:40px auto;max-width:420px">The drawing could not be built (' + esc(err && err.message ? err.message : err) + "). Pad the sketch, then open ISO Drawing again.</div>";
        }
        note("ISO drawing failed: " + (err && err.message ? err.message : err));
      }
    } else {
      var host2 = qs(document, "[data-sheet]");
      if (host2) {
        host2.style.display = "block";
        host2.innerHTML = '<div class="rgzcad-empty" style="margin:40px auto;max-width:420px">Drawing module is still starting — click <b>ISO Drawing</b> again in a moment.</div>';
      }
    }
  }
  function setStep(st) {
    /* 'plane' is the pre-sketch start state: 3D view with pickable datum planes */
    if (st !== "plane" && !STEPS.some(function (s2) { return s2.id === st; })) { return; }
    if (st === "sketch" && !D().sketches.length) { st = "plane"; }
    if ((st === "model" || st === "drawing") && !D().features.length && D().sketches.length && !closedCount(sketch())) {
      note("Draw and close at least one profile first (rectangle, circle, …).");
      st = "sketch";
    }
    if ((st === "model" || st === "drawing") && !D().sketches.length) { st = "plane"; }
    S.step = st;
    if (st === "sketch" && !sketch()) { D().activeSketch = D().sketches[0] ? D().sketches[0].id : null; }
    if (st === "plane") { S.selEnt = null; note("Pick a datum plane for your sketch — click the blue XY (flat), green XZ or red YZ plane in the 3D view. The sketch is added to the tree."); }
    applyStepUI();
    refreshSteps();
    renderAll();
    if (window.__rgzcad2 && window.__rgzcad2.refreshDatums) { window.__rgzcad2.refreshDatums(); }
    if (st === "plane" && window.__rgzcad2 && window.__rgzcad2.resizeGL) { window.__rgzcad2.resizeGL(); }
    if (st === "model") {
      if (window.__rgzcad2 && window.__rgzcad2.resizeGL) { window.__rgzcad2.resizeGL(); }
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
      if (window.__rgzcad2 && window.__rgzcad2.fitCamSoon) { window.__rgzcad2.fitCamSoon(); }
    }
    if (st === "drawing") { renderDrawingSheet(); }
  }
  function refreshSteps() {
    var root = document.querySelector("[data-rgzcad]");
    var canModel = D().features.length > 0;
    var curId = S.step === "plane" ? "sketch" : S.step;
    qsa(root, "[data-step]").forEach(function (b) {
      var st = b.getAttribute("data-step");
      var idx = STEPS.findIndex(function (s2) { return s2.id === st; });
      var cur = STEPS.findIndex(function (s2) { return s2.id === curId; });
      b.classList.toggle("on", st === curId);
      b.classList.toggle("done", canModel && idx < cur);
      b.disabled = st !== "sketch" && !canModel;
    });
  }

  function closedCount(sk) {
    var n = 0;
    profilesOf(sk).forEach(function () { n++; });
    return n;
  }

  function note(t) {
    var n = qs(document, "[data-stagenote]");
    if (n) { n.textContent = t; }
  }

  /* ---------------- 2D CANVAS (sketch editor) ---------------- */
  var cv = null, cx2 = null, dirty = true, rafOn = false;
  var drag = null;      /* transient tool drag {x0,y0,cur,extra[]} */
  var moveDrag = null;  /* select-mode move {ent, dx,dy, startEnt, moved} */
  var multi = null;     /* multi-click tools {pts:[]} */
  var skCanvas = null;

  function sk() { return skCanvas; }
  function w2s(p) { /* world/sketch-local → screen */
    var z = S.cam.z;
    return [ (p[0] - S.cam.x) * z + skCanvas.clientWidth / 2, (S.cam.y - p[1]) * z + skCanvas.clientHeight / 2 ];
  }
  function s2w(x, y) {
    var z = S.cam.z;
    return [ S.cam.x + (x - skCanvas.clientWidth / 2) / z, S.cam.y - (y - skCanvas.clientHeight / 2) / z ];
  }
  function snapPt(p) {
    var st = S.snap ? 1 : 0.1;
    var g = [Math.round(p[0] / st) * st, Math.round(p[1] / st) * st];
    var skc = sketch();
    if (!skc || !skCanvas) { return g; }
    var best = null, bd = Math.max(1.2, 10 / Math.max(S.cam.z, 0.2));
    function consider(q) {
      if (!q) { return; }
      var d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bd) { bd = d; best = [q[0], q[1]]; }
    }
    skc.entities.forEach(function (e) {
      if (e.type === "line" || e.type === "cline") {
        consider(e.a); consider(e.b);
        consider([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]);
      } else if (e.type === "circle" || e.role === "hole") {
        consider([e.cx, e.cy]);
        consider([e.cx + e.r, e.cy]); consider([e.cx - e.r, e.cy]);
        consider([e.cx, e.cy + e.r]); consider([e.cx, e.cy - e.r]);
      } else if (e.type === "rect") {
        (entPts(e) || []).forEach(consider);
        consider([e.cx, e.cy]);
      } else if (e.type === "poly" && e.pts) {
        e.pts.forEach(consider);
      } else if (e.type === "point") {
        consider([e.cx, e.cy]);
      }
    });
    return best || g;
  }

  function skResize() {
    if (!skCanvas) { return; }
    var host = skCanvas.parentElement;
    var w = host.clientWidth, h = host.clientHeight;
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var W = Math.max(2, Math.round(w * dpr)), H = Math.max(2, Math.round(h * dpr));
    if (skCanvas.width !== W || skCanvas.height !== H) { skCanvas.width = W; skCanvas.height = H; }
    skDirty();
  }
  function skDirty() {
    dirty = true;
    if (!rafOn) { rafOn = true; requestAnimationFrame(skFrame); }
  }
  function skFrame() {
    rafOn = false;
    if (!dirty) { return; }
    dirty = false;
    skDraw();
  }
  function skFit() {
    var skc = sketch(), all = [];
    if (!skc) { S.cam = { x: 0, y: 0, z: 5 }; skDirty(); return; }
    skc.entities.forEach(function (e) {
      var pts = entPts(e);
      if (pts) { all = all.concat(pts); }
      else if (e.role === "hole" || e.type === "circle") { all.push([e.cx - e.r, e.cy - e.r], [e.cx + e.r, e.cy + e.r]); }
      else if (e.type === "cline" || e.type === "line") { all.push(e.a, e.b); }
      else if (e.type === "poly" && e.pts) { all = all.concat(e.pts); }
      else if (e.type === "point") { all.push([e.cx, e.cy]); }
    });
    if (!all.length) { S.cam = { x: 0, y: 0, z: 5 }; skDirty(); return; }
    var bb = bboxOf(all);
    S.cam.x = bb.cx; S.cam.y = bb.cy;
    var zx = (skCanvas.clientWidth - 140) / Math.max(1, bb.w);
    var zy = (skCanvas.clientHeight - 140) / Math.max(1, bb.h);
    S.cam.z = clamp(Math.min(zx, zy), 0.6, 60);
    skDirty();
  }

  var GRID_COLOR = "#1d2a44", AXIS = "#33415e";
  function skDraw() {
    if (!cv) { return; }
    var dpr = skCanvas.width / Math.max(1, skCanvas.clientWidth);
    var W = skCanvas.width, H = skCanvas.height;
    cx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = skCanvas.clientWidth, h = skCanvas.clientHeight;
    cx2.fillStyle = "#0e1526";
    cx2.fillRect(0, 0, w, h);

    /* grid (adaptive) */
    var stepMm = 10;
    while (stepMm * S.cam.z < 14) { stepMm *= 5; }
    while (stepMm * S.cam.z > 90) { stepMm /= 5; }
    var tl = s2w(0, 0), br = s2w(w, h);
    var x0 = Math.floor(Math.min(tl[0], br[0]) / stepMm) * stepMm;
    var x1 = Math.ceil(Math.max(tl[0], br[0]) / stepMm) * stepMm;
    var y0 = Math.floor(Math.min(tl[1], br[1]) / stepMm) * stepMm;
    var y1 = Math.ceil(Math.max(tl[1], br[1]) / stepMm) * stepMm;
    var x, y, p;
    cx2.lineWidth = 1;
    cx2.strokeStyle = GRID_COLOR;
    cx2.beginPath();
    for (x = x0; x <= x1; x += stepMm) {
      for (y = y0; y <= y1; y += stepMm) {
        p = w2s([x, y]);
        cx2.moveTo(p[0] - 1.1, p[1]); cx2.lineTo(p[0] + 1.1, p[1]);
        cx2.moveTo(p[0], p[1] - 1.1); cx2.lineTo(p[0], p[1] + 1.1);
      }
    }
    cx2.stroke();

    /* axes */
    cx2.strokeStyle = AXIS;
    cx2.lineWidth = 1.2;
    var o = w2s([0, 0]);
    cx2.beginPath(); cx2.moveTo(0, o[1]); cx2.lineTo(w, o[1]); cx2.moveTo(o[0], 0); cx2.lineTo(o[0], h); cx2.stroke();

    var skc = sketch();
    /* closed-profile shading — even-odd: a profile inside another profile
       visually reads as a void, exactly what the pad will do (CATIA-style) */
    if (skc && window.Path2D) {
      var profNow = profilesOf(skc);
      if (profNow.length) {
        var items = classifyContours(profNow.map(function (p) { return p.pts; }));
        cx2.fillStyle = "rgba(96,165,250,.10)";
        items.forEach(function (it, ii) {
          if (it.role !== "solid") { return; }
          var path = new Path2D(), hasVoid = false;
          it.pts.forEach(function (q, i) { var s = w2s(q); if (i === 0) { path.moveTo(s[0], s[1]); } else { path.lineTo(s[0], s[1]); } });
          path.closePath();
          items.forEach(function (h3) {
            if (h3.role !== "hole" || h3.parent !== ii) { return; }
            hasVoid = true;
            h3.pts.forEach(function (q, i) { var s = w2s(q); if (i === 0) { path.moveTo(s[0], s[1]); } else { path.lineTo(s[0], s[1]); } });
            path.closePath();
          });
          cx2.fill(path, "evenodd");
          if (hasVoid) { cx2.strokeStyle = "rgba(96,165,250,.28)"; cx2.lineWidth = 1; cx2.stroke(path); }
        });
      }
    }
    /* host face outline (when sketching on a 3D face) */
    if (skc && skc.plane && skc.plane.kind !== "xy" && skc.faceOutline) {
      cx2.setLineDash([6, 4]);
      cx2.strokeStyle = "rgba(125,140,170,.55)";
      cx2.lineWidth = 1.4;
      cx2.beginPath();
      skc.faceOutline.forEach(function (q, i) {
        var s = w2s(q);
        if (i === 0) { cx2.moveTo(s[0], s[1]); } else { cx2.lineTo(s[0], s[1]); }
      });
      cx2.closePath(); cx2.stroke();
      cx2.setLineDash([]);
    }

    /* entities */
    if (skc) {
      skc.entities.forEach(function (e) {
        drawEntity(e, isSel(e.id));
      });
      /* geometric-constraint badges (H V ∥ ⊥ = · ◎ T ⚿) next to elements */
      cx2.font = "700 10px ui-sans-serif,system-ui,sans-serif";
      cx2.textAlign = "center"; cx2.textBaseline = "middle";
      skc.entities.forEach(function (e) {
        if (!e.geo || !e.geo.length) { return; }
        var m = geoBadgePos(e);
        if (!m) { return; }
        var bs = w2s(m);
        e.geo.forEach(function (g, gi) {
          var bx = bs[0] + 9 + gi * 15, by = bs[1] - 11;
          cx2.fillStyle = "rgba(245,176,84,.92)";
          cx2.fillRect(bx - 6.5, by - 7, 13, 14);
          cx2.fillStyle = "#14100a";
          cx2.fillText(GEO_GLYPHS[g.t] || g.t, bx, by + 0.5);
        });
      });
      /* measured sizes on the sketch — color-coded by constraint state
         (white/accent = under-defined, GREEN = fully constrained, violet = fixed) */
      if (S.ui.showSizes !== false) { drawSizes(skc); }
    }
    /* rubber-box selection rectangle */
    if (marq) {
      var msa = w2s(marq.a), msb = w2s(marq.b);
      var mcross = marq.b[0] < marq.a[0];
      cx2.fillStyle = "rgba(96,165,250,.10)";
      cx2.strokeStyle = mcross ? "#f5b054" : "#60a5fa";
      cx2.lineWidth = 1.2;
      cx2.setLineDash(mcross ? [5, 4] : []);
      cx2.fillRect(msa[0], msa[1], msb[0] - msa[0], msb[1] - msa[1]);
      cx2.strokeRect(msa[0], msa[1], msb[0] - msa[0], msb[1] - msa[1]);
      cx2.setLineDash([]);
    }
    /* tool preview */
    drawPreview();
    /* vertex handles */
    if (skc && S.vertexMode && S.selEnt) {
      var ve = entityById(skc, S.selEnt);
      if (ve && ve.type === "poly") {
        ve.pts.forEach(function (q, i) {
          var s = w2s(q);
          cx2.fillStyle = "#eb4e3c";
          cx2.fillRect(s[0] - 3.5, s[1] - 3.5, 7, 7);
          cx2.strokeStyle = "#fff"; cx2.lineWidth = 1; cx2.strokeRect(s[0] - 3.5, s[1] - 3.5, 7, 7);
        });
      }
    }
    /* coords badge */
    var hint = qs(document, "[data-sketchhint]");
    if (hint && lastMouse) {
      var wp = s2w(lastMouse[0], lastMouse[1]);
      hint.textContent = "x " + fmt(wp[0], 1) + " , y " + fmt(wp[1], 1) + " mm";
    }
  }

  function drawEntity(e, selected) {
    /* CATIA Sketcher color code: fully-constrained elements turn GREEN, fixed
       (⚿) elements violet, construction cyan, holes amber, the rest white. */
    var col;
    if (selected) { col = "#ff6f5e"; }
    else if (e.cons || e.role === "constr") { col = "#54d0e0"; }
    else if (e.role === "hole") { col = "#f5b054"; }
    else {
      var cst = constraintState(sketch(), e);
      col = cst === "fix" ? "#b78ef0" : (cst === "full" ? "#3ddc78" : "#e8edf6");
    }
    var lw = selected ? 2.4 : 1.6;
    cx2.strokeStyle = col; cx2.lineWidth = lw; cx2.fillStyle = col;
    var pts, i, s;
    if (e.type === "line") {
      /* plain line segment — construction geometry when e.cons (dashed) */
      if (e.cons) { cx2.setLineDash([7, 5]); }
      var la = w2s(e.a), lb = w2s(e.b);
      cx2.beginPath(); cx2.moveTo(la[0], la[1]); cx2.lineTo(lb[0], lb[1]); cx2.stroke();
      cx2.setLineDash([]);
      if (selected) {
        [la, lb].forEach(function (q) { cx2.fillRect(q[0] - 3.5, q[1] - 3.5, 7, 7); cx2.strokeStyle = "#fff"; cx2.lineWidth = 1; cx2.strokeRect(q[0] - 3.5, q[1] - 3.5, 7, 7); });
      }
      return;
    }
    if (e.type === "point") {
      var ps = w2s([e.cx, e.cy]);
      cx2.lineWidth = selected ? 2.2 : 1.4;
      cx2.beginPath();
      cx2.moveTo(ps[0] - 6, ps[1]); cx2.lineTo(ps[0] + 6, ps[1]);
      cx2.moveTo(ps[0], ps[1] - 6); cx2.lineTo(ps[0], ps[1] + 6);
      cx2.stroke();
      cx2.beginPath(); cx2.arc(ps[0], ps[1], 3, 0, Math.PI * 2); cx2.stroke();
      return;
    }
    if (e.type === "cline") {
      cx2.setLineDash([14, 5, 3, 5]);
      var a = w2s(e.a), b = w2s(e.b);
      cx2.beginPath(); cx2.moveTo(a[0], a[1]); cx2.lineTo(b[0], b[1]); cx2.stroke();
      cx2.setLineDash([]);
      return;
    }
    if (e.type === "hole") {
      s = w2s([e.cx, e.cy]);
      cx2.beginPath(); cx2.arc(s[0], s[1], e.r * S.cam.z, 0, Math.PI * 2); cx2.stroke();
      if (e.hType === "cbore" || e.hType === "csink") {
        cx2.setLineDash([4, 3]);
        cx2.beginPath(); cx2.arc(s[0], s[1], (e.cbd / 2) * S.cam.z, 0, Math.PI * 2); cx2.stroke();
        cx2.setLineDash([]);
      }
      cx2.beginPath();
      cx2.moveTo(s[0] - 4, s[1]); cx2.lineTo(s[0] + 4, s[1]); cx2.moveTo(s[0], s[1] - 4); cx2.lineTo(s[0], s[1] + 4);
      cx2.stroke();
      return;
    }
    if (e.type === "poly" && !e.closed) {
      /* open free polygons stay dashed until closed; true ARCs (AutoCAD ARC)
         are solid open curves — they join lines into a pad profile. */
      pts = e.pts;
      var isArc = e.kind === "arc";
      if (!isArc) { cx2.setLineDash([7, 5]); }
      cx2.beginPath();
      pts.forEach(function (q, i2) { s = w2s(q); if (i2 === 0) { cx2.moveTo(s[0], s[1]); } else { cx2.lineTo(s[0], s[1]); } });
      cx2.stroke();
      cx2.setLineDash([]);
      if (!isArc && pts.length >= 3) {
        s = w2s(pts[0]);
        cx2.beginPath(); cx2.arc(s[0], s[1], 6, 0, Math.PI * 2); cx2.stroke();
      }
      return;
    }
    pts = entPts(e);
    if (!pts) {
      /* open polyline with cons flag, or any typed entity handled above */
      if (e.type === "poly" && !e.closed) { /* drawn earlier */ }
      return;
    }
    if (e.cons) { cx2.setLineDash([7, 5]); }
    cx2.beginPath();
    pts.forEach(function (q, i2) { s = w2s(q); if (i2 === 0) { cx2.moveTo(s[0], s[1]); } else { cx2.lineTo(s[0], s[1]); } });
    cx2.closePath();
    if (selected) { cx2.fillStyle = "rgba(235,78,60,.12)"; cx2.fill(); }
    cx2.stroke();
    cx2.setLineDash([]);
    if (S.vertexMode && selected) { return; }
    /* center mark + dims hint on closed profiles */
    var bb = bboxOf(pts);
    var c = w2s([bb.cx, bb.cy]);
    cx2.strokeStyle = "rgba(232,237,246,.35)"; cx2.lineWidth = 1;
    cx2.beginPath(); cx2.moveTo(c[0] - 5, c[1]); cx2.lineTo(c[0] + 5, c[1]); cx2.moveTo(c[0], c[1] - 5); cx2.lineTo(c[0], c[1] + 5); cx2.stroke();
  }

  function drawPreview() {
    if (!drag && !(multi && multi.pts.length)) { return; }
    cx2.strokeStyle = "#f5b054"; cx2.fillStyle = "#f5b054"; cx2.lineWidth = 1.7;
    cx2.setLineDash([6, 4]);
    var s;
    if (S.mode === "rect" && drag) {
      var a = w2s(drag.p0), b = w2s(drag.cur);
      cx2.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
      labelAt((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 8, fmt(Math.abs(drag.cur[0] - drag.p0[0]), 1) + " × " + fmt(Math.abs(drag.cur[1] - drag.p0[1]), 1));
    } else if (S.mode === "circle" && drag) {
      var r = Math.hypot(drag.cur[0] - drag.p0[0], drag.cur[1] - drag.p0[1]);
      s = w2s(drag.p0);
      cx2.beginPath(); cx2.arc(s[0], s[1], r * S.cam.z, 0, Math.PI * 2); cx2.stroke();
      labelAt(s[0], s[1] - r * S.cam.z - 8, "Ø " + fmt(2 * r, 1));
    } else if ((S.mode === "poly" || S.mode === "spline" || S.mode === "arc") && multi && multi.pts.length) {
      cx2.beginPath();
      multi.previewPts().forEach(function (q, i) { var sp = w2s(q); if (i === 0) { cx2.moveTo(sp[0], sp[1]); } else { cx2.lineTo(sp[0], sp[1]); } });
      cx2.stroke();
      multi.pts.forEach(function (q) { var sp = w2s(q); cx2.fillRect(sp[0] - 2.5, sp[1] - 2.5, 5, 5); });
    } else if (S.mode === "ngon" && drag) {
      var rr = Math.hypot(drag.cur[0] - drag.p0[0], drag.cur[1] - drag.p0[1]);
      var n = +S.ui.ngonSides || 6;
      cx2.beginPath();
      ngonPts(drag.p0[0], drag.p0[1], rr, n).forEach(function (q, i) { var sp = w2s(q); if (i === 0) { cx2.moveTo(sp[0], sp[1]); } else { cx2.lineTo(sp[0], sp[1]); } });
      cx2.closePath(); cx2.stroke();
      labelAt(w2s(drag.p0)[0], w2s(drag.p0)[1] - rr * S.cam.z - 8, n + " sides · R " + fmt(rr, 1));
    } else if (S.mode === "slot" && drag) {
      var L = Math.hypot(drag.cur[0] - drag.p0[0], drag.cur[1] - drag.p0[1]) + (S.ui.slotW || 10);
      var ang = Math.atan2(drag.cur[1] - drag.p0[1], drag.cur[0] - drag.p0[0]) * 180 / Math.PI;
      cx2.beginPath();
      slotPts((drag.p0[0] + drag.cur[0]) / 2, (drag.p0[1] + drag.cur[1]) / 2, Math.max(L, S.ui.slotW || 10), S.ui.slotW || 10, ang).forEach(function (q, i) { var sp = w2s(q); if (i === 0) { cx2.moveTo(sp[0], sp[1]); } else { cx2.lineTo(sp[0], sp[1]); } });
      cx2.closePath(); cx2.stroke();
    } else if (S.mode === "ellipse" && drag) {
      var rx = Math.abs(drag.cur[0] - drag.p0[0]), ry = Math.abs(drag.cur[1] - drag.p0[1]);
      s = w2s(drag.p0);
      cx2.beginPath(); cx2.ellipse(s[0], s[1], rx * S.cam.z, ry * S.cam.z, 0, 0, Math.PI * 2); cx2.stroke();
    } else if (S.mode === "hole" && drag) {
      var rh = S.ui.holeR || 5;
      s = w2s(drag.cur);
      cx2.beginPath(); cx2.arc(s[0], s[1], rh * S.cam.z, 0, Math.PI * 2); cx2.stroke();
    } else if ((S.mode === "cline" || S.mode === "line") && drag) {
      var a2 = w2s(drag.p0), b2 = w2s(drag.cur);
      cx2.beginPath(); cx2.moveTo(a2[0], a2[1]); cx2.lineTo(b2[0], b2[1]); cx2.stroke();
      if (S.mode === "line") { labelAt((a2[0] + b2[0]) / 2, Math.min(a2[1], b2[1]) - 8, fmt(Math.hypot(drag.cur[0] - drag.p0[0], drag.cur[1] - drag.p0[1]), 1) + " mm" + (drag.axis ? " · " + GEO_GLYPHS[drag.axis] : "")); }
      if (drag.axis) { labelAt(b2[0], b2[1] - 14, drag.axis === "h" ? "H — snapped horizontal (constraint)" : "V — snapped vertical (constraint)"); }
    }
    cx2.setLineDash([]);
  }
  function labelAt(x, y, t) {
    cx2.font = "700 11px ui-sans-serif,system-ui,sans-serif";
    cx2.fillStyle = "rgba(14,21,38,.85)";
    var w = cx2.measureText(t).width + 10;
    cx2.fillRect(x - w / 2, y - 9, w, 16);
    cx2.fillStyle = "#ffd7c9";
    cx2.textAlign = "center"; cx2.textBaseline = "middle";
    cx2.fillText(t, x, y);
  }

  /* ---------------- pointer handling ---------------- */
  var lastMouse = null;
  function evPos(e) {
    var r = skCanvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function hitEntity(wp) {
    var skc = sketch();
    if (!skc) { return null; }
    var i, e, tol = 8 / Math.max(S.cam.z, 0.2);
    /* click inside a closed profile / hole first (topmost) */
    for (i = skc.entities.length - 1; i >= 0; i--) {
      e = skc.entities[i];
      if (e.role === "hole") {
        if (Math.hypot(wp[0] - e.cx, wp[1] - e.cy) <= e.r + tol) { return e; }
      } else {
        var pts = entPts(e);
        if (pts && pts.length >= 3 && pointInPoly(pts, wp[0], wp[1])) { return e; }
      }
    }
    var hc = hitCurve(wp);
    return hc ? hc.ent : null;
  }
  function distToSeg(p, a, b) {
    var vx = b[0] - a[0], vy = b[1] - a[1];
    var L2 = vx * vx + vy * vy || 1e-12;
    var t = clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2, 0, 1);
    return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
  }
  function nearEdge(pts, wp, tol) {
    for (var i = 0; i < pts.length; i++) {
      if (distToSeg(wp, pts[i], pts[(i + 1) % pts.length]) < tol) { return true; }
    }
    return false;
  }

  function moveEntity(e, dx, dy) {
    if (!e) { return; }
    if (e.type === "cline" || e.type === "line") { e.a = [e.a[0] + dx, e.a[1] + dy]; e.b = [e.b[0] + dx, e.b[1] + dy]; }
    else if (e.type === "poly") { e.pts = e.pts.map(function (p) { return [p[0] + dx, p[1] + dy]; }); }
    else { e.cx += dx; e.cy += dy; }
  }

  function skDown(e) {
    if (e.button === 2) { panDrag = { s: evPos(e), cam: { x: S.cam.x, y: S.cam.y } }; return; }
    if (e.button !== 0) { return; }
    var sp = evPos(e), wp = snapPt(s2w(sp[0], sp[1]));
    var skc = sketch();
    if (!skc) { setStep("plane"); return; }

    /* reference point = single click */
    if (S.mode === "point") {
      var pe = mkEnt("point", { cx: wp[0], cy: wp[1] });
      skc.entities.push(pe);
      selectEntity(pe.id);
      pushHist(); renderPanel(); renderTree(); skDirty();
      return;
    }
    /* relimitation modes: trim (2-click keep-side) · qtrim (1-click erase) · break · offset */
    if (S.mode === "trim") {
      var hcT = hitCurve(wp);
      var th = hcT ? hcT.ent : null;
      if (!th || th.type === "point" || th.role === "hole") {
        S.trimFirst = null;
        note("Trim: click the FIRST curve on the part to KEEP — a line, circle, or rectangle/polygon edge (Esc exits).");
        return;
      }
      if (!S.trimFirst) {
        S.trimFirst = { id: th.id, w: wp.slice(), edge: hcT.edge || 0 };
        S.selEnt = th.id; S.selSet = [th.id];
        note("Trim: now click the SECOND curve on the part to keep — both cut/extend to their intersection (centerlines stay fixed; circles become arcs, rings open).");
        skDirty();
        return;
      }
      var first = S.trimFirst;
      S.trimFirst = null;
      var e1 = entityById(skc, first.id);
      if (e1) { e1._trimEdge = first.edge; }
      th._trimEdge = hcT.edge || 0;
      trimCorner(e1, th, first.w, wp);
      return;
    }
    if (S.mode === "qtrim") { quickTrimAt(wp); return; }
    if (S.mode === "break") { breakAtPoint(wp); return; }
    if (S.mode === "offset") { offsetAtPoint(wp); return; }

    if (S.mode === "select") {
      /* vertex drag when vertexMode */
      if (S.vertexMode && S.selEnt) {
        var ve = entityById(skc, S.selEnt);
        if (ve && ve.type === "poly") {
          for (var i = 0; i < ve.pts.length; i++) {
            if (distToSeg(wp, ve.pts[i], ve.pts[i]) < 9 / S.cam.z) {
              moveDrag = { kind: "vertex", ent: ve, idx: i };
              skDirty();
              return;
            }
          }
        }
      }
      var add = !!(e.ctrlKey || e.metaKey || e.shiftKey);
      var hit = hitEntity(wp);
      if (hit) {
        selectEntity(hit.id, add);
        if (!add || isSel(hit.id)) {
          var dragEnts = selEnts().filter(function (e3) { return !e3.locked; });
          if (hit.locked) { note("That element is locked (Fix constraint) — unlock it with the ⚿ Fix button before moving."); }
          if (dragEnts.length) { moveDrag = { kind: "move", ent: hit, ents: dragEnts, last: wp.slice(), moved: false }; }
        }
      } else {
        marq = { a: wp.slice(), b: wp.slice(), add: add };
        if (!add) { S.selEnt = null; S.selSet = []; renderTree(); renderPanel(); }
      }
      skDirty();
      return;
    }

    /* multi-point tools */
    if (S.mode === "poly" || S.mode === "spline") {
      if (!multi) { multi = { pts: [], mode: S.mode, previewPts: function () { return this.pts.concat([wp]); } }; }
      /* close polygon by clicking the start point */
      if (S.mode === "poly" && multi.pts.length >= 3) {
        if (Math.hypot(wp[0] - multi.pts[0][0], wp[1] - multi.pts[0][1]) < 8 / S.cam.z) { finishMulti(true); return; }
      }
      multi.pts.push(wp);
      if (S.mode === "spline" && multi.pts.length >= 2) {
        multi.previewPts = function () { return catmullRom(this.pts.concat([wp])); };
      }
      renderToolHint();
      skDirty();
      return;
    }
    if (S.mode === "arc") {
      if (!multi) { multi = { pts: [], mode: "arc", previewPts: function () { return this.pts.length === 2 ? arc3Pts(this.pts[0], this.pts[1], wp) : this.pts.concat([wp]); } }; }
      multi.pts.push(wp);
      if (multi.pts.length === 3) { finishMultiArc(); return; }
      renderToolHint();
      skDirty();
      return;
    }

    /* hole = single click */
    if (S.mode === "hole") {
      var he = mkEnt("hole", { cx: wp[0], cy: wp[1], r: S.ui.holeR || 5, hType: S.ui.holeType || "through", depth: S.ui.holeDepth || 10, cbd: S.ui.holeCbd || 2 * (S.ui.holeR || 5) + 4, cbdDepth: S.ui.holeCbdDepth || 3, csAngle: S.ui.csAngle || 90 });
      skc.entities.push(he);
      selectEntity(he.id);
      pushHist(); renderPanel(); renderTree(); skDirty();
      var its2 = classifyContours(profilesOf(skc).map(function (p2) { return p2.pts; }));
      if (closedCount(skc) && !holeHasMaterial(its2, he)) {
        note("⚠ That hole sits OUTSIDE the solid material — a pad through it will not cut anything (CATIA would call it not-updatable). Move it inside the profile.");
      }
      return;
    }

    /* drag tools */
    drag = { p0: wp, cur: wp };
    skDirty();
  }

  var panDrag = null;
  var marq = null;      /* window/crossing rubber-box select {a,b,add} */
  function entBBox2(e) {
    var pts = [];
    if (!e) { return null; }
    if (e.type === "line" || e.type === "cline") { pts = [e.a, e.b]; }
    else if (e.type === "point") { pts = [[e.cx, e.cy]]; }
    else if (e.role === "hole" || e.type === "circle") { pts = [[e.cx - e.r, e.cy - e.r], [e.cx + e.r, e.cy + e.r]]; }
    else if (e.type === "rect") { pts = [[e.cx - e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy + e.h / 2]]; }
    else if (e.type === "poly") { pts = e.pts; }
    if (!pts || !pts.length) { return null; }
    var x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    pts.forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function entsInRect(skc, r, crossing) {
    var ids = [];
    (skc ? skc.entities : []).forEach(function (e) {
      var bb = entBBox2(e);
      if (!bb) { return; }
      var inx = !(bb.x1 < r[0] || bb.x0 > r[2] || bb.y1 < r[1] || bb.y0 > r[3]);
      var win = bb.x0 >= r[0] && bb.x1 <= r[2] && bb.y0 >= r[1] && bb.y1 <= r[3];
      if (crossing ? inx : win) { ids.push(e.id); }
    });
    return ids;
  }
  function skMove(e) {
    lastMouse = evPos(e);
    if (marq) {
      marq.b = s2w(lastMouse[0], lastMouse[1]);
      skDirty();
      return;
    }
    if (panDrag) {
      var s = evPos(e);
      S.cam.x = panDrag.cam.x - (s[0] - panDrag.s[0]) / S.cam.z;
      S.cam.y = panDrag.cam.y + (s[1] - panDrag.s[1]) / S.cam.z;
      skDirty();
      return;
    }
    if (moveDrag) {
      var wp = snapPt(s2w(lastMouse[0], lastMouse[1]));
      if (moveDrag.kind === "vertex") {
        moveDrag.ent.pts[moveDrag.idx] = wp;
      } else {
        var dx = wp[0] - moveDrag.last[0], dy = wp[1] - moveDrag.last[1];
        if (Math.abs(dx) + Math.abs(dy) > 0) {
          (moveDrag.ents || [moveDrag.ent]).forEach(function (e5) { moveEntity(e5, dx, dy); });
          moveDrag.last = wp;
          moveDrag.moved = true;
        }
      }
      skDirty();
      renderEntityPanelSoon();
      return;
    }
    if (drag) {
      var wp4 = snapPt(s2w(lastMouse[0], lastMouse[1]));
      drag.axis = null;
      if (S.mode === "line" || S.mode === "cline") {
        var ddx = wp4[0] - drag.p0[0], ddy = wp4[1] - drag.p0[1];
        if (e.shiftKey) {
          if (Math.abs(ddx) >= Math.abs(ddy)) { wp4[1] = drag.p0[1]; } else { wp4[0] = drag.p0[0]; }
          drag.axis = Math.abs(ddx) >= Math.abs(ddy) ? "h" : "v";
        } else if (Math.hypot(ddx, ddy) > 0.8) {
          /* CATIA auto-detection: nearly-horizontal/vertical lines snap to the axis and earn the constraint */
          if (Math.abs(ddy) <= 0.12 * Math.abs(ddx)) { wp4[1] = drag.p0[1]; drag.axis = "h"; }
          else if (Math.abs(ddx) <= 0.12 * Math.abs(ddy)) { wp4[0] = drag.p0[0]; drag.axis = "v"; }
        }
      } else if (S.mode === "rect" && e.shiftKey) {
        var sq2 = Math.max(Math.abs(wp4[0] - drag.p0[0]), Math.abs(wp4[1] - drag.p0[1]));
        wp4 = [drag.p0[0] + (wp4[0] >= drag.p0[0] ? sq2 : -sq2), drag.p0[1] + (wp4[1] >= drag.p0[1] ? sq2 : -sq2)];
      }
      drag.cur = wp4;
      skDirty();
      return;
    }
    if (multi) { skDirty(); }
  }

  function skUp(e) {
    if (marq) {
      var mq = marq; marq = null;
      var crossing = mq.b[0] < mq.a[0];
      var wpx = Math.abs(mq.b[0] - mq.a[0]) * S.cam.z, hpx = Math.abs(mq.b[1] - mq.a[1]) * S.cam.z;
      if (wpx > 4 || hpx > 4) {
        var rr2 = [Math.min(mq.a[0], mq.b[0]), Math.min(mq.a[1], mq.b[1]), Math.max(mq.a[0], mq.b[0]), Math.max(mq.a[1], mq.b[1])];
        var found = entsInRect(sketch(), rr2, crossing);
        var base = mq.add ? (S.selSet || []).slice() : [];
        found.forEach(function (id) { if (base.indexOf(id) < 0) { base.push(id); } });
        S.selSet = base;
        S.selEnt = base[base.length - 1] || null;
        if (base.length) { S.selFeat = null; }
        note(base.length ? base.length + " element(s) selected (" + (crossing ? "crossing" : "window") + " box) — constraints in the toolbar act on the whole set, first element = reference." : "Nothing in that selection box.");
        renderTree(); renderPanel(); skDirty();
      }
      return;
    }
    if (panDrag) { panDrag = null; return; }
    if (moveDrag) {
      if (moveDrag.moved || moveDrag.kind === "vertex") {
        /* CATIA rule: after a drag the stored constraints re-solve — partners follow */
        if (moveDrag.moved) { solveConstraints(sketch()); skDirty(); }
        pushHist(); renderPanel();
      }
      moveDrag = null;
      rebuild3dSoon();
      return;
    }
    if (!drag) { return; }
    var p0 = drag.p0, p1 = drag.cur || snapPt(s2w(lastMouse ? lastMouse[0] : evPos(e)[0], lastMouse ? lastMouse[1] : evPos(e)[1]));
    var axisSnap = drag.axis || null;
    drag.cur = p1;
    var skc = sketch(), ent = null;
    if (!skc) { drag = null; return; }
    if (S.mode === "rect") {
      var w = Math.abs(p1[0] - p0[0]), h = Math.abs(p1[1] - p0[1]);
      if (w > 0.5 && h > 0.5) { ent = mkEnt("rect", { cx: (p0[0] + p1[0]) / 2, cy: (p0[1] + p1[1]) / 2, w: w, h: h }); }
    } else if (S.mode === "circle") {
      var r = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (r > 0.25) { ent = mkEnt("circle", { cx: p0[0], cy: p0[1], r: r }); }
    } else if (S.mode === "ngon") {
      var rr = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (rr > 0.25) { ent = mkEnt("poly", { pts: ngonPts(p0[0], p0[1], rr, +S.ui.ngonSides || 6), closed: true, kind: "ngon", meta: { n: +S.ui.ngonSides || 6 } }); }
    } else if (S.mode === "slot") {
      var L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + (S.ui.slotW || 10);
      var ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI;
      if (L > (S.ui.slotW || 10) + 0.5) { ent = mkEnt("poly", { pts: slotPts((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, L, S.ui.slotW || 10, ang), closed: true, kind: "slot", meta: { len: L, w: S.ui.slotW || 10 } }); }
    } else if (S.mode === "ellipse") {
      var rx = Math.abs(p1[0] - p0[0]), ry = Math.abs(p1[1] - p0[1]);
      if (rx > 0.25 && ry > 0.25) { ent = mkEnt("poly", { pts: ellipsePts(p0[0], p0[1], rx, ry), closed: true, kind: "ellipse", meta: { rx: rx, ry: ry } }); }
    } else if (S.mode === "cline") {
      if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.5) { ent = mkEnt("cline", { a: p0, b: p1 }); ent.role = "constr"; }
    } else if (S.mode === "line") {
      if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.5) { ent = mkEnt("line", { a: p0, b: p1 }); }
    }
    drag = null;
    if (ent) {
      if (axisSnap && (ent.type === "line" || ent.type === "cline")) { ent.geo = [{ t: axisSnap, ref: null, auto: true }]; }
      skc.entities.push(ent);
      selectEntity(ent.id);
      if (ent.role === "profile" && (ent.type !== "line")) { S.mode = "select"; refreshModebar(); }
      else if (ent.type === "line") { renderToolHint(); }
      pushHist(); renderPanel(); renderTree(); skDirty();
    }
  }

  function skDbl(e) {
    var sp = evPos(e), wp = s2w(sp[0], sp[1]);
    var skc = sketch();
    /* double-click a polygon edge with vertex mode → insert vertex */
    if (S.selEnt) {
      var ve = entityById(skc, S.selEnt);
      if (ve && ve.type === "poly") {
        var best = null, bd = 8 / S.cam.z;
        ve.pts.forEach(function (p, i) {
          var q = ve.pts[(i + 1) % ve.pts.length];
          var d = distToSeg(wp, p, q);
          if (d < bd) { bd = d; best = i; }
        });
        if (best !== null) {
          var p1 = ve.pts[best], p2 = ve.pts[(best + 1) % ve.pts.length];
          ve.pts.splice(best + 1, 0, snapPt([(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]));
          pushHist(); skDirty(); renderPanel();
        }
      }
    }
  }

  function finishMulti(closed) {
    if (!multi) { return; }
    var skc = sketch();
    if (S.mode === "poly" && multi.pts.length >= 3) {
      var ent = mkEnt("poly", { pts: multi.pts.slice(), closed: true, kind: "free" });
      skc.entities.push(ent);
      selectEntity(ent.id);
      S.mode = "select"; refreshModebar();
      pushHist(); renderPanel(); renderTree();
    } else if (S.mode === "spline" && multi.pts.length >= 3) {
      var ent2 = mkEnt("poly", { pts: catmullRom(multi.pts.slice()), closed: true, kind: "spline", meta: { ctrl: multi.pts.slice() } });
      skc.entities.push(ent2);
      selectEntity(ent2.id);
      S.mode = "select"; refreshModebar();
      pushHist(); renderPanel(); renderTree();
    }
    multi = null;
    renderToolHint();
    skDirty();
  }
  function finishMultiArc() {
    if (!multi || multi.pts.length < 3) { return; }
    var skc = sketch();
    var pts = arc3Pts(multi.pts[0], multi.pts[1], multi.pts[2]);
    /* AutoCAD ARC is an OPEN curve. A closed "arc + chord" was a pie slice
       and could never join lines into the line–arc plates in every 2D CAD
       workbook. Keep it open so chain-face extraction can close it with
       neighbouring lines (exactly how AutoCAD TRIM/FILLET builds a profile). */
    var ent = mkEnt("poly", { pts: pts, closed: false, kind: "arc", meta: { p: multi.pts.slice() } });
    skc.entities.push(ent);
    selectEntity(ent.id);
    S.mode = "select"; refreshModebar();
    multi = null;
    pushHist(); renderPanel(); renderTree();
    renderToolHint();
    skDirty();
  }

  /* ---------------- tool mode ---------------- */
  S.ui = { ngonSides: 6, slotW: 10, holeR: 5, holeType: "through", holeDepth: 10, holeCbd: 14, holeCbdDepth: 3, csAngle: 90, filletR: 3, chamferD: 2, offsetD: 5, rotDeg: 90, scaleK: 2, showSizes: true, arrayNx: 3, arrayNy: 2, arrayDx: 20, arrayDy: 20, arrayN: 6, arrayAng: 360 };

  var TOOL_HINTS = {
    select: "Click = select & drag · Ctrl+click = add/toggle · drag a BOX on empty space = multi-select (→ window, ← crossing) · double-click polygon edge = +point · Del deletes the set",
    rect: "Drag a rectangle — it becomes a closed profile you can pad",
    circle: "Drag from the center — a closed circular profile",
    poly: "Click points · close on the start point or press Enter · 'Close sketch → Pad' auto-closes it",
    ngon: "Drag the radius — set the side count in the panel (default 6)",
    arc: "Click 3 points the arc passes through",
    slot: "Drag the slot axis — width in the panel",
    ellipse: "Drag the two radii",
    spline: "Click control points · Enter finishes (becomes a closed profile)",
    hole: "Click to drill — type & sizes in the panel · pads on this sketch cut it",
    cline: "Drag a construction/center line (dashed — never part of the solid)",
    line: "Drag a straight line segment — drag another to chain · Esc or Select tool to finish · endpoints editable",
    point: "Click to place a reference point marker (never part of the solid)",
    trim: "Click curve 1 on the part to KEEP, then curve 2 — lines, circles, rectangle/polygon edges all pair up; circles become arcs, rings open · Esc exits",
    qtrim: "Click any curve piece to erase just that piece (cut at its nearest crossings — works on lines, circles, rectangle/polygon edges) · Esc exits",
    break: "Click a line, circle or polygon edge to split it at that point · Esc to exit",
    offset: "Click the side of the selection to place the parallel copy — distance d set in the panel · Esc to exit"
  };
  function setMode(m) {
    S.mode = m;
    if (m !== "trim") { S.trimFirst = null; }
    if (m !== "offset") { S.offEnt = null; }
    marq = null;
    multi = null; drag = null;
    refreshModebar();
    renderToolHint();
    renderPanel();
    skDirty();
  }
  function refreshModebar() {
    var root = document.querySelector("[data-rgzcad]");
    qsa(root, "[data-mode]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-mode") === S.mode); });
    qsa(root, "[data-tool]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tool") === S.mode); });
    qsa(root, "[data-op2]").forEach(function (b) {
      var v = b.getAttribute("data-op2");
      b.classList.toggle("on", v === S.mode || ((v === "corner" && S.pendingCorner === "fillet2d") || (v === "chamfer" && S.pendingCorner === "chamfer2d")));
    });
  }
  function renderToolHint() {
    note(TOOL_HINTS[S.mode] || "");
  }

  /* ---------------- tree + selection ---------------- */
  /* multi-select model (CATIA): S.selSet = ordered id list; S.selEnt = the
     primary (last picked) shown in the panel. Ctrl/Shift+click toggles,
     dragging a rubber box selects window (L->R) or crossing (R->L). */
  function selectEntity(eid, add) {
    S.selSet = S.selSet || [];
    if (add && eid) {
      var ix = S.selSet.indexOf(eid);
      if (ix >= 0) {
        S.selSet.splice(ix, 1);
        if (S.selEnt === eid) { S.selEnt = S.selSet[S.selSet.length - 1] || null; }
      } else {
        S.selSet.push(eid);
        S.selEnt = eid;
      }
    } else {
      S.selEnt = eid;
      S.selSet = eid ? [eid] : [];
    }
    if (S.selEnt) { S.selFeat = null; S.vertexMode = false; }
    renderTree(); renderPanel(); skDirty();
  }
  function isSel(eid) { return !!(S.selSet && S.selSet.indexOf(eid) >= 0); }
  function selEnts() {
    var skc = sketch(), out = [];
    if (skc && S.selSet) {
      S.selSet.forEach(function (id) { var e = entityById(skc, id); if (e) { out.push(e); } });
    }
    return out;
  }
  function clearSel() { S.selEnt = null; S.selSet = []; }
  function selectFeature(fid) {
    S.selFeat = fid;
    if (fid) { S.selEnt = null; S.selSet = []; S.vertexMode = false; }
    renderTree(); renderPanel();
  }
  function selectSketch(skid) {
    if (!sketchById(skid)) { return; }
    D().activeSketch = skid;
    S.selEnt = null; S.selSet = [];
    var f = featureForSketch(skid);
    S.selFeat = f ? f.id : null;
    setStep("sketch");
    renderAll();
    skFit();
  }

  function renderTree() {
    var el = qs(document, "[data-tree]");
    if (!el) { return; }
    var d = D();
    var h = "";
    h += '<div class="rgzcad-treehead"><span>📐</span><b data-partname-t>' + esc(d.name || "Untitled part") + "</b></div>";
    h += '<div class="rgzcad-treelist">';
    if (!d.sketches.length) {
      h += '<div class="rgzcad-tempty"><b>No sketches yet.</b><br>The app starts in 3D like CATIA — pick a datum plane for your first sketch:</div>';
      h += "</div>";
      h += '<div class="rgzcad-treeft">' +
        '<button type="button" data-datum="xy" title="Flat XY plane (top view)">XY</button>' +
        '<button type="button" data-datum="xz" title="Upright XZ plane (front view)">XZ</button>' +
        '<button type="button" data-datum="yz" title="Upright YZ plane (side view)">YZ</button>' +
        "</div>";
      el.innerHTML = h;
      return;
    }
    d.sketches.forEach(function (sk) {
      var profN = closedCount(sk), holeN = holesOf(sk).length;
      var f = featureForSketch(sk.id);
      var planeTxt = sk.plane && sk.plane.kind === "xy" && !sk.plane.topOf ? "Base plane XY" : (sk.faceLabel || ("On " + (sk.hostName || "face")));
      h += '<div class="rgzcad-tnode sk' + (sk.id === d.activeSketch ? " on" : "") + '" data-treask="' + sk.id + '">' +
        '<span class="tic">✏️</span><span class="tnm">' + esc(sk.name) + '</span>' +
        '<small>' + profN + " profile" + (profN === 1 ? "" : "s") + (holeN ? " · " + holeN + " hole" + (holeN === 1 ? "" : "s") : "") + " · " + esc(planeTxt) + "</small>" +
        '<button type="button" class="tdel" data-delsk="' + sk.id + '" title="Delete sketch' + (d.sketches.length <= 1 ? " (the part keeps at least one sketch)" : "") + '">×</button>' +
        "</div>";
      /* holes of this sketch are tree nodes too (CATIA lists Hole.1 under the body) */
      holesOf(sk).forEach(function (hh) {
        h += '<div class="rgzcad-tnode sub hole hg" data-treahole="' + sk.id + "|" + hh.id + '" title="Hole — click to open it in the sketch">' +
          '<span class="tic">⬤</span><span class="tnm">' + esc(holeTypeLabel(hh)) + "</span>" +
          "<small>@ " + fmt(hh.cx, 1) + ", " + fmt(hh.cy, 1) + "</small>" +
          '<button type="button" class="tgear" data-holedef="' + sk.id + "|" + hh.id + '" title="Hole Definition… (type, depth, ISO thread, position)">⚙</button>' +
          '<button type="button" class="tdel" data-delhole="' + sk.id + "|" + hh.id + '" title="Delete this hole">×</button>' +
          "</div>";
      });
      if (f) {
        var ICONS = { pad: "▮", pocket: "▱", shaft: "↻", groove: "⊖", rib: "═" };
        var meta = "";
        if (f.type === "shaft" || f.type === "groove") { meta = fmt(num(f.angle, 360), 0) + "° revolve"; }
        else if (f.type === "rib") { meta = "t " + fmt(num(f.t, 4), 1) + " · L " + fmt(f.L, 1) + " mm"; }
        else { meta = (f.type === "pocket" ? "depth " : "L ") + fmt(f.L, 1) + " mm"; }
        if (f.edge && f.edge.style !== "none") { meta += " · " + f.edge.style; }
        if (num(f.draftDeg, 0) > 0) { meta += " · draft " + fmt(f.draftDeg, 1) + "°"; }
        if (num(f.shellT, 0) > 0) { meta += " · shell " + fmt(f.shellT, 1); }
        var ic = instCountOf(f);
        if (ic > 1) { meta += " · ×" + ic; }
        h += '<div class="rgzcad-tnode ft hg' + (f.id === S.selFeat ? " on" : "") + '" data-treaft="' + f.id + '">' +
          '<span class="tic">' + (ICONS[f.type] || "▮") + "</span><span class=\"tnm\">" + esc(f.name) + "</span>" +
          "<small>" + esc(meta) + "</small>" +
          '<button type="button" class="tgear" data-featdef="' + f.id + '" title="' + esc(f.type.charAt(0).toUpperCase() + f.type.slice(1)) + ' Definition… — every parameter editable in a dialog">⚙</button>' +
          '<button type="button" class="tdel" data-delfeat="' + f.id + '" title="Delete feature">×</button>' +
          "</div>";
        /* every 3D action on the feature is its own tree node (CATIA-style) */
        (f.edgeOps || []).forEach(function (op, oi) {
          h += '<div class="rgzcad-tnode sub" data-treaft="' + f.id + '" title="Picked edge dress-up — click to select the feature">' +
            '<span class="tic">' + (op.style === "fillet" ? "◜" : "◺") + '</span><span class="tnm">' + (op.style === "fillet" ? "Fillet R" + fmt(op.r, 1) : "Chamfer " + fmt(op.d, 1)) + "</span>" +
            "<small>edge " + (op.vi + 1) + " · ring " + (op.ring + 1) + "</small>" +
            '<button type="button" class="tdel" data-dressdel="' + f.id + "|edgeop|" + oi + '" title="Remove this edge round">×</button></div>';
        });
        if (num(f.draftDeg, 0) > 0) {
          h += '<div class="rgzcad-tnode sub" data-treaft="' + f.id + '"><span class="tic">∠</span><span class="tnm">Draft ' + fmt(f.draftDeg, 1) + "°</span><small>walls lean out</small>" +
            '<button type="button" class="tdel" data-dressdel="' + f.id + '|draft|" title="Remove the draft">×</button></div>';
        }
        if (num(f.shellT, 0) > 0) {
          h += '<div class="rgzcad-tnode sub" data-treaft="' + f.id + '"><span class="tic">◍</span><span class="tnm">Shell ' + fmt(f.shellT, 1) + " mm</span><small>open top</small>" +
            '<button type="button" class="tdel" data-dressdel="' + f.id + '|shell|" title="Remove the shell">×</button></div>';
        }
        if (f.pattern && f.pattern.mode && f.pattern.mode !== "none") {
          h += '<div class="rgzcad-tnode sub" data-treaft="' + f.id + '"><span class="tic">⿻</span><span class="tnm">' + (f.pattern.mode === "rect" ? "Rect pattern " + (f.pattern.nx | 0) + "×" + (f.pattern.ny | 0) : "Circ pattern ×" + (f.pattern.n | 0)) + "</span><small>" + (ic > 1 ? ic + " instances" : "") + "</small>" +
            '<button type="button" class="tdel" data-dressdel="' + f.id + '|pattern|" title="Remove the pattern">×</button></div>';
        }
      } else {
        h += '<div class="rgzcad-tnode ghost" data-padsketch="' + sk.id + '"><span class="tic">▮</span><span class="tnm">Pad ' + esc(sk.name) + "</span><small>make it 3D</small></div>";
      }
    });
    if (d.mirror && d.mirror.on) {
      h += '<div class="rgzcad-tnode ft hg"><span class="tic">⇋</span><span class="tnm">Mirror</span>' +
        "<small>about " + (d.mirror.plane === "xz" ? "XZ" : "YZ") + " · whole part</small>" +
        '<button type="button" class="tgear" data-mirrordef title="Mirror Definition…">⚙</button>' +
        '<button type="button" class="tdel" data-dressdel="|mirror|" title="Switch the mirror off">×</button></div>';
    }
    h += "</div>";
    h += '<div class="rgzcad-treeft">' +
      '<button type="button" data-newsketch title="New sketch — pick the datum plane in the 3D view">＋ Sketch</button>' +
      '<button type="button" data-facesketch title="New sketch on a face of the model (picks in 3D)">＋ Face sketch</button>' +
      "</div>";
    el.innerHTML = h;

    qsa(el, "[data-treask]").forEach(function (n) { n.addEventListener("click", function () { selectSketch(n.getAttribute("data-treask")); }); });
    qsa(el, "[data-treaft]").forEach(function (n) {
      n.addEventListener("click", function () {
        selectFeature(n.getAttribute("data-treaft"));
        if (window.__rgzcad2 && window.__rgzcad2.highlightFeature) { window.__rgzcad2.highlightFeature(S.selFeat); }
      });
    });
    qsa(el, "[data-padsketch]").forEach(function (n) { n.addEventListener("click", function () { padSketch(n.getAttribute("data-padsketch")); }); });
    qsa(el, "[data-delfeat]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteFeature(b.getAttribute("data-delfeat"));
      });
    });
    qsa(el, "[data-delsk]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteSketch(b.getAttribute("data-delsk"));
      });
    });
    qsa(el, "[data-treahole]").forEach(function (n) {
      n.addEventListener("click", function () {
        var pr = n.getAttribute("data-treahole").split("|");
        selectSketch(pr[0]);
        selectEntity(pr[1]);
      });
    });
    qsa(el, "[data-holedef]").forEach(function (b) {
      b.addEventListener("click", function (ev2) {
        ev2.stopPropagation();
        var pr = b.getAttribute("data-holedef").split("|");
        var sk2 = sketchById(pr[0]);
        var hh = sk2 && entityById(sk2, pr[1]);
        if (hh) { openHoleDialog(hh, { sk: sk2 }); }
      });
    });
    qsa(el, "[data-delhole]").forEach(function (b) {
      b.addEventListener("click", function (ev2) {
        ev2.stopPropagation();
        var pr = b.getAttribute("data-delhole").split("|");
        var sk2 = sketchById(pr[0]);
        if (sk2) {
          sk2.entities = sk2.entities.filter(function (x2) { return x2.id !== pr[1]; });
          if (S.selEnt === pr[1]) { S.selEnt = null; S.selSet = []; }
          pushHist(); renderAll();
          if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
        }
      });
    });
    qsa(el, "[data-featdef]").forEach(function (b) {
      b.addEventListener("click", function (ev2) {
        ev2.stopPropagation();
        var f2 = featureById(b.getAttribute("data-featdef"));
        if (f2) { selectFeature(f2.id); openFeatureDialog(f2); }
      });
    });
    qsa(el, "[data-dressdel]").forEach(function (b) {
      b.addEventListener("click", function (ev2) {
        ev2.stopPropagation();
        var pr = b.getAttribute("data-dressdel").split("|");
        if (!pr[0] && pr[1] === "mirror") { D().mirror.on = false; }
        else {
          var f3 = featureById(pr[0]);
          if (f3) {
            if (pr[1] === "edgeop") { (f3.edgeOps || []).splice(+pr[2], 1); }
            else if (pr[1] === "draft") { f3.draftDeg = 0; }
            else if (pr[1] === "shell") { f3.shellT = 0; }
            else if (pr[1] === "pattern" && f3.pattern) { f3.pattern.mode = "none"; }
          }
        }
        pushHist(); renderAll();
        if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
        if (S.step === "drawing") { renderDrawingSheet(); }
      });
    });
    var bm = qs(el, "[data-mirrordef]");
    if (bm) { bm.addEventListener("click", function (ev2) { ev2.stopPropagation(); openDressDialog("mirror", null); }); }
    var bn = qs(el, "[data-newsketch]");
    if (bn) { bn.addEventListener("click", function () { setStep("plane"); }); }
    var bf = qs(el, "[data-facesketch]");
    if (bf) { bf.addEventListener("click", function () { armFacePick("facesketch"); }); }
  }

  /* ---------------- feature ops ---------------- */
  function padSketch(skid) {
    var sk = sketchById(skid);
    if (!sk || !closedCount(sk)) { note("This sketch has no closed profile yet."); return; }
    var pf = featureForSketch(skid);
    if (pf) { selectFeature(pf.id); setStep("model"); return; }
    var f = {
      id: uid("f"), type: "pad", name: "Pad." + countType("pad"), sketchId: skid,
      L: 20, dir: (sk.plane && sk.plane.kind === "faceBottom") ? -1 : 1,
      edge: { style: "none", size: 1.5 }, tol: { on: false, plus: 0.2, minus: 0.2 }
    };
    D().features.push(f);
    S.selFeat = f.id;
    pushHist(); renderAll();
    setStep("model");
  }
  function pocketFromSketch(skid) {
    var sk = sketchById(skid);
    if (!sk || !closedCount(sk)) { note("This sketch has no closed profile yet."); return; }
    var f = {
      id: uid("f"), type: "pocket", name: "Pocket." + countType("pocket"), sketchId: skid,
      L: 10, dir: -1, edge: { style: "none", size: 1 }, tol: { on: false, plus: 0, minus: 0 }
    };
    D().features.push(f);
    S.selFeat = f.id;
    pushHist(); renderAll();
    setStep("model");
  }
  function countType(t) {
    var n = 0;
    D().features.forEach(function (f) { if (f.type === t) { n++; } });
    return n + 1;
  }

  /* ---- CATIA sketch-based features: Shaft/Groove (revolve) & Rib (thin pad) ---- */
  function sketchAxisCline(sk) {
    /* first vertical centreline → revolve axis x = const */
    var ax = null;
    sk.entities.forEach(function (e) {
      if (ax || e.type !== "cline") { return; }
      if (Math.abs(e.a[0] - e.b[0]) < 1e-9) { ax = e.a[0]; }
    });
    return ax;
  }
  function revolveSketch(skid, type) {
    var sk = sketchById(skid);
    if (!sk || !closedCount(sk)) { note("This sketch has no closed profile yet."); return; }
    var ax = sketchAxisCline(sk);
    if (ax === null) { note("Draw a VERTICAL centreline (⌖ tool) as the revolve axis first — the profile must lie on one side of it."); return; }
    if (featureForSketch(skid)) { note("This sketch already drives a feature."); return; }
    var f = {
      id: uid("f"), type: type, name: (type === "groove" ? "Groove." : "Shaft.") + countType(type), sketchId: skid,
      L: 0, dir: 1, angle: 360, axisX: ax,
      edge: { style: "none", size: 1 }, tol: { on: false, plus: 0, minus: 0 },
      pattern: mkPattern()
    };
    D().features.push(f);
    S.selFeat = f.id;
    pushHist(); renderAll();
    setStep("model");
    note(type === "groove" ? "Groove revolves the profile and removes it (angle editable on the feature card)." : "Shaft revolves the profile about the sketch centreline (angle editable on the feature card).");
  }
  function sketchOpenProfile(sk) {
    var p = null;
    sk.entities.forEach(function (e) {
      if (p) { return; }
      if (e.type === "poly" && !e.closed && !e.cons && (e.pts || []).length >= 2 && e.kind !== "ngon" && e.kind !== "arc") { p = e; }
    });
    return p;
  }
  function ribFromSketch(skid) {
    var sk = sketchById(skid);
    if (!sk) { return; }
    var line = sketchOpenProfile(sk);
    if (!line) { note("A rib needs an OPEN polyline (2+ points) in the sketch — it gets thickened into a web."); return; }
    var f = {
      id: uid("f"), type: "rib", name: "Rib." + countType("rib"), sketchId: skid,
      L: 20, t: 4, dir: (sk.plane && sk.plane.kind === "faceBottom") ? -1 : 1,
      edge: { style: "none", size: 1 }, tol: { on: false, plus: 0, minus: 0 },
      pattern: mkPattern()
    };
    D().features.push(f);
    S.selFeat = f.id;
    pushHist(); renderAll();
    setStep("model");
    note("Rib thickens the open polyline by " + f.t + " mm and extrudes it (thickness/length on the feature card).");
  }
  /* open polyline ± t/2 → closed ring (miter joins, butt ends) */
  function ribRingOf(f) {
    var sk = sketchById(f.sketchId);
    var line = sk ? sketchOpenProfile(sk) : null;
    if (!line) { return null; }
    var pts = line.pts, d = Math.max(0.1, num(f.t, 4)) / 2, out = [], i;
    function nrm(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; }
    for (i = 0; i < pts.length; i++) {
      var n1 = i > 0 ? nrm(pts[i - 1], pts[i]) : nrm(pts[0], pts[1]);
      var n2 = i < pts.length - 1 ? nrm(pts[i], pts[i + 1]) : n1;
      var nx = n1[0] + n2[0], ny = n1[1] + n2[1];
      var k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
      var ff = k > 1e-4 ? 1 / k : 2; if (ff > 2) { ff = 2; } if (ff < 0) { ff = 2; }
      out.push([pts[i][0] + nx * ff * d, pts[i][1] + ny * ff * d]);
    }
    var ring = out.slice();
    for (i = pts.length - 1; i >= 0; i--) {
      var m1 = out[i], dx = m1[0] - pts[i][0], dy = m1[1] - pts[i][1];
      ring.push([pts[i][0] - dx, pts[i][1] - dy]);
    }
    return ring.length >= 3 ? ring : null;
  }
  /* feature rail: every PartDesign tool runs on the ACTIVE sketch, always
     visible — when a precondition is missing the app says so in plain words
     instead of hiding the button (the "I cannot find the tools" complaint) */
  function featureFromActiveSketch(kind) {
    var sk2 = sketch();
    if (!sk2) { return; }
    if (featureForSketch(sk2.id)) { note(sk2.name + " already drives a feature — select it in the tree to edit, or draw on a new sketch."); return; }
    if ((kind === "pocket" || kind === "groove") && !D().features.length) {
      note(kind === "pocket" ? "A pocket cuts into an existing solid — make a pad (or shaft) first." : "A groove removes material from an existing solid — make a pad (or shaft) first.");
      return;
    }
    if (kind === "pad") { closeSketchToPad(); return; }
    if (kind === "pocket") { pocketFromSketch(sk2.id); return; }
    if (kind === "shaft" || kind === "groove") { revolveSketch(sk2.id, kind); return; }
    if (kind === "rib") { ribFromSketch(sk2.id); return; }
  }
  /* dress-up bar (3D step): every action opens its CATIA-style Definition
     dialog. Chamfer/fillet's second click on the SAME armed feature applies
     the marked edges / disarms the picker (CATIA edge-pick semantics). */
  function dressSelectedFeature(kind) {
    var d = D(), f = null;
    if (S.selFeat) { f = featureById(S.selFeat); }
    if (!f && d.features.length === 1) { f = d.features[0]; }
    if (!f) {
      note(d.features.length ? "Select the feature to dress up first — click it in the tree or on the 3D model." : "Make a 3D feature first (pad, shaft, …), then dress it up here.");
      return;
    }
    if (kind === "chamfer" || kind === "fillet") {
      if (f.type !== "pad") { note((kind === "chamfer" ? "Chamfer" : "Fillet") + " edge-picking works on pads — for pockets/open sketches use the 2D Corner/Chamfer tools inside the sketch, exactly like CATIA."); return; }
      if (num(f.draftDeg, 0) > 0 || num(f.shellT, 0) > 0) { note("Remove Draft/Shell from " + f.name + " before picking edges (CATIA limits edge dress-up on drafted/shelled bodies)."); return; }
      if (S.armed3d && S.armed3d.kind === kind && S.selFeat === f.id) {
        if ((f.edgeSel || []).length) { applyEdgeSelection(f); } else { disarmFacePick(); }
        return;
      }
      openEdgeDressDialog(kind, f);
      return;
    }
    if (kind === "draft" || kind === "shell") {
      if (f.type !== "pad") { note((kind === "draft" ? "Draft" : "Shell") + " applies to pad features — select a pad."); return; }
      openDressDialog(kind, f);
      return;
    }
    if (kind === "pattern" || kind === "mirror") {
      openDressDialog(kind, f);
      return;
    }
  }
  function mkPattern() { return { mode: "none", nx: 2, ny: 2, dx: 30, dy: 30, n: 6, ang: 360 }; }
  function instCountOf(f) {
    var p = f.pattern;
    if (!p || p.mode === "none" || !p.mode) { return 1; }
    if (p.mode === "rect") { return Math.max(1, Math.min(100, p.nx | 0)) * Math.max(1, Math.min(100, p.ny | 0)); }
    if (p.mode === "circ") { return Math.max(1, Math.min(200, p.n | 0)); }
    return 1;
  }
  function deleteFeature(fid) {
    var i = D().features.findIndex(function (f) { return f.id === fid; });
    if (i < 0) { return; }
    D().features.splice(i, 1);
    /* orphan sketch stays — user can pad it again or delete it */
    if (S.selFeat === fid) { S.selFeat = null; }
    pushHist(); renderAll();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
  }
  function deleteSketch(skid) {
    var d = D();
    d.features = d.features.filter(function (f) { return f.sketchId !== skid; });
    d.sketches = d.sketches.filter(function (s2) { return s2.id !== skid; });
    if (d.activeSketch === skid) { d.activeSketch = d.sketches.length ? d.sketches[0].id : null; }
    S.selEnt = null;
    pushHist(); renderAll();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
    if (!d.sketches.length && S.step === "sketch") { setStep("plane"); }
  }

  /* the three datum planes the app starts with (pickable in the 3D view) */
  var DATUMS = {
    xy: { plane: { kind: "xy", origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }, label: "Datum plane XY (flat)" },
    xz: { plane: { kind: "xz", origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] }, label: "Datum plane XZ (upright)" },
    yz: { plane: { kind: "yz", origin: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] }, label: "Datum plane YZ (upright)" }
  };
  function startSketchOnDatum(kind) {
    var dtm = DATUMS[kind] || DATUMS.xy;
    var plane = JSON.parse(JSON.stringify(dtm.plane));
    var sk2 = newSketchOnPlane(plane, null, "Sketch." + (D().sketches.length + 1));
    sk2.faceLabel = dtm.label;
    renderTree();
    return sk2;
  }

  /* new sketch on an arbitrary plane (face picking provides it) */
  function newSketchOnPlane(plane, host, name, faceOutline, faceLabel) {
    var sk = { id: uid("sk"), name: name || ("Sketch." + (D().sketches.length + 1)), plane: plane, host: host || null, entities: [] };
    if (faceOutline) { sk.faceOutline = faceOutline; }
    if (faceLabel) { sk.faceLabel = faceLabel; }
    D().sketches.push(sk);
    D().activeSketch = sk.id;
    S.selEnt = null;
    pushHist();
    setStep("sketch");
    renderAll();
    S.cam = { x: 0, y: 0, z: 5 };
    skFit();
    note("Sketching " + sk.name + (faceLabel ? " (" + faceLabel + ")" : "") + " — draw and close a profile, then 'Close sketch → Pad'.");
    return sk;
  }

  function armFacePick(kind) {
    S.armed3d = kind;
    var hint = qs(document, "[data-facehint]");
    if (hint) {
      hint.hidden = false;
      hint.innerHTML = (kind === "facesketch"
        ? "✏ <b>Sketch on face:</b> click a flat face of the model (Esc to cancel)"
        : "⬤ <b>Hole on face:</b> click a flat face to drill (Esc to cancel)");
    }
    setStep("model");
    note(kind === "facesketch" ? "Click a flat face of the 3D model to start a sketch there." : "Click a flat top/bottom face of the model to drill a hole.");
  }
  function disarmFacePick() {
    S.armed3d = null;
    var hint = qs(document, "[data-facehint]");
    if (hint) { hint.hidden = true; }
    var eh = qs(document, "[data-edgehint]");
    if (eh) { eh.hidden = true; }
    if (window.__rgzcad2 && window.__rgzcad2.clearEdgeHl) { window.__rgzcad2.clearEdgeHl(); }
    D().features.forEach(function (f) { f.edgeSel = []; });
    renderToolHint();
  }

  /* ------------------------------------------------------------------ */
  /* per-edge 3D dress-up (Update 17): click the VERTICAL edges of a pad  */
  /* and fillet/chamfer exactly those — CATIA "select the edge" behavior. */
  /* ------------------------------------------------------------------ */
  /* interior angle at vertex i (reflex > π for concave corners);
     matches applyEdgeOps in the worker exactly */
  function vertexInteriorAngle(pts, i) {
    var n = pts.length, p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    var a1 = Math.atan2(a[1] - p[1], a[0] - p[0]), a2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    var th = a1 - a2;
    while (th <= 0) { th += 2 * Math.PI; }
    if (polyArea(pts) < 0) { th = 2 * Math.PI - th; }
    return th;
  }
  /* signed area an edge op removes (negative = material added, concave corner) */
  function edgeOpSignedArea(op) {
    var th = op.ang || Math.PI / 2;
    var convex = th <= Math.PI;
    var phi = convex ? th : 2 * Math.PI - th;
    var dA = op.style === "fillet"
      ? op.r * op.r / Math.tan(phi / 2) - op.r * op.r / 2 * (Math.PI - phi)
      : 0.5 * op.d * op.d * Math.sin(phi);
    return convex ? dA : -dA;
  }
  /* pickable vertical edges of a pad: every vertex of every SOLID
     classified ring (line-drawn profiles included) */
  function profileEdgesFor(f) {
    if (!f || f.type !== "pad") { return null; }
    if (num(f.shellT, 0) > 0) { return null; }
    var sk = sketchById(f.sketchId);
    if (!sk) { return null; }
    var prof = profilesOf(sk);
    if (!prof.length) { return null; }
    var items = classifyContours(prof.map(function (p) { return p.pts; }));
    var edges = [];
    items.forEach(function (it, ri) {
      if (it.role !== "solid") { return; }   /* inner void rims: use the 2D Corner/Chamfer tools in the sketch */
      it.pts.forEach(function (p, vi) { edges.push({ ring: ri, vi: vi, p: p }); });
    });
    if (!edges.length) { return null; }
    return { sk: sk, f: f, items: items, edges: edges };
  }
  function edgePickSize(kind) { return kind === "fillet" ? Math.max(0.2, num(S.ui.filletR, 3)) : Math.max(0.2, num(S.ui.chamferD, 2)); }
  function upEdgeHint(f) {
    var el = qs(document, "[data-edgehint]");
    if (!el) { return; }
    var kind = S.armed3d && S.armed3d.kind;
    if (!f || !kind) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = (kind === "fillet" ? "\u25dc <b>Fillet R " + fmt(edgePickSize("fillet"), 1) + "</b>" : "\u25fa <b>Chamfer " + fmt(edgePickSize("chamfer"), 1) + " mm</b>") +
      " · click the <b>vertical edges</b> of <b>" + esc(f.name) + "</b> (" + (f.edgeSel || []).length + " marked) · click again to unmark · <b>Apply</b> on the card or Esc to finish";
  }
  function armEdgePick(kind, f) {
    S.armed3d = { kind: kind };
    S.selFeat = f.id;
    f.edgeSel = f.edgeSel || [];
    setStep("model");
    renderPanel();
    upEdgeHint(f);
    note((kind === "fillet" ? "Fillet" : "Chamfer") + ": click the VERTICAL edges of " + f.name + " to dress exactly those — marked " + (f.edgeSel.length || 0) + ". Whole top/bottom rim: use 'Edge finish' on the card. Esc finishes.");
    if (window.__rgzcad2 && window.__rgzcad2.edgeHighlightFrom) { window.__rgzcad2.edgeHighlightFrom(f); }
  }
  function applyEdgeSelection(f) {
    var kind = S.armed3d && S.armed3d.kind;
    if (!kind || !f) { return; }
    if (!(f.edgeSel || []).length) { note("Mark at least one vertical edge on the model first — click it (it highlights)."); return; }
    var ctx = profileEdgesFor(f);
    if (!ctx) { note("This feature has no straight vertical edges to dress."); return; }
    var size = edgePickSize(kind), applied = 0;
    f.edgeOps = f.edgeOps || [];
    f.edgeSel.forEach(function (key) {
      var ri = +key.split(":")[0], vi = +key.split(":")[1];
      var ring = ctx.items[ri];
      if (!ring) { return; }
      f.edgeOps = f.edgeOps.filter(function (o) { return !(o.ring === ri && o.vi === vi); });
      f.edgeOps.push({
        style: kind === "chamfer" ? "chamfer" : "fillet",
        ring: ri, vi: vi,
        r: kind === "fillet" ? size : 3,
        d: kind === "chamfer" ? size : 2,
        ang: vertexInteriorAngle(ring.pts, vi)
      });
      applied++;
    });
    f.edgeSel = [];
    disarmFacePick();
    pushHist(); renderAll();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
    note((kind === "fillet" ? "Fillet R " + fmt(size, 1) : "Chamfer " + fmt(size, 1) + " mm") + " applied to " + applied + " edge(s) — listed and removable on the feature card.");
  }
  function edgeOpsSummary(f) {
    var n = (f.edgeOps || []).length;
    return n ? n + " picked edge" + (n > 1 ? "s" : "") : "";
  }

  /* ---------------- CATIA-style definition dialogs (modal popups) ----------------
     Every 3D action opens a Definition dialog: Hole, Pad, Pocket, Shaft,
     Groove, Rib, Chamfer/Fillet (edge), Draft, Shell, Pattern, Mirror. OK
     applies, Cancel aborts; every value stays re-editable later from the
     ⚙ buttons in the specification tree. */
  function modalRoot() {
    var root = document.querySelector("[data-rgzcad]");
    if (!root) { return null; }
    var ov = qs(root, "[data-cadmodal]");
    if (!ov) {
      ov = document.createElement("div");
      ov.className = "rgzcad-modal";
      ov.setAttribute("data-cadmodal", "");
      ov.hidden = true;
      ov.innerHTML = '<div class="box"><div class="mhead"><b data-cadmodal-title></b><button type="button" class="x" data-cadmodal-close title="Close without changes (Esc)">×</button></div>' +
        '<div class="mbody" data-cadmodal-body></div><div class="mfoot" data-cadmodal-foot></div></div>';
      root.appendChild(ov);
      ov.addEventListener("mousedown", function (e2) { if (e2.target === ov) { closeModal(); } });
      qs(ov, "[data-cadmodal-close]").addEventListener("click", function () { closeModal(); });
    }
    return ov;
  }
  function openModal(title, bodyHtml, buttons) {
    var ov = modalRoot();
    if (!ov) { return null; }
    qs(ov, "[data-cadmodal-title]").textContent = title;
    var body = qs(ov, "[data-cadmodal-body]"), foot = qs(ov, "[data-cadmodal-foot]");
    body.innerHTML = bodyHtml;
    foot.innerHTML = "";
    (buttons || []).forEach(function (bt) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "rgzcad-btn " + (bt.cls || "ghost");
      b.setAttribute("data-m-act", bt.id || bt.label);
      b.textContent = bt.label;
      b.addEventListener("click", function () {
        if (bt.act === "cancel") { closeModal(); return; }
        if (typeof bt.act === "function") { bt.act(body); }
      });
      foot.appendChild(b);
    });
    ov.hidden = false;
    ov.classList.add("on");
    var firstNum = qs(body, "input");
    if (firstNum && firstNum.select) { try { firstNum.select(); } catch (e2) {} }
    return body;
  }
  function closeModal() {
    var root = document.querySelector("[data-rgzcad]");
    var ov = root ? qs(root, "[data-cadmodal]") : null;
    if (ov) { ov.classList.remove("on"); ov.hidden = true; }
  }
  function modalIsOpen() {
    var root = document.querySelector("[data-rgzcad]");
    var ov = root ? qs(root, "[data-cadmodal]") : null;
    return !!(ov && !ov.hidden);
  }
  function mNum(body, k, d0) { var n2 = qs(body, '[data-m-num="' + k + '"]'); return n2 ? num(n2.value, d0) : d0; }
  function mSel(body, k, d0) { var n2 = qs(body, '[data-m-sel="' + k + '"]'); return n2 ? n2.value : d0; }
  function mChk(body, k) { var n2 = qs(body, '[data-m-chk="' + k + '"]'); return !!(n2 && n2.checked); }

  /* ISO 261 metric coarse threads: [designation, pitch, tapping drill Ø] */
  var METRIC_COARSE = [["M3", 0.5, 2.5], ["M4", 0.7, 3.3], ["M5", 0.8, 4.2], ["M6", 1, 5.0], ["M8", 1.25, 6.8], ["M10", 1.5, 8.5], ["M12", 1.75, 10.2], ["M14", 2, 12.0], ["M16", 2, 14.0], ["M18", 2.5, 15.5], ["M20", 2.5, 17.5], ["M22", 2.5, 19.5], ["M24", 3, 21.0]];
  function sketchOfEntity(ent) {
    var found = null;
    D().sketches.forEach(function (sk) {
      (sk.entities || []).forEach(function (e) { if (e === ent || e.id === ent.id) { found = sk; } });
    });
    return found;
  }

  /* ============ HOLE DEFINITION (ISO) ============ */
  function holeBodyHtml(c) {
    var h2 = '<div class="rgzcad-mrow"><label>Type</label><select data-m-sel="hType">' +
      [["through", "Through all"], ["blind", "Blind ↧"], ["cbore", "Counterbore ⌴"], ["csink", "Countersink ⌵"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (c.hType === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></div>";
    h2 += '<div class="rgzcad-mrow"><label>⌀ drill (mm)</label><input type="number" step="0.1" min="0.5" data-m-num="dia" value="' + fmt(2 * c.r, 2) + '"' + (c.thread.on ? " disabled" : "") + ">" +
      (c.thread.on ? "<small>tapping drill — set by the thread</small>" : "") + "</div>";
    if (c.hType === "blind") { h2 += '<div class="rgzcad-mrow"><label>↧ Depth (mm)</label><input type="number" step="0.5" min="0.5" data-m-num="depth" value="' + fmt(c.depth, 1) + '"></div>'; }
    if (c.hType === "cbore") { h2 += '<div class="rgzcad-mrow"><label>⌴ ⌀ / ↧ (mm)</label><input type="number" step="0.1" min="0.2" data-m-num="cbd" value="' + fmt(c.cbd, 1) + '"><input type="number" step="0.5" min="0.2" data-m-num="cbdDepth" value="' + fmt(c.cbdDepth, 1) + '"></div>'; }
    if (c.hType === "csink") { h2 += '<div class="rgzcad-mrow"><label>⌵ ⌀ / angle°</label><input type="number" step="0.1" min="0.2" data-m-num="cbd" value="' + fmt(c.cbd, 1) + '"><input type="number" step="1" min="30" max="170" data-m-num="csAngle" value="' + fmt(c.csAngle, 0) + '"></div>'; }
    h2 += '<div class="rgzcad-mrow"><label>Thread (ISO metric)</label><select data-m-sel="mthread"><option value="">— none (plain hole) —</option>' +
      METRIC_COARSE.map(function (r2) { return '<option value="' + r2[0] + '"' + (c.thread.iso === r2[0] ? " selected" : "") + ">" + r2[0] + " × " + r2[1] + " · tap drill ⌀ " + r2[2] + "</option>"; }).join("") + "</select></div>";
    h2 += '<div class="rgzcad-mrow"><label>Position x / y (mm)</label><input type="number" step="0.5" data-m-num="cx" value="' + fmt(c.cx, 2) + '"><input type="number" step="0.5" data-m-num="cy" value="' + fmt(c.cy, 2) + '"></div>';
    h2 += '<div class="rgzcad-note">ISO callout on the drawing updates itself (e.g. <b>M8 × 1.25</b>, <b>Ø12 ↧ 25</b>, counterbore ⌴ / countersink ⌵ symbols). Choosing a thread locks the drill to the tapping size — clear the thread to free the Ø again.</div>';
    return h2;
  }
  function holeCollect(body, c) {
    c.hType = mSel(body, "hType", c.hType);
    var iso = mSel(body, "mthread", c.thread.iso || "");
    c.thread.iso = iso; c.thread.on = !!iso;
    if (!c.thread.on) { c.r = Math.max(0.25, mNum(body, "dia", 2 * c.r) / 2); }
    if (c.hType === "blind") { c.depth = Math.max(0.5, mNum(body, "depth", c.depth)); }
    if (c.hType === "cbore") { c.cbd = Math.max(2 * c.r + 0.2, mNum(body, "cbd", c.cbd)); c.cbdDepth = Math.max(0.2, mNum(body, "cbdDepth", c.cbdDepth)); }
    if (c.hType === "csink") { c.cbd = Math.max(2 * c.r + 0.2, mNum(body, "cbd", c.cbd)); c.csAngle = Math.max(30, Math.min(170, mNum(body, "csAngle", c.csAngle))); }
    c.cx = mNum(body, "cx", c.cx); c.cy = mNum(body, "cy", c.cy);
  }
  function openHoleDialog(ent, opts) {
    opts = opts || {};
    var info = opts.info || null;
    var cur = ent ? {
      cx: ent.cx, cy: ent.cy, r: ent.r, hType: ent.hType || "through",
      depth: num(ent.depth, 10), cbd: num(ent.cbd, 2 * ent.r + 4), cbdDepth: num(ent.cbdDepth, 3), csAngle: num(ent.csAngle, 90),
      thread: { on: !!(ent.thread && ent.thread.on), pitch: num(ent.thread && ent.thread.pitch, stdPitch(2 * ent.r)), iso: (ent.thread && ent.thread.iso) || "" }
    } : {
      cx: info ? info.local[0] : 10, cy: info ? info.local[1] : 10,
      r: num(S.ui.holeR, 5), hType: S.ui.holeType || "through",
      depth: num(S.ui.holeDepth, 10), cbd: num(S.ui.holeCbd, 14), cbdDepth: num(S.ui.holeCbdDepth, 3), csAngle: num(S.ui.csAngle, 90),
      thread: { on: false, pitch: stdPitch(2 * num(S.ui.holeR, 5) * 2), iso: "" }
    };
    var bx = openModal(ent ? "Hole Definition" : "Hole on face — Definition", holeBodyHtml(cur), [
      { label: "Cancel", cls: "ghost", act: "cancel", id: "cancel" },
      { label: ent ? "OK — update hole" : "OK — place hole", cls: "brand", id: "ok", act: function (body) { applyHoleDialog(ent, opts, body, cur); } }
    ]);
    if (!bx) { return; }
    function rebind() {
      var typeSel = qs(bx, '[data-m-sel="hType"]'), thSel = qs(bx, '[data-m-sel="mthread"]');
      if (typeSel) { typeSel.addEventListener("change", function () { holeCollect(bx, cur); cur.hType = typeSel.value; bx.innerHTML = holeBodyHtml(cur); rebind(); }); }
      if (thSel) { thSel.addEventListener("change", function () {
        holeCollect(bx, cur);
        var iso = thSel.value;
        cur.thread.iso = iso; cur.thread.on = !!iso;
        if (iso) { METRIC_COARSE.forEach(function (r2) { if (r2[0] === iso) { cur.thread.pitch = r2[1]; cur.r = r2[2] / 2; } }); }
        bx.innerHTML = holeBodyHtml(cur); rebind();
      }); }
    }
    rebind();
  }
  function applyHoleDialog(ent, opts, body, cur) {
    holeCollect(body, cur);
    holeSyncUi(cur);
    var skc, he;
    if (ent) {
      skc = opts.sk || sketchOfEntity(ent) || sketch();
      he = ent;
    } else {
      var info = opts.info || null;
      var hostF = info ? featureById(info.host) : null;
      skc = (hostF && sketchById(hostF.sketchId)) || opts.sk || sketch();
      if (!skc) { note("No sketch to receive the hole yet."); return; }
      he = mkEnt("hole", { cx: cur.cx, cy: cur.cy, r: cur.r });
      skc.entities.push(he);
    }
    he.cx = cur.cx; he.cy = cur.cy; he.r = Math.max(0.25, cur.r);
    he.hType = cur.hType; he.depth = Math.max(0.5, cur.depth);
    he.cbd = cur.cbd; he.cbdDepth = cur.cbdDepth; he.csAngle = cur.csAngle;
    he.thread = { on: !!cur.thread.on, pitch: num(cur.thread.pitch, stdPitch(2 * he.r)), iso: cur.thread.iso || "" };
    D().activeSketch = skc.id;
    S.selEnt = he.id; S.selSet = [he.id];
    closeModal();
    pushHist(); renderAll();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
    var msg2 = "⬤ " + holeTypeLabel(he) + " @ (" + fmt(he.cx, 1) + ", " + fmt(he.cy, 1) + ") — change it anytime: tree ⬤ node ⚙, or the panel.";
    var its = classifyContours(profilesOf(skc).map(function (p3) { return p3.pts; }));
    if (!holeHasMaterial(its, he)) { msg2 = "⚠ Hole placed OUTSIDE the material — it removes nothing. Fix x/y in the Hole Definition (tree ⚙)."; }
    note(msg2);
    return he;
  }
  function holeSyncUi(cur) {
    S.ui.holeR = cur.r; S.ui.holeType = cur.hType; S.ui.holeDepth = cur.depth;
    S.ui.holeCbd = cur.cbd; S.ui.holeCbdDepth = cur.cbdDepth; S.ui.csAngle = cur.csAngle;
  }

  /* ============ FEATURE DEFINITION (pad/pocket/shaft/groove/rib) ============ */
  function featureBodyHtml(f) {
    var ft = f.type;
    var body = '<div class="rgzcad-mrow"><label>Name</label><input type="text" data-m-str="name" value="' + esc(f.name || "") + '" maxlength="60" style="flex:1"></div>';
    if (ft === "pad" || ft === "pocket") {
      body += '<div class="rgzcad-mrow"><label>' + (ft === "pad" ? "Length L (mm)" : "Depth ↧ (mm)") + '</label><input type="number" step="1" min="0.5" data-m-num="L" value="' + fmt(f.L, 2) + '"></div>';
    }
    if (ft === "pad") {
      body += '<div class="rgzcad-mrow"><label>Direction</label><select data-m-sel="dir">' +
        '<option value="1"' + (f.dir === -1 ? "" : " selected") + ">Along plane normal</option>" +
        '<option value="-1"' + (f.dir === -1 ? " selected" : "") + ">Reversed (−normal)</option></select></div>";
      body += '<div class="rgzcad-mrow"><label>Draft angle (°)</label><input type="number" step="0.5" min="0" max="45" data-m-num="draftDeg" value="' + fmt(num(f.draftDeg, 0), 2) + '"></div>';
      body += '<div class="rgzcad-mrow"><label>Shell thickness (mm)</label><input type="number" step="0.5" min="0" data-m-num="shellT" value="' + fmt(num(f.shellT, 0), 2) + '"></div>';
    }
    if (ft === "shaft" || ft === "groove") {
      body += '<div class="rgzcad-mrow"><label>Revolve angle (°)</label><input type="number" step="1" min="1" max="360" data-m-num="angle" value="' + fmt(num(f.angle, 360), 0) + '"></div>';
      body += '<div class="rgzcad-mrow"><label>Axis x (mm)</label><input type="number" step="1" data-m-num="axisX" value="' + fmt(num(f.axisX, 0), 1) + '"></div>';
    }
    if (ft === "rib") {
      body += '<div class="rgzcad-mrow"><label>Rib thickness (mm)</label><input type="number" step="0.5" min="0.2" data-m-num="t" value="' + fmt(num(f.t, 4), 1) + '"></div>';
      body += '<div class="rgzcad-mrow"><label>Length along normal (mm)</label><input type="number" step="1" min="0.5" data-m-num="L" value="' + fmt(f.L, 1) + '"></div>';
    }
    var es = f.edge && f.edge.style ? f.edge.style : "none";
    body += '<div class="rgzcad-mrow"><label>Edge finish (rim)</label><select data-m-sel="edge">' +
      [["none", "None"], ["chamfer", "Chamfer 45°"], ["fillet", "Fillet (round)"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (es === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select>" +
      '<input type="number" step="0.5" min="0.1" data-m-num="edgeSize" value="' + fmt(num(f.edge && f.edge.size, 1.5), 2) + '" title="Chamfer leg / fillet radius"></div>';
    if (ft === "pad") {
      var eoN = (f.edgeOps || []).length;
      body += '<div class="rgzcad-note">Single picked edges: <b>' + eoN + '</b> round(s)' + (eoN ? " — remove single ones in the tree or on the card." : " — none yet.") + "</div>" +
        '<button type="button" class="rgzcad-btn ghost block" data-m-pickedges>◔ Pick single edges in the 3D view…</button>';
    }
    var p = f.pattern && f.pattern.mode ? f.pattern : mkPattern();
    body += '<div class="rgzcad-mrow"><label>Pattern</label><select data-m-sel="pmode">' +
      [["none", "Off (single)"], ["rect", "Rectangular"], ["circ", "Circular"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (p.mode === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></div>" +
      '<div class="rgzcad-mrow"><label>Rect: nx × ny</label><input type="number" min="1" max="100" data-m-num="pnx" value="' + (p.nx | 0) + '"><input type="number" min="1" max="100" data-m-num="pny" value="' + (p.ny | 0) + '"></div>' +
      '<div class="rgzcad-mrow"><label>Rect: dx × dy (mm)</label><input type="number" step="1" data-m-num="pdx" value="' + fmt(p.dx, 1) + '"><input type="number" step="1" data-m-num="pdy" value="' + fmt(p.dy, 1) + '"></div>' +
      '<div class="rgzcad-mrow"><label>Circ: n / sweep°</label><input type="number" min="1" max="200" data-m-num="pn" value="' + (p.n | 0) + '"><input type="number" step="15" min="1" max="360" data-m-num="pang" value="' + fmt(p.ang, 0) + '"></div>';
    return body;
  }
  function openFeatureDialog(f) {
    var NAMES = { pad: "Pad", pocket: "Pocket", shaft: "Shaft", groove: "Groove", rib: "Rib" };
    var bx = openModal((NAMES[f.type] || f.type) + " Definition — " + (f.name || ""), featureBodyHtml(f), [
      { label: "Cancel", cls: "ghost", act: "cancel", id: "cancel" },
      { label: "OK — apply", cls: "brand", id: "ok", act: function (body) { applyFeatureDialog(f, body); } }
    ]);
    if (!bx) { return; }
    var pe = qs(bx, "[data-m-pickedges]");
    if (pe) {
      pe.addEventListener("click", function () {
        f.edge = f.edge && f.edge.style ? f.edge : { style: "chamfer", size: 1.5 };
        if (f.edge.style === "none") { f.edge.style = "chamfer"; }
        closeModal();
        selectFeature(f.id);
        armEdgePick(f.edge.style === "fillet" ? "fillet" : "chamfer", f);
      });
    }
  }
  function applyFeatureDialog(f, body) {
    f.name = (qs(body, '[data-m-str="name"]') || {}).value || f.name;
    if (f.type === "pad" || f.type === "pocket" || f.type === "rib") { f.L = Math.max(0.5, mNum(body, "L", f.L)); }
    if (f.type === "rib") { f.t = Math.max(0.2, mNum(body, "t", num(f.t, 4))); }
    if (f.type === "pad") {
      f.dir = mSel(body, "dir", "1") === "-1" ? -1 : 1;
      f.draftDeg = Math.max(0, mNum(body, "draftDeg", 0));
      f.shellT = Math.max(0, mNum(body, "shellT", 0));
      if (f.draftDeg > 0 && f.shellT > 0) { f.shellT = 0; note("Draft and shell are mutually exclusive on one body — shell cleared (as CATIA limits it)."); }
    }
    if (f.type === "shaft" || f.type === "groove") { f.angle = Math.max(1, Math.min(360, mNum(body, "angle", 360))); f.axisX = mNum(body, "axisX", 0); }
    f.edge = { style: mSel(body, "edge", "none"), size: Math.max(0.1, mNum(body, "edgeSize", 1.5)) };
    f.pattern = f.pattern && f.pattern.mode ? f.pattern : mkPattern();
    f.pattern.mode = mSel(body, "pmode", "none");
    f.pattern.nx = Math.max(1, Math.min(100, mNum(body, "pnx", 2) | 0));
    f.pattern.ny = Math.max(1, Math.min(100, mNum(body, "pny", 2) | 0));
    f.pattern.dx = mNum(body, "pdx", 30); f.pattern.dy = mNum(body, "pdy", 30);
    f.pattern.n = Math.max(1, Math.min(200, mNum(body, "pn", 6) | 0));
    f.pattern.ang = Math.max(1, Math.min(360, mNum(body, "pang", 360)));
    closeModal();
    selectFeature(f.id);
    pushHist(); renderAll();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
    if (S.step === "drawing") { renderDrawingSheet(); }
    note(f.name + " updated — every parameter of every 3D action stays editable from the tree (⚙).");
  }

  /* ============ DRESS-UP dialogs (chamfer/fillet/draft/shell/pattern/mirror) ============ */
  function openEdgeDressDialog(kind, f) {
    var isF = kind === "fillet";
    var size = isF ? num(S.ui.filletR, 3) : num(S.ui.chamferD, 2);
    var body = '<div class="rgzcad-mrow"><label>' + (isF ? "Radius R (mm)" : "Chamfer leg (mm)") + '</label><input type="number" step="0.5" min="0.1" data-m-num="size" value="' + fmt(size, 2) + '"></div>' +
      '<div class="rgzcad-note">Two CATIA ways: <b>pick individual vertical edges</b> in the 3D view (click several, then Apply), or round <b>the whole top+bottom rim</b> at once. Convex edges remove material, concave ones add it — signed exactly.</div>';
    openModal((isF ? "Edge Fillet Definition — " : "Chamfer Definition — ") + f.name, body, [
      { label: "Cancel", cls: "ghost", act: "cancel", id: "cancel" },
      { label: "Whole rim", cls: "ghost", id: "rim", act: function (bx) {
          var v = Math.max(0.1, mNum(bx, "size", size));
          if (isF) { S.ui.filletR = v; } else { S.ui.chamferD = v; }
          f.edge = { style: isF ? "fillet" : "chamfer", size: v };
          closeModal(); selectFeature(f.id); pushHist(); renderAll();
          if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
          note((isF ? "Fillet R " : "Chamfer ") + fmt(v, 1) + " on the whole rim of " + f.name + " — off via Edge finish = none (card or ⚙ dialog).");
        } },
      { label: "◔ Pick edges…", cls: "brand", id: "pick", act: function (bx) {
          var v = Math.max(0.1, mNum(bx, "size", size));
          if (isF) { S.ui.filletR = v; } else { S.ui.chamferD = v; }
          closeModal(); selectFeature(f.id);
          armEdgePick(isF ? "fillet" : "chamfer", f);
        } }
    ]);
  }
  function openDressDialog(kind, f) {
    if (kind === "draft" || kind === "shell") {
      var isD = kind === "draft";
      var cur = isD ? num(f.draftDeg, 0) : num(f.shellT, 0);
      var def = cur > 0 ? cur : (isD ? 3 : 2);
      var body = '<div class="rgzcad-mrow"><label>' + (isD ? "Draft angle (°)" : "Wall thickness (mm)") + '</label><input type="number" step="0.5" min="0" data-m-num="v" value="' + fmt(def, 2) + '"></div>' +
        '<div class="rgzcad-note">' + (isD ?
          "Walls lean out by the angle (mould release). 0 = no draft. Mutually exclusive with Shell — the CATIA body limit." :
          "Hollows the pad to the wall thickness, open top. 0 = solid again. Mutually exclusive with Draft.") + "</div>" +
        (cur > 0 ? '<label class="rgzcad-check"><span>Remove the ' + (isD ? "draft" : "shell") + " from " + esc(f.name) + '</span><input type="checkbox" data-m-chk="rm"></label>' : "");
      openModal((isD ? "Draft Definition — " : "Shell Definition — ") + f.name, body, [
        { label: "Cancel", cls: "ghost", act: "cancel", id: "cancel" },
        { label: "OK — apply", cls: "brand", id: "ok", act: function (bx) {
            if (mChk(bx, "rm")) { if (isD) { f.draftDeg = 0; } else { f.shellT = 0; } }
            else {
              var v = Math.max(0, mNum(bx, "v", def));
              if (isD) { f.draftDeg = v; if (v > 0) { f.shellT = 0; } }
              else { f.shellT = v; if (v > 0) { f.draftDeg = 0; } }
            }
            closeModal(); selectFeature(f.id); pushHist(); renderAll();
            if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
            note(isD ? (f.draftDeg > 0 ? "Draft " + fmt(f.draftDeg, 1) + "° on " + f.name + "." : "Draft removed.") :
              (f.shellT > 0 ? "Shell " + fmt(f.shellT, 1) + " mm walls on " + f.name + " (open top)." : "Shell removed."));
          } }
      ]);
      return;
    }
    if (kind === "pattern") {
      f.pattern = f.pattern && f.pattern.mode ? f.pattern : mkPattern();
      var p = f.pattern;
      var body = '<div class="rgzcad-mrow"><label>Mode</label><select data-m-sel="mode">' +
        [["none", "Off (single)"], ["rect", "Rectangular"], ["circ", "Circular"]].map(function (o) { return '<option value="' + o[0] + '"' + (p.mode === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div>" +
        '<div class="rgzcad-mrow"><label>Rect: nx × ny</label><input type="number" min="1" max="100" data-m-num="nx" value="' + (p.nx | 0) + '"><input type="number" min="1" max="100" data-m-num="ny" value="' + (p.ny | 0) + '"></div>' +
        '<div class="rgzcad-mrow"><label>Spacing dx × dy (mm)</label><input type="number" step="1" data-m-num="dx" value="' + fmt(p.dx, 1) + '"><input type="number" step="1" data-m-num="dy" value="' + fmt(p.dy, 1) + '"></div>' +
        '<div class="rgzcad-mrow"><label>Circ: n / sweep°</label><input type="number" min="1" max="200" data-m-num="n" value="' + (p.n | 0) + '"><input type="number" step="15" min="1" max="360" data-m-num="ang" value="' + fmt(p.ang, 0) + '"></div>' +
        '<div class="rgzcad-note">Rectangular repeats along the sketch axes; circular repeats about the sketch normal. Hardware-safe caps: 100 × 100, 200 circular.</div>';
      openModal("Pattern Definition — " + f.name, body, [
        { label: "Cancel", cls: "ghost", act: "cancel", id: "cancel" },
        { label: "OK — apply", cls: "brand", id: "ok", act: function (bx) {
            p.mode = mSel(bx, "mode", "none");
            p.nx = Math.max(1, Math.min(100, mNum(bx, "nx", 2) | 0));
            p.ny = Math.max(1, Math.min(100, mNum(bx, "ny", 2) | 0));
            p.dx = mNum(bx, "dx", 30); p.dy = mNum(bx, "dy", 30);
            p.n = Math.max(1, Math.min(200, mNum(bx, "n", 6) | 0));
            p.ang = Math.max(1, Math.min(360, mNum(bx, "ang", 360)));
            closeModal(); selectFeature(f.id); pushHist(); renderAll();
            if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
            note(p.mode === "none" ? "Pattern off." : "Pattern: " + instCountOf(f) + " instance(s) of " + f.name + ". Reopen from the tree ⚙ anytime.");
          } }
      ]);
      return;
    }
    if (kind === "mirror") {
      var mr = D().mirror;
      if (!mr || typeof mr !== "object") { mr = { on: false, plane: "yz" }; D().mirror = mr; }
      var body = '<label class="rgzcad-check"><span>Mirrored copy of the whole part</span><input type="checkbox" data-m-chk="on"' + (mr.on ? " checked" : "") + "></label>" +
        '<div class="rgzcad-mrow"><label>Mirror plane</label><select data-m-sel="plane">' +
        [["yz", "YZ plane (left ↔ right)"], ["xz", "XZ plane (front ↔ back)"]].map(function (o) { return '<option value="' + o[0] + '"' + (mr.plane === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div>" +
        '<div class="rgzcad-note">The mirrored body appears in 3D and counts in the mass estimate.</div>';
      openModal("Mirror Definition — whole part", body, [
        { label: "Cancel", cls: "ghost", act: "cancel", id: "cancel" },
        { label: "OK — apply", cls: "brand", id: "ok", act: function (bx) {
            mr.on = mChk(bx, "on");
            mr.plane = mSel(bx, "plane", "yz");
            closeModal(); pushHist(); renderAll();
            if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
            note(mr.on ? "Mirror ON about the " + mr.plane.toUpperCase() + " plane." : "Mirror off.");
          } }
      ]);
      return;
    }
  }

  /* called by part 2 when a face is picked while armed */
  function onFacePicked(info) {
    var kind = S.armed3d;
    disarmFacePick();
    if (!info) { return; }
    if (kind === "facesketch") {
      newSketchOnPlane(info.plane, info.host, null, info.outline, info.label);
    } else if (kind === "holeface") {
      if (!info.flatTopBottom) {
        note("Drilling works on the flat top/bottom faces — for walls use 'Sketch on face' + a circle pocket.");
        return;
      }
      var hostF = featureById(info.host);
      if (hostF) {
        /* CATIA rule: picking the face opens the Hole Definition FIRST —
           type / depth / counterbore / countersink / ISO thread / position */
        openHoleDialog(null, { info: info, sk: sketchById(hostF.sketchId) });
      }
    }
  }

  /* ---------------- load/save via sketch close ---------------- */
  function closeSketchToPad() {
    var skc = sketch();
    /* auto-close open polygons with >=3 points (the "rectangle not closed" class of bugs) */
    skc.entities.forEach(function (e) {
      /* never auto-close an ARC — that would add a chord and destroy the
         line–arc plates (AutoCAD 2D exercises). Free polylines still close. */
      if (e.type === "poly" && !e.closed && e.pts.length >= 3 && e.kind !== "arc") {
        var a = e.pts[0], b = e.pts[e.pts.length - 1];
        if (!e.closed) { e.closed = true; }
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.001) { e.pts.pop(); }
      }
    });
    if (multi && multi.pts.length >= 3 && S.mode === "poly") { finishMulti(true); }
    multi = null;
    /* validate profiles don't self-intersect (cheap check on free polys) */
    var bad = 0;
    profilesOf(skc).forEach(function (p) {
      if (p.ent && p.ent.type === "poly" && selfIntersects(p.pts)) { bad++; }
    });
    if (bad) { note("⚠ " + bad + " profile(s) cross themselves — fix the contour before padding."); return; }
    if (!closedCount(skc)) { note("Draw and close at least one profile first."); return; }
    padSketch(skc.id);
  }
  function selfIntersects(pts) {
    var n = pts.length, i, j;
    function inter(a, b, c, d) {
      function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
      var d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
      return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    }
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) { continue; }
        if (inter(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) { return true; }
      }
    }
    return false;
  }

  var reb3T = null;
  function rebuild3dSoon() {
    clearTimeout(reb3T);
    reb3T = setTimeout(function () { if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); } }, 180);
  }

  /* ---------------- PANEL (right side, context aware) ---------------- */
  function renderAll() { renderTree(); renderPanel(); skDirty(); }
  var entPanelT = null;
  function renderEntityPanelSoon() { clearTimeout(entPanelT); entPanelT = setTimeout(function () { renderEntityPanelOnly(); }, 100); }

  function tolHtml(prefix, tol) {
    tol = tol || { on: false, plus: 0.1, minus: 0.1 };
    return '<div class="rgzcad-tol' + (tol.on ? " on" : "") + '" data-tolwrap="' + prefix + '">' +
      '<label class="sw"><input type="checkbox" data-bind="' + prefix + '.on" ' + (tol.on ? "checked" : "") + "> Tolerance (ISO 406)</label>" +
      '<div class="fields"><input type="number" step="0.01" data-bind="' + prefix + '.plus" value="' + tol.plus + '" title="upper deviation +' + '">' +
      '<input type="number" step="0.01" data-bind="' + prefix + '.minus" value="' + tol.minus + '" title="lower deviation −"></div>' +
      '<button type="button" class="auto" data-autotol="' + prefix + '">auto from ISO 2768</button></div>';
  }
  function fld(label, path, val, step) {
    return '<div class="fld"><label>' + label + '</label><input type="number" step="' + (step || "0.1") + '" data-bind="' + path + '" value="' + fmt(val, 3) + '"></div>';
  }

  function renderPanel() {
    var el = qs(document, "[data-panel]");
    if (!el) { return; }
    var h = "";
    var d = D();

    if (S.step === "drawing") {
      h += drawingPanelHtml();
    } else if (S.selSet && S.selSet.length > 1 && sketch() && selEnts().length > 1) {
      h += multiEntityPanelHtml(selEnts());
    } else if (S.selEnt && sketch() && entityById(sketch(), S.selEnt)) {
      h += entityPanelHtml(entityById(sketch(), S.selEnt));
    } else if (S.selFeat && featureById(S.selFeat)) {
      h += featurePanelHtml(featureById(S.selFeat));
    } else if (S.step === "sketch" || S.step === "plane") {
      h += sketchPanelHtml();
    } else {
      h += partPanelHtml();
    }
    h += exportPanelHtml();
    h += accountPanelHtml();
    el.innerHTML = h;
    bindPanel(el);
  }
  function renderEntityPanelOnly() {
    /* update dim inputs live while dragging (no full re-render) */
    var el = qs(document, "[data-panel]");
    if (!el || !S.selEnt) { return; }
    var e = entityById(sketch(), S.selEnt);
    if (!e) { return; }
    qsa(el, "[data-live]").forEach(function (n) {
      var p = n.getAttribute("data-live").split(".");
      var v = e;
      p.forEach(function (k) { v = v ? v[k] : null; });
      if (isFinite(v)) { n.value = fmt(v, 3); }
    });
  }

  function sketchPanelHtml() {
    var skc = sketch(), h = "";
    if (!skc) {
      /* no sketches yet: the tree is empty until the user picks a datum plane */
      return '<div class="rgzcad-card"><h3>✏ Start with a datum plane</h3>' +
        '<p class="sub">Exactly like CATIA/SolidWorks: the tree is empty until you choose where to sketch. Click a plane in the 3D view — or here:</p>' +
        '<div class="rgzcad-row wrap">' +
        '<button type="button" class="rgzcad-btn brand mini" data-datum="xy">XY — flat (top view)</button>' +
        '<button type="button" class="rgzcad-btn ghost mini" data-datum="xz">XZ — upright (front)</button>' +
        '<button type="button" class="rgzcad-btn ghost mini" data-datum="yz">YZ — upright (side)</button>' +
        "</div>" +
        '<div class="rgzcad-note">Then draw a profile (rectangle, circle, polygon…) and make it 3D with the rail: Pad · Pocket · Shaft · Groove · Rib.</div>' +
        "</div>";
    }
    var profN = closedCount(skc), holeN = holesOf(skc).length;
    h += '<div class="rgzcad-card"><h3>✏ ' + esc(skc.name) + "</h3>" +
      '<p class="sub">' + esc(skc.plane && skc.plane.kind === "xy" && !skc.plane.topOf ? "Base plane XY" : (skc.faceLabel || "On a model face")) + " · " + profN + " closed profile(s) · " + holeN + " hole(s)</p>";
    if (closedCount(skc)) {
      h += '<button type="button" class="rgzcad-btn brand block" data-padthis>▮ Pad this sketch…</button>';
    } else if (sketchOpenProfile(skc)) {
      h += '<div class="rgzcad-empty">This profile is still open — close it for a pad, or turn it into a rib below.</div>';
    } else {
      h += '<div class="rgzcad-empty">Draw a profile with the tools on the left bar. Rectangles and circles are closed automatically; free polygons close on the start point or with Enter.</div>';
    }
    /* PartDesign sketch-based features available from the current content */
    var more = "";
    if (closedCount(skc) && sketchAxisCline(skc) !== null) {
      more += '<button type="button" class="rgzcad-btn ghost block" data-shaftthis>↻ Shaft (revolve about centreline)</button>' +
        '<button type="button" class="rgzcad-btn ghost block" data-groovethis>⊖ Groove (revolved cut)</button>';
    }
    if (sketchOpenProfile(skc)) {
      more += '<button type="button" class="rgzcad-btn ghost block" data-ribthis>═ Rib (thicken open profile)</button>';
    }
    if (more) { h += more; }
    h += '<div class="rgzcad-row"><label>Default hole</label><select data-ui="holeType">' +
      ["through", "blind", "cbore", "csink"].map(function (t) { return '<option value="' + t + '"' + (S.ui.holeType === t ? " selected" : "") + ">" + ({ through: "Through", blind: "Blind", cbore: "Counterbore ⌴", csink: "Countersink ⌵" })[t] + "</option>"; }).join("") + "</select></div>" +
      '<div class="dims tworow">' +
      fld("Ø", "ui.holeR", S.ui.holeR, 0.5).replace(">Ø<", ">Ø (radius)<") +
      fld("↧ depth", "ui.holeDepth", S.ui.holeDepth, 0.5) +
      "</div>";
    h += '<label class="rgzcad-check"><span>Sizes on the sketch (measured labels, color-coded: orange under-defined · <b style="color:#3ddc78">green fully constrained</b> · violet fixed)</span><input type="checkbox" data-ui-cb="showSizes" ' + (S.ui.showSizes !== false ? "checked" : "") + "></label>";
    h += '<div class="rgzcad-note">Tool defaults: N-gon sides <input type="number" min="3" max="40" step="1" data-ui="ngonSides" value="' + (+S.ui.ngonSides || 6) + '" style="width:54px"> · slot width <input type="number" min="1" step="0.5" data-ui="slotW" value="' + fmt(S.ui.slotW || 10) + '" style="width:54px"> mm · offset d <input type="number" min="0.2" step="0.5" data-ui="offsetD" value="' + fmt(S.ui.offsetD || 5) + '" style="width:54px"> mm</div>';
    if (skc.entities.length) {
      h += '<h4 class="rgzcad-listhead">Entities in this sketch</h4>' + sketchEntityListHtml(skc);
    }
    h += "</div>";
    return h;
  }
  function sketchEntityListHtml(skc) {
    var h2 = '<div class="rgzcad-elist">';
    skc.entities.forEach(function (e) {
      h2 += '<button type="button" class="row' + (isSel(e.id) ? " on" : "") + '" data-selent="' + e.id + '">' +
        "<span>" + entIcon(e) + " " + esc(entLabel(e)) + "</span><small>" + esc(entMeta(e)) + "</small></button>";
    });
    return h2 + "</div>";
  }
  function entIcon(e) { return e.type === "rect" ? "▭" : e.type === "circle" ? "◯" : e.type === "hole" ? "◎" : e.type === "cline" ? "╌" : e.type === "line" ? "╱" : e.type === "point" ? "+" : "⬠"; }
  function entLabel(e) {
    if (e.label) { return e.label; }
    if (e.type === "rect") { return "Rectangle"; }
    if (e.type === "circle") { return "Circle / disc"; }
    if (e.type === "hole") { return holeTypeLabel(e); }
    if (e.type === "cline") { return "Centerline"; }
    if (e.type === "line") { return "Line"; }
    if (e.type === "point") { return "Reference point"; }
    var kk = { free: "Polygon", ngon: "N-gon", slot: "Slot", ellipse: "Ellipse", arc: "Arc", spline: "Spline" };
    return (kk[e.kind] || "Polygon") + " (" + (e.pts ? e.pts.length : 0) + " pts" + (e.closed ? ", closed" : ", open") + ")";
  }
  function entMeta(e) {
    if (e.type === "rect") { return fmt(e.w, 1) + " × " + fmt(e.h, 1) + " @ (" + fmt(e.cx, 1) + ", " + fmt(e.cy, 1) + ")"; }
    if (e.type === "circle") { return "Ø " + fmt(2 * e.r, 1) + " @ (" + fmt(e.cx, 1) + ", " + fmt(e.cy, 1) + ")"; }
    if (e.type === "hole") { return "Ø " + fmt(2 * e.r, 1) + " @ (" + fmt(e.cx, 1) + ", " + fmt(e.cy, 1) + ")"; }
    if (e.type === "cline" || e.type === "line") { return fmt(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 1) + " mm" + (Math.abs(e.b[1] - e.a[1]) < 1e-9 ? " · horizontal" : (Math.abs(e.b[0] - e.a[0]) < 1e-9 ? " · vertical" : "")); }
    if (e.type === "point") { return "@ (" + fmt(e.cx, 1) + ", " + fmt(e.cy, 1) + ")"; }
    var pts = entPts(e), bb = pts ? bboxOf(pts) : null;
    return bb ? fmt(bb.w, 1) + " × " + fmt(bb.h, 1) : "";
  }
  function holeTypeLabel(h) {
    var t = { through: "Through hole", blind: "Blind hole", cbore: "Counterbore ⌴", csink: "Countersink ⌵" }[h.hType] || "Hole";
    t += " Ø" + fmt(2 * h.r, 1);
    if (h.thread && h.thread.on) { t += " · " + ((h.thread && h.thread.iso) || ("M" + fmt(2 * h.r, 0))); }
    return t;
  }

  function geoButtonsHtml() {
    return [["h", "H Horizontal"], ["v", "V Vertical"], ["par", "\u2225 Parallel"], ["perp", "\u22a5 Perpendicular"], ["eq", "= Equal length"], ["coin", "\u00b7 Coincident"], ["con", "\u25ce Concentric"], ["tan", "T Tangent"], ["fix", "\u26bf Fix"]].map(function (kv) {
      return '<button type="button" class="rgzcad-btn ghost mini" data-geo="' + kv[0] + '" title="Apply: ' + GEO_NAMES[kv[0]] + '">' + esc(kv[1]) + "</button>";
    }).join(" ");
  }
  function multiEntityPanelHtml(set) {
    var lockedN = set.filter(function (e) { return e.locked; }).length;
    var h = '<div class="rgzcad-card"><h3>\u29c9 ' + set.length + " elements selected</h3>" +
      '<p class="sub">Ctrl+click toggles single elements · drag a box (\u2192 window, \u2190 crossing) adds more · constraints act on the whole set, first element = reference' + (lockedN ? " · " + lockedN + " locked" : "") + ".</p>";
    h += '<div class="rgzcad-elist">' + set.map(function (e) {
      return '<button type="button" class="row' + (e.id === S.selEnt ? " on" : "") + '" data-selent="' + e.id + '"><span>' + entIcon(e) + " " + esc(entLabel(e)) + "</span><small>" + esc(entMeta(e)) + "</small></button>";
    }).join("") + "</div>";
    h += '<div class="rgzcad-note" style="margin:6px 0">Constraints:</div>';
    h += '<div class="rgzcad-row wrap">' + geoButtonsHtml() + "</div>";
    h += '<div class="rgzcad-row wrap" style="margin-top:6px">' +
      '<button type="button" class="rgzcad-btn ghost mini" data-op="cons">\u25c7 Construction toggle</button>' +
      '<button type="button" class="rgzcad-btn danger mini" data-delent>\U0001f5d1 Delete selected</button>' +
      "</div>";
    h += "</div>";
    return h;
  }

  function entityPanelHtml(e) {
    var h = '<div class="rgzcad-card"><h3>' + entIcon(e) + " " + esc(entLabel(e)) + '</h3><p class="sub">Selected in ' + esc(sketch().name) + " — values are exact, mm</p>";
    h += '<div class="dims tworow">';
    if (e.type === "rect") {
      h += fld("center x", "ent.cx", e.cx) + fld("center y", "ent.cy", e.cy) + fld("width", "ent.w", e.w) + fld("height", "ent.h", e.h);
      h += "</div>" + tolHtml("ent.tol.w", e.tol && e.tol.w) + tolHtml("ent.tol.h", e.tol && e.tol.h);
    } else if (e.type === "circle") {
      h += fld("center x", "ent.cx", e.cx) + fld("center y", "ent.cy", e.cy) + fld("radius", "ent.r", e.r);
      h += "</div>" + tolHtml("ent.tol.d", e.tol && e.tol.d);
    } else if (e.type === "hole") {
      h += fld("center x", "ent.cx", e.cx) + fld("center y", "ent.cy", e.cy) + fld("radius", "ent.r", e.r);
      h += '</div><div class="rgzcad-row"><label>Hole type</label><select data-ent-holetype>' +
        ["through", "blind", "cbore", "csink"].map(function (t) { return '<option value="' + t + '"' + (e.hType === t ? " selected" : "") + ">" + ({ through: "Through", blind: "Blind", cbore: "Counterbore ⌴", csink: "Countersink ⌵" })[t] + "</option>"; }).join("") + "</select></div>";
      if (e.hType === "blind") { h += '<div class="dims tworow">' + fld("↧ depth", "ent.depth", e.depth, 0.5) + "</div>"; }
      if (e.hType === "cbore") { h += '<div class="dims tworow">' + fld("⌴ Ø", "ent.cbd", e.cbd, 0.5) + fld("⌴ ↧", "ent.cbdDepth", e.cbdDepth, 0.5) + "</div>"; }
      if (e.hType === "csink") { h += '<div class="dims tworow">' + fld("⌵ Ø", "ent.cbd", e.cbd, 0.5) + fld("angle", "ent.csAngle", e.csAngle, 1) + "</div>"; }
      h += '<label class="rgzcad-check"><span>Thread M' + fmt(2 * e.r, 1) + " (cosmetic, ISO metric)</span><input type=\"checkbox\" data-bind=\"ent.thread.on\" " + (e.thread && e.thread.on ? "checked" : "") + "></label>";
      if (e.thread && e.thread.on) { h += '<div class="dims tworow">' + fld("pitch mm", "ent.thread.pitch", num(e.thread.pitch, stdPitch(2 * e.r)), 0.25) + "</div>"; }
      h += tolHtml("ent.tol.d", e.tol && e.tol.d);
      h += '<button type="button" class="rgzcad-btn brand mini block" data-holedef-panel>⚙ Hole Definition… — type · depth · ISO thread · position</button>';
    } else if (e.type === "cline" || e.type === "line") {
      h += fld("a.x", "ent.a0", e.a[0]) + fld("a.y", "ent.a1", e.a[1]) + fld("b.x", "ent.b0", e.b[0]) + fld("b.y", "ent.b1", e.b[1]);
      h += "</div>";
      h += '<p class="sub">Length ' + fmt(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 2) + " mm · angle " + fmt(Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) * 180 / Math.PI, 1) + "°</p>";
    } else if (e.type === "point") {
      h += fld("x", "ent.cx", e.cx) + fld("y", "ent.cy", e.cy);
      h += "</div>";
    } else {
      var bb = bboxOf(entPts(e) || e.pts);
      h += fld("size W", "bb.w", bb.w) + fld("size H", "bb.h", bb.h);
      h += "</div>";
      if (e.type === "poly") {
        h += '<div class="rgzcad-row wrap">' +
          '<button class="rgzcad-btn ghost mini' + (S.vertexMode ? " brand" : "") + '" data-op="vertex">✥ Edit points</button>' +
          '<button class="rgzcad-btn ghost mini" data-op="fillet2d">⊾ Round corner…</button>' +
          '<button class="rgzcad-btn ghost mini" data-op="chamfer2d">◺ Cut corner…</button>' +
          '<button class="rgzcad-btn ghost mini" data-op="mirrorh">⇋ Mirror ↔</button>' +
          '<button class="rgzcad-btn ghost mini" data-op="mirrorv">⇅ Mirror ↕</button>' +
          "</div>" +
          '<div class="rgzcad-note">Corner ops: click a polygon point after arming. Radii: R <input type="number" min="0.2" step="0.1" data-ui="filletR" value="' + fmt(S.ui.filletR) + '" style="width:52px"> · cut <input type="number" min="0.2" step="0.1" data-ui="chamferD" value="' + fmt(S.ui.chamferD) + '" style="width:52px"> mm</div>';
        h += tolHtml("ent.tol.w", e.tol && e.tol.w);
      }
    }
    if ((e.geo || []).length) {
      h += '<div class="rgzcad-note" style="margin:4px 0 2px">Constraints:</div><div class="rgzcad-row wrap">' +
        e.geo.map(function (g, gi) {
          return '<span class="rgzcad-chip">' + (GEO_GLYPHS[g.t] || g.t) + " " + esc(GEO_NAMES[g.t] || g.t) + (g.auto ? " (auto)" : "") + ' <button type="button" class="x" data-geodel="' + gi + '" title="Remove this constraint (geometry stays as it is)">\u00d7</button></span>';
        }).join("") + "</div>";
    }
    if (e.locked) { h += '<p class="sub">\u26bf Locked (Fix) — it ignores constraint edits and drags. Toggle Fix to unlock.</p>'; }
    h += '<div class="rgzcad-note" style="margin:4px 0 2px">Apply constraint:</div><div class="rgzcad-row wrap">' + geoButtonsHtml() + "</div>";
    if (e.role !== "hole" && e.type !== "cline" && e.type !== "point") {
      h += '<label class="rgzcad-check"><span>Construction geometry (dashed reference — never part of the solid)</span><input type="checkbox" data-ent-cons ' + (e.cons ? "checked" : "") + "></label>";
    }
    h += '<div class="rgzcad-note">Transform about the entity center: rotate <input type="number" step="1" data-ui="rotDeg" value="' + fmt(S.ui.rotDeg) + '" style="width:54px">° · scale <input type="number" min="0.01" step="0.1" data-ui="scaleK" value="' + fmt(S.ui.scaleK) + '" style="width:52px">×' +
      ' <button type="button" class="rgzcad-btn ghost mini" data-op="rotate" title="Rotate by the given angle">↻ Rotate</button>' +
      ' <button type="button" class="rgzcad-btn ghost mini" data-op="scale" title="Scale by the given factor">⤢ Scale</button></div>';
    h += '<div class="rgzcad-row wrap">' +
      '<button type="button" class="rgzcad-btn danger mini" data-delent>🗑 Delete entity</button>' +
      "</div>";
    h += "</div>";
    return h;
  }

  function featurePanelHtml(f) {
    var sk = sketchById(f.sketchId);
    var NAMES = { pad: "▮ ", pocket: "▱ ", shaft: "↻ ", groove: "⊖ ", rib: "═ " };
    var SUBS = {
      pad: "Solid extruded along the sketch normal",
      pocket: "Material removed into the sketch plane",
      shaft: "Profile revolved about the sketch centreline",
      groove: "Revolved cut about the sketch centreline",
      rib: "Open polyline thickened into a web and extruded"
    };
    var revolve = f.type === "shaft" || f.type === "groove";
    var h = '<div class="rgzcad-card"><h3>' + (NAMES[f.type] || "▮ ") + esc(f.name) + "</h3>" +
      '<p class="sub">' + (SUBS[f.type] || SUBS.pad) + " · from " + esc(sk ? sk.name : "—") + "</p>" +
      '<button type="button" class="rgzcad-btn brand mini block" data-featdef-panel>⚙ Definition… — every parameter in one popup</button>';
    if (revolve) {
      h += '<div class="dims tworow">' + fld("revolve angle °", "feat.angle", num(f.angle, 360), 1) + "</div>" +
        '<p class="sub">Axis: vertical centreline at x = ' + fmt(num(f.axisX, 0), 1) + " mm of " + esc(sk ? sk.name : "the sketch") + " (1–360°).</p>";
    } else if (f.type === "rib") {
      h += '<div class="dims tworow">' + fld("thickness t", "feat.t", num(f.t, 4), 0.5) + fld("length L", "feat.L", f.L, 0.5) + "</div>";
    } else {
      h += '<div class="dims tworow">' + fld(f.type === "pocket" ? "depth ↧" : "length L", "feat.L", f.L, 0.5);
      if (f.edge && f.edge.style !== "none") { h += fld("edge size", "feat.edge.size", f.edge.size, 0.1); }
      h += "</div>";
    }
    if (f.type === "pad" || f.type === "pocket") {
      h += '<div class="rgzcad-row"><label>Edge finish</label><select data-feat-edge>' +
        ["none", "chamfer", "fillet"].map(function (t) { return '<option value="' + t + '"' + (f.edge && f.edge.style === t ? " selected" : "") + ">" + ({ none: "Sharp", chamfer: "Chamfer 45°", fillet: "Fillet (round)" })[t] + "</option>"; }).join("") + "</select></div>" +
        '<p class="sub">Edge finish dresses the whole top/bottom rim at once. For edge-precise work use the ◺/◜ buttons in the 3D toolbar and <b>click the exact vertical edges</b> (CATIA-style).</p>';
      if (f.type === "pad") {
        var eos = f.edgeOps || [], armedHere = S.armed3d && S.armed3d.kind && S.selFeat === f.id;
        if (armedHere) {
          h += '<div class="rgzcad-note">' + (S.armed3d.kind === "fillet" ? "◜ Fillet" : "◺ Chamfer") + " edge picking active: <b>" + (f.edgeSel || []).length + "</b> vertical edge(s) marked on the model." + (((f.edgeSel || []).length) ? "" : " Click edges in the 3D view…") + "</div>";
          if ((f.edgeSel || []).length) {
            h += '<div class="rgzcad-row"><button type="button" class="rgzcad-btn brand mini" data-edgeapply>\u2713 Apply ' + (S.armed3d.kind === "fillet" ? "fillet R " + fmt(edgePickSize("fillet"), 1) : "chamfer " + fmt(edgePickSize("chamfer"), 1) + " mm") + " to " + f.edgeSel.length + " edge(s)</button></div>";
          }
        }
        if (eos.length) {
          h += '<div class="rgzcad-row"><label>Picked edge rounds</label></div><div class="rgzcad-row wrap">' +
            eos.map(function (op, oi) {
              return '<span class="rgzcad-chip">' + (op.style === "fillet" ? "\u25dc R" + fmt(op.r, 1) : "\u25fa " + fmt(op.d, 1)) + " · edge " + (op.vi + 1) + ' <button type="button" class="x" data-feat-edgeop-del="' + oi + '" title="Remove this edge round">\u00d7</button></span>';
            }).join("") + "</div>";
        }
      }
      if (f.type === "pad") {
        h += '<div class="rgzcad-row"><label>Dress-up</label></div>' +
          '<div class="dims tworow">' + fld("draft °", "feat.draftDeg", num(f.draftDeg, 0), 0.5) + fld("shell mm", "feat.shellT", num(f.shellT, 0), 0.5) + "</div>" +
          '<p class="sub">Draft leans the walls by the angle (0 = straight). Shell hollows the solid to the wall thickness, open at the top (0 = solid). Use one at a time; edge finish pauses while either is set.</p>';
      }
    }
    var pp = f.pattern || mkPattern();
    var ic = instCountOf(f);
    h += '<div class="rgzcad-row"><label>Repeat (pattern)</label><select data-feat-pattern>' +
      [["none", "No repeat"], ["rect", "Rectangular pattern"], ["circ", "Circular pattern"]].map(function (o2) { return '<option value="' + o2[0] + '"' + (pp.mode === o2[0] ? " selected" : "") + ">" + o2[1] + "</option>"; }).join("") + "</select></div>";
    if (pp.mode === "rect") {
      h += '<div class="dims tworow">' + fld("count X", "feat.pattern.nx", pp.nx, 1) + fld("count Y", "feat.pattern.ny", pp.ny, 1) + fld("spacing X mm", "feat.pattern.dx", pp.dx, 1) + fld("spacing Y mm", "feat.pattern.dy", pp.dy, 1) + "</div>";
    } else if (pp.mode === "circ") {
      h += '<div class="dims tworow">' + fld("instances", "feat.pattern.n", pp.n, 1) + fld("total angle °", "feat.pattern.ang", pp.ang, 1) + "</div>" +
        '<p class="sub">Copies spaced evenly about the sketch origin (around the sketch normal). 360° = full circle.</p>';
    }
    h += tolHtml("feat.tol", f.tol);
    h += '<div class="rgzcad-row wrap">' +
      '<button type="button" class="rgzcad-btn ghost mini" data-editsk sketchid="' + f.sketchId + '" data-skedit="' + f.sketchId + '">✏ Edit sketch</button>' +
      '<button type="button" class="rgzcad-btn danger mini" data-delfeat2="' + f.id + '">🗑 Delete</button>' +
      "</div>";
    h += '<div class="rgzcad-note">Volume of this feature: <b>' + fmt(Math.abs(featureVol(f)) / 1000, 2) + " cm³</b>" + (ic > 1 ? " × " + ic + " = <b>" + fmt(Math.abs(featureVol(f)) * ic / 1000, 2) + " cm³</b>" : "") + "</div>";
    h += "</div>";
    return h;
  }

  function partPanelHtml() {
    var d = D(), h = "";
    var m = matOf();
    var vol = partVol(), mass = vol * m.density / 1000;
    h += '<div class="rgzcad-card"><h3>📐 Part</h3>' +
      '<div class="rgzcad-row"><input type="text" data-bind="design.name" value="' + esc(d.name) + '" maxlength="60" aria-label="Part name"></div>' +
      '<div class="rgzcad-kpis">' +
      '<div class="rgzcad-kpi"><b>' + fmt(vol / 1000, 2) + "</b><span>volume cm³</span></div>" +
      '<div class="rgzcad-kpi"><b>' + fmt(mass, 0) + "</b><span>mass g</span></div>" +
      '<div class="rgzcad-kpi"><b>' + fmt(partAreaEstimate() / 100, 0) + "</b><span>area cm²</span></div>" +
      '<div class="rgzcad-kpi"><b>' + d.features.length + "</b><span>features</span></div>" +
      "</div>" +
      '<p class="sub" style="margin-top:6px">Exact for non-overlapping features; overlapping solids are counted once per feature.</p></div>';

    h += '<div class="rgzcad-card"><h3>Material</h3><div class="rgzcad-selectmat">' +
      Object.keys(MATS).map(function (k) {
        var mt = MATS[k];
        return '<button type="button" class="rgzcad-mat' + (d.material === k ? " on" : "") + '" data-mat="' + k + '"><span class="sw" style="background:#' + mt.color.toString(16).padStart(6, "0") + '"></span>' + mt.label + "</button>";
      }).join("") + "</div></div>";

    var mr = d.mirror || { on: false, plane: "yz" };
    h += '<div class="rgzcad-card"><h3>Mirror part</h3>' +
      '<label class="rgzcad-check"><span>Add a mirrored copy of the whole part</span><input type="checkbox" data-bind="design.mirror.on" ' + (mr.on ? "checked" : "") + "></label>" +
      (mr.on ? '<div class="rgzcad-row"><label>Mirror plane</label><select data-bind="design.mirror.plane">' +
        [["yz", "YZ plane (left ↔ right)"], ["xz", "XZ plane (front ↔ back)"]].map(function (o2) { return '<option value="' + o2[0] + '"' + (mr.plane === o2[0] ? " selected" : "") + ">" + o2[1] + "</option>"; }).join("") + "</select></div>" : "") +
      "</div>";

    if (S.step === "model") {
      h += '<div class="rgzcad-card"><h3>3D tools</h3>' +
        '<div class="rgzcad-empty">Click a body in the view (or a feature in the tree) to edit it — then dress it up from the toolbar: <b>Chamfer, Fillet, Draft, Shell, Pattern, Mirror</b>. <b>Sketch on face</b> / <b>Hole on face</b> add geometry onto flat faces.</div></div>';
    }
    return h;
  }

  function drawingPanelHtml() {
    var d = D();
    return '<div class="rgzcad-card"><h3>📄 ISO drawing (A4)</h3>' +
      '<div class="rgzcad-row"><label>Views on the sheet</label></div>' +
      '<div class="rgzcad-views">' +
      [["front", "Front"], ["back", "Back"], ["top", "Top"], ["bottom", "Bottom"], ["right", "Right"], ["left", "Left"], ["iso", "3D view"]].map(function (v) {
        return '<label class="rgzcad-check v"><span>' + v[1] + '</span><input type="checkbox" data-bind="design.draw.views.' + v[0] + '" ' + (d.draw.views[v[0]] ? "checked" : "") + "></label>";
      }).join("") + "</div>" +
      '<div class="rgzcad-note">You choose the views — the app projects the 3D model for exactly those. First-angle layout (ISO 128-30): TOP below FRONT, LEFT at the right. Visible outlines thick, hidden edges dashed (ISO 128-24), hole axes dash-dot.</div>' +
      '<label class="rgzcad-check"><span>Hidden lines (dashed)</span><input type="checkbox" data-bind="design.draw.hidden" ' + (d.draw.hidden ? "checked" : "") + "></label>" +
      '<label class="rgzcad-check"><span>Construction lines</span><input type="checkbox" data-bind="design.draw.center" ' + (d.draw.center ? "checked" : "") + "></label>" +
      '<label class="rgzcad-check"><span>Dimension values</span><input type="checkbox" data-bind="design.draw.tolOn" ' + (d.draw.tolOn ? "checked" : "") + "></label>" +
      '<div class="rgzcad-row"><label>General tol</label><select data-bind="design.draw.general">' +
      [["mK", "ISO 2768-mK (medium)"], ["f", "ISO 2768-f (fine)"], ["c", "ISO 2768-c (coarse)"]].map(function (o) { return '<option value="' + o[0] + '"' + (d.draw.general === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div>" +
      '<div class="rgzcad-row"><label>Scale</label><select data-bind="design.draw.scale">' +
      ["auto", "1:1", "1:2", "1:5", "2:1", "5:1", "10:1"].map(function (o) { return '<option value="' + o + '"' + (d.draw.scale === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></div>" +
      '<button type="button" class="rgzcad-btn brand block" data-export="svg">⬇ Export drawing (SVG)</button>' +
      '<button type="button" class="rgzcad-btn ghost block" data-export="png">⬇ Export drawing (PNG)</button>' +
      "</div>";
  }

  function exportPanelHtml() {
    return '<div class="rgzcad-card"><h3>Files</h3>' +
      '<button type="button" class="rgzcad-btn brand block" data-export="stl">⬇ STL (3D print)</button>' +
      '<button type="button" class="rgzcad-btn ghost block" data-export="json">⬇ Design (.json)</button>' +
      '<button type="button" class="rgzcad-btn ghost block" data-openjson>📂 Open .json…</button>' +
      "</div>";
  }
  function accountPanelHtml() {
    return '<div class="rgzcad-card"><h3>Account</h3>' +
      '<div class="rgzcad-note" data-account-status>' + (window.__rgzcadAccountStatus ? window.__rgzcadAccountStatus() : "Not signed in — designs stay in this browser.") + "</div>" +
      '<button type="button" class="rgzcad-btn brand block" data-save-account>☁ Save to my account</button>' +
      '<button type="button" class="rgzcad-btn ghost block" data-open-designs>📂 My designs</button>' +
      '<button type="button" class="rgzcad-btn ghost block" data-newdesign>＋ New empty part</button>' +
      "</div>";
  }

  /* ---------------- panel binding ---------------- */
  function byPath(obj, path, set, val) {
    var parts = path.split(".");
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (parts[i] === "ent") { o = entityById(sketch(), S.selEnt); }
      else if (parts[i] === "feat") { o = featureById(S.selFeat); }
      else if (parts[i] === "design") { o = D(); }
      else if (parts[i] === "ui") { o = S.ui; }
      else if (parts[i] === "bb") { o = o.__bb || o; }
      else { o = o ? o[parts[i]] : null; }
      if (!o) { return false; }
    }
    if (set) { o[parts[parts.length - 1]] = val; return true; }
    return o[parts[parts.length - 1]];
  }

  function bindPanel(el) {
    qsa(el, "[data-bind]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var path = inp.getAttribute("data-bind");
        var val = inp.type === "checkbox" ? inp.checked : (inp.type === "number" ? num(inp.value, 0) : inp.value);
        applyBind(path, val);
        /* a typed size re-solves the sketch: constrained partners follow the rule */
        if (path.indexOf("ent.") === 0) { solveConstraints(sketch()); skDirty(); }
        pushHist();
        renderAll();
        if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
        if (S.step === "drawing") { renderDrawingSheet(); }
      });
    });
    qsa(el, "[data-ui]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var k = inp.getAttribute("data-ui");
        S.ui[k] = inp.type === "number" ? num(inp.value, S.ui[k]) : inp.value;
        skDirty();
      });
    });
    qsa(el, "[data-ui-cb]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        S.ui[inp.getAttribute("data-ui-cb")] = !!inp.checked;
        skDirty();
      });
    });
    qsa(el, "[data-live]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var path = "ent." + inp.getAttribute("data-live");
        applyBind(path, num(inp.value, 0));
        solveConstraints(sketch());
        pushHist(); renderAll(); skDirty();
        if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
      });
    });
    qsa(el, "[data-autotol]").forEach(function (b) {
      b.addEventListener("click", function () {
        var prefix = b.getAttribute("data-autotol");
        var tol = byPath(null, prefix, false);
        var e = entityById(sketch(), S.selEnt);
        var dim = 10;
        if (e) {
          if (prefix.indexOf(".d") !== -1) { dim = e.type === "hole" ? 2 * e.r : 2 * e.r; }
          else if (e.type === "rect") { dim = prefix.indexOf(".h") !== -1 ? e.h : e.w; }
          else { var bb = bboxOf(entPts(e) || e.pts); dim = prefix.indexOf(".h") !== -1 ? bb.h : bb.w; }
        }
        var t = autoTol()(dim);
        byPath(null, prefix + ".plus", true, t);
        byPath(null, prefix + ".minus", true, t);
        byPath(null, prefix + ".on", true, true);
        pushHist(); renderPanel(); skDirty();
      });
    });
    qsa(el, "[data-selent]").forEach(function (b) { b.addEventListener("click", function (ev) { selectEntity(b.getAttribute("data-selent"), !!(ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey))); }); });
    var padBtn = qs(el, "[data-padthis]");
    if (padBtn) { padBtn.addEventListener("click", function () { closeSketchToPad(); }); }
    var pocketBtn = qs(el, "[data-pocketthis]");
    if (pocketBtn) { pocketBtn.addEventListener("click", function () { pocketFromSketch(sketch().id); }); }
    var shaftBtn = qs(el, "[data-shaftthis]");
    if (shaftBtn) { shaftBtn.addEventListener("click", function () { revolveSketch(sketch().id, "shaft"); }); }
    var grooveBtn = qs(el, "[data-groovethis]");
    if (grooveBtn) { grooveBtn.addEventListener("click", function () { revolveSketch(sketch().id, "groove"); }); }
    var ribBtn = qs(el, "[data-ribthis]");
    if (ribBtn) { ribBtn.addEventListener("click", function () { ribFromSketch(sketch().id); }); }
    qsa(el, "[data-delent]").forEach(function (b) {
      b.addEventListener("click", function () {
        var skc = sketch();
        var ids = (S.selSet && S.selSet.length) ? S.selSet : [S.selEnt];
        var n = ids.length;
        skc.entities = skc.entities.filter(function (e2) { return ids.indexOf(e2.id) < 0; });
        S.selEnt = null; S.selSet = []; S.vertexMode = false;
        pushHist(); renderAll();
        if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
        note(n + " element(s) deleted.");
      });
    });
    qsa(el, "[data-geodel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var e2 = entityById(sketch(), S.selEnt);
        if (e2 && e2.geo) { e2.geo.splice(+b.getAttribute("data-geodel"), 1); pushHist(); renderPanel(); skDirty(); note("Constraint removed (the geometry stays where it is)."); }
      });
    });
    qsa(el, "[data-edgeapply]").forEach(function (b) {
      b.addEventListener("click", function () { var f2 = featureById(S.selFeat); if (f2) { applyEdgeSelection(f2); } });
    });
    qsa(el, "[data-feat-edgeop-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var f2 = featureById(S.selFeat);
        if (f2 && f2.edgeOps) {
          f2.edgeOps.splice(+b.getAttribute("data-feat-edgeop-del"), 1);
          pushHist(); renderAll();
          if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(true); }
          note("Picked-edge round removed — geometry rebuilt.");
        }
      });
    });
    qsa(el, "[data-op]").forEach(function (b) {
      b.addEventListener("click", function () {
        var op = b.getAttribute("data-op");
        entityOp(op);
      });
    });
    qsa(el, "[data-ent-cons]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var skc2 = sketch();
        var e = skc2 ? entityById(skc2, S.selEnt) : null;
        if (e) { e.cons = cb.checked; pushHist(); renderAll(); skDirty(); if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); } }
      });
    });
    qsa(el, "[data-ent-holetype]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var e = entityById(sketch(), S.selEnt);
        if (e && e.role === "hole") { e.hType = sel.value; pushHist(); renderAll(); skDirty(); if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); } }
      });
    });
    qsa(el, "[data-holedef-panel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var e = entityById(sketch(), S.selEnt);
        if (e && e.role === "hole") { openHoleDialog(e, { sk: sketch() }); }
      });
    });
    qsa(el, "[data-featdef-panel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var f = featureById(S.selFeat);
        if (f) { openFeatureDialog(f); }
      });
    });
    qsa(el, "[data-feat-edge]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var f = featureById(S.selFeat);
        if (f) { f.edge = f.edge || { style: "none", size: 1.5 }; f.edge.style = sel.value; pushHist(); renderAll(); if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); } }
      });
    });
    qsa(el, "[data-feat-pattern]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var f = featureById(S.selFeat);
        if (f) { f.pattern = f.pattern && f.pattern.mode ? f.pattern : mkPattern(); f.pattern.mode = sel.value; pushHist(); renderAll(); if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); } if (S.step === "drawing") { renderDrawingSheet(); } }
      });
    });
    qsa(el, "[data-skedit]").forEach(function (b) { b.addEventListener("click", function () { selectSketch(b.getAttribute("data-skedit")); }); });
    qsa(el, "[data-delfeat2]").forEach(function (b) { b.addEventListener("click", function () { deleteFeature(b.getAttribute("data-delfeat2")); }); });
    qsa(el, "[data-export]").forEach(function (b) {
      b.addEventListener("click", function () { doExport(b.getAttribute("data-export")); });
    });
    var oj = qs(el, "[data-openjson]");
    if (oj) { oj.addEventListener("click", function () { var f = qs(document, "[data-open-file]"); if (f) { f.click(); } }); }
    qsa(el, "[data-mat]").forEach(function (b) {
      b.addEventListener("click", function () {
        D().material = b.getAttribute("data-mat");
        saveSoon(); renderAll();
        if (window.__rgzcad2 && window.__rgzcad2.applyMaterial) { window.__rgzcad2.applyMaterial(); }
      });
    });
    var bSA = qs(el, "[data-save-account]");
    if (bSA) { bSA.addEventListener("click", function () { if (window.__rgzcadSaveAccount) { window.__rgzcadSaveAccount(); } }); }
    var bOD = qs(el, "[data-open-designs]");
    if (bOD) { bOD.addEventListener("click", function () { if (window.__rgzcadOpenDesigns) { window.__rgzcadOpenDesigns(); } }); }
  }

  function applyBind(path, val) {
    var parts = path.split(".");
    if (parts[0] === "ent") {
      var e = entityById(sketch(), S.selEnt);
      if (!e) { return; }
      var key = parts[1];
      if (key === "tol") {
        e.tol = e.tol || (e.type === "rect" ? mkTolPair() : { d: mkTol() });
        if (parts[2] === "d" || parts[2] === "w" || parts[2] === "h") {
          if (!e.tol[parts[2]]) { e.tol[parts[2]] = mkTol(); }
          e.tol[parts[2]][parts[3]] = val;
        }
      } else if (key === "a0") { e.a[0] = val; } else if (key === "a1") { e.a[1] = val; }
      else if (key === "b0") { e.b[0] = val; } else if (key === "b1") { e.b[1] = val; }
      else if (key === "cx" || key === "cy" || key === "w" || key === "h" || key === "r" || key === "depth" || key === "cbd" || key === "cbdDepth" || key === "csAngle") {
        e[key] = Math.max(key === "r" ? 0.1 : (key === "w" || key === "h" ? 0.2 : -10000), val);
      }
      if (window.__rgzcadBuild3d) { /* sketch edits affect any feature using it */ window.__rgzcadBuild3d(false); }
      return;
    }
    if (parts[0] === "feat") {
      var f = featureById(S.selFeat);
      if (!f) { return; }
      if (parts[1] === "L") { f.L = clamp(num(val, 10), 0.2, 5000); }
      else if (parts[1] === "edge") { f.edge = f.edge || { style: "none", size: 1.5 }; f.edge[parts[2]] = parts[2] === "size" ? clamp(num(val, 1), 0.2, Math.max(0.2, f.L / 2)) : val; }
      else if (parts[1] === "tol") { f.tol = f.tol || { on: false, plus: 0, minus: 0 }; f.tol[parts[2]] = val; }
      else if (parts[1] === "pattern") { f.pattern = f.pattern && f.pattern.mode ? f.pattern : mkPattern(); f.pattern[parts[2]] = val; }
      else if (parts[1] === "draftDeg") { f.draftDeg = clamp(num(val, 0), 0, 30); }
      else if (parts[1] === "shellT") { f.shellT = clamp(num(val, 0), 0, 500); }
      else if (parts[1] === "angle") { f.angle = clamp(num(val, 360), 1, 360); }
      else if (parts[1] === "axisX") { f.axisX = num(val, 0); }
      else if (parts[1] === "t") { f.t = clamp(num(val, 4), 0.1, 200); }
      return;
    }
    if (parts[0] === "design") {
      var o = D(), i;
      for (i = 1; i < parts.length - 1; i++) { o = o[parts[i]]; }
      o[parts[parts.length - 1]] = val;
      return;
    }
    if (parts[0] === "ui") { S.ui[parts[1]] = val; return; }
  }

  /* entity operations: vertex mode / corner fillet & chamfer / mirror /
     construction toggle / rotate / scale — the full CATIA Sketcher
     Operation-toolbar subset */
  function entityOp(op) {
    var skc = sketch();
    var e = skc ? entityById(skc, S.selEnt) : null;
    if (!e) { note("Select an entity first, then apply the operation."); return; }
    if (op === "cons") {
      var selN = 0;
      selEnts().forEach(function (e4) { if (e4.role !== "hole") { toggleCons(e4); selN++; } });
      if (selN > 1) { note(selN + " elements toggled construction/standard."); }
      return;
    }
    if (op === "rotate" || op === "scale") { transformEntity(e, op); return; }
    if (e.type === "line" && (op === "mirrorh" || op === "mirrorv")) {
      var lb = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
      function lm(p) { return op === "mirrorh" ? [2 * lb[0] - p[0], p[1]] : [p[0], 2 * lb[1] - p[1]]; }
      var na = lm(e.a); e.a = lm(e.b); e.b = na;
      pushHist(); renderAll(); skDirty();
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
      return;
    }
    if (e.type !== "poly") {
      note("That edit applies to polygon-shaped profiles (free polygon, N-gon, slot, ellipse, arc, spline).");
      return;
    }
    if (op === "vertex") { S.vertexMode = !S.vertexMode; renderPanel(); skDirty(); return; }
    if (op === "mirrorh" || op === "mirrorv") {
      var bb = bboxOf(e.pts);
      e.pts = e.pts.map(function (p) { return op === "mirrorh" ? [2 * bb.cx - p[0], p[1]] : [p[0], 2 * bb.cy - p[1]]; });
      e.pts.reverse();
      pushHist(); renderAll(); skDirty();
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
      return;
    }
    if (op === "fillet2d" || op === "chamfer2d") {
      S.pendingCorner = op;
      note(op === "fillet2d" ? "Corner (fillet): click a profile vertex — radius R " + fmt(S.ui.filletR) + " mm (panel)" : "Chamfer: click a profile vertex — leg " + fmt(S.ui.chamferD) + " mm (panel)");
      refreshModebar();
      skDirty();
    }
  }
  function toggleCons(e) {
    if (!e) { return; }
    if (e.role === "hole" || e.type === "cline") { note("Holes and centrelines already have fixed roles."); return; }
    e.cons = !e.cons;
    note(e.cons ? "Now CONSTRUCTION geometry (dashed reference — never part of the solid)." : "Back to a standard profile element.");
    pushHist(); renderAll(); skDirty();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
  }
  function entPivot(e) {
    if (e.type === "line" || e.type === "cline") { return [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]; }
    if (e.type === "point") { return [e.cx, e.cy]; }
    if (e.type === "poly") { var bb = bboxOf(e.pts); return [bb.cx, bb.cy]; }
    return [num(e.cx, 0), num(e.cy, 0)];
  }
  function transformEntity(e, op) {
    if (op === "scale") {
      var k = num(S.ui.scaleK, 2);
      if (!(k > 0.01)) { note("Scale factor must be positive — set it in the panel."); return; }
      scaleEntAbout(e, k);
      solveConstraints(sketch());
      selectEntity(e.id); pushHist(); renderAll(); skDirty();
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
      note("Scaled ×" + fmt(k, 3) + " about the entity center.");
      return;
    }
    var deg = num(S.ui.rotDeg, 90);
    if (!deg) { note("Rotation angle is 0° — set it in the panel."); return; }
    var rep = rotateEntAbout(e, deg);
    solveConstraints(sketch());
    selectEntity(e.id); pushHist(); renderAll(); skDirty();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
    note("Rotated " + fmt(deg, 1) + "° about the entity center" + (rep ? " (rectangles rotate into free polygons)" : "") + ".");
  }
  function scaleEntAbout(e, k) {
    var c = entPivot(e);
    function sc(p) { return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]; }
    if (e.type === "line" || e.type === "cline") { e.a = sc(e.a); e.b = sc(e.b); }
    else if (e.type === "poly") { e.pts = e.pts.map(sc); }
    else if (e.type === "rect") { e.w *= k; e.h *= k; }
    else if (e.type === "circle" || e.type === "hole") { e.r *= k; if (e.cbd) { e.cbd *= k; e.cbdDepth *= k; } }
    else if (e.type === "point") { /* rotating/scaling a point about itself: no-op */ }
  }
  function rotateEntAbout(e, deg) {
    var c = entPivot(e), a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    function ro(p) { var dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * ca - dy * sa, c[1] + dx * sa + dy * ca]; }
    if (e.type === "line" || e.type === "cline") { e.a = ro(e.a); e.b = ro(e.b); return null; }
    if (e.type === "poly") { e.pts = e.pts.map(ro); return null; }
    if (e.type === "rect") {
      /* an axis-aligned rect cannot stay typed after rotation → becomes a free polygon (same id) */
      var skc = sketch();
      var np = mkEnt("poly", { pts: entPts(e).map(ro), closed: true, kind: "free" });
      np.id = e.id; np.cons = !!e.cons;
      if (skc) {
        for (var i = 0; i < skc.entities.length; i++) { if (skc.entities[i].id === e.id) { skc.entities[i] = np; break; } }
      }
      return np;
    }
    if (e.type === "point" || e.type === "circle" || e.type === "hole") {
      note("Circles, holes and points rotate about their own center — move them instead (drag or x/y fields).");
    }
    return null;
  }

  /* ---- relimitation tools: Trim (corner), Break (split at point), Offset (side) ---- */
  function lineLineInt(a1, a2, b1, b2) {
    var d = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0]);
    if (Math.abs(d) < 1e-12) { return null; }
    var t = ((b1[0] - a1[0]) * (b2[1] - b1[1]) - (b1[1] - a1[1]) * (b2[0] - b1[0])) / d;
    return [a1[0] + t * (a2[0] - a1[0]), a1[1] + t * (a2[1] - a1[1])];
  }
  /* CATIA Trim (Relimitations > Trim) — universal: works on EVERY curve
     the same way CATIA's curves work: lines, centerlines, circles, and the
     individual edges of rectangles & polygons (a CATIA rectangle IS four
     curves). Click element 1 on the part to KEEP, then element 2 on the
     part to keep — both cut/extend to their intersection (nearest to the
     second click when there are two). Centerlines stay fixed references.
     Consequences are exactly CATIA's: a trimmed circle becomes an open
     arc, a trimmed ring becomes an open chain, and profiles re-evaluate
     immediately after the modification. */
  function trimCorner(e1, e2, w1, w2, edge1Ptr, edge2Ptr) {
    if (!e1 || !e2 || e1.id === e2.id) { note("Trim: pick two different elements."); return false; }
    var edge1 = e1._trimEdge != null ? e1._trimEdge : 0;
    var edge2 = e2._trimEdge != null ? e2._trimEdge : 0;
    if (e1.role === "hole" || e2.role === "hole") { note("Holes are drill features — edit their position/size in the panel instead of trimming them."); return false; }
    if ((e1.type !== "line" && e1.type !== "cline" && e1.type !== "circle" && e1.type !== "rect" && e1.type !== "poly") ||
        (e2.type !== "line" && e2.type !== "cline" && e2.type !== "circle" && e2.type !== "rect" && e2.type !== "poly")) {
      note("Trim works on lines, circles, and rectangle/polygon edges.");
      return false;
    }
    var ca = entityCurvesOf(e1)[edge1] || entityCurvesOf(e1)[0];
    var cb = entityCurvesOf(e2)[edge2] || entityCurvesOf(e2)[0];
    if (!ca || !cb) { note("Those two elements have no trimmable curves."); return false; }
    var ints = curveCurveInt(ca, cb);
    if (!ints.length) { note("The two curves don't intersect (lines extend, circles don't) — nothing to trim to."); return false; }
    /* nearest intersection to the SECOND click (CATIA rule) */
    var p = ints[0];
    if (w2 && ints.length > 1) {
      var bd = 1e18;
      ints.forEach(function (ip) { var d = Math.hypot(ip[0] - w2[0], ip[1] - w2[1]); if (d < bd) { bd = d; p = ip; } });
    }
    var skc = sketch();
    var changed1 = trimCurveAt(e1, edge1, p, w1, skc);
    if (!changed1) { return false; }
    var changed2 = trimCurveAt(e2, edge2, p, w2, skc);
    if (!changed2) { return false; }
    delete e1._trimEdge; delete e2._trimEdge;
    S.selEnt = e2.type === "cline" ? e1.id : e2.id;
    S.selSet = [S.selEnt];
    pushHist(); renderAll(); skDirty();
    note("Trimmed at (" + fmt(p[0], 1) + ", " + fmt(p[1], 1) + ") — clicked sides kept, centerlines fixed. Circles become arcs, rings open into chains, just like CATIA. Trim stays active (Esc exits).");
    return true;
  }
  /* apply the cut at p to ONE entity, keeping the clicked side. Returns true when changed. */
  function trimCurveAt(e, edge, p, w, skc) {
    if (e.type === "cline") { return true; }   /* fixed reference — CATIA never modifies the axis */
    if (e.type === "line") {
      var vx = e.b[0] - e.a[0], vy = e.b[1] - e.a[1], L2 = vx * vx + vy * vy || 1e-12;
      var tP = ((p[0] - e.a[0]) * vx + (p[1] - e.a[1]) * vy) / L2;
      var tW = w ? ((w[0] - e.a[0]) * vx + (w[1] - e.a[1]) * vy) / L2 : 0.5;
      if (Math.abs(tW - tP) < 1e-4) { tW = tP + (tP < 0.5 ? 0.05 : -0.05); }
      if (tW > tP) { e.a = p.slice(); } else { e.b = p.slice(); }
      return true;
    }
    if (e.type === "circle") {
      /* circle trimmed by ONE cutting curve: keep the clicked arc between
         that curve's intersection points (1 point → open at the point) */
      var circ = entityCurvesOf(e)[0];
      var pts = [];
      (skc.entities || []).forEach(function (o2) {
        if (o2.id === e.id) { return; }
        entityCurvesOf(o2).forEach(function (cb2) {
          curveCurveInt(circ, cb2).forEach(function (ip) { pts.push(ip); });
        });
      });
      if (!pts.length) { pts = [p]; }
      var uniq = [];
      pts.forEach(function (q) { if (!uniq.some(function (u) { return Math.hypot(u[0] - q[0], u[1] - q[1]) < 0.25; })) { uniq.push(q); } });
      var angs = uniq.map(function (q) { return Math.atan2(q[1] - e.cy, q[0] - e.cx); });
      if (angs.length >= 2 && w) {
        /* pick the CUT PAIR bounding the clicked arc: the kept piece is the
           arc between the two nearest intersections that CONTAINS the click */
        var ac = Math.atan2(w[1] - e.cy, w[0] - e.cx);
        angs.sort(function (x, y) { return x - y; });
        var n = angs.length, found = false, i2;
        for (i2 = 0; i2 < n && !found; i2++) {
          var a0 = angs[i2], a1 = angs[(i2 + 1) % n];
          var span = a1 - a0; if (span <= 0) { span += 2 * Math.PI; }
          var rel = ac - a0; while (rel < 0) { rel += 2 * Math.PI; }
          if (rel < span) {
            circleToChain(e, a0, a1);
            found = true;
          }
        }
        if (!found) { circleToChain(e, angs[0], angs[0]); }
      } else {
        circleToChain(e, angs[0] != null ? angs[0] : 0, angs[0] != null ? angs[0] : 0);
      }
      return true;
    }
    if (e.type === "rect") {
      /* cut the clicked edge of the rectangle, keep the clicked side */
      var rect = entityCurvesOf(e)[edge];
      var keepStart = keepSideOfSeg(rect.a, rect.b, w);
      e.pts = [[e.cx - e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy + e.h / 2], [e.cx - e.w / 2, e.cy + e.h / 2]];
      e.type = "poly"; e.closed = true; e.kind = "free";
      ringTrimAtEdge(e, edge, p, keepStart);
      return true;
    }
    if (e.type === "poly") {
      var seg = entityCurvesOf(e)[edge];
      var ks = keepSideOfSeg(seg.a, seg.b, w);
      if (e.closed) { ringTrimAtEdge(e, edge, p, ks); }
      else { chainTrimAtEdge(e, edge, p, ks, skc); }
      return true;
    }
    return false;
  }
  /* which side of segment a-b is the click nearer to: true = a-side */
  function keepSideOfSeg(a, b, w) {
    if (!w) { return true; }
    return Math.hypot(w[0] - a[0], w[1] - a[1]) <= Math.hypot(w[0] - b[0], w[1] - b[1]);
  }

  /* CATIA Quick Trim — universal: ONE click erases exactly the clicked
     curve piece, bounded by its nearest crossings on both sides, against
     EVERYTHING in the sketch (lines, centerlines, circles, edges). Lines
     shorten or split; circles become open arcs; rings open into chains;
     open chains split into two. No crossings → the element is deleted. */
  function quickTrimAt(wp) {
    var skc = sketch();
    if (!skc) { return null; }
    var hc = hitCurve(wp);
    if (!hc || !hc.ent || hc.ent.type === "point") {
      note("Quick Trim: click a curve — a line, circle, or polygon/rectangle edge. The clicked piece is erased at its nearest crossings.");
      return null;
    }
    var e = hc.ent, res = e, msg = "";
    if (e.role === "hole") { note("Holes are drill features — delete or edit them in the panel, not Quick Trim."); return null; }

    if (e.type === "line" || e.type === "cline") {
      var a = e.a.slice(), b = e.b.slice();
      var vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1e-12;
      var t0 = ((wp[0] - a[0]) * vx + (wp[1] - a[1]) * vy) / L2;
      var xs = allIntsOf(skc, e).map(function (ix) {
        return ((ix.p[0] - a[0]) * vx + (ix.p[1] - a[1]) * vy) / L2;
      }).filter(function (t) { return t > 1e-4 && t < 1 - 1e-4; });
      xs.sort(function (x2, y2) { return x2 - y2; });
      var lower = null, upper = null;
      xs.forEach(function (t) { if (t < t0 - 1e-6) { lower = t; } if (t > t0 + 1e-6 && upper === null) { upper = t; } });
      function atT(t) { return [a[0] + vx * t, a[1] + vy * t]; }
      if (lower === null && upper === null) {
        skc.entities = skc.entities.filter(function (x2) { return x2.id !== e.id; });
        res = null; msg = "Quick Trim: no crossings — element deleted.";
      } else if (lower !== null && upper !== null) {
        var tail = b;
        e.b = atT(lower);
        var nb = mkEnt(e.type === "cline" ? "cline" : "line", { a: atT(upper), b: tail, cons: e.cons });
        skc.entities.push(nb); res = nb;
        msg = "Quick Trim: middle piece erased — split at both crossings.";
      } else if (lower !== null) {
        e.b = atT(lower); msg = "Quick Trim: end piece erased at the crossing.";
      } else {
        e.a = atT(upper); msg = "Quick Trim: start piece erased at the crossing.";
      }
    } else if (e.type === "circle") {
      var angs = allIntsOf(skc, e).map(function (ix) { return Math.atan2(ix.p[1] - e.cy, ix.p[0] - e.cx); });
      var ac = Math.atan2(wp[1] - e.cy, wp[0] - e.cx);
      if (!angs.length) {
        skc.entities = skc.entities.filter(function (x2) { return x2.id !== e.id; });
        res = null; msg = "Quick Trim: no crossings — circle deleted.";
      } else {
        angs.sort(function (x2, y2) { return x2 - y2; });
        /* the kept piece = the arc that does NOT contain the click */
        var n2 = angs.length, done = false, i2;
        for (i2 = 0; i2 < n2 && !done; i2++) {
          var a0 = angs[i2], a1 = angs[(i2 + 1) % n2];
          var span = a1 - a0; if (span <= 0) { span += 2 * Math.PI; }
          var rel = ac - a0; while (rel < 0) { rel += 2 * Math.PI; }
          if (rel < span) { circleToChain(e, a1, a0 + 2 * Math.PI); done = true; }
        }
        if (!done) { circleToChain(e, angs[0], angs[0] + 2 * Math.PI); }
        msg = "Quick Trim: clicked arc erased — the circle is now an open arc (CATIA).";
      }
    } else if (e.type === "rect" || e.type === "poly") {
      /* work on the CLICKED EDGE: crossings parametrised on that edge */
      var n = e.type === "rect" ? 4 : e.pts.length;
      var curves = entityCurvesOf(e);
      var seg = curves[hc.edge] || curves[0];
      var k = seg.edge;
      var svx = seg.b[0] - seg.a[0], svy = seg.b[1] - seg.a[1], sL2 = svx * svx + svy * svy || 1e-12;
      var st0 = ((wp[0] - seg.a[0]) * svx + (wp[1] - seg.a[1]) * svy) / sL2;
      var sts = allIntsOf(skc, e).filter(function (ix) { return ix.edge === k; }).map(function (ix) {
        return ((ix.p[0] - seg.a[0]) * svx + (ix.p[1] - seg.a[1]) * svy) / sL2;
      }).filter(function (t) { return t > 1e-4 && t < 1 - 1e-4; });
      /* normalise rect entities to polygons before editing */
      if (e.type === "rect") {
        e.pts = [[e.cx - e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy + e.h / 2], [e.cx - e.w / 2, e.cy + e.h / 2]];
        e.type = "poly"; e.closed = true; e.kind = "free";
      }
      function atSeg(t) { return [seg.a[0] + svx * t, seg.a[1] + svy * t]; }
      sts.sort(function (x2, y2) { return x2 - y2; });
      var lo = null, up = null;
      sts.forEach(function (t) { if (t < st0 - 1e-6) { lo = t; } if (t > st0 + 1e-6 && up === null) { up = t; } });
      if (lo === null && up === null) {
        /* erase the whole edge: ring opens, open chain splits */
        if (e.closed) {
          /* ring minus the clicked edge = the same vertices rotated at the gap */
          e.pts = e.pts.slice(k + 1).concat(e.pts.slice(0, k + 1));
          e.closed = false; e.kind = "free";
          msg = "Quick Trim: edge erased — the ring is now an open chain.";
        }
        else {
          var head3 = e.pts.slice(0, k + 1).map(function (q) { return q.slice(); });
          var tail3 = e.pts.slice(k + 1).map(function (q) { return q.slice(); });
          if (head3.length >= 2) {
            e.pts = head3;
            if (tail3.length >= 2) { skc.entities.push(mkEnt("poly", { pts: tail3, closed: false, kind: e.kind || "free", cons: e.cons })); }
          } else if (tail3.length >= 2) { e.pts = tail3; }
          else { skc.entities = skc.entities.filter(function (x2) { return x2.id !== e.id; }); res = null; }
          msg = "Quick Trim: edge erased — the chain split at the gap.";
        }
      } else if (e.closed) {
        var pLo = atSeg(lo !== null ? lo : 0), pUp = atSeg(up !== null ? up : 1);
        /* keep everything EXCEPT the clicked piece: open the ring at the
           far end of the erased piece and rejoin at the near end */
        var chain2 = [pUp.slice()];
        for (var m2 = k + 1; m2 < n + k + 1; m2++) { chain2.push(e.pts[m2 % n].slice()); }
        chain2.push(pLo.slice());
        e.pts = chain2; e.closed = false; e.kind = "free";
        msg = "Quick Trim: clicked piece erased — ring opened into a chain (reclose it to make a profile again).";
      } else {
        var pLo2 = atSeg(lo !== null ? lo : 0), pUp2 = atSeg(up !== null ? up : 1);
        var head2 = e.pts.slice(0, k + 1).map(function (q) { return q.slice(); }).concat([pLo2]);
        var tail2 = [pUp2].concat(e.pts.slice(k + 1).map(function (q) { return q.slice(); }));
        if (lo === null) { head2 = []; }
        if (up === null) { tail2 = []; }
        if (head2.length >= 2) { e.pts = head2; } else if (tail2.length >= 2) { e.pts = tail2; tail2 = []; } else { skc.entities = skc.entities.filter(function (x2) { return x2.id !== e.id; }); res = null; }
        if (tail2.length >= 2 && res) { skc.entities.push(mkEnt("poly", { pts: tail2, closed: false, kind: e.kind || "free", cons: e.cons })); }
        msg = "Quick Trim: clicked piece erased from the chain.";
      }
    } else {
      note("Quick Trim works on lines, circles, and rectangle/polygon edges.");
      return null;
    }
    S.selEnt = res ? res.id : null;
    S.selSet = res ? [res.id] : [];
    pushHist(); renderAll(); skDirty();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
    note(msg + " (Esc exits)");
    return res;
  }

  /* ---------------- geometric constraints (CATIA Sketcher) ----------------
     Dialog-box style: select element(s), click a constraint. It is applied
     to the geometry immediately and remembered on the element (badges on
     the canvas, chips in the panel, removable there). With several selected
     elements the FIRST is the fixed reference (CATIA rule). */
  var GEO_GLYPHS = { h: "H", v: "V", par: "\u2225", perp: "\u22a5", eq: "=", coin: "\u00b7", con: "\u25ce", tan: "T", fix: "\u26bf" };
  var GEO_NAMES = { h: "Horizontal", v: "Vertical", par: "Parallel", perp: "Perpendicular", eq: "Equal length", coin: "Coincident", con: "Concentric", tan: "Tangent", fix: "Fix" };
  function isLineEnt(e) { return e && (e.type === "line" || e.type === "cline"); }
  function isCircEnt(e) { return e && (e.type === "circle" || e.role === "hole"); }
  function addGeo(e, t, refId) {
    e.geo = (e.geo || []).filter(function (g) { return g.t !== t; });
    e.geo.push({ t: t, ref: refId || null });
  }
  function rotLineAboutMid(e, ang) {
    var mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
    var L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    var cur = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
    while (ang - cur > Math.PI / 2) { ang -= Math.PI; }
    while (cur - ang > Math.PI / 2) { ang += Math.PI; }
    e.a = [mx - Math.cos(ang) * L / 2, my - Math.sin(ang) * L / 2];
    e.b = [mx + Math.cos(ang) * L / 2, my + Math.sin(ang) * L / 2];
  }
  function applyGeo(t) {
    var skc = sketch();
    if (!skc) { return 0; }
    var set = selEnts(), done = 0, ref = set[0];
    function fin(msg) {
      if (done) { pushHist(); renderAll(); skDirty(); if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); } }
      note(msg);
      return done;
    }
    if (t === "h" || t === "v") {
      var refusedHV = 0, lastMsgHV = "";
      set.forEach(function (e) {
        if (!isLineEnt(e) || e.locked) { return; }
        var ocm = overConstraintMsg(skc, e, t, null);
        if (ocm) { refusedHV++; lastMsgHV = ocm === "same" ? "" : ocm; return; }
        if (t === "h") { var y = (e.a[1] + e.b[1]) / 2; e.a[1] = y; e.b[1] = y; }
        else { var x = (e.a[0] + e.b[0]) / 2; e.a[0] = x; e.b[0] = x; }
        addGeo(e, t); done++;
      });
      return fin((done ? done + " line(s) made exactly " + GEO_NAMES[t].toLowerCase() + " — badge '" + GEO_GLYPHS[t] + "' on the sketch, removable in the panel." +
        (refusedHV ? " ⚠ " + refusedHV + " refused (" + (lastMsgHV || "redundant / over-constrained") + ")" : "") :
        (lastMsgHV || "Select one or more lines first (drag a selection box or Ctrl+click), then apply " + GEO_NAMES[t] + ".")));
    }
    if (t === "par" || t === "perp" || t === "eq") {
      if (set.length < 2 || !isLineEnt(ref)) { return fin(GEO_NAMES[t] + ": select TWO or more lines — the first is the reference, the others adapt. (Multi-select: drag a box or Ctrl+click.)"); }
      var a0 = Math.atan2(ref.b[1] - ref.a[1], ref.b[0] - ref.a[0]);
      var L0 = Math.hypot(ref.b[0] - ref.a[0], ref.b[1] - ref.a[1]);
      var refusedP = 0, lastMsgP = "";
      set.slice(1).forEach(function (e) {
        if (!isLineEnt(e) || e.locked) { return; }
        var ocm = overConstraintMsg(skc, e, t, ref.id);
        if (ocm) { refusedP++; lastMsgP = ocm === "same" ? "redundant — that rule already exists on the element" : ocm; return; }
        if (t === "eq") {
          var mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
          var ae = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
          e.a = [mx - Math.cos(ae) * L0 / 2, my - Math.sin(ae) * L0 / 2];
          e.b = [mx + Math.cos(ae) * L0 / 2, my + Math.sin(ae) * L0 / 2];
        } else { rotLineAboutMid(e, t === "par" ? a0 : a0 + Math.PI / 2); }
        addGeo(e, t, ref.id); done++;
      });
      return fin((done ? done + " line(s) constrained " + GEO_NAMES[t].toLowerCase() + " to the reference line." + (refusedP ? " ⚠ " + refusedP + " refused (" + lastMsgP + ")" : "") :
        (lastMsgP || "Nothing adapted — the later selections must be lines (and not locked).")));
    }
    if (t === "coin") {
      if (set.length < 2) { return fin("Coincident: select two lines/polylines — nearest endpoints are snapped exactly together (this is what connects a Line-drawn square into a closed profile)."); }
      var E1 = openEnds(ref);
      if (!E1) { return fin("Coincident works on line/polyline endpoints — the first selection has none."); }
      var refusedC = 0, lastMsgC = "";
      set.slice(1).forEach(function (e) {
        var E2 = openEnds(e);
        if (!E2 || e.locked) { return; }
        var ocm = overConstraintMsg(skc, e, "coin", ref.id);
        if (ocm) { refusedC++; lastMsgC = ocm === "same" ? "redundant — already coincident to that element" : ocm; return; }
        var bi = 0, bj = 0, bd = 1e18;
        E1.forEach(function (p1, i2) { E2.forEach(function (p2, j2) { var dd = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]); if (dd < bd) { bd = dd; bi = i2; bj = j2; } }); });
        moveEntity(e, E1[bi][0] - E2[bj][0], E1[bi][1] - E2[bj][1]);
        addGeo(e, "coin", ref.id); done++;
      });
      return fin((done ? "Endpoints made coincident — connected line chains now form closed profiles." + (refusedC ? " ⚠ " + refusedC + " refused (" + lastMsgC + ")" : "") :
        (lastMsgC || "Nothing moved (locked or no endpoints).")));
    }
    if (t === "con") {
      if (set.length < 2 || !isCircEnt(ref)) { return fin("Concentric: select two circles (the first is the reference center)."); }
      var refusedN = 0, lastMsgN = "";
      set.slice(1).forEach(function (e) {
        if (!isCircEnt(e) || e.locked) { return; }
        var ocm = overConstraintMsg(skc, e, "con", ref.id);
        if (ocm) { refusedN++; lastMsgN = ocm === "same" ? "redundant — already concentric to that circle" : ocm; return; }
        e.cx = ref.cx; e.cy = ref.cy; addGeo(e, "con", ref.id); done++;
      });
      return fin((done ? done + " circle(s) concentric with the reference." + (refusedN ? " ⚠ " + refusedN + " refused (" + lastMsgN + ")" : "") :
        (lastMsgN || "The first selection must be a circle.")));
    }
    if (t === "tan") {
      if (set.length < 2) { return fin("Tangent: select TWO elements — a circle plus a line / rectangle side / polygon edge, or two circles. The FIRST is the fixed reference."); }
      var okT = 0, sameT = 0, refusedT = 0, lastMsgT = "", badT = 0;
      set.slice(1).forEach(function (e) {
        if (e.locked) { refusedT++; lastMsgT = "The second element is locked (Fix) — unlock it first."; return; }
        var ocm = overConstraintMsg(skc, e, "tan", ref.id);
        if (ocm) { refusedT++; lastMsgT = ocm === "same" ? "redundant — tangency to that element is already stored" : ocm; return; }
        var rec = { t: "tan", ref: ref.id };
        var rr = tangentMove(skc, e, ref, rec);
        if (rr === 1) { e.geo = (e.geo || []).filter(function (g2) { return g2.t !== "tan" || g2.ref !== ref.id; }); e.geo.push(rec); okT++; done++; }
        else if (rr === 2) { e.geo = (e.geo || []).filter(function (g2) { return g2.t !== "tan" || g2.ref !== ref.id; }); e.geo.push(rec); sameT++; done++; }
        else { badT++; }
      });
      if (done || refusedT) {
        return fin((okT ? okT + " element(s) moved tangent to the reference." : "") +
          (sameT ? (okT ? " " : "") + "Already tangent — rule stored (it will hold from now on)." : "") +
          (refusedT ? " ⚠ " + refusedT + " refused: " + lastMsgT : "") +
          (badT ? " ⚠ " + badT + " unsupported pair — tangency works on circles and straight sides (line / rect / polygon edge)." : ""));
      }
      return fin("Tangent needs: two circles, or a circle and a line / rectangle side / polygon edge (e.g. a circle touching one side of a square).");
    }
    if (t === "fix") {
      set.forEach(function (e) {
        e.locked = !e.locked;
        if (e.locked) { addGeo(e, "fix"); } else { e.geo = (e.geo || []).filter(function (g) { return g.t !== "fix"; }); }
        done++;
      });
      if (done) { pushHist(); renderAll(); skDirty(); }
      note(done ? "Fix toggled on " + done + " element(s) — locked elements ignore constraint edits and cannot be dragged." : "Select the element(s) to lock/unlock first.");
      return done;
    }
    return 0;
  }
  function geoBadgePos(e) {
    if (isLineEnt(e)) { return [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]; }
    if (isCircEnt(e)) { return [e.cx + e.r * 0.72, e.cy + e.r * 0.72]; }
    if (e.type === "rect") { return [e.cx + e.w / 2, e.cy + e.h / 2]; }
    if (e.type === "poly" && (e.pts || []).length) { return e.pts[0]; }
    return null;
  }

  /* ---------------- DOF accounting, CATIA solve & colors ----------------
     Every geometric element carries degrees of freedom (line 4, circle 3,
     rectangle 4 = cx/cy/w/h, point 2, poly 2·n). Each constraint consumes
     DOF: H/V/parallel/perp/equal/tangent = 1, coincident/concentric = 2,
     Fix = all of them. When DOF is exhausted the element is FULLY
     CONSTRAINED (drawn green like CATIA); a constraint that would go below
     zero is REFUSED (over-constraint, exactly like CATIA). */
  function entDof(e) {
    if (!e) { return 0; }
    if (isLineEnt(e)) { return 4; }
    if (isCircEnt(e)) { return 3; }
    if (e.type === "rect") { return 4; }
    if (e.type === "point") { return 2; }
    if (e.type === "poly") { return 2 * (e.pts || []).length; }
    return 4;
  }
  function geoCost(e, g) {
    if (g.t === "fix") { return entDof(e); }
    if (g.t === "coin" || g.t === "con") { return 2; }
    return 1;                                  /* h v par perp eq tan */
  }
  function dofUsed(sk, e) {
    var u = 0;
    ((e && e.geo) || []).forEach(function (g) { u += geoCost(e, g); });
    return u;
  }
  function dofLeft(sk, e) { return entDof(e) - dofUsed(sk, e); }
  function constraintState(sk, e) {
    if (!e || e.cons || e.role === "constr") { return "constr"; }
    if (e.locked) { return "fix"; }
    return dofLeft(sk, e) <= 0 ? "full" : "under";
  }
  /* null = OK to apply; "same" = already implied; otherwise a refusal note */
  function overConstraintMsg(sk, e, t, refId) {
    if (!e || e.locked) { return null; }
    var dup = ((e.geo) || []).some(function (g) { return g.t === t && (g.ref || null) === (refId || null); });
    if (dup) { return "same"; }
    if (geoCost(e, { t: t }) > dofLeft(sk, e)) {
      return "❌ Over-constraint refused — this element is already fully defined (" + dofUsed(sk, e) + "/" + entDof(e) + " DOF used). Remove a constraint first (orange badges / panel chips), exactly like CATIA.";
    }
    return null;
  }

  /* a straight carrier for tangency: the line itself, or the rect/poly EDGE
     nearest to a point (CATIA lets you pick the side of a closed shape) */
  function carrierSegOf(e, nearPt, edgeIdx) {
    if (isLineEnt(e)) { return { a: e.a, b: e.b, edge: 0 }; }
    var cvs = entityCurvesOf(e).filter(function (c) { return c.k === "seg"; });
    if (!cvs.length) { return null; }
    /* edge-locked (CATIA): the constraint remembers WHICH side it touches */
    if (edgeIdx != null && cvs[edgeIdx]) { return { a: cvs[edgeIdx].a, b: cvs[edgeIdx].b, edge: edgeIdx }; }
    if (!nearPt) { return null; }
    var best = null, bd = 1e18;
    cvs.forEach(function (c) {
      var d = distToSeg(nearPt, c.a, c.b);
      if (d < bd) { bd = d; best = c; }
    });
    return best ? { a: best.a, b: best.b, edge: best.edge } : null;
  }
  function isCarrierEnt(e) { return isLineEnt(e) || e.type === "rect" || (e.type === "poly" && (e.pts || []).length >= 2); }

  /* generalized CATIA tangency: `adapt` moves until it just touches `ref`.
     Pairs: circle×circle (external/internal — whichever is nearer), and
     circle×carrier (line / rectangle side / polygon edge). Returns
     1 = moved, 2 = already tangent, 0 = unsupported pair. */
  function tangentMove(sk, adapt, ref, g) {
    var cA = isCircEnt(adapt) ? adapt : null, cR = isCircEnt(ref) ? ref : null;
    if (cA && cR) {
      var dx = cA.cx - cR.cx, dy = cA.cy - cR.cy, d = Math.hypot(dx, dy);
      var tExt = cR.r + cA.r, tInt = Math.abs(cR.r - cA.r);
      var tgt = Math.abs(d - tExt) <= Math.abs(d - tInt) ? tExt : tInt;
      if (Math.abs(d - tgt) < 1e-6) { return 2; }
      if (d < 1e-9) { dx = 1; dy = 0; d = 1; }             /* concentric: push +X */
      cA.cx = cR.cx + dx / d * tgt; cA.cy = cR.cy + dy / d * tgt;
      return 1;
    }
    var segOf, circ, flip;
    if (cR && !cA && isCarrierEnt(adapt)) { segOf = carrierSegOf(adapt, [cR.cx, cR.cy], g && g.edge); circ = cR; flip = 1; }
    else if (cA && !cR && isCarrierEnt(ref)) { segOf = carrierSegOf(ref, [cA.cx, cA.cy], g && g.edge); circ = cA; flip = -1; }
    else { return 0; }
    if (!segOf) { return 0; }
    if (g && segOf.edge != null) { g.edge = segOf.edge; }   /* lock the constraint to THIS side (CATIA) */
    var vx = segOf.b[0] - segOf.a[0], vy = segOf.b[1] - segOf.a[1], L = Math.hypot(vx, vy) || 1e-12;
    var d2 = ((circ.cx - segOf.a[0]) * vy - (circ.cy - segOf.a[1]) * vx) / L;
    var side = d2 >= 0 ? 1 : -1;
    var delta = (Math.abs(d2) - circ.r) * side;      /* signed shift of the carrier along its normal */
    var mx = vy / L * delta * flip, my = -vx / L * delta * flip;
    if (Math.hypot(mx, my) < 1e-6) { return 2; }
    moveEntity(adapt, mx, my);
    return 1;
  }

  /* re-impose one stored constraint (used after drags / numeric edits, so
     constrained elements KEEP their rules — "move respective to those rules") */
  function enforceGeo(sk, e, g) {
    if (!e || e.locked) { return false; }
    var ref = g.ref ? entityById(sk, g.ref) : null;
    if (g.t === "h" && isLineEnt(e)) {
      var y = (e.a[1] + e.b[1]) / 2;
      if (Math.abs(e.a[1] - y) > 1e-9 || Math.abs(e.b[1] - y) > 1e-9) { e.a[1] = y; e.b[1] = y; return true; }
      return false;
    }
    if (g.t === "v" && isLineEnt(e)) {
      var x = (e.a[0] + e.b[0]) / 2;
      if (Math.abs(e.a[0] - x) > 1e-9 || Math.abs(e.b[0] - x) > 1e-9) { e.a[0] = x; e.b[0] = x; return true; }
      return false;
    }
    if ((g.t === "par" || g.t === "perp") && isLineEnt(e) && ref && isLineEnt(ref)) {
      var a0 = Math.atan2(ref.b[1] - ref.a[1], ref.b[0] - ref.a[0]) + (g.t === "perp" ? Math.PI / 2 : 0);
      var cu = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
      var dd = ((a0 - cu) % Math.PI + 2 * Math.PI) % Math.PI;
      if (dd > 1e-9 && Math.PI - dd > 1e-9) { rotLineAboutMid(e, a0); return true; }
      return false;
    }
    if (g.t === "eq" && isLineEnt(e) && ref && isLineEnt(ref)) {
      var L0 = Math.hypot(ref.b[0] - ref.a[0], ref.b[1] - ref.a[1]);
      var Lc = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      if (Math.abs(L0 - Lc) > 1e-9 && Lc > 1e-9) {
        var mxx = (e.a[0] + e.b[0]) / 2, myy = (e.a[1] + e.b[1]) / 2;
        var ae = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
        e.a = [mxx - Math.cos(ae) * L0 / 2, myy - Math.sin(ae) * L0 / 2];
        e.b = [mxx + Math.cos(ae) * L0 / 2, myy + Math.sin(ae) * L0 / 2];
        return true;
      }
      return false;
    }
    if (g.t === "coin" && ref) {
      var E1 = openEnds(ref), E2 = openEnds(e);
      if (!E1 || !E2) { return false; }
      var bi = 0, bj = 0, bd = 1e18;
      E1.forEach(function (p1, i2) { E2.forEach(function (p2, j2) { var d2q = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]); if (d2q < bd) { bd = d2q; bi = i2; bj = j2; } }); });
      if (bd > 1e-9) { moveEntity(e, E1[bi][0] - E2[bj][0], E1[bi][1] - E2[bj][1]); return true; }
      return false;
    }
    if (g.t === "con" && ref && isCircEnt(e) && isCircEnt(ref)) {
      if (e.cx !== ref.cx || e.cy !== ref.cy) { e.cx = ref.cx; e.cy = ref.cy; return true; }
      return false;
    }
    if (g.t === "tan" && ref) { return tangentMove(sk, e, ref, g) === 1; }
    return false;
  }
  function openEnds(e) {
    if (isLineEnt(e)) { return [e.a, e.b]; }
    if (e.type === "poly" && !e.closed && (e.pts || []).length >= 2) { return [e.pts[0], e.pts[e.pts.length - 1]]; }
    return null;
  }
  function skHasGeo(sk) {
    return !!(sk && (sk.entities || []).some(function (e) { return (e.geo && e.geo.length) || e.locked; }));
  }
  /* CATIA-style mini solver: a few relaxation passes over the stored rules,
     so a dragged/edited element drags its constrained partners along. */
  function solveConstraints(sk) {
    if (!skHasGeo(sk)) { return 0; }
    var total = 0, pass, moved;
    for (pass = 0; pass < 4; pass++) {
      moved = 0;
      sk.entities.forEach(function (e) {
        ((e && e.geo) || []).forEach(function (g) { if (enforceGeo(sk, e, g)) { moved++; } });
      });
      total += moved;
      if (!moved) { break; }
    }
    return total;
  }

  /* ---------------- measured sizes on the sketch ---------------- */
  function sizeLabelOf(e) {
    if (!e) { return null; }
    if (e.type === "line") { return fmt(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 1); }
    if (e.type === "circle") { return "Ø " + fmt(2 * e.r, 1); }
    if (e.type === "rect") { return fmt(e.w, 1) + " × " + fmt(e.h, 1); }
    if (e.type === "hole") {
      var t2 = (e.thread && e.thread.on && e.thread.iso) ? e.thread.iso + " · tap Ø" + fmt(2 * e.r, 1) : "Ø " + fmt(2 * e.r, 1);
      if (e.hType === "blind") { t2 += " ↧" + fmt(e.depth, 0); }
      else if (e.hType === "cbore") { t2 += " ⌴"; }
      else if (e.hType === "csink") { t2 += " ⌵"; }
      return t2;
    }
    if (e.type === "point") { return fmt(e.cx, 1) + ", " + fmt(e.cy, 1); }
    return null;   /* polylines label per edge below, clines stay clean */
  }
  function drawSizes(skc) {
    cx2.textAlign = "center"; cx2.textBaseline = "bottom";
    function put(w, dyPx, txt, col) {
      if (!txt) { return; }
      var s = w2s(w);
      cx2.font = "600 10px ui-sans-serif,system-ui,sans-serif";
      cx2.lineWidth = 3; cx2.strokeStyle = "rgba(9,12,18,.9)";
      cx2.strokeText(txt, s[0], s[1] + (dyPx || 0));
      cx2.fillStyle = col;
      cx2.fillText(txt, s[0], s[1] + (dyPx || 0));
    }
    skc.entities.forEach(function (e) {
      if (e.type === "cline") { return; }
      var st = (e.cons || e.role === "constr") ? "constr" : constraintState(skc, e);
      var col = st === "full" ? "#3ddc78" : (st === "fix" ? "#b78ef0" : (st === "constr" ? "rgba(84,208,224,.9)" : "#ffa189"));
      if (e.type === "line") {
        var vx = e.b[0] - e.a[0], vy = e.b[1] - e.a[1], L = Math.hypot(vx, vy) || 1;
        put([(e.a[0] + e.b[0]) / 2 - vy / L * 8 * S.cam.z, (e.a[1] + e.b[1]) / 2 + vx / L * 8 * S.cam.z], 0, sizeLabelOf(e), col);
      } else if (e.type === "circle" || e.type === "hole") {
        put([e.cx, e.cy - e.r], -5, sizeLabelOf(e), col);
      } else if (e.type === "rect") {
        put([e.cx, e.cy - e.h / 2], -5, sizeLabelOf(e), col);
      } else if (e.type === "point") {
        put([e.cx, e.cy], -8, sizeLabelOf(e), col);
      } else if (e.type === "poly" && isSel(e.id)) {
        (e.pts || []).forEach(function (p, i) {
          if (!e.closed && i === e.pts.length - 1) { return; }
          var q = e.pts[(i + 1) % e.pts.length];
          var L2 = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (L2 < 1e-9) { return; }
          put([(p[0] + q[0]) / 2 - (q[1] - p[1]) / L2 * 7 * S.cam.z, (p[1] + q[1]) / 2 + (q[0] - p[0]) / L2 * 7 * S.cam.z], 0, fmt(L2, 1), col);
        });
      }
    });
  }


  function breakAtPoint(wp) {
    var skc = sketch();
    if (!skc) { return null; }
    var hit = hitEntity(wp);
    if (!hit) { note("Break: click ON a line, circle or polygon edge — it splits exactly there."); return null; }
    if (hit.type === "circle") {
      /* CATIA Break on a circle: opens it at the click into an open arc chain */
      var acB = Math.atan2(wp[1] - hit.cy, wp[0] - hit.cx);
      circleToChain(hit, acB, acB + 2 * Math.PI);
      /* fold back to one point short so the chain has distinct open ends area */
      pushHist(); renderAll(); skDirty();
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
      note("Circle broken open at the click — it's an open arc chain now (close it with Coincident to rebuild a profile).");
      return hit;
    }
    if (hit.type === "line" || hit.type === "cline") {
      var vx = hit.b[0] - hit.a[0], vy = hit.b[1] - hit.a[1], L2 = vx * vx + vy * vy || 1e-12;
      var t = ((wp[0] - hit.a[0]) * vx + (wp[1] - hit.a[1]) * vy) / L2;
      if (t < 0.03 || t > 0.97) { note("Break: aim a little farther from the endpoints."); return null; }
      var q = [hit.a[0] + t * vx, hit.a[1] + t * vy];
      var rest = hit.b.slice();
      hit.b = q;
      var nb = mkEnt(hit.type, { a: q, b: rest, cons: hit.cons });
      skc.entities.push(nb);
      selectEntity(nb.id); pushHist(); renderAll(); skDirty();
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
      note("Line broken into two at (" + fmt(q[0], 1) + ", " + fmt(q[1], 1) + ") — Break stays active, Esc to exit.");
      return nb;
    }
    if (hit.type === "poly") {
      var pts = hit.pts, bi = -1, bd = 8 / S.cam.z, bt = 0;
      pts.forEach(function (p2, i) {
        if (!hit.closed && i === pts.length - 1) { return; }
        var p3 = pts[(i + 1) % pts.length];
        var d = distToSeg(wp, p2, p3);
        if (d < bd) {
          var vx2 = p3[0] - p2[0], vy2 = p3[1] - p2[1], L3 = vx2 * vx2 + vy2 * vy2 || 1e-12;
          bd = d; bi = i; bt = ((wp[0] - p2[0]) * vx2 + (wp[1] - p2[1]) * vy2) / L3;
        }
      });
      if (bi < 0) { note("Break: click closer to the edge."); return null; }
      var sp = pts[bi], ep = pts[(bi + 1) % pts.length];
      var qq = [sp[0] + (ep[0] - sp[0]) * bt, sp[1] + (ep[1] - sp[1]) * bt];
      if (hit.closed) {
        /* ring → open chain starting & ending at the break point */
        hit.pts = [qq.slice()].concat(pts.slice(bi + 1)).concat(pts.slice(0, bi + 1)).concat([qq.slice()]);
        hit.closed = false; hit.kind = "free";
        selectEntity(hit.id); pushHist(); renderAll(); skDirty();
        if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
        note("Closed ring broken into an open polyline — it stays open until you close it (Close sketch → Pad).");
        return hit;
      }
      var left = pts.slice(0, bi + 1).concat([qq.slice()]);
      var right = [qq.slice()].concat(pts.slice(bi + 1));
      if (left.length < 2 || right.length < 2) { note("Break: aim along the edge interior, not at an endpoint."); return null; }
      hit.pts = left;
      var nb2 = mkEnt("poly", { pts: right, closed: false, kind: "free", cons: hit.cons });
      skc.entities.push(nb2);
      selectEntity(nb2.id); pushHist(); renderAll(); skDirty();
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
      note("Polyline broken into two open chains — Break stays active, Esc to exit.");
      return nb2;
    }
    note("Break works on lines and polygon edges.");
    return null;
  }
  function segNrm(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; }
  function offsetAtPoint(wp) {
    var skc = sketch();
    if (!skc) { return null; }
    var src = (S.offEnt ? entityById(skc, S.offEnt) : null) || (S.selEnt ? entityById(skc, S.selEnt) : null);
    if (!src) { note("Offset: select a line, circle, rectangle or polygon first, then click the side to offset to."); return null; }
    var d = Math.max(0.2, num(S.ui.offsetD, 5));
    var ne = null;
    if (src.type === "line" || src.type === "cline") {
      var dx = src.b[0] - src.a[0], dy = src.b[1] - src.a[1], l = Math.hypot(dx, dy) || 1;
      var n1x = -dy / l, n1y = dx / l;
      /* side of the click: cross((b-a),(wp-a)) */
      var cross = dx * (wp[1] - src.a[1]) - dy * (wp[0] - src.a[0]);
      var sd = cross >= 0 ? 1 : -1;
      var off = [n1x * d * sd, n1y * d * sd];
      ne = mkEnt(src.type, { a: [src.a[0] + off[0], src.a[1] + off[1]], b: [src.b[0] + off[0], src.b[1] + off[1]], cons: src.cons });
    } else if (src.type === "circle") {
      var inside = Math.hypot(wp[0] - src.cx, wp[1] - src.cy) < src.r;
      var rr = inside ? src.r - d : src.r + d;
      if (!(rr >= 0.5)) { note("That offset collapses the circle — use a smaller distance."); return null; }
      ne = mkEnt("circle", { cx: src.cx, cy: src.cy, r: rr, cons: src.cons });
    } else if (src.type === "rect" || (src.type === "poly" && src.closed)) {
      var ring = src.type === "rect" ? entPts(src) : src.pts.slice();
      var inside2 = pointInPoly(ring, wp[0], wp[1]);
      var sgn = polyArea(ring) > 0 ? 1 : -1;   /* positive d pulls CCW rings inward in offsetRing */
      var res = offsetRing(ring, (inside2 ? 1 : -1) * sgn * d);
      if (!res || res.length < 3 || Math.abs(polyArea(res)) < 0.5 || (polyArea(res) > 0) !== (polyArea(ring) > 0)) { note("That offset collapses the contour — use a smaller distance."); return null; }
      ne = mkEnt("poly", { pts: res, closed: true, kind: "free", cons: src.cons });
    } else if (src.type === "poly" && !src.closed) {
      var pts2 = src.pts, nL = pts2.length, i2;
      var bi2 = 0, bd2 = 1e18;
      for (i2 = 0; i2 < nL - 1; i2++) { var dd = distToSeg(wp, pts2[i2], pts2[i2 + 1]); if (dd < bd2) { bd2 = dd; bi2 = i2; } }
      var dirx = pts2[bi2 + 1][0] - pts2[bi2][0], diry = pts2[bi2 + 1][1] - pts2[bi2][1];
      var cr = dirx * (wp[1] - pts2[bi2][1]) - diry * (wp[0] - pts2[bi2][0]);
      var sd2 = cr >= 0 ? 1 : -1;
      var out2 = [];
      for (i2 = 0; i2 < nL; i2++) {
        var nA = i2 > 0 ? segNrm(pts2[i2 - 1], pts2[i2]) : segNrm(pts2[0], pts2[1]);
        var nB = i2 < nL - 1 ? segNrm(pts2[i2], pts2[i2 + 1]) : nA;
        var mx = nA[0] + nB[0], my = nA[1] + nB[1], kk = 1 + nA[0] * nB[0] + nA[1] * nB[1];
        var f2 = kk > 1e-4 ? 1 / kk : 2; if (f2 > 2) { f2 = 2; } if (f2 < 0) { f2 = 2; }
        out2.push([pts2[i2][0] + mx * f2 * d * sd2, pts2[i2][1] + my * f2 * d * sd2]);
      }
      ne = mkEnt("poly", { pts: out2, closed: false, kind: "free", cons: src.cons });
    } else if (src.type === "point") {
      note("Points have no size to offset — offset applies to lines, circles and polygons.");
      return null;
    } else {
      note("Offset applies to lines, circles, rectangles and polygons (drill holes offset by editing x/y).");
      return null;
    }
    if (!ne) { return null; }
    skc.entities.push(ne);
    S.offEnt = ne.id;
    selectEntity(ne.id);
    pushHist(); renderAll(); skDirty();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
    note("Offset copy placed " + fmt(d, 1) + " mm on the clicked side — the copy is selected for another offset; Esc to exit.");
    return ne;
  }
  /* True circular fillet / chamfer at a vertex (AutoCAD FILLET / CHAMFER).
     The old code passed the CORNER through arc3Pts, so a requested R3 on a
     90° corner produced a R≈2.12 bulge through the vertex — not a fillet.
     Center sits on the interior bisector at R / sin(θ/2). */
  function filletCornerGeom(prev, p, next, R) {
    var d1 = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    var d2 = Math.hypot(p[0] - next[0], p[1] - next[1]);
    if (d1 < 0.4 || d2 < 0.4) { return null; }
    var ux = (prev[0] - p[0]) / d1, uy = (prev[1] - p[1]) / d1;
    var vx = (next[0] - p[0]) / d2, vy = (next[1] - p[1]) / d2;
    var cos = ux * vx + uy * vy;
    var ang = Math.acos(clamp(cos, -1, 1));
    if (!(ang > 1e-3) || ang > Math.PI - 1e-3) { return null; }
    var half = ang / 2;
    var rMax = Math.min((d1 - 0.2) * Math.tan(half), (d2 - 0.2) * Math.tan(half));
    R = Math.min(R, rMax);
    if (!(R > 0.15)) { return null; }
    var t = R / Math.tan(half);
    var T1 = [p[0] + ux * t, p[1] + uy * t];
    var T2 = [p[0] + vx * t, p[1] + vy * t];
    var bx = ux + vx, by = uy + vy, bL = Math.hypot(bx, by) || 1;
    var dC = R / Math.sin(half);
    var C = [p[0] + bx / bL * dC, p[1] + by / bL * dC];
    var mid = [C[0] - (bx / bL) * R, C[1] - (by / bL) * R];
    return { T1: T1, T2: T2, C: C, mid: mid, R: R, pts: arcVia(C, R, T1, T2, mid) };
  }
  /* sample the arc T1 → T2 around C that passes through `via` (the short
     fillet, never the 270° long way arc3Pts can pick on a 90° corner). */
  function arcVia(C, R, T1, T2, via) {
    var a0 = Math.atan2(T1[1] - C[1], T1[0] - C[0]);
    var a1 = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
    var av = Math.atan2(via[1] - C[1], via[0] - C[0]);
    function rel(a, s) { var t = a - s; while (t < 0) { t += 2 * Math.PI; } while (t >= 2 * Math.PI) { t -= 2 * Math.PI; } return t; }
    var ccw = rel(av, a0) <= rel(a1, a0) + 1e-9;
    var span = ccw ? rel(a1, a0) : rel(a0, a1);
    if (span < 1e-6) { span = 2 * Math.PI; }
    var N = Math.max(6, Math.round(span / (Math.PI / 24))), pts = [], i;
    for (i = 0; i <= N; i++) {
      var t = ccw ? a0 + span * i / N : a0 - span * i / N;
      pts.push([C[0] + R * Math.cos(t), C[1] + R * Math.sin(t)]);
    }
    return pts;
  }
  function explodeRectToPoly(e) {
    if (!e || e.type !== "rect") { return e; }
    e.pts = entPts(e);
    e.type = "poly";
    e.closed = true;
    e.kind = "free";
    delete e.w; delete e.h; delete e.cx; delete e.cy;
    return e;
  }
  function filletPolyVertex(e, idx, kind, size) {
    if (!e || e.type !== "poly" || !e.pts || e.pts.length < 3) { return false; }
    var n = e.pts.length;
    if (idx < 0 || idx >= n) { return false; }
    var p = e.pts[idx], prev = e.pts[(idx - 1 + n) % n], next = e.pts[(idx + 1) % n];
    if (kind === "chamfer2d") {
      var d1 = Math.hypot(p[0] - prev[0], p[1] - prev[1]), d2 = Math.hypot(p[0] - next[0], p[1] - next[1]);
      var t = Math.min(size, (d1 - 0.2) / 2, (d2 - 0.2) / 2);
      if (!(t > 0.1)) { return false; }
      e.pts.splice(idx, 1, [p[0] + (prev[0] - p[0]) / d1 * t, p[1] + (prev[1] - p[1]) / d1 * t],
        [p[0] + (next[0] - p[0]) / d2 * t, p[1] + (next[1] - p[1]) / d2 * t]);
      return true;
    }
    var g = filletCornerGeom(prev, p, next, size);
    if (!g) { return false; }
    e.pts.splice.apply(e.pts, [idx, 1].concat(g.pts));
    return true;
  }
  /* AutoCAD FILLET ▸ Polyline: round every vertex of a closed profile. */
  function filletPolyAll(e, kind, size) {
    explodeRectToPoly(e);
    if (!e || e.type !== "poly" || !e.closed || e.pts.length < 3) { return 0; }
    var src = e.pts.map(function (q) { return q.slice(); }), out = [], i, n = src.length, ok = 0;
    for (i = 0; i < n; i++) {
      var prev = src[(i - 1 + n) % n], p = src[i], next = src[(i + 1) % n];
      if (kind === "chamfer2d") {
        var d1 = Math.hypot(p[0] - prev[0], p[1] - prev[1]), d2 = Math.hypot(p[0] - next[0], p[1] - next[1]);
        var t = Math.min(size, (d1 - 0.2) / 2, (d2 - 0.2) / 2);
        if (t > 0.1) {
          out.push([p[0] + (prev[0] - p[0]) / d1 * t, p[1] + (prev[1] - p[1]) / d1 * t]);
          out.push([p[0] + (next[0] - p[0]) / d2 * t, p[1] + (next[1] - p[1]) / d2 * t]);
          ok++;
        } else { out.push(p.slice()); }
      } else {
        var g = filletCornerGeom(prev, p, next, size);
        if (g) { out = out.concat(g.pts); ok++; }
        else { out.push(p.slice()); }
      }
    }
    if (ok) { e.pts = out; }
    return ok;
  }
  /* ---- circle–circle geometry (almost every plate in 100 CAD Exercises) ---- */
  function circleIntersect(c1, r1, c2, r2) {
    var dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy);
    if (d < 1e-9 || d > r1 + r2 + 1e-6 || d < Math.abs(r1 - r2) - 1e-6) { return []; }
    var a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    var h2 = Math.max(0, r1 * r1 - a * a), h = Math.sqrt(h2);
    var mx = c1[0] + a * dx / d, my = c1[1] + a * dy / d;
    var out = [[mx - h * dy / d, my + h * dx / d]];
    if (h > 1e-8) { out.push([mx + h * dy / d, my - h * dx / d]); }
    return out;
  }
  /* AutoCAD FILLET of two CIRCLES: a blend arc of radius R, internally
     tangent when R is large (the R100 “waist” on a gasket) and externally
     tangent when R is small (the R5 corner). Returns {C,R,T1,T2,pts,mode}. */
  function filletTwoCirclesGeom(c1, r1, c2, r2, R, hint) {
    if (!(R > 0.15)) { return null; }
    var modes = [
      { k: "int", d1: Math.abs(R - r1), d2: Math.abs(R - r2) },
      { k: "ext", d1: r1 + R, d2: r2 + R }
    ];
    var cands = [];
    modes.forEach(function (m) {
      circleIntersect(c1, m.d1, c2, m.d2).forEach(function (C) {
        var u1x = c1[0] - C[0], u1y = c1[1] - C[1], L1 = Math.hypot(u1x, u1y) || 1;
        var u2x = c2[0] - C[0], u2y = c2[1] - C[1], L2 = Math.hypot(u2x, u2y) || 1;
        var s1 = (m.k === "int" && R > r1) ? -1 : 1;
        var s2 = (m.k === "int" && R > r2) ? -1 : 1;
        var T1 = [C[0] + s1 * u1x / L1 * R, C[1] + s1 * u1y / L1 * R];
        var T2 = [C[0] + s2 * u2x / L2 * R, C[1] + s2 * u2y / L2 * R];
        var midA = Math.atan2((T1[1] + T2[1]) / 2 - C[1], (T1[0] + T2[0]) / 2 - C[0]);
        var mid = [C[0] + R * Math.cos(midA), C[1] + R * Math.sin(midA)];
        cands.push({ C: C, R: R, T1: T1, T2: T2, mid: mid, mode: m.k, pts: arcVia(C, R, T1, T2, mid) });
      });
    });
    if (!cands.length) { return null; }
    if (hint) {
      cands.sort(function (a, b) {
        return Math.hypot(a.C[0] - hint[0], a.C[1] - hint[1]) - Math.hypot(b.C[0] - hint[0], b.C[1] - hint[1]);
      });
    }
    return cands[0];
  }
  function isCircLike(e) { return e && (e.type === "circle" || e.role === "hole"); }
  function filletTwoCircles(e1, e2, R, hint) {
    if (!isCircLike(e1) || !isCircLike(e2)) { return null; }
    var g = filletTwoCirclesGeom([e1.cx, e1.cy], e1.r, [e2.cx, e2.cy], e2.r, R, hint);
    if (!g) { note("Those two circles have no fillet of R " + fmt(R, 1) + " mm."); return null; }
    var skc = sketch();
    var arc = mkEnt("poly", { pts: g.pts, closed: false, kind: "arc", meta: { cx: g.C[0], cy: g.C[1], r: g.R, mode: g.mode } });
    if (skc) { skc.entities.push(arc); }
    return arc;
  }
  /* outer outline of overlapping disks (star-convex about the cloud centroid).
     This is how a student FILLET / TRIM / JOIN ends up: one closed profile. */
  function disksOutline(disks, nPer) {
    nPer = nPer || 56;
    var pts = [];
    disks.forEach(function (d, di) {
      var i;
      for (i = 0; i < nPer; i++) {
        var a = i / nPer * 2 * Math.PI;
        var p = [d.cx + d.r * Math.cos(a), d.cy + d.r * Math.sin(a)];
        var buried = false, j;
        for (j = 0; j < disks.length && !buried; j++) {
          if (j === di) { continue; }
          if (Math.hypot(p[0] - disks[j].cx, p[1] - disks[j].cy) < disks[j].r - 0.04) { buried = true; }
        }
        if (!buried) { pts.push(p); }
      }
    });
    if (pts.length < 3) { return []; }
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    pts.sort(function (a, b) { return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx); });
    var out = [], k;
    for (k = 0; k < pts.length; k++) {
      var q = pts[k], prev = out[out.length - 1];
      if (!prev || Math.hypot(q[0] - prev[0], q[1] - prev[1]) > 0.15) { out.push(q); }
    }
    return out;
  }
  /* common EXTERNAL tangent segments between two circles (AutoCAD LINE + TANGENT osnap). */
  function externalTangents(c1, r1, c2, r2) {
    var dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy);
    if (d < 1e-6) { return []; }
    var out = [], sign;
    for (sign = -1; sign <= 1; sign += 2) {
      var ang = Math.atan2(dy, dx);
      var phi = Math.asin(Math.max(-1, Math.min(1, (r2 - r1) / d)));
      var a = ang + Math.PI / 2 + phi * (sign > 0 ? 1 : -1);
      /* parallel-radius construction for equal-sense external tangents */
      var nx = -dy / d * sign, ny = dx / d * sign;
      if (Math.abs(r1 - r2) < 1e-6) {
        out.push({ a: [c1[0] + nx * r1, c1[1] + ny * r1], b: [c2[0] + nx * r2, c2[1] + ny * r2] });
      } else {
        var v = (r1 - r2) / d;
        if (Math.abs(v) >= 1) { continue; }
        var h = Math.sqrt(Math.max(0, 1 - v * v));
        var tx = dx / d * v - dy / d * h * sign, ty = dy / d * v + dx / d * h * sign;
        out.push({ a: [c1[0] + tx * r1, c1[1] + ty * r1], b: [c2[0] + tx * r2, c2[1] + ty * r2] });
      }
    }
    return out;
  }

  /* AutoCAD FILLET of two LINE entities: trim both to the tangent points
     and insert a true circular arc of radius R. */
  function filletTwoLines(l1, l2, R) {
    if (!l1 || !l2 || l1.id === l2.id || !isLineEnt(l1) || !isLineEnt(l2)) { return null; }
    if (l1.type === "cline" || l2.type === "cline") { note("Centerlines stay fixed — fillet the drawing lines instead."); return null; }
    var I = lineLineInt(l1.a, l1.b, l2.a, l2.b);
    if (!I) { note("Those two lines are parallel — nothing to fillet."); return null; }
    function farEnd(e) {
      return Math.hypot(e.a[0] - I[0], e.a[1] - I[1]) < Math.hypot(e.b[0] - I[0], e.b[1] - I[1]) ? e.b : e.a;
    }
    function nearIsA(e) {
      return Math.hypot(e.a[0] - I[0], e.a[1] - I[1]) <= Math.hypot(e.b[0] - I[0], e.b[1] - I[1]);
    }
    var f1 = farEnd(l1), f2 = farEnd(l2);
    var g = filletCornerGeom(f1, I, f2, R);
    if (!g) { note("Corner too tight for R " + fmt(R, 1) + " mm — use a smaller radius."); return null; }
    if (nearIsA(l1)) { l1.a = g.T1.slice(); } else { l1.b = g.T1.slice(); }
    if (nearIsA(l2)) { l2.a = g.T2.slice(); } else { l2.b = g.T2.slice(); }
    var skc = sketch();
    var arc = mkEnt("poly", { pts: g.pts, closed: false, kind: "arc", meta: { cx: g.C[0], cy: g.C[1], r: g.R } });
    if (skc) { skc.entities.push(arc); }
    return arc;
  }
  function tryCornerAt(wp) {
    if (!S.pendingCorner || !S.selEnt) { return false; }
    var e = entityById(sketch(), S.selEnt);
    if (e && e.type === "rect") { explodeRectToPoly(e); }
    if (!e || e.type !== "poly" || e.pts.length < 3) { S.pendingCorner = null; return false; }
    var idx = -1, bd = 9 / S.cam.z;
    e.pts.forEach(function (p, i) { var d = distToSeg(wp, p, p); if (d < bd) { bd = d; idx = i; } });
    if (idx < 0) { return false; }
    var size = S.pendingCorner === "chamfer2d" ? S.ui.chamferD : S.ui.filletR;
    if (!filletPolyVertex(e, idx, S.pendingCorner, size)) {
      note("Corner too tight for that " + (S.pendingCorner === "chamfer2d" ? "chamfer" : "radius") + ".");
      S.pendingCorner = null;
      return true;
    }
    S.pendingCorner = null;
    pushHist(); renderAll(); skDirty();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
    renderToolHint();
    return true;
  }

  function armCornerOp(kind) {
    var skc = sketch();
    if (!skc) { note("Pick a datum plane and start a sketch first."); return; }
    var lines = selEnts().filter(function (e) { return e.type === "line"; });
    var circs = selEnts().filter(isCircLike);
    var size = kind === "chamfer2d" ? S.ui.chamferD : S.ui.filletR;
    /* AutoCAD FILLET of two circles (the 100-exercise gasket plates). */
    if (kind !== "chamfer2d" && circs.length >= 2) {
      var arcC = filletTwoCircles(circs[0], circs[1], size);
      if (!arcC) { return; }
      pushHist(); renderAll(); skDirty();
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
      note("Fillet R " + fmt(size, 1) + " between the two selected circles — AutoCAD FILLET.");
      return;
    }
    /* AutoCAD: two selected lines → fillet/chamfer them now. */
    if (lines.length >= 2) {
      if (kind === "chamfer2d") {
        var I = lineLineInt(lines[0].a, lines[0].b, lines[1].a, lines[1].b);
        if (!I) { note("Those two lines are parallel — nothing to chamfer."); return; }
        function far(e) { return Math.hypot(e.a[0] - I[0], e.a[1] - I[1]) < Math.hypot(e.b[0] - I[0], e.b[1] - I[1]) ? e.b : e.a; }
        function nearA(e) { return Math.hypot(e.a[0] - I[0], e.a[1] - I[1]) <= Math.hypot(e.b[0] - I[0], e.b[1] - I[1]); }
        var d1 = Math.hypot(far(lines[0])[0] - I[0], far(lines[0])[1] - I[1]);
        var d2 = Math.hypot(far(lines[1])[0] - I[0], far(lines[1])[1] - I[1]);
        var t = Math.min(size, (d1 - 0.2) / 2, (d2 - 0.2) / 2);
        if (!(t > 0.1)) { note("Corner too tight for that chamfer."); return; }
        var u1x = far(lines[0])[0] - I[0], u1y = far(lines[0])[1] - I[1], L1 = Math.hypot(u1x, u1y) || 1;
        var u2x = far(lines[1])[0] - I[0], u2y = far(lines[1])[1] - I[1], L2 = Math.hypot(u2x, u2y) || 1;
        var T1 = [I[0] + u1x / L1 * t, I[1] + u1y / L1 * t];
        var T2 = [I[0] + u2x / L2 * t, I[1] + u2y / L2 * t];
        if (nearA(lines[0])) { lines[0].a = T1; } else { lines[0].b = T1; }
        if (nearA(lines[1])) { lines[1].a = T2; } else { lines[1].b = T2; }
        skc.entities.push(mkEnt("line", { a: T1, b: T2 }));
      } else {
        if (!filletTwoLines(lines[0], lines[1], size)) { return; }
      }
      pushHist(); renderAll(); skDirty();
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
      note((kind === "chamfer2d" ? "Chamfer" : "Fillet R " + fmt(size, 1)) + " applied between the two selected lines — AutoCAD FILLET.");
      return;
    }
    var e = S.selEnt ? entityById(skc, S.selEnt) : null;
    if (e && (e.type === "rect" || (e.type === "poly" && e.closed))) {
      var n = filletPolyAll(e, kind, size);
      if (!n) { note("Could not apply " + (kind === "chamfer2d" ? "chamfer" : "fillet") + " to every corner — try a smaller size."); return; }
      pushHist(); renderAll(); skDirty();
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
      note((kind === "chamfer2d" ? "Chamfer" : "Fillet R " + fmt(size, 1)) + " applied to " + n + " corner(s) (AutoCAD FILLET ▸ Polyline).");
      return;
    }
    if (!e || (e.type !== "poly" && e.type !== "rect")) {
      note((kind === "fillet2d" ? "Corner (fillet)" : "Chamfer") + ": select TWO lines, or a rectangle/polygon (all corners), then click the tool. Radius/leg is set in the panel.");
      return;
    }
    entityOp(kind);
  }

  /* ---------- AutoCAD ARRAY / MIRROR (2D sketch) ---------- */
  function copyEntRaw(e) {
    var n = mkEnt(e.type, e);
    n.cons = !!e.cons;
    n.role = e.role;
    if (e.kind) { n.kind = e.kind; }
    if (e.meta) { n.meta = JSON.parse(JSON.stringify(e.meta)); }
    if (e.thread) { n.thread = JSON.parse(JSON.stringify(e.thread)); }
    if (e.hType) { n.hType = e.hType; }
    return n;
  }
  function rotatePt(p, c, ang) {
    var ca = Math.cos(ang), sa = Math.sin(ang), dx = p[0] - c[0], dy = p[1] - c[1];
    return [c[0] + dx * ca - dy * sa, c[1] + dx * sa + dy * ca];
  }
  function rotateCopyEnt(e, c, ang) {
    if (e.type === "rect") {
      return mkEnt("poly", { pts: entPts(e).map(function (p) { return rotatePt(p, c, ang); }), closed: true, kind: "free", cons: e.cons });
    }
    var n = copyEntRaw(e);
    if (n.type === "line" || n.type === "cline") { n.a = rotatePt(n.a, c, ang); n.b = rotatePt(n.b, c, ang); }
    else if (n.type === "poly") { n.pts = n.pts.map(function (p) { return rotatePt(p, c, ang); }); }
    else { var q = rotatePt([n.cx, n.cy], c, ang); n.cx = q[0]; n.cy = q[1]; }
    return n;
  }
  function mirrorPt(p, kind, piv) {
    if (kind === "h") { return [2 * piv[0] - p[0], p[1]]; }
    return [p[0], 2 * piv[1] - p[1]];
  }
  function mirrorCopyEnt(e, kind, piv) {
    if (e.type === "rect") {
      var pts = entPts(e).map(function (p) { return mirrorPt(p, kind, piv); });
      pts.reverse();
      return mkEnt("poly", { pts: pts, closed: true, kind: "free", cons: e.cons });
    }
    var n = copyEntRaw(e);
    if (n.type === "line" || n.type === "cline") { n.a = mirrorPt(n.a, kind, piv); n.b = mirrorPt(n.b, kind, piv); }
    else if (n.type === "poly") { n.pts = n.pts.map(function (p) { return mirrorPt(p, kind, piv); }); if (n.closed) { n.pts.reverse(); } }
    else { var q = mirrorPt([n.cx, n.cy], kind, piv); n.cx = q[0]; n.cy = q[1]; }
    return n;
  }
  function selCentroid(set) {
    var sx = 0, sy = 0, n = 0;
    (set || []).forEach(function (e) {
      var c = entPivot(e);
      if (c) { sx += c[0]; sy += c[1]; n++; }
    });
    return n ? [sx / n, sy / n] : [0, 0];
  }
  function arraySelection(opts) {
    opts = opts || {};
    var skc = sketch();
    var set = selEnts();
    if (!skc || !set.length) { note("Array: select the element(s) to repeat first (holes, lines, circles…)."); return 0; }
    var added = [], i, j;
    if (opts.mode === "polar") {
      var n = Math.max(2, Math.min(200, opts.n | 0 || S.ui.arrayN || 6));
      var sweep = (opts.ang != null ? opts.ang : S.ui.arrayAng) * Math.PI / 180;
      var c = opts.center || selCentroid(set);
      for (i = 1; i < n; i++) {
        var ang = sweep * i / n;
        set.forEach(function (e) { var ne = rotateCopyEnt(e, c, ang); skc.entities.push(ne); added.push(ne); });
      }
      note("Polar array ×" + n + " about (" + fmt(c[0], 1) + ", " + fmt(c[1], 1) + ") — " + added.length + " cop" + (added.length === 1 ? "y" : "ies") + ".");
    } else {
      var nx = Math.max(1, Math.min(100, opts.nx | 0 || S.ui.arrayNx || 3));
      var ny = Math.max(1, Math.min(100, opts.ny | 0 || S.ui.arrayNy || 2));
      var dx = opts.dx != null ? opts.dx : S.ui.arrayDx;
      var dy = opts.dy != null ? opts.dy : S.ui.arrayDy;
      for (j = 0; j < ny; j++) {
        for (i = 0; i < nx; i++) {
          if (i === 0 && j === 0) { continue; }
          set.forEach(function (e) {
            var ne = copyEntRaw(e);
            moveEntity(ne, i * dx, j * dy);
            skc.entities.push(ne);
            added.push(ne);
          });
        }
      }
      note("Rectangular array " + nx + "×" + ny + " — " + added.length + " cop" + (added.length === 1 ? "y" : "ies") + ".");
    }
    if (added.length) {
      S.selSet = added.map(function (e) { return e.id; });
      S.selEnt = added[added.length - 1].id;
      pushHist(); renderAll(); skDirty();
      if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
    }
    return added.length;
  }
  function mirrorCopySelection(kind) {
    var skc = sketch();
    var set = selEnts();
    if (!skc || !set.length) { note("Mirror: select the element(s) to copy first."); return 0; }
    /* world axes (the construction centreline at the origin) — AutoCAD
       MIRROR about the Y / X axis, which is how the 100-exercise plates
       are almost always symmetric. */
    var piv = [0, 0];
    var added = [];
    set.forEach(function (e) {
      var ne = mirrorCopyEnt(e, kind === "v" ? "v" : "h", piv);
      skc.entities.push(ne);
      added.push(ne);
    });
    S.selSet = added.map(function (e) { return e.id; });
    S.selEnt = added.length ? added[added.length - 1].id : null;
    pushHist(); renderAll(); skDirty();
    if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
    note("Mirrored copy about the world " + (kind === "v" ? "X (up ↕ down)" : "Y (left ↔ right)") + " axis — source kept (AutoCAD MIRROR).");
    return added.length;
  }
  function openArrayDialog() {
    var set = selEnts();
    if (!set.length) { note("Array: select the element(s) to repeat first — then click Array again."); return; }
    var body = '<div class="rgzcad-mrow"><label>Mode</label><select data-m-sel="mode"><option value="rect">Rectangular (rows × columns)</option><option value="polar">Polar (around a centre)</option></select></div>' +
      '<div class="rgzcad-mrow"><label>Rect: columns × rows</label><input type="number" min="1" max="100" data-m-num="nx" value="' + (S.ui.arrayNx | 0) + '"><input type="number" min="1" max="100" data-m-num="ny" value="' + (S.ui.arrayNy | 0) + '"></div>' +
      '<div class="rgzcad-mrow"><label>Spacing dx × dy (mm)</label><input type="number" step="0.5" data-m-num="dx" value="' + fmt(S.ui.arrayDx, 1) + '"><input type="number" step="0.5" data-m-num="dy" value="' + fmt(S.ui.arrayDy, 1) + '"></div>' +
      '<div class="rgzcad-mrow"><label>Polar: count / sweep°</label><input type="number" min="2" max="200" data-m-num="n" value="' + (S.ui.arrayN | 0) + '"><input type="number" step="15" min="1" max="360" data-m-num="ang" value="' + fmt(S.ui.arrayAng, 0) + '"></div>' +
      '<div class="rgzcad-note">Polar repeats about the centroid of the selection (typical bolt circle). Rectangular uses the sketch X/Y axes — the same commands as AutoCAD ARRAY.</div>';
    openModal("Array — " + set.length + " selected", body, [
      { label: "Cancel", cls: "ghost", act: "cancel", id: "cancel" },
      { label: "OK — array", cls: "brand", id: "ok", act: function (bx) {
          var mode = mSel(bx, "mode", "rect");
          S.ui.arrayNx = Math.max(1, mNum(bx, "nx", 3) | 0);
          S.ui.arrayNy = Math.max(1, mNum(bx, "ny", 2) | 0);
          S.ui.arrayDx = mNum(bx, "dx", 20);
          S.ui.arrayDy = mNum(bx, "dy", 20);
          S.ui.arrayN = Math.max(2, mNum(bx, "n", 6) | 0);
          S.ui.arrayAng = mNum(bx, "ang", 360);
          closeModal();
          arraySelection({ mode: mode, nx: S.ui.arrayNx, ny: S.ui.arrayNy, dx: S.ui.arrayDx, dy: S.ui.arrayDy, n: S.ui.arrayN, ang: S.ui.arrayAng });
        } }
    ]);
  }
  function openMirrorDialog() {
    var set = selEnts();
    if (!set.length) { note("Mirror: select the element(s) to copy first — then click Mirror again."); return; }
    var body = '<div class="rgzcad-note">Creates a <b>copy</b> across the selection axis (AutoCAD MIRROR, source kept). Use the in-place ⇋ / ⇅ on a single polygon to flip that one shape.</div>';
    openModal("Mirror copy — " + set.length + " selected", body, [
      { label: "Cancel", cls: "ghost", act: "cancel", id: "cancel" },
      { label: "⇋ Left ↔ right", cls: "brand", id: "h", act: function () { closeModal(); mirrorCopySelection("h"); } },
      { label: "⇅ Up ↕ down", cls: "ghost", id: "v", act: function () { closeModal(); mirrorCopySelection("v"); } }
    ]);
  }

  /* wire corner-op click into select-mode down */
  var origSkDown = skDown;
  skDown = function (e) {
    if (e.button === 0 && S.pendingCorner && S.mode === "select") {
      var sp = evPos(e), wp = snapPt(s2w(sp[0], sp[1]));
      if (tryCornerAt(wp)) { return; }
    }
    origSkDown(e);
  };

  /* ---------------- exports / file io ---------------- */
  function matOf() { return MATS[D().material] || MATS.steel; }

  function download(filename, content, type) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: type || "application/octet-stream" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function slugName() { return (D().name || "rgz-part").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rgz-part"; }

  function doExport(kind) {
    if (kind === "json") {
      download(slugName() + ".rgzcad.json", JSON.stringify(D(), null, 1), "application/json");
      note("Design JSON downloaded — reopen it later with Open .json.");
    } else if (kind === "stl") {
      if (window.__rgzcadExportSTL) { window.__rgzcadExportSTL(); }
    } else if (kind === "svg") {
      if (window.__rgzcadExportSVGfile) { window.__rgzcadExportSVGfile(); }
    } else if (kind === "png") {
      if (window.__rgzcadExportPNG) { window.__rgzcadExportPNG(); }
    }
  }

  function openJsonFile(file) {
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(String(rd.result));
        applyLoadedDesign(d, null);
        note("Design loaded from file.");
      } catch (err) { note("That file is not a valid RGZ 3D Studio design."); }
    };
    rd.readAsText(file);
  }

  /* dims for the drawing sheet (part 3 uses this) */
  function designDims() {
    var dims = [];
    var f = D().features[0];
    if (f) {
      var sk = sketchById(f.sketchId);
      if (sk) {
        var prof = profilesOf(sk);
        if (prof.length) {
          var all = [];
          prof.forEach(function (p) { all = all.concat(p.pts); });
          var bb = bboxOf(all);
          var first = prof[0].ent;
          if (first && first.type === "rect" && prof.length === 1) {
            dims.push({ axis: "X", label: "W", value: first.w, tol: first.tol && first.tol.w });
            dims.push({ axis: "Y", label: "H", value: first.h, tol: first.tol && first.tol.h });
          } else {
            dims.push({ axis: "X", label: "W", value: bb.w, tol: null });
            dims.push({ axis: "Y", label: "H", value: bb.h, tol: null });
          }
          dims.push({ axis: "Z", label: "L", value: f.L, tol: f.tol });
          holesOf(sk).forEach(function (he) { dims.push({ axis: "HOLE", label: "Ø", value: he.r * 2, tol: he.tol && he.tol.d, hole: he }); });
          dims.bbox = bb;
          dims.sketchPlaneZ = f && sk ? (sk.plane.origin ? sk.plane.origin[2] : 0) : 0;
        }
      }
    }
    return dims;
  }

  /* ---------------- boot ---------------- */
  function boot1() {
    var root = document.querySelector("[data-rgzcad]");
    if (!root) { return; }
    /* always open light: a fresh empty part; the browser autosave (if any)
       is offered as an on-demand Resume chip instead of being force-loaded */
    var stashed = readAutosave();
    S.design = defaultDesign();

    skCanvas = qs(root, "[data-sketch-canvas]");
    cv = skCanvas;
    cx2 = skCanvas.getContext("2d");

    skCanvas.addEventListener("pointerdown", function (e) { skCanvas.setPointerCapture && skCanvas.setPointerCapture(e.pointerId); skDown(e); });
    skCanvas.addEventListener("pointermove", skMove);
    skCanvas.addEventListener("pointerup", skUp);
    skCanvas.addEventListener("pointercancel", function () { drag = null; moveDrag = null; panDrag = null; multi = null; skDirty(); });
    skCanvas.addEventListener("dblclick", skDbl);
    skCanvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    /* wheel zoom, anchored to the cursor (CAD-style) */
    skCanvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = skCanvas.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      var wp = s2w(mx, my);
      var dy = e.deltaY || 0; if (e.deltaMode === 1) { dy *= 16; }
      var z2 = clamp(S.cam.z * Math.exp(-dy * 0.0013), 0.25, 160);
      S.cam.z = z2;
      /* keep the world point under the cursor stationary */
      S.cam.x = wp[0] - (mx - skCanvas.clientWidth / 2) / z2;
      S.cam.y = wp[1] + (my - skCanvas.clientHeight / 2) / z2;
      skDirty();
    }, { passive: false });

    qsa(root, "[data-tool]").forEach(function (b) { b.addEventListener("click", function () { setMode(b.getAttribute("data-tool")); }); });
    /* one delegated handler: toolbar + panel chips. Per-button binds were
       never attached to the sketch bar, so H/V/Parallel looked dead. */
    root.addEventListener("click", function (ev) {
      var gbtn = ev.target && ev.target.closest ? ev.target.closest("[data-geo]") : null;
      if (gbtn && root.contains(gbtn)) { applyGeo(gbtn.getAttribute("data-geo")); }
    });
    qsa(root, "[data-mode]").forEach(function (b) { b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); }); });
    var bSnap = qs(root, "[data-snap]");
    if (bSnap) { bSnap.addEventListener("click", function () { S.snap = !S.snap; bSnap.classList.toggle("on", S.snap); }); }
    var bFit = qs(root, "[data-zoom-fit]");
    if (bFit) { bFit.addEventListener("click", skFit); }
    var bU = qs(root, "[data-undo]"); if (bU) { bU.addEventListener("click", undo); }
    var bR = qs(root, "[data-redo]"); if (bR) { bR.addEventListener("click", redo); }
    var bCP = qs(root, "[data-close-profile]");
    if (bCP) { bCP.addEventListener("click", closeSketchToPad); }

    qsa(root, "[data-step]").forEach(function (b) {
      b.addEventListener("click", function () { if (!b.disabled) { setStep(b.getAttribute("data-step")); } });
    });

    /* New part (header + panel share data-newdesign — one delegated handler) */
    root.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-newdesign]") : null;
      if (t && root.contains(t)) { newDesignFresh(); return; }
      var dp = e.target && e.target.closest ? e.target.closest("[data-datum]") : null;
      if (dp && root.contains(dp)) { startSketchOnDatum(dp.getAttribute("data-datum")); }
    });
    /* sketcher operation tools (trim / break / offset / corner / chamfer / construction) */
    qsa(root, "[data-op2]").forEach(function (b) {
      b.addEventListener("click", function () {
        var op = b.getAttribute("data-op2");
        if (op === "trim" || op === "break" || op === "qtrim") { setMode(op); return; }
        if (op === "offset") {
          var skc3 = sketch();
          var hasSel = skc3 && S.selEnt && entityById(skc3, S.selEnt);
          if (!hasSel) { note("Offset: select a line, circle, rectangle or polygon first, then click the side to offset to."); }
          S.offEnt = hasSel ? S.selEnt : null;
          setMode("offset");
          return;
        }
        if (op === "corner" || op === "chamfer") { armCornerOp(op === "corner" ? "fillet2d" : "chamfer2d"); return; }
        if (op === "array") { openArrayDialog(); return; }
        if (op === "mirror2") { openMirrorDialog(); return; }
        if (op === "cons") { entityOp("cons"); refreshModebar(); return; }
      });
    });
    var bRes = qs(root, "[data-resume]");
    if (bRes) { bRes.addEventListener("click", resumeDesign); }
    /* feature rail + dress-up bar */
    qsa(root, "[data-featmk]").forEach(function (b) { b.addEventListener("click", function () { featureFromActiveSketch(b.getAttribute("data-featmk")); }); });
    qsa(root, "[data-dress]").forEach(function (b) { b.addEventListener("click", function () { dressSelectedFeature(b.getAttribute("data-dress")); }); });

    document.addEventListener("keydown", function (e) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA")) { return; }
      if (e.key === "Enter" && multi) { finishMulti(true); }
      else if (e.key === "Escape") {
        if (modalIsOpen()) { closeModal(); }
        else if (S.armed3d) { disarmFacePick(); }
        else if (multi) { multi = null; setMode("select"); }
        else if (S.pendingCorner) { S.pendingCorner = null; renderToolHint(); }
        else if (S.mode !== "select") { setMode("select"); }
        else if (S.selEnt || (S.selSet && S.selSet.length)) { selectEntity(null); }
        skDirty();
      } else if ((e.key === "Delete" || e.key === "Backspace") && !modalIsOpen()) {
        if (S.selSet && S.selSet.length) {
          var skc = sketch();
          var n = S.selSet.length;
          skc.entities = skc.entities.filter(function (e2) { return S.selSet.indexOf(e2.id) < 0; });
          S.selEnt = null; S.selSet = []; S.vertexMode = false;
          pushHist(); renderAll();
          if (window.__rgzcadBuild3d) { window.__rgzcadBuild3d(false); }
          note(n + " element(s) deleted.");
        } else if (S.selFeat) { deleteFeature(S.selFeat); }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); }
    });

    window.addEventListener("resize", function () { skResize(); });

    var bF = qs(root, "[data-open-file]");
    if (bF) { bF.addEventListener("change", function () { if (bF.files && bF.files[0]) { openJsonFile(bF.files[0]); bF.value = ""; } }); }

    hist.stack = [snapshot()];
    hist.i = 0;
    S.cam = { x: 0, y: 0, z: 5 };
    skResize();               /* backing store sized to the real pane from boot (crisp, not the 300×150 canvas default) */
    setStep(D().sketches.length ? "sketch" : "plane");   /* CATIA-style: start in 3D, tree empty until a datum plane is picked */
    renderToolHint();
    skFit();
    updateResumeChip(!!(stashed && designDirty(stashed)));
  }

  window.__rgzcad1 = {
    S: S, STEPS: STEPS, MATS: MATS, matOf: matOf,
    qs: qs, qsa: qsa, esc: esc, fmt: fmt, num: num, clamp: clamp, uid: uid,
    polyArea: polyArea, bboxOf: bboxOf, pointInPoly: pointInPoly, worldOf: worldOf, basePlane: basePlane,
    classifyContours: classifyContours,
    sketch: sketch, sketchById: sketchById, featureById: featureById, entityById: entityById,
    profilesOf: profilesOf, holesOf: holesOf, entPts: entPts, featureVol: featureVol, partVol: partVol, featureTip: featureTip,
    iso2768: iso2768, tolText: tolText, autoTol: autoTol,
    setStep: setStep, renderDrawingSheet: renderDrawingSheet, note: note, saveDesign: saveDesign, pushHist: pushHist,
    renderTree: renderTree, renderPanel: renderPanel, renderAll: renderAll, selectEntity: selectEntity, selectFeature: selectFeature, selectSketch: selectSketch,
    padSketch: padSketch, pocketFromSketch: pocketFromSketch, deleteFeature: deleteFeature, deleteSketch: deleteSketch,
    featureFromActiveSketch: featureFromActiveSketch, dressSelectedFeature: dressSelectedFeature,
    newDesignFresh: newDesignFresh, resumeDesign: resumeDesign,
    startSketchOnDatum: startSketchOnDatum, trimCorner: trimCorner, lineLineInt: lineLineInt, quickTrimAt: quickTrimAt,
    filletCornerGeom: filletCornerGeom, filletTwoLines: filletTwoLines, filletTwoCircles: filletTwoCircles, filletTwoCirclesGeom: filletTwoCirclesGeom,
    disksOutline: disksOutline, externalTangents: externalTangents, circleIntersect: circleIntersect,
    ngonPts: ngonPts, slotPts: slotPts, ellipsePts: ellipsePts, rotatePts: rotatePts, airfoilPts: airfoilPts,
    filletPolyAll: filletPolyAll, filletPolyVertex: filletPolyVertex,
    arraySelection: arraySelection, mirrorCopySelection: mirrorCopySelection, explodeRectToPoly: explodeRectToPoly,
    entityCurvesOf: entityCurvesOf, curveCurveInt: curveCurveInt, hitCurve: hitCurve, arcChainPts: arcChainPts, circleToChain: circleToChain,
    loopsFromChains: loopsFromChains, chainSegments: chainSegments, segSegInt: segSegInt, crossingsWith: crossingsWith, holeHasMaterial: holeHasMaterial,
    applyGeo: applyGeo, GEO_GLYPHS: GEO_GLYPHS, GEO_NAMES: GEO_NAMES, selEnts: selEnts, isSel: isSel, clearSel: clearSel, entsInRect: entsInRect, entBBox2: entBBox2,
    profileEdgesFor: profileEdgesFor, vertexInteriorAngle: vertexInteriorAngle, edgeOpSignedArea: edgeOpSignedArea, applyEdgeSelection: applyEdgeSelection, armEdgePick: armEdgePick, upEdgeHint: upEdgeHint, edgeOpsSummary: edgeOpsSummary,
    breakAtPoint: breakAtPoint, offsetAtPoint: offsetAtPoint, toggleCons: toggleCons, entityOp: entityOp, hitEntity: hitEntity,
    revolveSketch: revolveSketch, ribFromSketch: ribFromSketch, ribRingOf: ribRingOf, instCountOf: instCountOf,
    offsetRing: offsetRing, ringCentroid: ringCentroid, mkPattern: mkPattern, sketchAxisCline: sketchAxisCline, sketchOpenProfile: sketchOpenProfile,
    stdPitch: stdPitch,
    newSketchOnPlane: newSketchOnPlane, onFacePicked: onFacePicked, armFacePick: armFacePick, disarmFacePick: disarmFacePick,
    applyLoadedDesign: applyLoadedDesign, migrate1to2: migrate1to2, normalizeDesign: normalizeDesign,
    designDims: designDims, holeTypeLabel: holeTypeLabel, entLabel: entLabel, entMeta: entMeta,
    skResize: skResize, skDirty: skDirty, skFit: skFit, w2s: w2s, s2w: s2w, arc3Pts: arc3Pts, catmullRom: catmullRom,
    download: download, slugName: slugName,
    setMode: setMode, closeSketchToPad: closeSketchToPad, mkEnt: mkEnt, selfIntersects: selfIntersects,
    solveConstraints: solveConstraints, constraintState: constraintState, dofLeft: dofLeft, entDof: entDof, dofUsed: dofUsed,
    tangentMove: tangentMove, carrierSegOf: carrierSegOf, sizeLabelOf: sizeLabelOf, sketchOfEntity: sketchOfEntity,
    openHoleDialog: openHoleDialog, openFeatureDialog: openFeatureDialog, openDressDialog: openDressDialog,
    openModal: openModal, closeModal: closeModal, modalIsOpen: modalIsOpen, METRIC_COARSE: METRIC_COARSE, fillDraw: fillDraw
  };
  window.__rgzcadBoot1 = boot1;
})();
