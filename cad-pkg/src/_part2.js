/* ============================================================
   RGZ 3D CAD Studio — part 2 (v3): 3D stage
   Per-feature meshes with plane bases (sketch-on-face), local
   tessellation mirroring the worker, on-demand rendering,
   face picking, measure, section, STL export, fullscreen.
   ============================================================ */
(function () {
  "use strict";
  var U = window.__rgzcad1;
  var S = U.S;
  var CFG = window.RGZCAD || {};

  var gl = {
    renderer: null, scene: null, cam: null, camPersp: null, camOrtho: null, ortho: false,
    ctl: null, group: null, meshes: {}, ok: false, wrap: null,
    wire: false, shadows: true, showGrid: true, zoomedOnce: false,
    grid: null, ground: null, axes: null, light: null, mat: null
  };
  var stats = { tris: 0, buildMs: 0 };
  window.__rgzcadStats = stats;

  /* ================= tessellation (mirrors the geometry worker) ================= */
  function triPush(P, N, a, b, c, n) {
    P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    N.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
  }
  function tube(P, N, cx, cy, r, z0, z1, seg, inward) {
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      var p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
      var n0 = [Math.cos(a0), Math.sin(a0), 0], n1 = [Math.cos(a1), Math.sin(a1), 0];
      if (inward) { n0 = [-n0[0], -n0[1], 0]; n1 = [-n1[0], -n1[1], 0]; }
      var A = [p0[0], p0[1], z0], B = [p1[0], p1[1], z0], C = [p1[0], p1[1], z1], Dq = [p0[0], p0[1], z1];
      if (inward) { triPush(P, N, A, C, B, n0); triPush(P, N, A, Dq, C, n0); }
      else { triPush(P, N, A, B, C, n0); triPush(P, N, A, C, Dq, n0); }
    }
  }
  function disc(P, N, cx, cy, r, z, up, seg) {
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      var A = [cx, cy, z], B = [cx + r * Math.cos(a0), cy + r * Math.sin(a0), z], C = [cx + r * Math.cos(a1), cy + r * Math.sin(a1), z];
      var n = [0, 0, up ? 1 : -1];
      if (up) { triPush(P, N, A, B, C, n); } else { triPush(P, N, A, C, B, n); }
    }
  }
  function annulus(P, N, cx, cy, R, r, z, seg) {
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      var A = [cx + r * Math.cos(a0), cy + r * Math.sin(a0), z], B = [cx + r * Math.cos(a1), cy + r * Math.sin(a1), z],
          C = [cx + R * Math.cos(a1), cy + R * Math.sin(a1), z], Dq = [cx + R * Math.cos(a0), cy + R * Math.sin(a0), z];
      triPush(P, N, A, B, C, [0, 0, 1]); triPush(P, N, A, C, Dq, [0, 0, 1]);
    }
  }
  function frustum(P, N, cx, cy, R, r, z0, z1, seg) {
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      var A = [cx + R * Math.cos(a0), cy + R * Math.sin(a0), z0], B = [cx + R * Math.cos(a1), cy + R * Math.sin(a1), z0],
          C = [cx + r * Math.cos(a1), cy + r * Math.sin(a1), z1], Dq = [cx + r * Math.cos(a0), cy + r * Math.sin(a0), z1];
      triPush(P, N, A, B, C, [0, 0, 0.42]); triPush(P, N, A, C, Dq, [0, 0, 0.42]);
    }
  }
  function boxCut(P, N, cx, cy, w, h, z0, z1) {
    /* recess shell (walls inward + floor) for a rectangular pocket */
    var x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    var quads = [
      [[x0, y0], [x1, y0], [1, 0, 0]],
      [[x1, y0], [x1, y1], [0, 1, 0]],
      [[x1, y1], [x0, y1], [-1, 0, 0]],
      [[x0, y1], [x0, y0], [0, -1, 0]]
    ];
    quads.forEach(function (q) {
      var A = [q[0][0], q[0][1], z1], B = [q[1][0], q[1][1], z1], C = [q[1][0], q[1][1], z0], Dq = [q[0][0], q[0][1], z0];
      var n = [-q[2][0], -q[2][1], 0];
      triPush(P, N, A, C, B, n); triPush(P, N, A, Dq, C, n);
    });
    triPush(P, N, [x0, y0, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]);
    triPush(P, N, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  }

  /* shell features (blind / cbore / csink) appended under z=L */
  function shellFeatures(P, N, holes, L) {
    var removed = 0, seg = 28;
    holes.forEach(function (h) {
      var cx = +h[0], cy = +h[1], r = +h[2], tI = h[3] | 0;
      var depth = +h[4] || 0, cbD = +h[5] || 0, cbDepth = +h[6] || 0, ang = +h[7] || 90;
      if (tI === 1) {
        depth = Math.min(Math.max(depth, 0.5), Math.max(L - 0.5, 0.6));
        tube(P, N, cx, cy, r, L - depth, L, seg, true);
        disc(P, N, cx, cy, r, L - depth, true, seg);
        removed += Math.PI * r * r * depth;
      } else if (tI === 2) {
        var R = Math.max(cbD / 2, r + 0.2);
        cbDepth = Math.min(Math.max(cbDepth, 0.4), Math.max(L - 0.5, 0.5));
        tube(P, N, cx, cy, R, L - cbDepth, L, seg, true);
        annulus(P, N, cx, cy, R, r, L - cbDepth, seg);
        removed += Math.PI * (R * R - r * r) * cbDepth;
      } else if (tI === 3) {
        var R2 = Math.max(cbD / 2, r + 0.2);
        var hC = Math.min((R2 - r) / Math.tan((ang * Math.PI / 180) / 2), Math.max(L - 0.4, 0.4));
        if (hC > 0.05) { frustum(P, N, cx, cy, R2, r, L, L - hC, seg); }
        removed += Math.max(0, (Math.PI * hC / 3) * (R2 * R2 + R2 * r + r * r) - Math.PI * r * r * hC);
      }
    });
    return removed;
  }

  function payloadAreaLocal(profiles, holes, L) {
    var s = 0;
    U.classifyContours(profiles).forEach(function (it) {
      var pt = it.pts, i;
      s += it.role === "solid" ? 2 * it.area : -2 * it.area;
      for (i = 0; i < pt.length; i++) { var q = pt[(i + 1) % pt.length]; s += Math.hypot(q[0] - pt[i][0], q[1] - pt[i][1]) * L; }
    });
    holes.forEach(function (h) {
      var r = +h[2];
      s += 2 * Math.PI * r * L - 2 * Math.PI * r * r;
    });
    return Math.max(0, s);
  }

  /* analytic volume of a raw payload (mm³) */
  function payloadVol(profiles, holes, cuts, cutDepth, L, edgeOps) {
    function A(pts) { var a = 0; for (var i = 0; i < pts.length; i++) { var q = pts[(i + 1) % pts.length]; a += pts[i][0] * q[1] - q[0] * pts[i][1]; } return a / 2; }
    var itemsV = U.classifyContours(profiles);
    var full = 0;
    itemsV.forEach(function (it) { full += it.role === "solid" ? it.area : -it.area; });
    full -= edgeOpsAreaDelta(edgeOps);
    /* a hole only removes material where there IS material (mesh + featureVol rule) */
    holes = holes.filter(function (h) {
      var ok = false;
      itemsV.forEach(function (it, i2) {
        if (it.role !== "solid" || !U.pointInPoly(it.pts, +h[0], +h[1])) { return; }
        var inV = false;
        itemsV.forEach(function (h3) { if (h3.role === "hole" && h3.parent === i2 && U.pointInPoly(h3.pts, +h[0], +h[1])) { inV = true; } });
        if (!inV) { ok = true; }
      });
      return ok;
    });
    var Athrough = 0;
    holes.forEach(function (h) {
      var r = +h[2], tI = h[3] | 0;
      if (tI !== 1) { Athrough += Math.PI * r * r; }
    });
    var V = (full - Athrough) * L;
    var cutA = 0; cuts.forEach(function (c) { cutA += Math.abs(A(c)); });
    V -= cutA * Math.min(cutDepth, L);
    holes.forEach(function (h) {
      var r = +h[2], tI = h[3] | 0;
      if (tI === 1) { V -= Math.PI * r * r * Math.min(Math.max(+h[4] || 0, 0.5), Math.max(L - 0.5, 0.6)); }
      else if (tI === 2) { var R = Math.max((+h[5] || 0) / 2, r + 0.2), d = Math.min(Math.max(+h[6] || 0, 0.4), Math.max(L - 0.5, 0.5)); V -= Math.PI * (R * R - r * r) * d; }
      else if (tI === 3) { var R2 = Math.max((+h[5] || 0) / 2, r + 0.2), hC = Math.min((R2 - r) / Math.tan(((+h[7] || 90) * Math.PI / 180) / 2), Math.max(L - 0.4, 0.4)); V -= Math.max(0, (Math.PI * Math.max(hC, 0) / 3) * (R2 * R2 + R2 * r + r * r) - Math.PI * r * r * Math.max(hC, 0)); }
    });
    return Math.max(0, V);
  }

  /* local tessellation (no worker needed) — builds layered slab mesh:
     bottom slab 0..(L-cutDepth): profile with through holes
     top slab (L-cutDepth)..L:    profile minus pocket cut contours          */
  /* ---- per-edge corner rounding shared with the geometry worker (identical math) ---- */
  function interiorAngleW(pts, i) {
    var n = pts.length, p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    var a1 = Math.atan2(a[1] - p[1], a[0] - p[0]), a2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    var th = a1 - a2;
    while (th <= 0) { th += 2 * Math.PI; }
    if (U.polyArea(pts) < 0) { th = 2 * Math.PI - th; }
    return th;
  }
  function applyEdgeOpsLocal(items, ops) {
    (ops || []).slice().sort(function (a, b) { return (a.ring - b.ring) || (b.vi - a.vi); }).forEach(function (op) {
      var ring = items[op.ring];
      if (!ring || ring.role !== "solid") { return; }
      var pts = ring.pts, vi = op.vi | 0, n = pts.length;
      if (vi < 0 || vi >= n) { return; }
      var p = pts[vi], a = pts[(vi + n - 1) % n], b = pts[(vi + 1) % n];
      var th = interiorAngleW(pts, vi);
      var convex = th <= Math.PI;
      var phi = convex ? th : 2 * Math.PI - th;
      if (phi >= Math.PI - 1e-6 || phi <= 1e-6) { return; }
      var la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      if (la < 1e-6 || lb < 1e-6) { return; }
      var ua = [(a[0] - p[0]) / la, (a[1] - p[1]) / la], ub = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
      var t = op.style === "fillet" ? op.r / Math.tan(phi / 2) : op.d;
      var tMax = Math.min(la, lb) * 0.5;
      if (t > tMax) { t = tMax; }
      if (t < 1e-4) { return; }
      var T1 = [p[0] + ua[0] * t, p[1] + ua[1] * t], T2 = [p[0] + ub[0] * t, p[1] + ub[1] * t];
      var repl = [T1];
      if (op.style === "fillet") {
        var r = t * Math.tan(phi / 2);
        var bx = ua[0] + ub[0], by = ua[1] + ub[1], bl = Math.hypot(bx, by) || 1;
        bx /= bl; by /= bl;
        if (!convex) { bx = -bx; by = -by; }   /* concave corner: arc center on the other bisector side */
        var distC = r / Math.sin(phi / 2);
        var C = [p[0] + bx * distC, p[1] + by * distC];
        var aa = Math.atan2(T1[1] - C[1], T1[0] - C[0]), ab = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
        var sw = ab - aa;
        while (sw > Math.PI) { sw -= 2 * Math.PI; }
        while (sw < -Math.PI) { sw += 2 * Math.PI; }
        var K = Math.max(3, Math.round(Math.abs(sw) / (Math.PI / 10))), i2;
        for (i2 = 1; i2 < K; i2++) {
          var a3 = aa + sw * i2 / K;
          repl.push([C[0] + r * Math.cos(a3), C[1] + r * Math.sin(a3)]);
        }
      }
      repl.push(T2);
      ring.pts = pts.slice(0, vi).concat(repl, pts.slice(vi + 1));
    });
  }
  /* exact signed area removed by the edge ops of one classified ring set */
  function edgeOpsAreaDelta(ops) {
    var dA = 0;
    (ops || []).forEach(function (op) {
      var th = +op.ang || Math.PI / 2;
      var convex = th <= Math.PI;
      var phi = convex ? th : 2 * Math.PI - th;
      var a = op.style === "fillet"
        ? op.r * op.r / Math.tan(phi / 2) - op.r * op.r / 2 * (Math.PI - phi)
        : 0.5 * op.d * op.d * Math.sin(phi);
      dA += convex ? a : -a;
    });
    return dA;
  }
  function tessellateLocal(payload) {
    var T = window.THREE;
    if (!T) { return null; }
    var profiles = payload.profiles || [], holes = payload.holes || [], cuts = payload.cuts || [];
    var L = +payload.L || 1;
    var cutDepth = Math.min(Math.max(+payload.cutDepth || 0, 0), Math.max(L - 0.3, 0));
    var bevel = payload.bevel || { mode: 0, size: 0 };

    var validContours = 0;
    profiles.forEach(function (c) { if (c && c.length >= 3 && Math.abs(U.polyArea(c)) >= 0.01) { validContours++; } });
    if (!validContours) { return { error: "profile is not a closed area" }; }
    var items = U.classifyContours(profiles);
    applyEdgeOpsLocal(items, payload.edgeOps);
    {
      var solidsN = 0; items.forEach(function (it) { if (it.role === "solid") { solidsN++; } });
      if (!solidsN) { return { error: "profile is not a closed area" }; }
      if (payload.revol && (+payload.revol.angle) > 0) { return tessellateRevolve(items, +payload.revol.angle, +payload.revol.axisX || 0); }
      if ((+payload.shellT || 0) > 0) { return tessellateShell(items, holes, +payload.shellT, L); }
      if ((+payload.draftDeg || 0) > 0) { return tessellateDraft(items, holes, +payload.draftDeg, L); }
    }
    /* ---- hole-contour boolean union (earcut demands disjoint holes; when a
       drilled hole crosses a pocket rim the true face boundary is their union) ---- */
    function segXpt(p0, p1, q0, q1) {
      var d = (p1[0] - p0[0]) * (q1[1] - q0[1]) - (p1[1] - p0[1]) * (q1[0] - q0[0]);
      if (Math.abs(d) < 1e-12) { return null; }
      var t2 = ((q0[0] - p0[0]) * (q1[1] - q0[1]) - (q0[1] - p0[1]) * (q1[0] - q0[0])) / d;
      var u2 = ((q0[0] - p0[0]) * (p1[1] - p0[1]) - (q0[1] - p0[1]) * (p1[0] - p0[0])) / d;
      if (t2 <= 1e-9 || t2 >= 1 - 1e-9 || u2 <= 1e-9 || u2 >= 1 - 1e-9) { return null; }
      return [p0[0] + (p1[0] - p0[0]) * t2, p0[1] + (p1[1] - p0[1]) * t2];
    }
    function polysTouch(a2, b2) {
      var i2, j2;
      for (i2 = 0; i2 < a2.length; i2++) {
        if (U.pointInPoly(b2, a2[i2][0], a2[i2][1])) { return true; }
        for (j2 = 0; j2 < b2.length; j2++) {
          if (Math.hypot(a2[i2][0] - b2[j2][0], a2[i2][1] - b2[j2][1]) < 1e-6) { return true; }
        }
      }
      for (i2 = 0; i2 < b2.length; i2++) { if (U.pointInPoly(a2, b2[i2][0], b2[i2][1])) { return true; } }
      for (i2 = 0; i2 < a2.length; i2++) {
        for (j2 = 0; j2 < b2.length; j2++) {
          if (segXpt(a2[i2], a2[(i2 + 1) % a2.length], b2[j2], b2[(j2 + 1) % b2.length])) { return true; }
        }
      }
      return false;
    }
    function polyUnion2(a2, b2) {   /* outer-boundary chain of a ∪ b (simple polygons) */
      function splitEdges(p, q) {
        var out = [], i2, j2, k3;
        for (i2 = 0; i2 < p.length; i2++) {
          var p0 = p[i2], p1 = p[(i2 + 1) % p.length];
          var dx2 = p1[0] - p0[0], dy2 = p1[1] - p0[1], ln = dx2 * dx2 + dy2 * dy2;
          if (ln < 1e-18) { continue; }
          var pts = [p0];
          for (j2 = 0; j2 < q.length; j2++) {
            var hit = segXpt(p0, p1, q[j2], q[(j2 + 1) % q.length]);
            if (hit) { pts.push(hit); }
            var qv = q[j2], pr = ((qv[0] - p0[0]) * dx2 + (qv[1] - p0[1]) * dy2) / ln; /* graze split */
            if (pr > 1e-9 && pr < 1 - 1e-9 && Math.hypot(p0[0] + dx2 * pr - qv[0], p0[1] + dy2 * pr - qv[1]) < 1e-6) { pts.push([qv[0], qv[1]]); }
          }
          pts.push(p1);
          pts.sort(function (s2, t3) { return ((s2[0] - p0[0]) * dx2 + (s2[1] - p0[1]) * dy2) - ((t3[0] - p0[0]) * dx2 + (t3[1] - p0[1]) * dy2); });
          var dd = [];
          pts.forEach(function (s2) { var l = dd[dd.length - 1]; if (!l || Math.hypot(s2[0] - l[0], s2[1] - l[1]) > 1e-7) { dd.push(s2); } });
          for (k3 = 0; k3 + 1 < dd.length; k3++) {
            var mx = (dd[k3][0] + dd[k3 + 1][0]) / 2, my = (dd[k3][1] + dd[k3 + 1][1]) / 2;
            out.push({ a: dd[k3], b: dd[k3 + 1], in: U.pointInPoly(q, mx, my) });
          }
        }
        return out;
      }
      var ea = splitEdges(a2, b2).filter(function (e2) { return !e2.in; });
      var eb = splitEdges(b2, a2).filter(function (e2) { return !e2.in; });
      if (!ea.length) { return b2; }
      if (!eb.length) { return a2; }
      var edges = ea.concat(eb), start = edges[0], cur = start, loop = [], guard = 0;
      while (guard++ < 4096) {
        loop.push(cur.a);
        var nxt = null, ni2;
        for (ni2 = 0; ni2 < edges.length; ni2++) {
          if (Math.hypot(edges[ni2].a[0] - cur.b[0], edges[ni2].a[1] - cur.b[1]) < 1e-6) { nxt = edges[ni2]; break; }
        }
        if (!nxt || nxt === start) { break; }
        cur = nxt;
      }
      if (loop.length < 3 || Math.abs(U.polyArea(loop)) < 1e-6) { return null; }
      return loop;
    }
    function mergeHolePolys(polys) {
      var groups = polys.slice(), merged = true, guard = 0;
      while (merged && guard++ < 32) {
        merged = false;
        var done = false;
        for (var i2 = 0; i2 < groups.length && !done; i2++) {
          for (var j2 = i2 + 1; j2 < groups.length && !done; j2++) {
            if (polysTouch(groups[i2], groups[j2])) {
              var u2 = polyUnion2(groups[i2], groups[j2]);
              if (u2) { groups.splice(j2, 1); groups[i2] = u2; merged = true; done = true; }
            }
          }
        }
      }
      return groups;
    }
    function buildShape(withCuts) {
      var shapes = [];
      items.forEach(function (it, idx) {
        if (it.role !== "solid") { return; }
        var pts = it.pts.slice();
        if (U.polyArea(pts) < 0) { pts = pts.slice().reverse(); }
        var sh = new T.Shape();
        pts.forEach(function (p, i) { if (i === 0) { sh.moveTo(p[0], p[1]); } else { sh.lineTo(p[0], p[1]); } });
        sh.closePath();
        function insideProfileVoid(x, y) {
          var inV = false;
          items.forEach(function (h2) { if (h2.role === "hole" && h2.parent === idx && U.pointInPoly(h2.pts, x, y)) { inV = true; } });
          return inV;
        }
        /* collect every void of this face; overlapping contours get union-merged
           before extrusion (disjoint input is an earcut requirement) */
        var holePolys = [], smoothHoles = [];
        items.forEach(function (h2) {   /* nested profile voids (e.g. circle sketched inside a rect) */
          if (h2.role !== "hole" || h2.parent !== idx) { return; }
          var vp = h2.pts.slice();
          if (U.polyArea(vp) > 0) { vp = vp.slice().reverse(); }
          holePolys.push(vp);
        });
        holes.forEach(function (h) {
          var r = +h[2], tI = h[3] | 0;
          if (!(r > 0) || tI === 1) { return; }   /* blind cuts are swept in via shellFeatures */
          if (!U.pointInPoly(pts, +h[0], +h[1]) || insideProfileVoid(+h[0], +h[1])) { return; }
          smoothHoles.push(h);
        });
        if (withCuts) {
          cuts.forEach(function (c) {
            var cp = c.slice(), bb = U.bboxOf(cp);
            if (!U.pointInPoly(pts, bb.cx, bb.cy) || insideProfileVoid(bb.cx, bb.cy)) { return; }
            if (U.polyArea(cp) < 0) { cp = cp.slice().reverse(); }
            holePolys.push(cp);
          });
        }
        /* a circle clashing with another contour joins the merge set as a 28-gon;
           disjoint circles keep their smooth arc path (clean tessellation) */
        var circPolys = [];
        smoothHoles.forEach(function (h) {
          var cg = [], clash = false, i2, a2;
          for (i2 = 0; i2 < 28; i2++) { a2 = i2 / 28 * 2 * Math.PI; cg.push([+h[0] + (+h[2]) * Math.cos(a2), +h[1] + (+h[2]) * Math.sin(a2)]); }
          for (i2 = 0; i2 < holePolys.length && !clash; i2++) { if (polysTouch(holePolys[i2], cg)) { clash = true; } }
          for (i2 = 0; i2 < circPolys.length && !clash; i2++) { if (polysTouch(circPolys[i2], cg)) { clash = true; } }
          if (clash) { circPolys.push(cg); return; }
          var hp = new T.Path();
          hp.absarc(+h[0], +h[1], +h[2], 0, Math.PI * 2, true);
          sh.holes.push(hp);
        });
        mergeHolePolys(holePolys.concat(circPolys)).forEach(function (mp2) {
          if (U.polyArea(mp2) > 0) { mp2 = mp2.slice().reverse(); }   /* hole loops run CW */
          var hp2 = new T.Path();
          mp2.forEach(function (p, i) { if (i === 0) { hp2.moveTo(p[0], p[1]); } else { hp2.lineTo(p[0], p[1]); } });
          hp2.closePath();
          sh.holes.push(hp2);
        });
        shapes.push(sh);
      });
      return shapes;
    }

    var P = [], N = [];
    var usedBevel = bevel.mode > 0 && bevel.size > 0 && (L - 2 * bevel.size) >= 0.5 && cutDepth === 0;
    var sz = Math.min(bevel.size || 0, L / 2);

    /* earcut bridges multiple holes with duplicate vertices → degenerate slivers
       that overlap pocket rims (3+ coincident cap faces on one edge); strip cap
       tris that are degenerate or lie inside a pocket cut contour */
    /* hole radius removed from a horizontal cap at level capZ (per hole type):
       through = r everywhere; blind = r only above its floor; cbore/csink widen
       to the recess radius near the top face */
    function holeRAt(h, capZ) {
      var r = +h[2], tI = h[3] | 0;
      if (!(r > 0)) { return 0; }
      if (tI === 1) {
        var dep = Math.min(Math.max(+h[4] || 0, 0.5), Math.max(L - 0.5, 0.6));
        return capZ > L - dep + 0.02 ? r : 0;
      }
      if (tI === 2) {
        var R2 = Math.max((+h[5] || 0) / 2, r + 0.2), d2 = Math.min(Math.max(+h[6] || 0, 0.4), Math.max(L - 0.5, 0.5));
        return capZ > L - d2 + 0.02 ? R2 : r;
      }
      if (tI === 3) {
        var R3 = Math.max((+h[5] || 0) / 2, r + 0.2), hC = Math.min((R3 - r) / Math.tan(((+h[7] || 90) * Math.PI / 180) / 2), Math.max(L - 0.4, 0.4));
        return capZ > L - hC + 0.02 ? R3 : r;
      }
      return r;
    }
    function filterCaps(P2, N2, from, cutPolys) {
      /* read the original arrays once, collect kept tris into fresh arrays,
         then swap back — no in-place read/write overlap */
      var keptP = [], keptN = [], r;
      for (r = from; r < P2.length; r += 9) {
        var drop = false;
        if (Math.abs(N2[r + 2]) > 0.99) {                     /* cap tri only (walls keep) */
          /* strip only tris whose centroid leaves the true face region; keep
             zero-area bridge slivers — deleting them flips real neighbor tris
             into fake 1-face boundary edges (extraneous chords in drawings) */
          drop = !capRegionOk((P2[r] + P2[r + 3] + P2[r + 6]) / 3, (P2[r + 1] + P2[r + 4] + P2[r + 7]) / 3, P2[r + 2], cutPolys);
        }
        if (!drop) { for (var k2 = 0; k2 < 9; k2++) { keptP.push(P2[r + k2]); keptN.push(N2[r + k2]); } }
      }
      P2.length = from; N2.length = from;
      for (var q = 0; q < keptP.length; q++) { P2.push(keptP[q]); N2.push(keptN[q]); }
    }
    /* centroid test: is (x,y) face material at cap level capZ? profile solids
       minus nested voids minus pocket cuts minus every hole's disk at that z */
    function capRegionOk(x, y, capZ, cutPolys) {
      var inS = false, i2;
      items.forEach(function (it, idx2) {
        if (it.role !== "solid" || !U.pointInPoly(it.pts, x, y)) { return; }
        var inV = false;
        items.forEach(function (h2) { if (h2.role === "hole" && h2.parent === idx2 && U.pointInPoly(h2.pts, x, y)) { inV = true; } });
        if (!inV) { inS = true; }
      });
      if (!inS) { return false; }
      if (cutPolys) {
        for (i2 = 0; i2 < cutPolys.length; i2++) { if (U.pointInPoly(cutPolys[i2], x, y)) { return false; } }
      }
      for (i2 = 0; i2 < holes.length; i2++) {
        var re = holeRAt(holes[i2], capZ);
        if (re > 0.02) {
          var dx2 = x - (+holes[i2][0]), dy2 = y - (+holes[i2][1]);
          if (dx2 * dx2 + dy2 * dy2 < (re - 0.01) * (re - 0.01)) { return false; }
        }
      }
      return true;
    }
    try {
      /* bottom slab (full profile incl. through holes) */
      var dBottom = cutDepth > 0 ? L - cutDepth : L;
      if (!usedBevel || cutDepth > 0) {
        var m1 = P.length;
        var g1 = new T.ExtrudeGeometry(buildShape(false), { depth: Math.max(0.5, dBottom), bevelEnabled: false, curveSegments: 24 });
        accum(g1, P, N, 0);
        filterCaps(P, N, m1, null);
      }
      /* top slab */
      if (cutDepth > 0) {
        var m2 = P.length;
        var g2 = new T.ExtrudeGeometry(buildShape(true), { depth: cutDepth, bevelEnabled: false, curveSegments: 24 });
        accum(g2, P, N, L - cutDepth);
        filterCaps(P, N, m2, cuts);
      } else if (usedBevel) {
        var m3 = P.length;
        var g3 = new T.ExtrudeGeometry(buildShape(false), {
          depth: L - 2 * sz, bevelEnabled: true, bevelThickness: sz, bevelSize: sz,
          bevelSegments: bevel.mode === 2 ? 3 : 2, curveSegments: 24
        });
        accum(g3, P, N, 0);
        filterCaps(P, N, m3, null);
      }
    } catch (e) { return { error: "extrude failed: " + e.message }; }

    var removed = shellFeatures(P, N, holes, L);
    return {
      positions: new Float32Array(P), normals: new Float32Array(N),
      tris: (P.length / 9) | 0,
      vol: payloadVol(profiles, holes, cuts, cutDepth, L, payload.edgeOps) / 1000,
      area: payloadAreaLocal(profiles, holes, L) / 100,
      removed: removed
    };
  }

  /* ---- local mirror of the worker's CATIA tessellators (parity) ---- */
  function localErr(msg) { return { positions: new Float32Array(0), normals: new Float32Array(0), tris: 0, vol: 0, area: 0, removed: 0, error: msg }; }
function localPer(pts) {
  var s = 0, i, q;
  for (i = 0; i < pts.length; i++) { q = pts[(i + 1) % pts.length]; s += Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]); }
  return s;
}
function pushTri(P, N, a, b, c, hx, hy, hz) {
  var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  var l = Math.hypot(nx, ny, nz);
  if (l < 1e-12) { return 0; }
  nx /= l; ny /= l; nz /= l;
  if (nx * hx + ny * hy + nz * hz < 0) { var t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
  P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (var i = 0; i < 3; i++) { N.push(nx, ny, nz); }
  return 1;
}
function pushQuad(P, N, a, b, c, d, hx, hy, hz) {
  var t = pushTri(P, N, a, b, c, hx, hy, hz);
  t += pushTri(P, N, a, c, d, hx, hy, hz);
  return t;
}
/* shapes for the classified items at an applied ring transform */
function shapesFromItems(items, mapFn) {
  var T = window.THREE;
  var shapes = [];
  items.forEach(function (it, idx) {
    if (it.role !== "solid") { return; }
    var rp = (mapFn ? mapFn(it.pts) : it.pts).slice();
    if (Math.abs(U.polyArea(rp)) < 0.01) { return; }
    if (U.polyArea(rp) < 0) { rp = rp.slice().reverse(); }
    var sh = new T.Shape();
    rp.forEach(function (q, i) { if (i === 0) { sh.moveTo(q[0], q[1]); } else { sh.lineTo(q[0], q[1]); } });
    sh.closePath();
    items.forEach(function (h2) {
      if (h2.role !== "hole" || h2.parent !== idx) { return; }
      var vp = (mapFn ? mapFn(h2.pts) : h2.pts).slice();
      if (U.polyArea(vp) > 0) { vp = vp.slice().reverse(); }
      var hp = new T.Path();
      vp.forEach(function (q, i) { if (i === 0) { hp.moveTo(q[0], q[1]); } else { hp.lineTo(q[0], q[1]); } });
      hp.closePath();
      sh.holes.push(hp);
    });
    shapes.push(sh);
  });
  return shapes;
}
function capsFromShapes(shapes, placeFn, P, N, hx, hy, hz) {
  var T = window.THREE;
  var t = 0;
  shapes.forEach(function (sh) {
    var g = new T.ShapeGeometry(sh, 6);
    var g2 = g.index ? g.toNonIndexed() : g;
    var arr = g2.getAttribute("position").array;
    for (var i = 0; i + 8 < arr.length; i += 9) {
      var a = placeFn(arr[i], arr[i + 1]), b = placeFn(arr[i + 3], arr[i + 4]), c = placeFn(arr[i + 6], arr[i + 7]);
      t += pushTri(P, N, a, b, c, hx, hy, hz);
    }
    g.dispose(); if (g2.dispose) { g2.dispose(); }
  });
  return t;
}

function ringProbe(pts) {
  var a = pts[0], b = pts[1], c = pts[2];
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
}
function tessellateRevolve(items, angleDeg, ax) {
  var T = window.THREE;
  var P = [], N = [];
  var ang = Math.min(Math.max(angleDeg || 360, 1), 360) * Math.PI / 180;
  var full = Math.abs(ang - 2 * Math.PI) < 1e-9;
  var bad = items.some(function (it) {
    var s = 0;
    for (var i = 0; i < it.pts.length; i++) {
      var d = it.pts[i][0] - ax;
      if (Math.abs(d) < 1e-7) { continue; }
      var sg = d > 0 ? 1 : -1;
      if (s === 0) { s = sg; } else if (sg !== s) { return true; }
    }
    return false;
  });
  if (bad) { return localErr("revolve: every profile must stay on one side of the axis (draw a vertical centreline as the axis)"); }
  var seg = Math.max(12, Math.round(96 * ang / (2 * Math.PI)));
  var holeFlip = 0;
  items.forEach(function (it) {
    var pts = it.pts, n = pts.length, flip = it.role === "hole" ? -1 : 1;
    for (var i = 0; i < n; i++) {
      var p1 = pts[i], p2 = pts[(i + 1) % n];
      var r1 = p1[0] - ax, r2 = p2[0] - ax;
      var n2x = (p2[1] - p1[1]) * flip, n2y = -(p2[0] - p1[0]) * flip;  /* outward hint in the (r,y) half-plane */
      for (var j = 0; j < seg; j++) {
        var f0 = j / seg * ang, f1 = (j + 1) / seg * ang, fm = (f0 + f1) / 2;
        var cm = Math.cos(fm), sm = Math.sin(fm);
        var a = [ax + r1 * Math.cos(f0), p1[1], r1 * Math.sin(f0)];
        var b = [ax + r2 * Math.cos(f0), p2[1], r2 * Math.sin(f0)];
        var c = [ax + r2 * Math.cos(f1), p2[1], r2 * Math.sin(f1)];
        var d = [ax + r1 * Math.cos(f1), p1[1], r1 * Math.sin(f1)];
        holeFlip += pushQuad(P, N, a, b, c, d, n2x * cm, n2y, n2x * sm);
      }
    }
  });
  if (!full) {   /* partial revolution: cap the two sweep ends */
    var shapes = shapesFromItems(items, null);
    var any = items.filter(function (it) { return it.role === "solid"; })[0];
    var sAny = any && (U.ringCentroid(any.pts)[0] - ax) >= 0 ? 1 : -1;
    holeFlip += capsFromShapes(shapes, function (x, y) { return [ax + (x - ax) * Math.cos(0), y, (x - ax) * Math.sin(0)]; }, P, N, sAny * Math.sin(0), 0, -sAny * Math.cos(0));
    holeFlip += capsFromShapes(shapes, function (x, y) { return [ax + (x - ax) * Math.cos(ang), y, (x - ax) * Math.sin(ang)]; }, P, N, -sAny * Math.sin(ang), 0, sAny * Math.cos(ang));
  }
  var vol = 0, area = 0;
  items.forEach(function (it) {
    var c = U.ringCentroid(it.pts), sgn = it.role === "solid" ? 1 : -1;
    var dC = Math.abs(c[0] - ax);
    vol += sgn * it.area * 2 * Math.PI * dC * (ang / (2 * Math.PI));
    for (var i = 0; i < it.pts.length; i++) {
      var q = it.pts[(i + 1) % it.pts.length];
      var len = Math.hypot(q[0] - it.pts[i][0], q[1] - it.pts[i][1]);
      var de = Math.abs((it.pts[i][0] + q[0]) / 2 - ax);
      area += len * 2 * Math.PI * de * (ang / (2 * Math.PI));
    }
  });
  if (!full) { var capA = 0; items.forEach(function (it) { capA += it.role === "solid" ? it.area : -it.area; }); area += 2 * Math.max(0, capA); }
  return {
    positions: new Float32Array(P), normals: new Float32Array(N),
    tris: (P.length / 9) | 0,
    vol: Math.max(0, vol) / 1000, area: Math.max(0, area) / 100, removed: 0
  };
}

/* ---- Draft angle: walls lean inward with height (pads only) ---- */
function tessellateDraft(items, holes, deg, L) {
  var T = window.THREE;
  if (!(deg > 0.01)) { return localErr("draft: angle must be positive"); }
  if (deg > 30) { return localErr("draft: keep the angle at 30° or less for a prismatic part"); }
  var tan = Math.tan(deg * Math.PI / 180);
  var shrinkL = L * tan;
  var okTop = items.some(function (it) {
    if (it.role !== "solid") { return false; }
    var r1 = U.offsetRing(it.pts, shrinkL);
    var a0 = U.polyArea(it.pts), a1 = U.polyArea(r1);
    if (a0 * a1 <= 0) { return false; }
    if (Math.abs(a1) >= 0.995 * Math.abs(a0)) { return false; }      /* must really shrink */
    if (Math.abs(a1) < 0.01 * Math.abs(a0)) { return false; }        /* must not vanish */
    var pr = ringProbe(r1);
    return U.pointInPoly(it.pts, pr[0], pr[1]);
  });
  if (!okTop) { return localErr("draft: angle too steep for this length (top profile would vanish)"); }
  var P = [], N = [];
  var ns = Math.min(24, Math.max(2, Math.ceil(L / 4)));
  items.forEach(function (it) {
    var n = it.pts.length, flip = it.role === "hole" ? -1 : 1;
    var ring0 = it.pts.map(function (p) { return p.slice(); });
    for (var j = 1; j <= ns; j++) {
      var z0 = (j - 1) / ns * L, z1 = j / ns * L;
      var ring1 = U.offsetRing(it.pts, z1 * tan);
      for (var i = 0; i < n; i++) {
        var i2 = (i + 1) % n;
        var p1 = ring0[i], p2 = ring0[i2];
        var n2x = (p2[1] - p1[1]) * flip, n2y = -(p2[0] - p1[0]) * flip;
        var a = [p1[0], p1[1], z0], b = [p2[0], p2[1], z0];
        var c = [ring1[i2][0], ring1[i2][1], z1], d = [ring1[i][0], ring1[i][1], z1];
        pushQuad(P, N, a, b, c, d, n2x, n2y, 0);
      }
      ring0 = ring1;
    }
  });
  var t1 = capsFromShapes(shapesFromItems(items, null), function (x, y) { return [x, y, 0]; }, P, N, 0, 0, -1);
  var t2 = capsFromShapes(shapesFromItems(items, function (pts) { return U.offsetRing(pts, shrinkL); }), function (x, y) { return [x, y, L]; }, P, N, 0, 0, 1);
  /* drills ignored with draft (panel note), volume: Simpson on the signed area law */
  function signedA(z) {
    var s = 0;
    items.forEach(function (it) { s += (it.role === "solid" ? 1 : -1) * Math.abs(U.polyArea(U.offsetRing(it.pts, z * tan))); });
    return s;
  }
  var vol = L / 6 * (signedA(0) + 4 * signedA(L / 2) + signedA(L));
  var area = signedA(0) + signedA(L);
  items.forEach(function (it) { area += localPer(U.offsetRing(it.pts, shrinkL / 2)) * (L / Math.cos(deg * Math.PI / 180)); });
  return {
    positions: new Float32Array(P), normals: new Float32Array(N),
    tris: (P.length / 9) | 0,
    vol: Math.max(0, vol) / 1000, area: Math.max(0, area) / 100, removed: 0
  };
}

/* ---- Shell: hollow the solid, walls t, opening on the top face ---- */
function tessellateShell(items, holes, t, L) {
  var T = window.THREE;
  if (!(t > 0)) { return localErr("shell: thickness must be positive"); }
  if (t >= L - 0.2) { return localErr("shell: keep the thickness below the feature length"); }
  var P = [], N = [];
  function accumGeom(shapes, z0, depth) {
    var g = new T.ExtrudeGeometry(shapes, { depth: Math.max(0.2, depth), bevelEnabled: false, curveSegments: 24 });
    var g2 = g.index ? g.toNonIndexed() : g;
    var arr = g2.getAttribute("position").array, nr = g2.getAttribute("normal").array, i;
    for (i = 0; i < arr.length; i += 3) {
      P.push(arr[i], arr[i + 1], arr[i + 2] + z0);
      N.push(nr[i], nr[i + 1], nr[i + 2]);
    }
    g.dispose(); if (g2 !== g && g2.dispose) { g2.dispose(); }
  }
  function drillPaths(pts, innerR) {
    var paths = [];
    (holes || []).forEach(function (h) {
      var r = +h[2], tI = h[3] | 0;
      if (!(r > 0) || tI === 1) { return; }
      if (!U.pointInPoly(pts, +h[0], +h[1])) { return; }
      if (innerR && U.pointInPoly(innerR, +h[0], +h[1])) { return; }
      var hp = new T.Path();
      hp.absarc(+h[0], +h[1], r, 0, Math.PI * 2, true);
      paths.push(hp);
    });
    return paths;
  }
  var vol = 0, area = 0, err = null;
  items.forEach(function (it, idx) {
    if (it.role !== "solid") { return; }
    var inner = U.offsetRing(it.pts, t);
    var aBase = U.polyArea(it.pts), aIn = U.polyArea(inner);
    var pr = ringProbe(inner);
    if (aBase * aIn <= 0 || Math.abs(aIn) >= 0.995 * Math.abs(aBase) || Math.abs(aIn) < 0.05 * it.area || !U.pointInPoly(it.pts, pr[0], pr[1])) { err = "shell: thickness too large for profile " + (idx + 1); return; }
    function shapeWith(innerAsHole) {
      var rp = it.pts.slice();
      if (U.polyArea(rp) < 0) { rp = rp.slice().reverse(); }
      var sh = new T.Shape();
      rp.forEach(function (q, i) { if (i === 0) { sh.moveTo(q[0], q[1]); } else { sh.lineTo(q[0], q[1]); } });
      sh.closePath();
      items.forEach(function (h2) {
        if (h2.role !== "hole" || h2.parent !== idx) { return; }
        var vp = h2.pts.slice();
        if (U.polyArea(vp) > 0) { vp = vp.slice().reverse(); }
        var hp = new T.Path();
        vp.forEach(function (q, i) { if (i === 0) { hp.moveTo(q[0], q[1]); } else { hp.lineTo(q[0], q[1]); } });
        hp.closePath();
        sh.holes.push(hp);
      });
      if (innerAsHole) {
        var ip = inner.slice();
        if (U.polyArea(ip) > 0) { ip = ip.slice().reverse(); }
        var hp2 = new T.Path();
        ip.forEach(function (q, i) { if (i === 0) { hp2.moveTo(q[0], q[1]); } else { hp2.lineTo(q[0], q[1]); } });
        hp2.closePath();
        sh.holes.push(hp2);
        drillPaths(it.pts, inner).forEach(function (p3) { sh.holes.push(p3); });
      } else {
        drillPaths(it.pts, null).forEach(function (p3) { sh.holes.push(p3); });
      }
      return sh;
    }
    accumGeom([shapeWith(false)], 0, t);            /* bottom plate */
    accumGeom([shapeWith(true)], t, L - t);         /* walls */
    var Ai = Math.abs(U.polyArea(inner));
    var voidA = 0;
    items.forEach(function (h2) { if (h2.role === "hole" && h2.parent === idx) { voidA += h2.area; } });
    vol += it.area * t + (it.area - Ai) * (L - t) - voidA * L;
    area += localPer(it.pts) * L + localPer(inner) * (L - t) + 2 * (it.area - Ai);
  });
  if (err) { return localErr(err); }
  (holes || []).forEach(function (h) {
    var r = +h[2], tI = h[3] | 0;
    if (!(r > 0)) { return; }
    if (tI === 1) { vol -= Math.PI * r * r * Math.min(Math.max(+h[4] || 0, 0.5), Math.max(t - 0.2, 0.4)); }
    else { vol -= Math.PI * r * r * L; }
  });
  return {
    positions: new Float32Array(P), normals: new Float32Array(N),
    tris: (P.length / 9) | 0,
    vol: Math.max(0, vol) / 1000, area: Math.max(0, area) / 100, removed: 0
  };
}

  function accum(geom, P, N, zOff) {
    var g2 = geom.index ? geom.toNonIndexed() : geom;
    var pos = g2.getAttribute("position").array, nrm = g2.getAttribute("normal").array, i;
    for (i = 0; i < pos.length; i += 3) {
      P.push(pos[i], pos[i + 1], pos[i + 2] + zOff);
      N.push(nrm[i], nrm[i + 1], nrm[i + 2]);
    }
    geom.dispose();
    if (g2 !== geom && g2.dispose) { g2.dispose(); }
  }

  /* ================= worker glue (off-main-thread when available) ================= */
  var worker = null, workerBusy = false, workerPending = null, workerOk = false;
  function workerBoot() {
    if (worker !== null) { return; }
    try {
      worker = new Worker(CFG.worker);
      workerOk = true;
      worker.onmessage = function (e) {
        workerBusy = false;
        var job = workerPending;
        workerPending = null;
        if (job) { job(e.data); }
      };
      worker.onerror = function () { workerOk = false; };
    } catch (e) { worker = null; workerOk = false; }
  }
  function buildPayloadAsync(payload, done) {
    if (workerOk && worker) {
      if (workerBusy) { done(tessellateLocal(payload)); return; }
      workerBusy = true;
      workerPending = done;
      try {
        worker.postMessage({ id: 1, payload: payload });
      } catch (e) { workerBusy = false; done(tessellateLocal(payload)); }
    } else {
      setTimeout(function () { done(tessellateLocal(payload)); }, 0);
    }
  }

  /* ================= scene ================= */
  function bootGL() {
    var root = document.querySelector("[data-rgzcad]");
    gl.wrap = U.qs(root, "[data-gl]");
    if (!window.THREE) { failGL(); return; }
    var THREE = window.THREE;
    try {
      gl.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (e) { failGL(); return; }

    try {
    gl.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    gl.renderer.outputEncoding = THREE.sRGBEncoding;
    gl.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    gl.renderer.shadowMap.enabled = true;
    gl.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.renderer.shadowMap.autoUpdate = false; /* render on demand = live feel, low load */
    gl.group = new THREE.Group();
    gl.scene = new THREE.Scene();
    gl.scene.background = new THREE.Color(0x0e1526);
    gl.scene.add(gl.group);
    gl.wrap.appendChild(gl.renderer.domElement);

    gl.camPersp = new THREE.PerspectiveCamera(42, 1, 0.5, 8000);
    gl.camOrtho = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.5, 8000);
    gl.cam = gl.camPersp;
    gl.camPersp.up.set(0, 0, 1); gl.camOrtho.up.set(0, 0, 1); /* z-up like real CAD */
    gl.camPersp.position.set(120, -150, 110);

    var hemi = new THREE.HemisphereLight(0xbcd2ff, 0x1b2436, 0.95);
    gl.scene.add(hemi);
    gl.light = new THREE.DirectionalLight(0xffffff, 1.05);
    gl.light.position.set(180, -140, 260);
    gl.light.castShadow = true;
    gl.light.shadow.mapSize.set(2048, 2048);
    gl.light.shadow.bias = -0.0002;
    gl.scene.add(gl.light);
    gl.scene.add(gl.light.target);
    var fill = new THREE.DirectionalLight(0x88aaff, 0.25);
    fill.position.set(-160, 190, 60);
    gl.scene.add(fill);

    gl.grid = new THREE.GridHelper(1000, 100, 0x334155, 0x1e293b);
    gl.grid.rotation.x = Math.PI / 2;
    gl.scene.add(gl.grid);
    gl.axes = new THREE.AxesHelper(40);
    gl.scene.add(gl.axes);

    /* pickable datum planes (app starts in 3D: pick a plane → sketch added to the tree) */
    gl.datums = new THREE.Group();
    gl.datumMeshes = [];
    (function () {
      function mkDatum(kind, rx, ry, colorHex) {
        var geo = new THREE.PlaneGeometry(220, 220);
        var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
        m.rotation.set(rx, ry, 0);
        m.userData.datum = kind;
        var ed = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.55 }));
        ed.rotation.copy(m.rotation);
        m.userData.edge = ed;
        gl.datums.add(m);
        gl.datums.add(ed);
        gl.datumMeshes.push(m);
      }
      mkDatum("xy", 0, 0, 0x60a5fa);              /* blue — flat top view */
      mkDatum("xz", Math.PI / 2, 0, 0x34d399);    /* green — front view (normal -Y) */
      mkDatum("yz", 0, Math.PI / 2, 0xeb6a4c);    /* red — side view (normal +X) */
      gl.scene.add(gl.datums);
    })();
    gl.datums.visible = false;

    gl.ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.ShadowMaterial({ opacity: 0.35 }));
    gl.ground.receiveShadow = true;
    gl.scene.add(gl.ground);

    applyMaterial();

    bootControls();
    /* datum-plane picking: click (not drag) on a plane starts its sketch */
    var datumDown = null;
    gl.renderer.domElement.addEventListener("pointerdown", function (e) {
      if (S.step === "plane") { datumDown = [e.clientX, e.clientY]; return; }
      if (meas.on) { measPick(e); } else if (S.armed3d && S.armed3d.kind) { if (e.button === 0) { edgePickClick(e); } } else if (S.armed3d) { facePick(e); } else if (e.button === 0) { pickFeature(e); }
    });
    gl.renderer.domElement.addEventListener("pointerup", function (e) {
      if (S.step === "plane" && datumDown) {
        var dx = e.clientX - datumDown[0], dy = e.clientY - datumDown[1];
        datumDown = null;
        if (dx * dx + dy * dy < 25) { datumPick(e); }
      }
    });
    gl.renderer.domElement.addEventListener("pointermove", datumHover);

    U.qsa(root, "[data-view]").forEach(function (b) { b.addEventListener("click", function () { setView(b.getAttribute("data-view")); }); });
    U.qsa(root, "[data-opt]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-opt");
        if (k === "wire") { gl.wire = !gl.wire; gl.mat.wireframe = gl.wire; b.classList.toggle("on", gl.wire); }
        if (k === "shadows") { gl.shadows = !gl.shadows; gl.renderer.shadowMap.enabled = gl.shadows; gl.light.castShadow = gl.shadows; b.classList.toggle("on", gl.shadows); dirtyShadow(); }
        if (k === "grid") { gl.showGrid = !gl.showGrid; gl.grid.visible = gl.showGrid; gl.axes.visible = gl.showGrid; b.classList.toggle("on", gl.showGrid); }
        if (k === "ortho") { gl.ortho = !gl.ortho; gl.cam = gl.ortho ? gl.camOrtho : gl.camPersp; b.classList.toggle("on", gl.ortho); ctlApply(); }
        if (k === "section") { toggleSection(b); }
        if (k === "measure") { toggleMeasure(b); }
      });
    });
    U.qsa(root, "[data-tool3d]").forEach(function (b) {
      b.addEventListener("click", function () { U.armFacePick(b.getAttribute("data-tool3d") === "facesketch" ? "facesketch" : "holeface"); });
    });
    var bf = U.qs(root, "[data-fit]");
    if (bf) { bf.addEventListener("click", fitCam); }
    document.addEventListener("keydown", function (e) {
      if (S.step !== "model") { return; }
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) { return; }
      if (e.key === "f" || e.key === "F") { fitCam(); }
    });

    gl.ok = true;
    workerBoot();
    resizeGL();
    buildModel(true);
    requestRender();
    } catch (eBoot) { failGL(); return; }
  }
  function failGL() {
    var root = document.querySelector("[data-rgzcad]");
    var fail = U.qs(root, "[data-webgl-fail]");
    if (fail) { fail.hidden = false; }
    U.qsa(root, "[data-gl-retry]").forEach(function (b) { b.addEventListener("click", function () { location.reload(); }); });
  }
  function applyMaterial() {
    var T = window.THREE;
    if (!T) { return; }
    var m = U.matOf();
    if (gl.mat) { gl.mat.color.setHex(m.color); gl.mat.metalness = m.metal; gl.mat.roughness = m.rough; }
    else { gl.mat = new T.MeshStandardMaterial({ color: m.color, metalness: m.metal, roughness: m.rough, side: T.DoubleSide }); }
    gl.matSel = gl.matSel || new T.MeshStandardMaterial({ color: 0xff7a5c, metalness: 0.4, roughness: 0.5, side: T.DoubleSide, emissive: 0x421008 });
    requestRender();
  }

  /* ---------- orbit controls (custom, z-up, on-demand render) ---------- */
  var ctl = { az: -0.7, el: 0.62, dist: 260, tx: 30, ty: 20, tz: 20 };
  function bootControls() {
    var cv = gl.renderer.domElement, drag = null;
    cv.style.touchAction = "none";
    cv.addEventListener("pointerdown", function (e) {
      if (meas.on || S.armed3d) { return; }
      drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey, az: ctl.az, el: ctl.el, tx: ctl.tx, ty: ctl.ty };
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drag) { if (S.armed3d && S.armed3d.kind) { edgePickHover(e); } else { hoverFace(e); } return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.pan) {
        var k = ctl.dist / 500;
        var fwd = [Math.cos(ctl.az), Math.sin(ctl.az), 0];
        ctl.tx = drag.tx + (-dx * -fwd[1] - dy * fwd[0]) * k;
        ctl.ty = drag.ty + (dx * fwd[0] * -1 - dy * fwd[1] * -1) * -k;
      } else {
        ctl.az = drag.az - dx * 0.005;
        ctl.el = Math.min(1.5, Math.max(-1.5, drag.el + dy * 0.005));
      }
      ctlApply();
    });
    cv.addEventListener("pointerup", function () { drag = null; });
    cv.addEventListener("pointercancel", function () { drag = null; });
    cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    cv.addEventListener("wheel", function (e) {
      e.preventDefault();
      ctl.dist = Math.min(3000, Math.max(20, ctl.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
      ctlApply();
    }, { passive: false });
  }
  function ctlApply() {
    if (!window.THREE || !gl.cam) { return; }
    var z = Math.sin(ctl.el) * ctl.dist, r = Math.cos(ctl.el) * ctl.dist;
    var x = ctl.tx + r * Math.cos(ctl.az), y = ctl.ty + r * Math.sin(ctl.az);
    gl.camPersp.position.set(x, y, ctl.tz + z);
    gl.camPersp.lookAt(ctl.tx, ctl.ty, ctl.tz);
    if (gl.ortho) {
      var a = Math.max(10, ctl.dist * 0.6);
      gl.camOrtho.left = -a * gl.aspect; gl.camOrtho.right = a * gl.aspect;
      gl.camOrtho.top = a; gl.camOrtho.bottom = -a;
      gl.camOrtho.position.set(x, y, ctl.tz + z);
      gl.camOrtho.lookAt(ctl.tx, ctl.ty, ctl.tz);
      gl.camOrtho.updateProjectionMatrix();
    }
    requestRender();
  }
  function fitCam() {
    var bb = partBBox();
    var mdx = Math.max(bb.x1 - bb.x0, 10), mdy = Math.max(bb.y1 - bb.y0, 10), mdz = Math.max(bb.z1 - bb.z0, 10);
    var m = Math.max(mdx, mdy, mdz);
    ctl.tx = (bb.x0 + bb.x1) / 2; ctl.ty = (bb.y0 + bb.y1) / 2; ctl.tz = (bb.z0 + bb.z1) / 2;
    ctl.dist = m * 2.1 + 40;
    if (!gl.zoomedOnce) { gl.zoomedOnce = true; }
    ctlApply();
  }
  function fitCamSoon() { setTimeout(function () { if (!gl.zoomedOnce) { fitCam(); } }, 60); }
  function setView(v) {
    var root = document.querySelector("[data-rgzcad]");
    U.qsa(root, "[data-view]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-view") === v); });
    if (v === "front") { ctl.az = Math.PI * 1.5; ctl.el = 0.02; }
    else if (v === "top") { ctl.az = -Math.PI / 2; ctl.el = 1.45; }
    else if (v === "right") { ctl.az = 0; ctl.el = 0.02; }
    else { ctl.az = -0.7; ctl.el = 0.62; }
    fitCam();
  }
  function partBBox() {
    var bb = { x0: 0, y0: 0, z0: 0, x1: 60, y1: 40, z1: 20 };
    var any = false;
    S.design.features.forEach(function (f) {
      var sk = U.sketchById(f.sketchId);
      if (!sk) { return; }
      var prof = U.profilesOf(sk);
      if (!prof.length) { return; }
      var all = [];
      prof.forEach(function (p) { p.pts.forEach(function (q) { all.push(U.worldOf(sk.plane, q[0], q[1])); }); });
      var tip = U.featureTip(f);
      all.push(tip);
      all.forEach(function (w) {
        if (!any) { bb = { x0: w[0], y0: w[1], z0: w[2], x1: w[0], y1: w[1], z1: w[2] }; any = true; }
        bb.x0 = Math.min(bb.x0, w[0]); bb.y0 = Math.min(bb.y0, w[1]); bb.z0 = Math.min(bb.z0, w[2]);
        bb.x1 = Math.max(bb.x1, w[0]); bb.y1 = Math.max(bb.y1, w[1]); bb.z1 = Math.max(bb.z1, w[2]);
      });
    });
    return bb;
  }

  /* ---------- feature payloads ---------- */
  function holeRows(sk) {
    return U.holesOf(sk).map(function (h) {
      var tI = { through: 0, blind: 1, cbore: 2, csink: 3 }[h.hType] || 0;
      return [h.cx, h.cy, h.r, tI, h.depth, h.cbd, h.cbdDepth, h.csAngle];
    });
  }
  function payloadForFeature(f) {
    var sk = U.sketchById(f.sketchId);
    if (!sk) { return null; }
    /* rib: worker-side nothing new — the open polyline's offset ring is its profile */
    if (f.type === "rib") {
      var ring = U.ribRingOf(f);
      if (!ring || ring.length < 3 || Math.abs(U.polyArea(ring)) < 0.01) { return null; }
      return { profiles: [ring], holes: [], cuts: [], cutDepth: 0, L: f.L, bevel: { mode: 0, size: 0 } };
    }
    var prof = U.profilesOf(sk);
    if (!prof.length) { return null; }
    var profiles = prof.map(function (p) { return p.pts; });
    /* shaft / groove: revolve about the sketch's vertical centreline */
    if (f.type === "shaft" || f.type === "groove") {
      return { profiles: profiles, holes: [], cuts: [], cutDepth: 0, L: 1, bevel: { mode: 0, size: 0 }, revol: { angle: +f.angle || 360, axisX: +f.axisX || 0 } };
    }
    var padDraft = f.type === "pad" && +f.draftDeg > 0;
    var padShell = f.type === "pad" && !padDraft && +f.shellT > 0;
    if (padDraft) { return { profiles: profiles, holes: [], cuts: [], cutDepth: 0, L: f.L, bevel: { mode: 0, size: 0 }, draftDeg: +f.draftDeg }; }
    var holes = holeRows(sk);
    if (padShell) { return { profiles: profiles, holes: holes, cuts: [], cutDepth: 0, L: f.L, bevel: { mode: 0, size: 0 }, shellT: +f.shellT }; }
    var cuts = [], cutDepth = 0;
    if (f.type === "pad") {
      /* pockets sitting on this pad's top/bottom face carve into it */
      S.design.features.forEach(function (g) {
        if (g.type !== "pocket") { return; }
        var gsk = U.sketchById(g.sketchId);
        if (!gsk || gsk.host !== f.id) { return; }
        if (!planeParallelsTop(gsk.plane)) { return; }
        U.profilesOf(gsk).forEach(function (p) {
          cuts.push(p.pts);
        });
        cutDepth = Math.max(cutDepth, Math.min(g.L, Math.max(f.L - 0.3, 0.2)));
      });
    }
    /* pocket hosted on a pad's horizontal face is carved into that pad's slabs
       (see the pad branch above) — emitting its own recess shell on top would
       duplicate the same walls/floor (z-fighting in 3D, and the drawing HLR
       drops >2-face coincident edges, which would erase the pocket rim) */
    if (f.type === "pocket") {
      var hostPad = null;
      S.design.features.forEach(function (g) {
        if (g.id === sk.host && g.type === "pad") { hostPad = g; }
      });
      if (hostPad && planeParallelsTop(sk.plane)) { return null; }
      /* pocket on a non-horizontal face: it renders as a recess shell itself */
      return { shellOnly: true, profiles: profiles, L: f.L };
    }
    var mode = f.edge && f.edge.style === "chamfer" ? 1 : (f.edge && f.edge.style === "fillet" ? 2 : 0);
    var eo = (f.edgeOps || []).map(function (o2) {
      return { style: o2.style === "chamfer" ? "chamfer" : "fillet", ring: o2.ring | 0, vi: o2.vi | 0, r: +o2.r || 3, d: +o2.d || 2, ang: +o2.ang || Math.PI / 2 };
    });
    return { profiles: profiles, holes: holes, cuts: cuts, cutDepth: cutDepth, L: f.L, bevel: { mode: mode, size: f.edge ? f.edge.size : 0 }, edgeOps: eo };
  }
  function planeParallelsTop(pl) { return Math.abs(pl.n[2]) > 0.95; }

  /* transform a local (sketch-space) point [x,y,z] by the sketch plane */
  function planeMatrix(pl) {
    var T = window.THREE;
    var m = new T.Matrix4();
    var n = pl.n, u = pl.u, v = pl.v;
    m.makeBasis(new T.Vector3(u[0], u[1], u[2]), new T.Vector3(v[0], v[1], v[2]), new T.Vector3(n[0], n[1], n[2]));
    m.setPosition(new T.Vector3(pl.origin[0], pl.origin[1], pl.origin[2]));
    return m;
  }

  /* ---------- model building ---------- */
  var building = false, queued = false, geoCache = {};
  function sig(o) { return JSON.stringify(o); }
  function buildModel(immediate) {
    if (!gl.ok) { return; }
    if (building && !immediate) { queued = true; return; }
    building = true;
    var t0 = performance.now();
    var jobs = [];
    S.design.features.forEach(function (f) {
      var payload = payloadForFeature(f);
      if (!payload) { return; }
      jobs.push({ f: f, payload: payload });
    });
    var results = {}, pending = jobs.length;
    if (!pending) { finishAll(results); return; }
    jobs.forEach(function (job) {
      if (job.payload.shellOnly) {
        results[job.f.id] = buildShellMesh(job.payload, job.f);
        maybeDone();
        return;
      }
      var key = sig(job.payload);
      if (geoCache[job.f.id] && geoCache[job.f.id].key === key) {
        results[job.f.id] = geoCache[job.f.id].res;
        maybeDone();
        return;
      }
      buildPayloadAsync(job.payload, function (res) {
        if (res && !res.error && res.positions) {
          geoCache[job.f.id] = { key: key, res: res };
          results[job.f.id] = res;
        }
        maybeDone();
      });
    });
    function maybeDone() {
      pending--;
      if (pending <= 0) { finishAll(results); }
    }
    function finishAll(results) {
      building = false;
      if (queued) { queued = false; buildModel(true); return; }
      var keep = {};
      S.design.features.forEach(function (f) { keep[f.id] = true; });
      Object.keys(gl.meshes).forEach(function (id) {
        if (!keep[id]) { removeMesh(id); }
      });
      var tris = 0;
      S.design.features.forEach(function (f) {
        var res = results[f.id];
        if (!res) { return; }
        var merged = instancedSoup(f, res);
        installMesh(f, merged);
        tris += merged.tris || 0;
      });
      rebuildMirror3d();
      stats.tris = tris;
      stats.buildMs = Math.round(performance.now() - t0);
      if (S.selFeat) { highlightFeature(S.selFeat); }
      if (window.__rgzcad1 && window.__rgzcad1.renderPanel && S.step === "model") {
        /* volumes may have changed */
      }
      if (sec.on) { applySection(); }
      if (S.armed3d && S.armed3d.kind && S.selFeat) { var ef2 = U.featureById(S.selFeat); if (ef2) { edgeHighlightFrom(ef2); } }
      dirtyShadow();
      requestRender();
    }
  }
  function buildShellMesh(payload, f) {
    /* pocket on a non-horizontal plane: recess shell only (visual cut) */
    var P = [], N = [];
    payload.profiles.forEach(function (contour) {
      var bb = U.bboxOf(contour);
      boxCut(P, N, bb.cx, bb.cy, bb.w, bb.h, -payload.L, 0);
    });
    return { positions: new Float32Array(P), normals: new Float32Array(N), tris: (P.length / 9) | 0, vol: 0, shellOnly: true };
  }
  /* ---------- patterns (rect/circular) + part mirror ---------- */
  function appendTransformed(P, N, pos, nor, mx) {
    var T = window.THREE;
    var nm = new T.Matrix3().getNormalMatrix(mx);
    var v = new T.Vector3(), w = new T.Vector3();
    for (var i = 0; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(mx);
      P.push(v.x, v.y, v.z);
      w.set(nor[i], nor[i + 1], nor[i + 2]).applyMatrix3(nm).normalize();
      N.push(w.x, w.y, w.z);
    }
  }
  function patternTransforms(f) {
    var T = window.THREE;
    var p = f.pattern && f.pattern.mode ? f.pattern : { mode: "none" };
    var out = [new T.Matrix4()];
    var i, j, k;
    if (p.mode === "rect") {
      var nx = Math.max(1, Math.min(100, p.nx | 0)), ny = Math.max(1, Math.min(100, p.ny | 0));
      for (i = 0; i < nx; i++) {
        for (j = 0; j < ny; j++) {
          if (!i && !j) { continue; }
          out.push(new T.Matrix4().makeTranslation(i * (+p.dx || 0), j * (+p.dy || 0), 0));
        }
      }
    } else if (p.mode === "circ") {
      var n = Math.max(1, Math.min(200, p.n | 0));
      var ang = (+p.ang || 360) * Math.PI / 180;
      var fullTurn = Math.abs(ang - 2 * Math.PI) < 1e-6;
      var step = n <= 1 ? 0 : (fullTurn ? ang / n : ang / (n - 1));
      for (k = 1; k < n; k++) { out.push(new T.Matrix4().makeRotationZ(k * step)); }
    }
    return out;
  }
  function instancedSoup(f, res) {
    var xforms = patternTransforms(f);
    if (xforms.length === 1 || !res || !res.positions) { return res; }
    var P = [], N = [];
    xforms.forEach(function (mx) { appendTransformed(P, N, res.positions, res.normals, mx); });
    return { positions: new Float32Array(P), normals: new Float32Array(N), tris: (P.length / 9) | 0, vol: res.vol, area: res.area, error: res.error };
  }
  /* whole-part mirror (world space) with corrected winding + normals */
  function rebuildMirror3d() {
    var T = window.THREE;
    if (gl.mirrMesh) { gl.group.remove(gl.mirrMesh); if (gl.mirrMesh.geometry) { gl.mirrMesh.geometry.dispose(); } gl.mirrMesh = null; }
    var mr = S.design && S.design.mirror;
    if (!mr || !mr.on || !T) { return; }
    var sx = mr.plane === "xz" ? 1 : -1, sy = mr.plane === "xz" ? -1 : 1;
    var P = [], N = [];
    S.design.features.forEach(function (f) {
      var mesh = gl.meshes[f.id];
      if (!mesh) { return; }
      mesh.updateMatrix();
      var tmpP = [], tmpN = [];
      appendTransformed(tmpP, tmpN, mesh.geometry.getAttribute("position").array, mesh.geometry.getAttribute("normal").array, mesh.matrix);
      for (var i = 0; i + 8 < tmpP.length; i += 9) {
        [0, 2, 1].forEach(function (kk) {   /* reflection flips chirality → restore outward winding */
          P.push(tmpP[i + 3 * kk] * sx, tmpP[i + 3 * kk + 1] * sy, tmpP[i + 3 * kk + 2]);
          N.push(tmpN[i + 3 * kk] * sx, tmpN[i + 3 * kk + 1] * sy, tmpN[i + 3 * kk + 2]);
        });
      }
    });
    if (!P.length) { return; }
    var geom = new T.BufferGeometry();
    geom.setAttribute("position", new T.BufferAttribute(new Float32Array(P), 3));
    geom.setAttribute("normal", new T.BufferAttribute(new Float32Array(N), 3));
    gl.mirrMesh = new T.Mesh(geom, gl.matGhost || gl.mat);
    gl.mirrMesh.castShadow = true;
    gl.mirrMesh.receiveShadow = true;
    gl.group.add(gl.mirrMesh);
  }
  function installMesh(f, res) {
    var T = window.THREE;
    var sk = U.sketchById(f.sketchId);
    if (!sk) { return; }
    removeMesh(f.id);
    var geom = new T.BufferGeometry();
    geom.setAttribute("position", new T.BufferAttribute(res.positions, 3));
    geom.setAttribute("normal", new T.BufferAttribute(res.normals, 3));
    var mesh = new T.Mesh(geom, f.id === S.selFeat ? gl.matSel : gl.mat);
    var m = planeMatrix(sk.plane);
    mesh.applyMatrix4(m);
    if (f.dir === -1) { mesh.translateZ(-f.L); } /* bottom-face pads grow along −n */
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.featureId = f.id;
    gl.group.add(mesh);
    gl.meshes[f.id] = mesh;
  }
  function removeMesh(id) {
    var mesh = gl.meshes[id];
    if (mesh) {
      gl.group.remove(mesh);
      if (mesh.geometry) { mesh.geometry.dispose(); }
      delete gl.meshes[id];
    }
  }
  function highlightFeature(fid) {
    Object.keys(gl.meshes).forEach(function (id) {
      gl.meshes[id].material = (id === fid) ? gl.matSel : gl.mat;
    });
    requestRender();
  }
  function pickFeature(e) {
    if (S.step !== "model") { return; }
    var hit = raycastAt(e);
    if (hit && hit.object && hit.object.userData.featureId) {
      U.selectFeature(hit.object.userData.featureId);
      highlightFeature(hit.object.userData.featureId);
    } else {
      U.selectFeature(null);
      highlightFeature(null);
    }
  }

  /* ---------- per-edge 3D dress-up picking (Update 17) ---------- */
  var edgeHlGroup = null, edgeHoverObj = null;
  function distSeg3(p, a, b) {
    var vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
    var L2 = vx * vx + vy * vy + vz * vz || 1e-12;
    var t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy + (p[2] - a[2]) * vz) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy), p[2] - (a[2] + t * vz));
  }
  /* all pickable vertical edges of a feature in WORLD coordinates */
  function featureEdgeCandidates(f) {
    var ctx = U.profileEdgesFor ? U.profileEdgesFor(f) : null;
    if (!ctx) { return []; }
    var pl = ctx.sk.plane, dir = f.dir === -1 ? -1 : 1, out = [];
    ctx.edges.forEach(function (ed) {
      var w0 = U.worldOf(pl, ed.p[0], ed.p[1]);
      out.push({
        ring: ed.ring, vi: ed.vi, key: ed.ring + ":" + ed.vi,
        a: w0,
        b: [w0[0] + pl.n[0] * f.L * dir, w0[1] + pl.n[1] * f.L * dir, w0[2] + pl.n[2] * f.L * dir]
      });
    });
    return out;
  }
  function pickFeatureForEdges() {
    return U.featureById(S.selFeat) || (S.design.features.length === 1 ? S.design.features[0] : null);
  }
  function nearestEdgeFor(f, e) {
    var hit = raycastAt(e);
    if (!hit || !hit.point) { return null; }
    var P = [hit.point.x, hit.point.y, hit.point.z];
    var cands = featureEdgeCandidates(f), best = null, bd = 1e18;
    cands.forEach(function (c) {
      var d = distSeg3(P, c.a, c.b);
      if (d < bd) { bd = d; best = c; }
    });
    var tol = Math.max(2.5, f.L * 0.35);
    return (best && bd <= tol) ? best : null;
  }
  function clearEdgeHl() {
    if (edgeHlGroup) {
      gl.scene.remove(edgeHlGroup);
      edgeHlGroup.children.forEach(function (m) { if (m.geometry) { m.geometry.dispose(); } if (m.material) { m.material.dispose(); } });
      edgeHlGroup = null;
    }
    edgeHoverObj = null;
    requestRender();
  }
  function edgeHighlightFrom(f) {
    var T = window.THREE;
    if (!T || !gl.ok) { return; }
    clearEdgeHl();
    if (!f || !(f.edgeSel || []).length) { return; }
    var cands = featureEdgeCandidates(f);
    var grp = new T.Group();
    f.edgeSel.forEach(function (key) {
      var c = null;
      cands.forEach(function (cd) { if (cd.key === key) { c = cd; } });
      if (!c) { return; }
      var g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute([c.a[0], c.a[1], c.a[2], c.b[0], c.b[1], c.b[2]], 3));
      var ln = new T.Line(g, new T.LineBasicMaterial({ color: 0xf5b054 }));
      ln.renderOrder = 5;
      grp.add(ln);
    });
    if (grp.children.length) { edgeHlGroup = grp; gl.scene.add(grp); requestRender(); }
  }
  function edgePickClick(e) {
    var f = pickFeatureForEdges();
    if (!f) { U.note("Select the pad to dress first (click it in the tree or on the model)."); return; }
    if (!U.profileEdgesFor(f)) {
      U.note(f.type === "pad" ? "Remove Shell from " + f.name + " before picking edges." : "Edge picking works on pad features — select a pad. (Pockets/open sketches: 2D Corner/Chamfer in the sketch.)");
      return;
    }
    var c = nearestEdgeFor(f, e);
    if (!c) { return; }   /* treat as orbit click */
    f.edgeSel = f.edgeSel || [];
    var at = f.edgeSel.indexOf(c.key);
    if (at >= 0) { f.edgeSel.splice(at, 1); } else { f.edgeSel.push(c.key); }
    edgeHighlightFrom(f);
    U.upEdgeHint(f);
    U.renderPanel();
    U.note((S.armed3d.kind === "fillet" ? "Fillet" : "Chamfer") + ": " + f.edgeSel.length + " edge(s) marked on " + f.name + " — Apply on the feature card, click more edges, or Esc to finish.");
  }
  function edgePickHover(e) {
    var f = pickFeatureForEdges();
    if (!f || !U.profileEdgesFor(f)) { return; }
    var c = nearestEdgeFor(f, e);
    var T = window.THREE;
    if (!c || !T) {
      if (edgeHoverObj) { gl.scene.remove(edgeHoverObj); edgeHoverObj.geometry.dispose(); edgeHoverObj = null; requestRender(); }
      return;
    }
    if (!edgeHoverObj) {
      var g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(6, 3));
      edgeHoverObj = new T.Line(g, new T.LineBasicMaterial({ color: 0xffffff }));
      edgeHoverObj.renderOrder = 6;
      gl.scene.add(edgeHoverObj);
    }
    var pos = edgeHoverObj.geometry.attributes.position;
    pos.setXYZ(0, c.a[0], c.a[1], c.a[2]);
    pos.setXYZ(1, c.b[0], c.b[1], c.b[2]);
    pos.needsUpdate = true;
    U.note((S.armed3d.kind === "fillet" ? "◜ Fillet" : "◺ Chamfer") + ": click to " + ((f.edgeSel || []).indexOf(c.key) >= 0 ? "unmark" : "mark") + " this vertical edge (edge " + (c.vi + 1) + " of ring " + (c.ring + 1) + ").");
    requestRender();
  }

  /* ---------- datum planes (start state) ---------- */
  var datumHoverMesh = null;
  function raycastDatums(e) {
    var T = window.THREE;
    if (!T || !gl.cam || !gl.datumMeshes || !gl.datumMeshes.length) { return null; }
    if (!rayc) { rayc = new T.Raycaster(); }
    var r = gl.renderer.domElement.getBoundingClientRect();
    if (!r.width) { return null; }
    var nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    var ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    rayc.setFromCamera(new T.Vector2(nx, ny), gl.cam);
    var hits = rayc.intersectObjects(gl.datumMeshes, false);
    return hits.length ? hits[0] : null;
  }
  function datumPick(e) {
    if (S.step !== "plane" || !gl.datums || !gl.datums.visible) { return; }
    var hit = raycastDatums(e);
    if (hit && hit.object.userData.datum && U.startSketchOnDatum) {
      U.startSketchOnDatum(hit.object.userData.datum);
    }
  }
  function datumHover(e) {
    if (!gl.ok || !gl.datums) { return; }
    if (S.step !== "plane" || !gl.datums.visible) {
      if (datumHoverMesh) { datumHoverMesh.material.opacity = 0.06; datumHoverMesh.userData.edge.material.opacity = 0.55; datumHoverMesh = null; requestRender(); }
      return;
    }
    var hit = raycastDatums(e);
    var m = hit ? hit.object : null;
    if (m !== datumHoverMesh) {
      if (datumHoverMesh) { datumHoverMesh.material.opacity = 0.06; datumHoverMesh.userData.edge.material.opacity = 0.55; }
      datumHoverMesh = m;
      if (m) {
        m.material.opacity = 0.22; m.userData.edge.material.opacity = 1;
        if (gl.renderer && gl.renderer.domElement) { gl.renderer.domElement.style.cursor = "pointer"; }
        U.note("Click to start a sketch on the " + ({ xy: "XY (flat)", xz: "XZ (upright)", yz: "YZ (upright)" })[m.userData.datum] + " datum plane.");
      } else if (gl.renderer && gl.renderer.domElement) {
        gl.renderer.domElement.style.cursor = "";
      }
      requestRender();
    }
  }
  function refreshDatums() {
    if (!gl.datums) { return; }
    gl.datums.visible = (S.step === "plane");
    if (datumHoverMesh) { datumHoverMesh.material.opacity = 0.06; datumHoverMesh.userData.edge.material.opacity = 0.55; datumHoverMesh = null; }
    requestRender();
  }

  /* ---------- raycasting ---------- */
  var rayc = null;
  function raycastAt(e) {
    var T = window.THREE;
    if (!T || !gl.cam) { return null; }
    if (!rayc) { rayc = new T.Raycaster(); }
    var r = gl.renderer.domElement.getBoundingClientRect();
    var nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    var ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    rayc.setFromCamera(new T.Vector2(nx, ny), gl.cam);
    var meshes = Object.keys(gl.meshes).map(function (k) { return gl.meshes[k]; }).concat([gl.ground]);
    var hits = rayc.intersectObjects(meshes, false);
    return hits.length ? hits[0] : null;
  }

  /* ---------- face picking (sketch-on-face / hole-on-face) ---------- */
  var hoverHalo = null;
  function hoverFace(e) {
    if (!S.armed3d || !window.THREE) { return; }
    var hit = raycastAt(e);
    var T = window.THREE;
    if (hit && hit.face && hit.object.userData.featureId) {
      var n = hit.face.normal.clone().normalize();
      if (!hoverHalo) {
        hoverHalo = new T.Mesh(new T.SphereGeometry(1.6, 12, 12), new T.MeshBasicMaterial({ color: 0xeb4e3c }));
        gl.scene.add(hoverHalo);
      }
      hoverHalo.position.copy(hit.point);
      requestRender();
    } else if (hoverHalo) { gl.scene.remove(hoverHalo); hoverHalo = null; requestRender(); }
  }

  function facePick(e) {
    var hit = raycastAt(e);
    if (!hit || !hit.face || !hit.object.userData.featureId || hit.object === gl.ground) { U.onFacePicked(null); return; }
    var fid = hit.object.userData.featureId;
    var f = U.featureById(fid);
    var sk = f ? U.sketchById(f.sketchId) : null;
    if (!f || !sk) { U.onFacePicked(null); return; }
    var n = hit.face.normal.clone().normalize();
    var p = hit.point;
    var info = null;
    if (Math.abs(n.z) > 0.9) {
      var top = n.z > 0;
      /* local coords in the host sketch frame (plane-local x/y) */
      var local = worldToPlane(sk.plane, p);
      info = {
        host: fid, flatTopBottom: true, local: [local[0], local[1]],
        plane: { kind: top ? "faceTop" : "faceBottom", topOf: fid, origin: [0, 0, p.z], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
        outline: top ? hostOutlineWorld(sk, p.z) : null,
        label: "On " + f.name + (top ? " (top face)" : " (bottom face)")
      };
    } else if (Math.abs(n.z) < 0.05) {
      /* side wall: plane tangent to the wall, u along the wall edge, v = +Z */
      var t = [-n.y, n.x, 0]; /* tangent such that u×v = n: u=(−ny,nx,0), v=(0,0,1) → u×v = (nx·? ) verify below */
      /* u = (−n.y, n.x, 0); u×v = (n.x, n.y, 0) = n ✓ */
      var horizontal = Math.hypot(n.x, n.y) || 1;
      var ux = -n.y / horizontal, uy = n.x / horizontal;
      var edge = nearestProfileEdge(sk, p, [n.x, n.y]);
      var origin = edge ? [edge.a[0], edge.a[1], Math.min(p.z, edge.z0)] : [p.x, p.y, 0];
      info = {
        host: fid, flatTopBottom: false, local: null,
        plane: { kind: "faceSide", topOf: fid, origin: origin, u: [ux, uy, 0], v: [0, 0, 1], n: [n.x, n.y, 0] },
        outline: edge ? [[0, 0], [edge.len, 0], [edge.len, edge.h], [0, edge.h]] : null,
        label: "On " + f.name + " (wall)"
      };
    } else {
      U.note("Sketches need a flat face (top, bottom or a straight wall) — that spot is sloped or curved.");
      U.onFacePicked(null);
      return;
    }
    U.onFacePicked(info);
  }
  function hostOutlineWorld(sk, z) {
    /* top/bottom context outline in the NEW sketch's local frame (same XY) */
    var out = [];
    var prof = U.profilesOf(sk);
    if (prof.length) { out = prof[0].pts.slice(); }
    return out;
  }
  function nearestProfileEdge(sk, p, nxy) {
    var prof = U.profilesOf(sk);
    if (!prof.length) { return null; }
    var f = U.featureById ? featureOfSketchId(sk.id) : null;
    var z0 = sk.plane.origin ? sk.plane.origin[2] : 0;
    var z1 = z0 + (f ? f.L : 20);
    var best = null, bd = -2;
    prof.forEach(function (pr) {
      for (var i = 0; i < pr.pts.length; i++) {
        var a = pr.pts[i], b = pr.pts[(i + 1) % pr.pts.length];
        var ex = b[0] - a[0], ey = b[1] - a[1];
        var L = Math.hypot(ex, ey);
        if (L < 1e-6) { continue; }
        var enx = -ey / L, eny = ex / L;
        var d = Math.abs(enx * nxy[0] + eny * nxy[1]);
        if (d > bd) {
          bd = d;
          var flip = (enx * nxy[0] + eny * nxy[1]) < 0;
          best = { a: flip ? b.slice() : a.slice(), b: flip ? a.slice() : b.slice(), len: L, z0: z0, z1: Math.max(z0 + 1, z1), h: Math.max(1, z1 - z0) };
        }
      }
    });
    return best;
  }
  function featureOfSketchId(skid) {
    for (var i = 0; i < S.design.features.length; i++) { if (S.design.features[i].sketchId === skid) { return S.design.features[i]; } }
    return null;
  }
  function worldToPlane(pl, w) {
    /* express world point in plane (a,b) coords */
    var rel = [w.x - pl.origin[0], w.y - pl.origin[1], w.z - pl.origin[2]];
    return [
      rel[0] * pl.u[0] + rel[1] * pl.u[1] + rel[2] * pl.u[2],
      rel[0] * pl.v[0] + rel[1] * pl.v[1] + rel[2] * pl.v[2],
      rel[0] * pl.n[0] + rel[1] * pl.n[1] + rel[2] * pl.n[2]
    ];
  }

  /* pad direction from plane kind: sketches on a bottom face extrude downward */
  function padDirForPlane(pl) { return 1; }

  /* ---------- measure ---------- */
  var meas = { on: false, pts: [], line: null, dots: [] };
  function toggleMeasure(b) {
    meas.on = !meas.on;
    b.classList.toggle("on", meas.on);
    if (!meas.on) { measClear(); }
    U.note(meas.on ? "📏 Measure: click two points on the model." : "");
  }
  function measClear() {
    var T = window.THREE;
    meas.dots.forEach(function (d) { gl.scene.remove(d); });
    meas.dots = [];
    if (meas.line) { gl.scene.remove(meas.line); meas.line = null; }
    meas.pts = [];
    var tag = U.qs(document, "[data-measure-tag]");
    if (tag) { tag.hidden = true; }
    requestRender();
  }
  function measPick(e) {
    var hit = raycastAt(e);
    if (!hit || !hit.point) { return; }
    var T = window.THREE;
    var dot = new T.Mesh(new T.SphereGeometry(1.3, 10, 10), new T.MeshBasicMaterial({ color: 0xeb4e3c }));
    dot.position.copy(hit.point);
    gl.scene.add(dot); meas.dots.push(dot);
    meas.pts.push(hit.point.clone());
    if (meas.pts.length === 2) {
      if (meas.line) { gl.scene.remove(meas.line); }
      var g = new T.BufferGeometry().setFromPoints(meas.pts);
      meas.line = new T.Line(g, new T.LineBasicMaterial({ color: 0xeb4e3c, linewidth: 2 }));
      gl.scene.add(meas.line);
      var a = meas.pts[0], b = meas.pts[1];
      var d = a.distanceTo(b);
      var tag = U.qs(document, "[data-measure-tag]");
      if (tag) {
        tag.hidden = false;
        tag.textContent = "📏 " + U.fmt(d, 2) + " mm · Δx " + U.fmt(Math.abs(b.x - a.x), 2) + " · Δy " + U.fmt(Math.abs(b.y - a.y), 2) + " · Δz " + U.fmt(Math.abs(b.z - a.z), 2);
      }
      setTimeout(function () { meas.pts = []; }, 300);
    }
    requestRender();
  }

  /* ---------- section ---------- */
  var sec = { on: false, axis: "y", pos: 0.5, plane: null };
  function toggleSection(b) {
    sec.on = !sec.on;
    b.classList.toggle("on", sec.on);
    var root = document.querySelector("[data-rgzcad]");
    var ax = U.qs(root, "[data-section-axis]"), pos = U.qs(root, "[data-section-pos]");
    if (ax) { ax.hidden = !sec.on; }
    if (pos) { pos.hidden = !sec.on; }
    if (sec.on) {
      if (ax) { ax.value = sec.axis; ax.onchange = function () { sec.axis = ax.value; applySection(); }; }
      if (pos) { pos.value = String(Math.round(sec.pos * 100)); pos.oninput = function () { sec.pos = (+pos.value) / 100; applySection(); }; }
    }
    applySection();
  }
  function applySection() {
    if (!gl.ok || !window.THREE) { return; }
    var T = window.THREE;
    if (!sec.on) {
      gl.renderer.clippingPlanes = [];
      requestRender();
      return;
    }
    var bb = partBBox();
    var lo = bb[sec.axis + "0"], hi = bb[sec.axis + "1"];
    var v = lo + (hi - lo) * sec.pos;
    var n = { x: [-1, 0, 0], y: [0, -1, 0], z: [0, 0, -1] }[sec.axis];
    sec.plane = new T.Plane(new T.Vector3(n[0], n[1], n[2]), v * -({ x: n[0], y: n[1], z: n[2] }[sec.axis]) * 1);
    gl.renderer.localClippingEnabled = true;
    gl.renderer.clippingPlanes = [sec.plane];
    requestRender();
  }

  /* ---------- render loop: on demand ---------- */
  var renderQueued = false;
  function requestRender() {
    if (!gl.ok) { return; }
    if (renderQueued) { return; }
    renderQueued = true;
    requestAnimationFrame(function () {
      renderQueued = false;
      if (!gl.ok || !gl.renderer) { return; }
      var vp = U.qs(document, "[data-viewport]");
      if (!vp) { return; }
      gl.renderer.render(gl.scene, gl.cam);
    });
  }
  function dirtyShadow() {
    if (gl.renderer && gl.renderer.shadowMap.enabled) { gl.renderer.shadowMap.needsUpdate = true; }
  }
  function resizeGL() {
    if (!gl.ok) { return; }
    var r = gl.wrap.getBoundingClientRect();
    var w = Math.max(2, r.width), h = Math.max(2, r.height);
    gl.renderer.setSize(w, h, false);
    gl.aspect = w / h;
    gl.camPersp.aspect = gl.aspect;
    gl.camPersp.updateProjectionMatrix();
    if (gl.ortho) { ctlApply(); }
    requestRender();
  }

  /* ---------- STL export (all feature meshes, world space) ---------- */
  function exportSTL() {
    var T = window.THREE;
    var out = "solid rgzcad-" + U.slugName() + "\n";
    var va = new T.Vector3(), vb = new T.Vector3(), vc = new T.Vector3(), n = new T.Vector3(), e1 = new T.Vector3(), e2 = new T.Vector3();
    var list = Object.keys(gl.meshes).map(function (id) { return gl.meshes[id]; });
    if (gl.mirrMesh) { list.push(gl.mirrMesh); }
    list.forEach(function (mesh) {
      var pos = mesh.geometry.getAttribute("position");
      mesh.updateMatrixWorld(true);
      for (var i = 0; i < pos.count; i += 3) {
        va.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        vb.fromBufferAttribute(pos, i + 1).applyMatrix4(mesh.matrixWorld);
        vc.fromBufferAttribute(pos, i + 2).applyMatrix4(mesh.matrixWorld);
        e1.subVectors(vb, va); e2.subVectors(vc, va);
        n.crossVectors(e1, e2); n.normalize();
        out += "facet normal " + n.x.toExponential(5) + " " + n.y.toExponential(5) + " " + n.z.toExponential(5) + "\n outer loop\n";
        [va, vb, vc].forEach(function (v) { out += "  vertex " + v.x.toExponential(6) + " " + v.y.toExponential(6) + " " + v.z.toExponential(6) + "\n"; });
        out += " endloop\nendfacet\n";
      }
    });
    out += "endsolid rgzcad-" + U.slugName() + "\n";
    U.download(U.slugName() + ".stl", out, "model/stl");
    U.note("STL exported — ready for your slicer.");
  }

  /* ---------- fullscreen (API + fallback) ---------- */
  function fsResized() {
    resizeGL();
    if (window.__rgzcad1 && window.__rgzcad1.skResize) { window.__rgzcad1.skResize(); }
    if (window.__rgzcadRenderSheet && S.step === "drawing") { window.__rgzcadRenderSheet(); }
  }
  function fsToggle() {
    var rt = document.querySelector("[data-rgzcad]");
    if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); return; }
    if (rt.classList.contains("rgzcad-fs")) { rt.classList.remove("rgzcad-fs"); setTimeout(fsResized, 30); return; }
    if (rt.requestFullscreen) {
      rt.requestFullscreen({ navigationUI: "hide" }).catch(function () { rt.classList.add("rgzcad-fs"); setTimeout(fsResized, 30); });
    } else { rt.classList.add("rgzcad-fs"); setTimeout(fsResized, 30); }
  }
  function bootFS() {
    U.qsa(document, "[data-fullscreen]").forEach(function (b) { b.addEventListener("click", fsToggle); });
    document.addEventListener("fullscreenchange", fsResized);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var rt = document.querySelector("[data-rgzcad]");
        if (rt && rt.classList.contains("rgzcad-fs")) { rt.classList.remove("rgzcad-fs"); setTimeout(fsResized, 30); }
      }
    });
  }

  function boot2() {
    var root = document.querySelector("[data-rgzcad]");
    if (!root) { return; }
    bootGL();
    bootFS();
    window.addEventListener("resize", resizeGL);
  }

  /* world-space triangle soup of the whole design — pure geometry (no GL),
     used by the ISO drawing views; mirrors buildModel's exact transforms. */
  function worldSoup() {
    var T = window.THREE;
    if (!T) { return null; }
    var P = [], N = [];
    S.design.features.forEach(function (f) {
      var payload = payloadForFeature(f);
      if (!payload) { return; }
      var res = payload.shellOnly ? buildShellMesh(payload, f) : tessellateLocal(payload);
      if (!res || res.error || !res.positions) { return; }
      var merged = instancedSoup(f, res);
      var sk = U.sketchById(f.sketchId);
      if (!sk) { return; }
      var m = planeMatrix(sk.plane);
      if (f.dir === -1) { m.multiply(new T.Matrix4().makeTranslation(0, 0, -Math.abs(+f.L || 0))); }
      appendTransformed(P, N, merged.positions, merged.normals, m);
    });
    var mr = S.design && S.design.mirror;
    if (mr && mr.on && P.length) {
      var sx = mr.plane === "xz" ? 1 : -1, sy = mr.plane === "xz" ? -1 : 1;
      var base = P.length;
      for (var i = 0; i + 8 < base; i += 9) {
        [0, 2, 1].forEach(function (kk) {   /* reflection flips chirality → restore outward winding */
          P.push(P[i + 3 * kk] * sx, P[i + 3 * kk + 1] * sy, P[i + 3 * kk + 2]);
          N.push(N[i + 3 * kk] * sx, N[i + 3 * kk + 1] * sy, N[i + 3 * kk + 2]);
        });
      }
    }
    if (!P.length) { return null; }
    return { positions: new Float32Array(P), normals: new Float32Array(N) };
  }

  window.__rgzcad2 = {
    fitCam: fitCam, fitCamSoon: fitCamSoon, applyMaterial: applyMaterial, highlightFeature: highlightFeature,
    resizeGL: resizeGL, raycastAt: raycastAt, worldToPlane: worldToPlane, gl: gl, refreshDatums: refreshDatums,
    edgeHighlightFrom: edgeHighlightFrom, clearEdgeHl: clearEdgeHl, featureEdgeCandidates: featureEdgeCandidates,
    tessLocal: tessellateLocal, worldSoup: worldSoup
  };
  window.__rgzcadBuild3d = buildModel;
  window.__rgzcadExportSTL = exportSTL;
  window.__rgzcadBoot2 = boot2;
  window.__rgzcadGL = gl;
})();
