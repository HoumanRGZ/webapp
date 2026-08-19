/* ============================================================
   RGZ 3D CAD Studio — part 3 (v3): ISO drawing sheet for the
   whole feature tree, exports, guided tour, account module.
   ============================================================ */
(function () {
  "use strict";
  var U = window.__rgzcad1;
  var S = U.S;
  var CFG2 = window.RGZCAD || {};

  /* ============================================================
     ISOMETRIC DRAWING SHEET (ISO 128 / 129-1 / 406 / 7200 / 216)
     Renders EVERY feature of the tree (pads, pockets, holes).
     ============================================================ */
  var COS30 = 0.8660254, SIN30 = 0.5;
  function proj(p) { return [(p[0] - p[1]) * COS30, (p[0] + p[1]) * SIN30 - p[2]]; }

  /* world-space wireframe of one feature */
  function featureWires(f) {
    var sk = U.sketchById(f.sketchId);
    if (!sk) { return null; }
    var prof = U.profilesOf(sk);
    if (!prof.length) { return null; }
    var n = sk.plane.n, dir = f.dir === -1 ? -1 : 1;
    function P3(a, b, h) {
      var w = U.worldOf(sk.plane, a, b);
      return [w[0] + n[0] * h * dir, w[1] + n[1] * h * dir, w[2] + n[2] * h * dir];
    }
    var wires = { visible: [], hidden: [], centers: [] };
    var contours = prof.map(function (p) { return p.pts; });
    contours.forEach(function (pts) {
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        wires.visible.push([P3(a[0], a[1], f.L === 0 ? 0 : (f.type === "pocket" ? 0 : f.L)), P3(b[0], b[1], f.type === "pocket" ? 0 : f.L)]);
        wires.hidden.push([P3(a[0], a[1], 0), P3(b[0], b[1], 0)]);
        wires.visible.push([P3(a[0], a[1], 0), P3(a[0], a[1], f.L)]);
      }
    });
    /* holes as circles (top + bottom if through) */
    U.holesOf(sk).forEach(function (h) {
      var N = 24, i, ring = [], ringB = [];
      for (i = 0; i < N; i++) {
        var t = i / N * Math.PI * 2;
        ring.push(P3(h.cx + h.r * Math.cos(t), h.cy + h.r * Math.sin(t), f.L));
        ringB.push(P3(h.cx + h.r * Math.cos(t), h.cy + h.r * Math.sin(t), 0));
      }
      for (i = 0; i < N; i++) {
        wires.visible.push([ring[i], ring[(i + 1) % N]]);
        if (h.hType === "through") { wires.hidden.push([ringB[i], ringB[(i + 1) % N]]); }
      }
      wires.centers.push({ a: P3(h.cx, h.cy, f.L + 2), b: P3(h.cx, h.cy, f.L), hole: h, topRing: ring, feat: f });
      if (h.hType === "cbore" || h.hType === "csink") {
        var ring2 = [];
        for (i = 0; i < N; i++) {
          var t2 = i / N * Math.PI * 2;
          ring2.push(P3(h.cx + (h.cbd / 2) * Math.cos(t2), h.cy + (h.cbd / 2) * Math.sin(t2), f.L));
        }
        for (i = 0; i < N; i++) { wires.visible.push([ring2[i], ring2[(i + 1) % N]]); }
      }
    });
    return wires;
  }

  function allWires() {
    var out = { visible: [], hidden: [], centers: [] };
    S.design.features.forEach(function (f) {
      var w = featureWires(f);
      if (!w) { return; }
      out.visible = out.visible.concat(w.visible);
      out.hidden = out.hidden.concat(w.hidden);
      out.centers = out.centers.concat(w.centers);
    });
    /* pocket cuts drawn on their host top: contour at tip + depth dashed */
    S.design.features.forEach(function (g) {
      if (g.type !== "pocket") { return; }
      var gsk = U.sketchById(g.sketchId);
      var host = gsk && gsk.host ? U.featureById(gsk.host) : null;
      if (!gsk || !host) { return; }
      var hsk = U.sketchById(host.sketchId);
      if (!hsk) { return; }
      var hn = hsk.plane.n;
      var top = U.featureTip(host);
      function P3h(a, b, drop) {
        var w = U.worldOf(gsk.plane, a, b);
        return [w[0] - hn[0] * drop, w[1] - hn[1] * drop, w[2] - hn[2] * drop];
      }
      U.profilesOf(gsk).forEach(function (p) {
        for (var i = 0; i < p.pts.length; i++) {
          var a = p.pts[i], b = p.pts[(i + 1) % p.pts.length];
          out.visible.push([P3h(a[0], a[1], 0), P3h(b[0], b[1], 0)]);
          out.hidden.push([P3h(a[0], a[1], g.L), P3h(b[0], b[1], g.L)]);
          out.hidden.push([P3h(a[0], a[1], 0), P3h(a[0], a[1], g.L)]);
        }
      });
    });
    return out;
  }

  /* ============================================================
     MULTI-VIEW PROJECTION with hidden-line removal (ISO 128-20/24)
     The user picks the views; each is projected from the real 3D
     solid with a software z-buffer: visible outlines thick,
     obscured edges dashed. */
  var VIEW_ORDER = ["front", "top", "right", "back", "bottom", "left", "iso"];
  var VIEW_DEFS = {
    front:  { eye: [0, -1, 0],  u: [1, 0, 0],   v: [0, 0, 1],           label: "FRONT VIEW" },
    back:   { eye: [0, 1, 0],   u: [-1, 0, 0],  v: [0, 0, 1],           label: "BACK VIEW" },
    top:    { eye: [0, 0, 1],   u: [1, 0, 0],   v: [0, -1, 0],          label: "TOP VIEW" },
    bottom: { eye: [0, 0, -1],  u: [1, 0, 0],   v: [0, 1, 0],           label: "BOTTOM VIEW" },
    right:  { eye: [1, 0, 0],   u: [0, -1, 0],  v: [0, 0, 1],           label: "RIGHT VIEW" },
    left:   { eye: [-1, 0, 0],  u: [0, 1, 0],   v: [0, 0, 1],           label: "LEFT VIEW" },
    iso:    { eye: [0.5773503, 0.5773503, 0.5773503], u: [0.8660254, -0.8660254, 0], v: [0.4082483, 0.4082483, -0.8164966], label: "ISOMETRIC VIEW" }
  };
  function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  /* project whole soup into one view: returns runs of edges with visibility */
  function hlrView(soup, def) {
    var pos = soup.positions, nor = soup.normals;
    var tris = (pos.length / 9) | 0;
    if (!tris) { return { runs: [], span: 1, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }; }
    var i, j;
    /* ---- project all referenced points (view coords: u, v, depth w) ---- */
    var pts = new Float64Array(pos.length);
    var u0 = 1e30, v0 = 1e30, u1 = -1e30, v1 = -1e30, w1 = -1e30;
    for (i = 0; i < pos.length; i += 3) {
      var x = pos[i], y = pos[i + 1], z = pos[i + 2];
      var qu = vDot(def.u, [x, y, z]), qv = vDot(def.v, [x, y, z]), qw = vDot(def.eye, [x, y, z]);
      pts[i] = qu; pts[i + 1] = qv; pts[i + 2] = qw;
      if (qu < u0) { u0 = qu; } if (qu > u1) { u1 = qu; }
      if (qv < v0) { v0 = qv; } if (qv > v1) { v1 = qv; }
      if (qw > w1) { w1 = qw; }
    }
    var spanU = Math.max(u1 - u0, 1e-6), spanV = Math.max(v1 - v0, 1e-6);
    var span = Math.max(spanU, spanV);
    /* ---- z-buffer (raster, no canvas — testable anywhere) ---- */
    var sc2 = 460 / span;
    var bw = Math.min(720, Math.max(24, Math.ceil(spanU * sc2) + 4));
    var bh = Math.min(720, Math.max(24, Math.ceil(spanV * sc2) + 4));
    var zbuf = new Float64Array(bw * bh).fill(-1e30);
    function pxOf(qu) { return (qu - u0) * sc2 + 2; }
    function pyOf(qv) { return (qv - v0) * sc2 + 2; }
    for (i = 0; i < tris; i++) {
      var i0 = i * 9, i1 = i0 + 3, i2 = i0 + 6;
      var ax = pxOf(pts[i0]), ay = pyOf(pts[i0 + 1]), aw = pts[i0 + 2];
      var bx2 = pxOf(pts[i1]), by2 = pyOf(pts[i1 + 1]), bw2 = pts[i1 + 2];
      var cx2 = pxOf(pts[i2]), cy2 = pyOf(pts[i2 + 1]), cw2 = pts[i2 + 2];
      var den = (by2 - cy2) * (ax - cx2) + (cx2 - bx2) * (ay - cy2);
      if (Math.abs(den) < 1e-12) { continue; }   /* edge-on sliver */
      var mnx = Math.max(0, Math.floor(Math.min(ax, bx2, cx2))), mxx = Math.min(bw - 1, Math.ceil(Math.max(ax, bx2, cx2)));
      var mny = Math.max(0, Math.floor(Math.min(ay, by2, cy2))), mxy = Math.min(bh - 1, Math.ceil(Math.max(ay, by2, cy2)));
      for (var py = mny; py <= mxy; py++) {
        for (var px = mnx; px <= mxx; px++) {
          var l1 = ((by2 - cy2) * (px + 0.5 - cx2) + (cx2 - bx2) * (py + 0.5 - cy2)) / den;
          var l2 = ((cy2 - ay) * (px + 0.5 - cx2) + (ax - cx2) * (py + 0.5 - cy2)) / den;
          var l3 = 1 - l1 - l2;
          if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) { continue; }
          var w = l1 * aw + l2 * bw2 + l3 * cw2;
          var idx = py * bw + px;
          if (w > zbuf[idx]) { zbuf[idx] = w; }
        }
      }
    }
    /* ---- face visibility per tri (for silhouette detection) ---- */
    var faceVis = new Int8Array(tris);
    for (i = 0; i < tris; i++) {
      var ni = i * 9;
      faceVis[i] = vDot(def.eye, [nor[ni], nor[ni + 1], nor[ni + 2]]) > 1e-9 ? 1 : -1;
    }
    /* ---- unique edges with adjacency ---- */
    var emap = {};
    function vkey(i3) { return Math.round(pos[i3] * 4096) + "|" + Math.round(pos[i3 + 1] * 4096) + "|" + Math.round(pos[i3 + 2] * 4096); }
    for (i = 0; i < tris; i++) {
      for (j = 0; j < 3; j++) {
        var ia = i * 9 + 3 * j, ib = i * 9 + 3 * ((j + 1) % 3);
        var ka = vkey(ia), kb = vkey(ib);
        var ek = ka < kb ? ka + "~" + kb : kb + "~" + ka;
        var rec = emap[ek];
        if (!rec) { rec = emap[ek] = { a: -1, b: -1, faces: [] }; }
        if (ka < kb) { rec.a = ia; rec.b = ib; } else { rec.a = ib; rec.b = ia; }
        if (rec.faces.indexOf(i) < 0) { rec.faces.push(i); }
      }
    }
    /* ---- candidate edges: sharp / boundary / silhouette ----
       coincident-face handling is pairwise: an edge shared by two coplanar
       faces with OPPOSITE normals is an internal interface (stacked slabs,
       part-on-part contact) and never drawn; everything else is judged by
       its own dihedral/silhouette pairs, so pocket rims (which sit next to
       duplicated cap slivers from the tessellator) survive */
    var cands = [];
    Object.keys(emap).forEach(function (ek) {
      var rec = emap[ek];
      if (rec.faces.length === 1) { cands.push(rec); return; }
      var internal = false, hit = false, i2, j2;
      for (i2 = 0; i2 < rec.faces.length && !internal; i2++) {
        for (j2 = i2 + 1; j2 < rec.faces.length && !internal; j2++) {
          var na = rec.faces[i2] * 9, nb = rec.faces[j2] * 9;
          var d = nor[na] * nor[nb] + nor[na + 1] * nor[nb + 1] + nor[na + 2] * nor[nb + 2];
          if (d < -0.9995) { internal = true; break; }        /* coincident opposite caps */
          if (Math.abs(d) < 0.906 || faceVis[rec.faces[i2]] !== faceVis[rec.faces[j2]]) { hit = true; }
        }
      }
      if (!internal && hit) { cands.push(rec); }
    });
    /* ---- classify: sample the edge through the z-buffer ---- */
    var tol = 1.9 / sc2 + span * 1.5e-3;
    var M = 22;
    var runs = [];
    cands.forEach(function (rec) {
      var aU = pts[rec.a], aV = pts[rec.a + 1], aW = pts[rec.a + 2];
      var bU = pts[rec.b], bV = pts[rec.b + 1], bW = pts[rec.b + 2];
      var flags = [];
      for (j = 0; j <= M; j++) {
        var t2 = j / M;
        var w = aW + (bW - aW) * t2;
        var gx = Math.round(pxOf(aU + (bU - aU) * t2)), gy = Math.round(pyOf(aV + (bV - aV) * t2));
        gx = Math.max(0, Math.min(bw - 1, gx)); gy = Math.max(0, Math.min(bh - 1, gy));
        flags.push(w >= zbuf[gy * bw + gx] - tol);
      }
      /* median-of-3 smoothing kills single-sample flutters */
      for (j = 1; j < M; j++) {
        if (flags[j - 1] === flags[j + 1] && flags[j] !== flags[j - 1]) { flags[j] = flags[j - 1]; }
      }
      var st = 0;
      for (j = 1; j <= M; j++) {
        if (flags[j] !== flags[st] || j === M) {
          var te = (flags[j] !== flags[st]) ? j : M;
          if (te - st >= 1) {
            runs.push({
              a: [aU + (bU - aU) * (st / M), aV + (bV - aV) * (st / M)],
              b: [aU + (bU - aU) * (te / M), aV + (bV - aV) * (te / M)],
              vis: flags[st]
            });
          }
          st = j;
        }
      }
    });
    /* drop zero-length fragments (degenerate tessellation slivers) */
    runs = runs.filter(function (r) { return Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) > 1e-4; });
    /* hidden runs covered by a visible collinear run (fully OR partially, e.g. a
       pocket floor rim directly under its opening rim) are dropped, as are exact
       visible duplicates — ISO 128-24: a visible line has precedence */
    function covBy(r, s) {   /* is run r covered by the VISIBLE run s? */
      var ls = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      var lr = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
      if (!(ls > 1e-6) || !(lr > 1e-6)) { return false; }
      var dsx = (s.b[0] - s.a[0]) / ls, dsy = (s.b[1] - s.a[1]) / ls;
      var drx = (r.b[0] - r.a[0]) / lr, dry = (r.b[1] - r.a[1]) / lr;
      if (Math.abs(dsx * drx + dsy * dry) < 0.99) { return false; }        /* not collinear */
      var pA = Math.abs((r.a[0] - s.a[0]) * dsy - (r.a[1] - s.a[1]) * dsx);
      var pB = Math.abs((r.b[0] - s.a[0]) * dsy - (r.b[1] - s.a[1]) * dsx);
      if (pA > 0.45 || pB > 0.45) { return false; }                        /* not on the same line */
      var ta = ((r.a[0] - s.a[0]) * dsx + (r.a[1] - s.a[1]) * dsy) / ls;
      var tb = ((r.b[0] - s.a[0]) * dsx + (r.b[1] - s.a[1]) * dsy) / ls;
      var sl = 0.45 / ls;
      return Math.min(ta, tb) >= -sl && Math.max(ta, tb) <= 1 + sl;        /* contained */
    }
    var keptV = [];
    runs.forEach(function (r) {
      if (!r.vis) { return; }
      if (!keptV.some(function (s) { return covBy(r, s); })) { keptV.push(r); }
    });
    runs = runs.filter(function (r) {
      if (r.vis) { return keptV.indexOf(r) >= 0; }
      return !keptV.some(function (s) { return covBy(r, s); });
    });
    return { runs: runs, span: span, bbox: { x0: u0, y0: v0, x1: u1, y1: v1 } };
  }

  /* scale picking like the v2 sheet */
  var SCALES = [0.1, 0.125, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20];
  function pickScale(spanMm, budgetPx) {
    if (!(spanMm > 0)) { return 1; }
    var mmToPxAt1 = budgetPx / spanMm;
    var pxPerMm = mmToPxAt1;
    var best = SCALES[0];
    for (var i = 0; i < SCALES.length; i++) { if (SCALES[i] <= pxPerMm + 1e-9) { best = SCALES[i]; } }
    if (window.RGZCAD && S.design.draw.scale !== "auto") {
      var m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(S.design.draw.scale);
      if (m) { return (parseFloat(m[1]) / parseFloat(m[2])) * (3.7795275591); }
    }
    return best;
  }

  function wireRunsForView(wires, def) {
    /* fallback when the tessellator is unavailable: analytic wires (still
       view-correct outlines, visible/hidden classes approximated) */
    var runs = [], u0 = 1e30, v0 = 1e30, u1 = -1e30, v1 = -1e30;
    function put(e, vis) {
      var a = [vDot(def.u, e[0]), vDot(def.v, e[0])], b = [vDot(def.u, e[1]), vDot(def.v, e[1])];
      runs.push({ a: a, b: b, vis: vis });
      [a, b].forEach(function (q) {
        u0 = Math.min(u0, q[0]); v0 = Math.min(v0, q[1]);
        u1 = Math.max(u1, q[0]); v1 = Math.max(v1, q[1]);
      });
    }
    wires.visible.forEach(function (e) { put(e, true); });
    wires.hidden.forEach(function (e) { put(e, false); });
    if (!runs.length) { u0 = 0; v0 = 0; u1 = 1; v1 = 1; }
    return { runs: runs, bbox: { x0: u0, y0: v0, x1: u1, y1: v1 } };
  }

  function renderSheet() {
    var root = document.querySelector("[data-rgzcad]");
    var host = (root && U.qs(root, "[data-sheet]")) || document.querySelector("[data-sheet]");
    if (!host) { return; }
    host.style.display = "block";
    S.design.draw = U.fillDraw(S.design.draw);
    var dr = S.design.draw;
    if (!S.design.features.length) {
      host.innerHTML = '<div class="rgzcad-empty" style="margin:40px auto;max-width:420px">No 3D features yet — pad a sketch first (steps 1–2).</div>';
      return;
    }
    var names = VIEW_ORDER.filter(function (nm) { return dr.views[nm]; });
    if (!names.length) {
      host.innerHTML = '<div class="rgzcad-empty" style="margin:40px auto;max-width:420px">No views selected — tick at least one view in the drawing panel (Front / Top / Right / 3D …).</div>';
      return;
    }
    var wires = allWires();
    var soup = null;
    try {
      if (window.__rgzcad2 && typeof window.__rgzcad2.worldSoup === "function") {
        soup = window.__rgzcad2.worldSoup();
      }
    } catch (eSoup) { soup = null; }
    var views = names.map(function (nm) {
      var def = VIEW_DEFS[nm];
      var wr = wireRunsForView(wires, def);
      if (soup) {
        try {
          var hv = hlrView(soup, def);
          var visN = hv && hv.runs ? hv.runs.filter(function (r) { return r.vis; }).length : 0;
          if (hv && visN) { return { name: nm, def: def, runs: hv.runs, bbox: hv.bbox }; }
        } catch (eHlr) { /* fall through to analytic wires */ }
      }
      return { name: nm, def: def, runs: wr.runs, bbox: wr.bbox };
    });
    window.__rgzcadViewData = views;   /* harness/debug: inspect the computed runs */

    /* ---- first-angle slot layout around FRONT (ISO 128-30) ---- */
    var slotOf = { front: [0, 0], top: [0, 1], bottom: [0, -1], right: [-1, 0], left: [1, 0] };
    var usedSlots = {};
    views.forEach(function (vw) {
      if (vw.slot) { return; }
      var s = slotOf[vw.name] ? [slotOf[vw.name][0], slotOf[vw.name][1]] : [0, 0];
      if (vw.name === "back") { s = usedSlots["1,0"] ? [2, 0] : [1, 0]; }
      if (vw.name === "iso") {
        var mx = null;
        views.forEach(function (o) { if (o !== vw && o.slot) { mx = mx === null ? o.slot[0] : Math.max(mx, o.slot[0]); } });
        s = [mx === null ? 0 : mx + 1, 0];
      }
      while (usedSlots[s[0] + "," + s[1]]) { s = [s[0] + 1, s[1]]; }
      usedSlots[s[0] + "," + s[1]] = vw;
      vw.slot = s;
    });
    var GUT = 12, LAB = 7;              /* mm, drawing space */
    var cols = {}, rows2 = {};
    views.forEach(function (vw) {
      vw.wmm = Math.max(vw.bbox.x1 - vw.bbox.x0, 1e-3);
      vw.hmm = Math.max(vw.bbox.y1 - vw.bbox.y0, 1e-3);
      cols[vw.slot[0]] = Math.max(cols[vw.slot[0]] || 0, vw.wmm);
      rows2[vw.slot[1]] = Math.max(rows2[vw.slot[1]] || 0, vw.hmm + LAB);
    });
    var colXs = Object.keys(cols).map(Number).sort(function (a, b) { return a - b; });
    var rowYs = Object.keys(rows2).map(Number).sort(function (a, b) { return a - b; });   /* slot −1 (bottom view) stacks above */
    var totWmm = 0, totHmm = 0;
    colXs.forEach(function (cx, i2) { totWmm += cols[cx]; if (i2) { totWmm += GUT; } });
    rowYs.forEach(function (ry, i2) { totHmm += rows2[ry]; if (i2) { totHmm += GUT; } });

    var W = 1123, H = 794;               /* A4 landscape px @96dpi */
    var margin = 36, blockH = 86, titleW = 330;
    var budgetPx = Math.min(W - 2 * margin - 40, H - 2 * margin - blockH - 30);
    var sc = pickScale(Math.max(totWmm, totHmm), budgetPx);
    var arrW = totWmm * sc, arrH = totHmm * sc;
    var ox = margin + (W - 2 * margin - arrW) / 2;
    var oy = margin + 26 + Math.max(0, (H - 2 * margin - blockH - 30 - arrH) / 2);
    var colXpx = {}, rowYpx = {}, acc = ox;
    colXs.forEach(function (cx, i2) { colXpx[cx] = acc; acc += cols[cx] * sc + GUT * sc; });
    acc = oy;
    rowYs.forEach(function (ry, i2) { rowYpx[ry] = acc; acc += rows2[ry] * sc + GUT * sc; });
    views.forEach(function (vw) {
      vw.cx0 = colXpx[vw.slot[0]] + (cols[vw.slot[0]] * sc - vw.wmm * sc) / 2 - vw.bbox.x0 * sc;
      vw.cy0 = rowYpx[vw.slot[1]] + (rows2[vw.slot[1]] * sc + vw.hmm * sc) / 2 + vw.bbox.y0 * sc;   /* paper y = cy0 − v·sc */
    });
    function PX(vw, p2) { return vw.cx0 + p2[0] * sc; }
    function PY(vw, p2) { return vw.cy0 - p2[1] * sc; }

    var showHid = dr.hidden, showCenter = dr.center, showDims = dr.tolOn !== false;
    var svg = "";
    svg += '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" font-family="Arial,Helvetica,sans-serif">';
    svg += '<rect width="' + W + '" height="' + H + '" fill="#fff"/>';
    svg += '<rect x="' + margin + '" y="' + margin + '" width="' + (W - 2 * margin) + '" height="' + (H - 2 * margin) + '" fill="none" stroke="#111" stroke-width="2"/>';
    svg += '<rect x="' + (margin + 8) + '" y="' + (margin + 8) + '" width="' + (W - 2 * margin - 16) + '" height="' + (H - 2 * margin - 16) + '" fill="none" stroke="#111" stroke-width="0.6"/>';
    svg += '<text x="' + (margin + 16) + '" y="' + (margin + 30) + '" font-size="13" font-weight="bold" fill="#111">PROJECTED VIEWS — ISO 128 (first angle) · dims ISO 129-1 · units mm</text>';

    views.forEach(function (vw) {
      svg += '<g data-view="' + vw.name + '">';
      if (showHid) {
        vw.runs.forEach(function (r) {
          if (r.vis) { return; }
          svg += '<line x1="' + PX(vw, r.a).toFixed(1) + '" y1="' + PY(vw, r.a).toFixed(1) + '" x2="' + PX(vw, r.b).toFixed(1) + '" y2="' + PY(vw, r.b).toFixed(1) + '" stroke="#41505f" stroke-width="0.7" stroke-dasharray="5 3"/>';
        });
      }
      vw.runs.forEach(function (r) {
        if (!r.vis) { return; }
        svg += '<line x1="' + PX(vw, r.a).toFixed(1) + '" y1="' + PY(vw, r.a).toFixed(1) + '" x2="' + PX(vw, r.b).toFixed(1) + '" y2="' + PY(vw, r.b).toFixed(1) + '" stroke="#111" stroke-width="1.5"/>';
      });
      if (showCenter) { svg += centersSvg(vw, wires, sc); }
      var midU = (vw.bbox.x0 + vw.bbox.x1) / 2;
      svg += '<text x="' + (vw.cx0 + midU * sc).toFixed(1) + '" y="' + (vw.cy0 - vw.bbox.y0 * sc + 14).toFixed(1) + '" font-size="11" font-weight="bold" fill="#111" text-anchor="middle" letter-spacing="1.5">' + vw.def.label + '</text>';
      svg += "</g>";
    });

    /* dimensions on the anchor view (front → top → iso → first picked) */
    var dims = null;
    try { dims = U.designDims(); } catch (eDim) { dims = []; }
    var anchor = null;
    ["front", "top", "iso"].forEach(function (nm) { views.forEach(function (vw) { if (!anchor && vw.name === nm) { anchor = vw; } }); });
    if (!anchor) { anchor = views[0]; }
    if (showDims && dims && dims.length && dims.bbox && anchor) {
      try {
        svg += dimSvg(dims, sc, function (w) { return [anchor.cx0 + vDot(anchor.def.u, w) * sc, anchor.cy0 - vDot(anchor.def.v, w) * sc]; });
      } catch (eDim2) { /* keep the views even if a dim leader fails */ }
    }

    /* projection symbol — FIRST ANGLE (ISO 128-30): frustum left, circles right */
    var px = margin + 64, py = H - margin - blockH - 52;
    svg += '<g stroke="#111" stroke-width="1.3" fill="none">' +
      '<path d="M ' + px + ' ' + (py + 11) + ' L ' + (px + 26) + ' ' + (py + 5) + ' M ' + px + ' ' + (py + 25) + ' L ' + (px + 26) + ' ' + (py + 31) + '"/>' +
      '<line x1="' + px + '" y1="' + (py + 11) + '" x2="' + px + '" y2="' + (py + 25) + '"/>' +
      '<line x1="' + (px + 26) + '" y1="' + (py + 5) + '" x2="' + (px + 26) + '" y2="' + (py + 31) + '"/>' +
      '<circle cx="' + (px + 46) + '" cy="' + (py + 18) + '" r="7"/><circle cx="' + (px + 46) + '" cy="' + (py + 18) + '" r="3.2"/></g>';
    svg += '<text x="' + (px - 4) + '" y="' + (py + 48) + '" font-size="10" fill="#111">Projection: first angle (ISO 128-30)</text>';

    /* title block (ISO 7200) */
    var bx = W - margin - titleW, by = H - margin - blockH;
    svg += '<g font-size="11" fill="#111">';
    svg += '<rect x="' + bx + '" y="' + by + '" width="' + titleW + '" height="' + blockH + '" fill="none" stroke="#111" stroke-width="1.6"/>';
    var rows = [
      ["<tspan font-weight='bold' font-size='14'>" + U.esc(S.design.name || "Untitled part") + "</tspan>", "", ""],
      [U.esc(U.matOf().label), "Dims ISO 129-1 · Tol ISO 406", ""],
      ["Scale " + scaleLabel(sc) + " · Units mm · Sheet A4", "Tol " + U.esc(S.design.draw.general === "f" ? "ISO 2768-f" : S.design.draw.general === "c" ? "ISO 2768-c" : "ISO 2768-mK"), ""],
      [new Date().toISOString().slice(0, 10) + " · houmanrgz.ir", "RGZ ENGINEERING", ""]
    ];
    var rh = blockH / 4;
    rows.forEach(function (r, i) {
      if (i) { svg += '<line x1="' + bx + '" y1="' + (by + i * rh) + '" x2="' + (bx + titleW) + '" y2="' + (by + i * rh) + '" stroke="#111" stroke-width="0.9"/>'; }
      svg += '<text x="' + (bx + 8) + '" y="' + (by + i * rh + rh / 2 + 4) + '">' + r[0] + "</text>";
      if (r[1]) { svg += '<text x="' + (bx + titleW - 8) + '" y="' + (by + i * rh + rh / 2 + 4) + '" text-anchor="end" font-size="10">' + r[1] + "</text>"; }
    });
    svg += "</g></svg>";
    host.innerHTML = '<div class="rgzcad-sheetpage" style="width:' + W + 'px;max-width:100%">' + svg + "</div>";
    window.__rgzcadLastSVG = svg;
  }

  /* hole centre-lines per view (dash-dot): cross when looking along the
     axis, extended axis line when looking across it */
  function centersSvg(vw, wires, sc) {
    var out = "";
    wires.centers.forEach(function (c) {
      var axis = [c.a[0] - c.b[0], c.a[1] - c.b[1], c.a[2] - c.b[2]];
      var al = Math.hypot(axis[0], axis[1], axis[2]) || 1;
      axis = [axis[0] / al, axis[1] / al, axis[2] / al];
      function LP(w) { return [vw.cx0 + vDot(vw.def.u, w) * sc, vw.cy0 - vDot(vw.def.v, w) * sc]; }
      if (Math.abs(vDot(axis, vw.def.eye)) > 0.94) {
        var rExt = c.hole ? Math.max(c.hole.r, (c.hole.hType === "cbore" || c.hole.hType === "csink") ? c.hole.cbd / 2 : c.hole.r) : 6;
        var ext = rExt * 1.45 * sc + 4;
        var cc = LP(c.b);
        out += '<line x1="' + (cc[0] - ext).toFixed(1) + '" y1="' + cc[1].toFixed(1) + '" x2="' + (cc[0] + ext).toFixed(1) + '" y2="' + cc[1].toFixed(1) + '" stroke="#41505f" stroke-width="0.6" stroke-dasharray="12 4 2 4"/>';
        out += '<line x1="' + cc[0].toFixed(1) + '" y1="' + (cc[1] - ext).toFixed(1) + '" x2="' + cc[0].toFixed(1) + '" y2="' + (cc[1] + ext).toFixed(1) + '" stroke="#41505f" stroke-width="0.6" stroke-dasharray="12 4 2 4"/>';
      } else if (c.feat) {
        var bBot = [c.b[0] - axis[0] * c.feat.L, c.b[1] - axis[1] * c.feat.L, c.b[2] - axis[2] * c.feat.L];
        var aT = LP(c.a), bT = LP(bBot);
        var dx = aT[0] - bT[0], dy = aT[1] - bT[1], dl = Math.hypot(dx, dy) || 1;
        dx /= dl; dy /= dl;
        out += '<line x1="' + (bT[0] - dx * 4).toFixed(1) + '" y1="' + (bT[1] - dy * 4).toFixed(1) + '" x2="' + (aT[0] + dx * 4).toFixed(1) + '" y2="' + (aT[1] + dy * 4).toFixed(1) + '" stroke="#41505f" stroke-width="0.6" stroke-dasharray="12 4 2 4"/>';
      }
    });
    return out;
  }

  function scaleLabel(sc) {
    if (Math.abs(sc - 1) < 0.01) { return "1:1"; }
    return sc > 1 ? U.fmt(sc, 1).replace(/\.0$/, "") + ":1" : "1:" + U.fmt(1 / sc, 1).replace(/\.0$/, "");
  }

  /* overall + hole dimensions, projected onto the anchor view.
     P maps a world point to sheet px. ISO 129-1 style with arrows. */
  function dimSvg(dims, sc, P) {
    var g = "";
    var bb = dims.bbox;
    var f = S.design.features[0];
    var sk = f ? U.sketchById(f.sketchId) : null;
    if (!sk) { return g; }
    var n = sk.plane.n;
    function P3(a, b, h) { var w = U.worldOf(sk.plane, a, b); return [w[0] + n[0] * h, w[1] + n[1] * h, w[2] + n[2] * h]; }
    function arrow(p, ang) {
      var s = 6;
      return '<path d="M ' + p[0] + " " + p[1] + " l " + (-s * Math.cos(ang - 0.42)) + " " + (-s * Math.sin(ang - 0.42)) + " M " + p[0] + " " + p[1] + " l " + (-s * Math.cos(ang + 0.42)) + " " + (-s * Math.sin(ang + 0.42)) + '" stroke="#0070c0" fill="none" stroke-width="1.1"/>';
    }
    function dimLine(aW, bW, text, off) {
      var A = P(aW), B = P(bW);
      var mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      var ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
      var out = '<line x1="' + A[0].toFixed(1) + '" y1="' + A[1].toFixed(1) + '" x2="' + B[0].toFixed(1) + '" y2="' + B[1].toFixed(1) + '" stroke="#0070c0" stroke-width="0.9"/>';
      out += arrow(A, ang) + arrow(B, ang + Math.PI);
      var deg = ang * 180 / Math.PI;
      if (deg > 90 || deg < -90) { deg += 180; }
      out += '<text x="' + (mx + off[0]) + '" y="' + (my + off[1]) + '" font-size="12" fill="#0070c0" text-anchor="middle" transform="rotate(' + deg.toFixed(1) + " " + (mx + off[0]) + " " + (my + off[1]) + ')">' + text + "</text>";
      return out;
    }
    var x0 = bb.x, y0 = bb.y, x1 = bb.x + bb.w, y1 = bb.y + bb.h, L = f.L;
    /* overall width along the sketch x, depth along y, height along the normal */
    g += dimLine(P3(x0, y0, L), P3(x1, y0, L), U.tolText(dims[0].tol, dims[0].value), [0, -10]);
    g += dimLine(P3(x1, y0, L), P3(x1, y1, L), U.tolText(dims[1].tol, dims[1].value), [16, 0]);
    g += dimLine(P3(x0, y0, 0), P3(x0, y0, L), U.tolText(dims[2].tol, dims[2].value), [-20, 0]);
    /* holes: leader with the full ISO callout (thread included) — staggered */
    var wires = allWires(), leaderIdx = 0;
    wires.centers.forEach(function (c) {
      if (!c.hole) { return; }
      var top = P(c.a);
      var cT = P(c.b);
      var lab = holeCallout(c.hole);
      var elbow = [top[0] + 42 + (leaderIdx % 2) * 26, top[1] - 40 - leaderIdx * 17];
      leaderIdx++;
      g += '<polyline points="' + cT[0] + "," + cT[1] + " " + elbow[0] + "," + elbow[1] + " " + (elbow[0] + 8) + "," + elbow[1] + '" fill="none" stroke="#0070c0" stroke-width="0.9"/>';
      g += '<text x="' + (elbow[0] + 12) + '" y="' + (elbow[1] + 4) + '" font-size="12" fill="#0070c0">' + U.esc(lab) + "</text>";
    });
    return g;
  }

  function holeCallout(h) {
    if (h.thread && h.thread.on) {   /* ISO metric thread designation replaces the drill callout */
      var tt = (h.thread.iso || ("M" + U.fmt(2 * h.r, 1))) + " × " + U.fmt(h.thread.pitch, 2);
      if (h.hType === "blind") { tt += " ↧ " + U.fmt(h.depth, 1); }
      return tt;
    }
    var t = U.tolText(h.tol && h.tol.d, 2 * h.r);
    t = "Ø " + t;
    if (h.hType === "blind") { t += " ↧ " + U.fmt(h.depth, 1); }
    else if (h.hType === "cbore") { t += "  ⌴ Ø " + U.fmt(h.cbd, 1) + " ↧ " + U.fmt(h.cbdDepth, 1); }
    else if (h.hType === "csink") { t += "  ⌵ Ø " + U.fmt(h.cbd, 1) + " × " + U.fmt(h.csAngle, 0) + "°"; }
    return t;
  }

  function exportSVGfile() {
    renderSheet();
    if (!window.__rgzcadLastSVG) { U.note("Nothing to export yet."); return; }
    U.download(U.slugName() + "-drawing.svg", window.__rgzcadLastSVG, "image/svg+xml");
    U.note("Drawing SVG exported.");
  }
  function exportPNG() {
    renderSheet();
    var svg = window.__rgzcadLastSVG;
    if (!svg) { U.note("Nothing to export yet."); return; }
    var img = new Image();
    var blob = new Blob([svg], { type: "image/svg+xml" });
    var url = URL.createObjectURL(blob);
    img.onload = function () {
      try {
        var cv2 = document.createElement("canvas");
        cv2.width = 2246; cv2.height = 1588;
        var cx3 = cv2.getContext("2d");
        cx3.fillStyle = "#fff"; cx3.fillRect(0, 0, cv2.width, cv2.height);
        cx3.drawImage(img, 0, 0, cv2.width, cv2.height);
        URL.revokeObjectURL(url);
        cv2.toBlob(function (b) {
          if (b) { U.download(U.slugName() + "-drawing.png", b); U.note("Drawing PNG exported (2× resolution)."); }
        }, "image/png");
      } catch (e) { URL.revokeObjectURL(url); U.note("PNG export failed in this browser — use the SVG export, it is lossless."); }
    };
    img.src = url;
  }

  /* ============================================================
     GUIDED TOUR
     ============================================================ */
  var tour = { el: null, i: -1, steps: [] };
  function tourSteps() {
    return [
      { sel: "[data-planehint]", t: "Start: pick a datum plane", p: "The app opens in 3D with an empty tree, like CATIA. Click the XY (flat), XZ or YZ plane — Sketch.1 is added to the tree and the 2D editor opens on it." },
      { sel: "[data-tree]", t: "The specification tree", p: "Everything you make is a node here — sketches and 3D features (pad, pocket, shaft, groove, rib). Click any node to edit it anytime; × deletes it." },
      { sel: "[data-modebar]", t: "Full sketcher tool-set", p: "Line, rectangle, circle, polygon, N-gon, arc, slot, ellipse, spline, point, centerline — plus the Operation tools: corner, chamfer, trim, break, offset and construction toggle. Select is the plain mouse." },
      { sel: "[data-makebar]", t: "All 3D features, always visible", p: "Pad, Pocket, Shaft, Groove and Rib run on the active sketch. If something is missing (e.g. a centreline for a shaft), the app tells you what to draw." },
      { sel: "[data-viewport]", t: "Precise 1 mm grid", p: "Wheel zooms, right-drag pans, Esc returns to Select. Every clicked element gets exact numeric fields (and tolerances) in the right panel." },
      { sel: "[data-dress=draft]", t: "Dress-up in 3D", p: "Select a feature, then chamfer, fillet, draft, shell, pattern or mirror it from the 3D toolbar — every value stays editable on the feature card afterwards." },
      { sel: "[data-opt=measure]", t: "Measure & section", p: "Check distances between two points and slice the part open with the section plane — no install needed." },
      { sel: "[data-newdesign]", t: "New part anytime", p: "The app opens with a fresh empty part. Your last browser session is one click away under Resume, and My designs holds everything you saved." }
    ];
  }
  function tourStart() {
    tourStop();
    tour.steps = tourSteps();
    tour.i = 0;
    var el = document.createElement("div");
    el.className = "rgzcad-tour";
    el.innerHTML = '<div class="spot"></div><div class="card"><h4></h4><p></p><div class="foot"><div class="dots"></div><div class="acts"><button type="button" class="skip">Skip</button><button type="button" class="next">Next →</button></div></div></div>';
    document.body.appendChild(el);
    tour.el = el;
    U.qs(el, ".skip").addEventListener("click", tourStop);
    U.qs(el, ".next").addEventListener("click", function () { tour.i++; if (tour.i >= tour.steps.length) { tourStop(); } else { tourShow(); } });
    tourShow();
  }
  function tourShow() {
    if (!tour.el) { return; }
    var st = tour.steps[tour.i];
    var tgt = document.querySelector(st.sel);
    var spot = U.qs(tour.el, ".spot"), card = U.qs(tour.el, ".card");
    U.qs(tour.el, "h4").textContent = st.t;
    U.qs(tour.el, "p").textContent = st.p;
    var dots = U.qs(tour.el, ".dots");
    dots.innerHTML = tour.steps.map(function (_, i) { return '<i class="' + (i === tour.i ? "on" : "") + '"></i>'; }).join("");
    var r = tgt ? tgt.getBoundingClientRect() : { left: 40, top: 80, width: 300, height: 200 };
    spot.style.left = (r.left - 6) + "px"; spot.style.top = (r.top - 6) + "px";
    spot.style.width = (r.width + 12) + "px"; spot.style.height = (r.height + 12) + "px";
    var cx = Math.min(window.innerWidth - 350, Math.max(10, r.left + 10));
    var cy = Math.min(window.innerHeight - 190, r.bottom + 14);
    if (cy + 170 > window.innerHeight || cy < r.top) { cy = Math.max(10, r.top - 180); }
    card.style.left = cx + "px"; card.style.top = cy + "px";
  }
  function tourStop() { if (tour.el) { tour.el.remove(); tour.el = null; } tour.i = -1; markTourSeen(); }
  function markTourSeen() { try { localStorage.setItem("rgzcad.tour.v3", "1"); } catch (e) {} }

  /* ============================================================
     ACCOUNT MODULE (server: rgz-cad-studio.php)
     ============================================================ */
  var acct = { token: "", user: null, openId: null };
  function api(action, data) {
    data = data || {};
    var fd = new FormData();
    fd.append("action", action);
    Object.keys(data).forEach(function (k) { fd.append(k, data[k]); });
    return fetch(CFG2.ajaxUrl, { method: "POST", body: fd, credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) {
        if (!j) { throw new Error("No answer from the server."); }
        if (!j.success) { var err = new Error((j.data && j.data.message) || "Request failed."); err.auth = !!(j.data && j.data.auth_required); throw err; }
        return j.data;
      });
  }
  function apiAuthed(action, data) {
    data = data || {};
    data.token = acct.token;
    return api(action, data);
  }
  function accountStatusText() {
    if (acct.user) { return "Signed in as " + acct.user.name + " (" + acct.user.email + ")"; }
    return "Not signed in — designs stay in this browser.";
  }
  window.__rgzcadAccountStatus = accountStatusText;

  function refreshChip() {
    var chip = document.querySelector("[data-account-chip]");
    if (!chip) { return; }
    var sub = chip.querySelector("[data-account-sub]");
    if (acct.user) {
      chip.childNodes[0].textContent = "👤 " + acct.user.name + " ";
      if (sub) { sub.textContent = "· My designs"; }
    } else {
      chip.childNodes[0].textContent = "Sign in / Sign up";
      if (sub) { sub.textContent = ""; }
    }
    U.renderPanel();
  }
  function authShow(mode) {
    var root = document.querySelector("[data-rgzcad]");
    var md = U.qs(root, "[data-auth-modal]"), body = U.qs(root, "[data-auth-body]"), err = U.qs(root, "[data-auth-err]");
    err.textContent = "";
    if (acct.user) {
      body.innerHTML = '<div class="rgzcad-signed">Signed in as <b>' + U.esc(acct.user.name) + "</b><br><small>" + U.esc(acct.user.email) + "</small></div>" +
        '<button type="button" class="rgzcad-btn brand block" data-auth-mydesigns>📂 My designs</button>' +
        '<button type="button" class="rgzcad-btn ghost block" data-auth-signout>Sign out</button>';
      U.qs(body, "[data-auth-mydesigns]").addEventListener("click", function () { authHide(); designsShow(); });
      U.qs(body, "[data-auth-signout]").addEventListener("click", function () {
        acct.user = null; acct.token = "";
        try { localStorage.removeItem("rgzcad.token"); } catch (e) {}
        authHide(); refreshChip();
      });
    } else {
      var isReg = mode === "register";
      body.innerHTML =
        '<div class="rgzcad-tabs"><button type="button" class="' + (!isReg ? "on" : "") + '" data-auth-tab="login">Sign in</button>' +
        '<button type="button" class="' + (isReg ? "on" : "") + '" data-auth-tab="register">Create account</button></div>' +
        (isReg ? '<input type="text" data-f-name placeholder="Your name" maxlength="60">' : "") +
        '<input type="email" data-f-email placeholder="Email address" maxlength="120">' +
        '<input type="password" data-f-pass placeholder="Password (min 6 characters)" maxlength="120">' +
        '<button type="button" class="rgzcad-btn brand block" data-auth-go>' + (isReg ? "Create & sign in" : "Sign in") + "</button>";
      U.qsa(body, "[data-auth-tab]").forEach(function (t) { t.addEventListener("click", function () { authShow(t.getAttribute("data-auth-tab")); }); });
      U.qs(body, "[data-auth-go]").addEventListener("click", function () {
        var email = (U.qs(body, "[data-f-email]").value || "").trim();
        var pass = U.qs(body, "[data-f-pass]").value || "";
        var data = isReg ? { name: (U.qs(body, "[data-f-name]").value || "").trim(), email: email, password: pass } : { login: email, password: pass };
        err.textContent = "";
        var btn = U.qs(body, "[data-auth-go]"); btn.disabled = true;
        api(isReg ? "rgz_cad_register" : "rgz_cad_login", data).then(function (d) {
          btn.disabled = false;
          acct.user = d.user; acct.token = d.token || "";
          try { localStorage.setItem("rgzcad.token", acct.token); } catch (e) {}
          authHide(); refreshChip();
          if (acct.openId) { var oid = acct.openId; acct.openId = null; loadServerDesign(oid); }
        }).catch(function (e2) { btn.disabled = false; err.textContent = e2.message; });
      });
    }
    md.hidden = false;
  }
  function authHide() { var md = U.qs(document.querySelector("[data-rgzcad]"), "[data-auth-modal]"); if (md) { md.hidden = true; } }

  function saveAccount() {
    if (!acct.token) { authShow("login"); U.note("Sign in first — then your design is stored on houmanrgz.ir."); return; }
    var payload = JSON.stringify(S.design);
    if (payload.length > 120000) { U.note("Design is too large for account storage (128 KB max)."); return; }
    var data = { nonce: CFG2.nonce, design_name: S.design.name || "Untitled design", design_json: payload };
    if (S.design.serverId) { data.design_id = S.design.serverId; }
    apiAuthed("rgz_cad_save_design", data).then(function (d) {
      S.design.serverId = d.id;
      U.saveDesign();
      U.note("Saved to your account (" + (S.design.name || "design") + " #" + d.id + ").");
    }).catch(function (e) {
      if (e.auth) { authShow("login"); }
      U.note(e.message);
    });
  }

  function designsShow() {
    if (!acct.token) { authShow("login"); return; }
    var root = document.querySelector("[data-rgzcad]");
    var md = U.qs(root, "[data-designs-modal]"), body = U.qs(root, "[data-designs-body]");
    body.innerHTML = '<div class="rgzcad-empty">Loading…</div>';
    md.hidden = false;
    apiAuthed("rgz_cad_my_designs", {}).then(function (d) {
      var rows = (d && d.designs) || [];
      if (!rows.length) { body.innerHTML = '<div class="rgzcad-empty">No saved designs yet — build something, then “Save to my account”.</div>'; return; }
      var h = '<div class="rgzcad-dlist">';
      rows.forEach(function (r) {
        h += '<div class="rgzcad-drow"><div class="meta"><b>' + U.esc(r.design_name) + "</b><small>#" + r.id + " · " + (Math.round(r.file_size / 102.4) / 10) + " KB · " + U.esc(r.created_at) + "</small></div>" +
          '<div class="ops"><button type="button" class="rgzcad-btn mini" data-dopen="' + r.id + '">Open</button>' +
          '<button type="button" class="rgzcad-btn mini danger" data-ddel="' + r.id + '">Delete</button></div></div>';
      });
      body.innerHTML = h + "</div>";
      U.qsa(body, "[data-dopen]").forEach(function (b) { b.addEventListener("click", function () { designsHide(); loadServerDesign(+b.getAttribute("data-dopen")); }); });
      U.qsa(body, "[data-ddel]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!window.confirm("Delete this design on the server?")) { return; }
          apiAuthed("rgz_cad_delete_design", { id: +b.getAttribute("data-ddel") }).then(function () {
            designsShow();
            if (+b.getAttribute("data-ddel") === S.design.serverId) { S.design.serverId = null; U.renderPanel(); }
          });
        });
      });
    }).catch(function (e) { body.innerHTML = '<div class="rgzcad-empty">' + U.esc(e.message) + "</div>"; });
  }
  function designsHide() { var md = U.qs(document.querySelector("[data-rgzcad]"), "[data-designs-modal]"); if (md) { md.hidden = true; } }

  function loadServerDesign(id) {
    if (!acct.token) { acct.openId = id; authShow("login"); U.note("Sign in to open your saved design."); return; }
    apiAuthed("rgz_cad_get_design", { id: id }).then(function (d) {
      var json = d.design && d.design.design_json;
      var obj = JSON.parse(json);
      U.applyLoadedDesign(obj, d.design.id);
      U.note("Loaded “" + (d.design.design_name || "design") + "” from your account.");
    }).catch(function (e) { U.note("Could not open the design: " + e.message); });
  }

  /* deep link: appurl#rgz-open=<id> (from deck profile / My designs) */
  function checkOpenHash() {
    var m = /#rgz-open=(\d+)/.exec(location.hash || "");
    if (m) { loadServerDesign(+m[1]); }
  }

  function accountBoot() {
    try { acct.token = localStorage.getItem("rgzcad.token") || ""; } catch (e) { acct.token = ""; }
    var root = document.querySelector("[data-rgzcad]");
    var chip = U.qs(root, "[data-account-chip]");
    if (chip) { chip.addEventListener("click", function () { authShow("login"); }); }
    U.qsa(root, "[data-auth-close]").forEach(function (b) { b.addEventListener("click", authHide); });
    U.qsa(root, "[data-designs-close]").forEach(function (b) { b.addEventListener("click", designsHide); });
    U.qsa(root, "[data-auth-modal]")
      .forEach(function (m) { m.addEventListener("click", function (e) { if (e.target === m) { authHide(); } }); });
    U.qsa(root, "[data-designs-modal]")
      .forEach(function (m) { m.addEventListener("click", function (e) { if (e.target === m) { designsHide(); } }); });
    if (acct.token) {
      apiAuthed("rgz_cad_me", {}).then(function (d) {
        if (d && d.user) { acct.user = d.user; refreshChip(); }
      }).catch(function () {});
    }
    refreshChip();
  }

  function boot3() {
    window.__rgzcadRenderSheet = renderSheet;
    var root = document.querySelector("[data-rgzcad]");
    if (!root) { return; }
    try { accountBoot(); } catch (eAcc) {}
    try { checkOpenHash(); } catch (eHash) {}
    var gallery = U.qs(root, "[data-start-tour]");
    U.qsa(root, "[data-start-tour]").forEach(function (b) { b.addEventListener("click", tourStart); });
    window.__rgzcadExportSVGfile = exportSVGfile;
    window.__rgzcadExportPNG = exportPNG;
    window.__rgzcadSaveAccount = saveAccount;
    window.__rgzcadOpenDesigns = designsShow;
    var auto = /[?&]rgz_tour=1/.test(location.search);
    try { if (!localStorage.getItem("rgzcad.tour.v3") || auto) { setTimeout(tourStart, 700); } } catch (e) { if (auto) { setTimeout(tourStart, 700); } }
  }

  window.__rgzcad3 = { tourStart: tourStart, renderSheet: renderSheet, featureWires: featureWires, allWires: allWires, hlrView: hlrView, VIEW_DEFS: VIEW_DEFS, wireRunsForView: wireRunsForView };
  window.__rgzcadBoot3 = boot3;
})();

/* boot chain */
(function () {
  function go() {
    try { if (window.__rgzcadBoot1) { window.__rgzcadBoot1(); } } catch (e1) { try { console.error("RGZ CAD boot1", e1); } catch (e1b) {} }
    try { if (window.__rgzcadBoot2) { window.__rgzcadBoot2(); } } catch (e2) { try { console.error("RGZ CAD boot2", e2); } catch (e2b) {} }
    try { if (window.__rgzcadBoot3) { window.__rgzcadBoot3(); } } catch (e3) { try { console.error("RGZ CAD boot3", e3); } catch (e3b) {} }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", go); } else { go(); }
})();
