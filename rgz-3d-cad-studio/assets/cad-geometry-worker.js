/* ============================================================
   RGZ 3D CAD Studio — geometry worker (v3)
   Tessellates ONE feature payload into a local (z-up 0..L) triangle soup.

   payload = {
     profiles: [ [[x,y],…], … ]                  closed contours (local 2D)
     holes:    [ [cx,cy,r,typeI,depth,cbD,cbDepth,csAngle], … ]
                  typeI: 0 through · 1 blind · 2 counterbore · 3 countersink
     cuts:     [ [[x,y],…], … ]                  pocket contours (top recess)
     cutDepth: number                            recess depth (shared)
     L: number                                   extrusion length
     bevel:    { mode: 0 none | 1 chamfer | 2 fillet, size }
   }
   replies { positions, normals, tris, vol, removed }
   ============================================================ */
"use strict";

var THREE = null;
try { importScripts("three.min.js"); THREE = self.THREE || (typeof globalThis !== "undefined" ? globalThis.THREE : null); } catch (e) { THREE = null; }

if (!THREE) {
  self.onmessage = function (e) {
    self.postMessage({ id: (e.data && e.data.id) || 0, error: "three.js did not load in the worker" });
  };
} else {
  self.onmessage = function (e) {
    var d = e.data || {};
    try {
      var res = tessellate(d.payload || d);
      res.id = d.id || 0;
      var tx = [res.positions.buffer, res.normals.buffer];
      self.postMessage(res, tx);
    } catch (err) {
      self.postMessage({ id: d.id || 0, error: String((err && err.message) || err) });
    }
  };
}

self.RGZ_THREE_READY = !!THREE;

function polyArea(pts) {
  var a = 0;
  for (var i = 0; i < pts.length; i++) { var q = pts[(i + 1) % pts.length]; a += pts[i][0] * q[1] - q[0] * pts[i][1]; }
  return a / 2;
}
function bboxOf(pts) {
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
function pointInPoly(pts, x, y) {
  var inside = false;
  for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)) { inside = !inside; }
  }
  return inside;
}

function ringProbe(pts) {
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

/* per-edge corner rounding for picked vertical edges (Update 17).
   ops: [{style:'fillet'|'chamfer', ring, vi, r, d, ang}] — same math in-app. */
function interiorAngleW(pts, i) {
  var n = pts.length, p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
  var a1 = Math.atan2(a[1] - p[1], a[0] - p[0]), a2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
  var th = a1 - a2;
  while (th <= 0) { th += 2 * Math.PI; }
  if (polyArea(pts) < 0) { th = 2 * Math.PI - th; }
  return th;
}
function applyEdgeOps(items, ops) {
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

function tessellate(p) {
  var profiles = p.profiles || (p.pts ? [p.pts] : []);
  var holes = p.holes || [];
  var cuts = p.cuts || [];
  var L = +p.L || 1;
  var cutDepth = Math.min(Math.max(+p.cutDepth || 0, 0), Math.max(L - 0.3, 0));
  var bevel = p.bevel || { mode: 0, size: 0 };
  if (!profiles.length) { return emptyWithError("no closed profile in the sketch"); }
  var validContours = 0;
  profiles.forEach(function (c) { if (c && c.length >= 3 && Math.abs(polyArea(c)) >= 0.01) { validContours++; } });
  if (!validContours) { return emptyWithError("profile is not a closed area"); }

  /* nested contours: a profile inside another profile is a VOID (odd depth),
     one level deeper a solid island again (CATIA/H810 rule) */
  var items = classifyContours(profiles);
  applyEdgeOps(items, p.edgeOps);

  /* CATIA PartDesign branches: Shaft/Groove (revolve), Shell, Draft angle */
  var solidsN = 0; items.forEach(function (it) { if (it.role === "solid") { solidsN++; } });
  if (!solidsN) { return emptyWithError("profile is not a closed area"); }
  if (p.revol && (+p.revol.angle) > 0) { return tessellateRevolve(items, +p.revol.angle, +p.revol.axisX || 0); }
  if ((+p.shellT || 0) > 0) { return tessellateShell(items, holes, +p.shellT, L); }
  if ((+p.draftDeg || 0) > 0) { return tessellateDraft(items, holes, +p.draftDeg, L); }

  /* ---- hole-contour boolean union (earcut demands disjoint holes) ---- */
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
      if (pointInPoly(b2, a2[i2][0], a2[i2][1])) { return true; }
      for (j2 = 0; j2 < b2.length; j2++) {
        if (Math.hypot(a2[i2][0] - b2[j2][0], a2[i2][1] - b2[j2][1]) < 1e-6) { return true; }
      }
    }
    for (i2 = 0; i2 < b2.length; i2++) { if (pointInPoly(a2, b2[i2][0], b2[i2][1])) { return true; } }
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
          var qv = q[j2], pr = ((qv[0] - p0[0]) * dx2 + (qv[1] - p0[1]) * dy2) / ln;
          if (pr > 1e-9 && pr < 1 - 1e-9 && Math.hypot(p0[0] + dx2 * pr - qv[0], p0[1] + dy2 * pr - qv[1]) < 1e-6) { pts.push([qv[0], qv[1]]); }
        }
        pts.push(p1);
        pts.sort(function (s2, t3) { return ((s2[0] - p0[0]) * dx2 + (s2[1] - p0[1]) * dy2) - ((t3[0] - p0[0]) * dx2 + (t3[1] - p0[1]) * dy2); });
        var dd = [];
        pts.forEach(function (s2) { var l = dd[dd.length - 1]; if (!l || Math.hypot(s2[0] - l[0], s2[1] - l[1]) > 1e-7) { dd.push(s2); } });
        for (k3 = 0; k3 + 1 < dd.length; k3++) {
          out.push({ a: dd[k3], b: dd[k3 + 1], in: pointInPoly(q, (dd[k3][0] + dd[k3 + 1][0]) / 2, (dd[k3][1] + dd[k3 + 1][1]) / 2) });
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
    if (loop.length < 3 || Math.abs(polyArea(loop)) < 1e-6) { return null; }
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
      if (polyArea(pts) < 0) { pts = pts.slice().reverse(); }
      var sh = new THREE.Shape();
      pts.forEach(function (q, i) { if (i === 0) { sh.moveTo(q[0], q[1]); } else { sh.lineTo(q[0], q[1]); } });
      sh.closePath();
      function insideProfileVoid(x, y) {
        var inV = false;
        items.forEach(function (h2) { if (h2.role === "hole" && h2.parent === idx && pointInPoly(h2.pts, x, y)) { inV = true; } });
        return inV;
      }
      var holePolys = [], smoothHoles = [];
      items.forEach(function (h2) {
        if (h2.role !== "hole" || h2.parent !== idx) { return; }
        var vp = h2.pts.slice();
        if (polyArea(vp) > 0) { vp = vp.slice().reverse(); }
        holePolys.push(vp);
      });
      holes.forEach(function (h) {
        var r = +h[2], tI = h[3] | 0;
        if (!(r > 0) || tI === 1) { return; }
        if (!pointInPoly(pts, +h[0], +h[1]) || insideProfileVoid(+h[0], +h[1])) { return; }
        smoothHoles.push(h);
      });
      if (withCuts) {
        cuts.forEach(function (c) {
          var cp = c.slice(), bb = bboxOf(cp);
          if (!pointInPoly(pts, bb.cx, bb.cy) || insideProfileVoid(bb.cx, bb.cy)) { return; }
          if (polyArea(cp) < 0) { cp = cp.slice().reverse(); }
          holePolys.push(cp);
        });
      }
      /* a circle clashing with another contour joins the merge set as a 28-gon;
         disjoint circles keep their smooth arc path */
      var circPolys = [];
      smoothHoles.forEach(function (h) {
        var cg = [], clash = false, i2, a2;
        for (i2 = 0; i2 < 28; i2++) { a2 = i2 / 28 * 2 * Math.PI; cg.push([+h[0] + (+h[2]) * Math.cos(a2), +h[1] + (+h[2]) * Math.sin(a2)]); }
        for (i2 = 0; i2 < holePolys.length && !clash; i2++) { if (polysTouch(holePolys[i2], cg)) { clash = true; } }
        for (i2 = 0; i2 < circPolys.length && !clash; i2++) { if (polysTouch(circPolys[i2], cg)) { clash = true; } }
        if (clash) { circPolys.push(cg); return; }
        var hp = new THREE.Path();
        hp.absarc(+h[0], +h[1], +h[2], 0, Math.PI * 2, true);
        sh.holes.push(hp);
      });
      mergeHolePolys(holePolys.concat(circPolys)).forEach(function (mp2) {
        if (polyArea(mp2) > 0) { mp2 = mp2.slice().reverse(); }
        var hp2 = new THREE.Path();
        mp2.forEach(function (q, i) { if (i === 0) { hp2.moveTo(q[0], q[1]); } else { hp2.lineTo(q[0], q[1]); } });
        hp2.closePath();
        sh.holes.push(hp2);
      });
      shapes.push(sh);
    });
    return shapes;
  }

  var P = [], N = [];
  var sz = Math.min(bevel.size || 0, L / 2);
  var usedBevel = bevel.mode > 0 && sz > 0 && (L - 2 * sz) >= 0.5 && cutDepth === 0;

  function accum(geom, zOff) {
    var g2 = geom.index ? geom.toNonIndexed() : geom;
    var pos = g2.getAttribute("position").array, nrm = g2.getAttribute("normal").array;
    for (var i = 0; i < pos.length; i += 3) {
      P.push(pos[i], pos[i + 1], pos[i + 2] + zOff);
      N.push(nrm[i], nrm[i + 1], nrm[i + 2]);
    }
    geom.dispose();
    if (g2 !== geom && g2.dispose) { g2.dispose(); }
  }

  /* hole radius removed from a horizontal cap at level capZ */
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
  /* is (x,y) face material at cap level capZ? (profile − voids − cuts − hole disks) */
  function capRegionOk(x, y, capZ, cutPolys) {
    var inS = false, i2;
    items.forEach(function (it, idx2) {
      if (it.role !== "solid" || !pointInPoly(it.pts, x, y)) { return; }
      var inV = false;
      items.forEach(function (h2) { if (h2.role === "hole" && h2.parent === idx2 && pointInPoly(h2.pts, x, y)) { inV = true; } });
      if (!inV) { inS = true; }
    });
    if (!inS) { return false; }
    if (cutPolys) {
      for (i2 = 0; i2 < cutPolys.length; i2++) { if (pointInPoly(cutPolys[i2], x, y)) { return false; } }
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
  /* strip cap tris whose centroid leaves the true face region (keep zero-area
     bridge slivers — deleting them flips real neighbor tris into fake 1-face
     boundary edges; kept identical to tessellateLocal on the main thread) */
  function filterCaps(from, cutPolys) {
    /* fresh-array rebuild (mirrors tessellateLocal on the main thread):
       read originals once, collect kept tris, swap back */
    var keptP = [], keptN = [], r;
    for (r = from; r < P.length; r += 9) {
      var drop = false;
      if (Math.abs(N[r + 2]) > 0.99) {
        drop = !capRegionOk((P[r] + P[r + 3] + P[r + 6]) / 3, (P[r + 1] + P[r + 4] + P[r + 7]) / 3, P[r + 2], cutPolys);
      }
      if (!drop) { for (var k2 = 0; k2 < 9; k2++) { keptP.push(P[r + k2]); keptN.push(N[r + k2]); } }
    }
    P.length = from; N.length = from;
    for (var q2 = 0; q2 < keptP.length; q2++) { P.push(keptP[q2]); N.push(keptN[q2]); }
  }

  if (cutDepth > 0) {
    var m1 = P.length;
    accum(new THREE.ExtrudeGeometry(buildShape(false), { depth: Math.max(0.5, L - cutDepth), bevelEnabled: false, curveSegments: 24 }), 0);
    filterCaps(m1, null);
    var m2 = P.length;
    accum(new THREE.ExtrudeGeometry(buildShape(true), { depth: cutDepth, bevelEnabled: false, curveSegments: 24 }), L - cutDepth);
    filterCaps(m2, cuts);
  } else if (usedBevel) {
    var m3b = P.length;
    accum(new THREE.ExtrudeGeometry(buildShape(false), {
      depth: L - 2 * sz, bevelEnabled: true, bevelThickness: sz, bevelSize: sz,
      bevelSegments: bevel.mode === 2 ? 3 : 2, curveSegments: 24
    }), 0);
    filterCaps(m3b, null);
  } else {
    var m3 = P.length;
    accum(new THREE.ExtrudeGeometry(buildShape(false), { depth: L, bevelEnabled: false, curveSegments: 24 }), 0);
    filterCaps(m3, null);
  }

  var removed = shellFeatures(P, N, holes, L);
  var vol = payloadVol(profiles, holes, cuts, cutDepth, L, p.edgeOps);

  return {
    positions: new Float32Array(P),
    normals: new Float32Array(N),
    tris: (P.length / 9) | 0,
    vol: vol / 1000,              /* mm3 -> cm3 */
    area: payloadArea(profiles, holes, L) / 100,  /* mm2 -> cm2 (estimate) */
    removed: removed
  };
}


function payloadArea(profiles, holes, L) {
  function per(pts) { var p = 0; for (var i = 0; i < pts.length; i++) { var q = pts[(i + 1) % pts.length]; p += Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]); } return p; }
  var s = 0;
  classifyContours(profiles).forEach(function (it) {
    s += (it.role === "solid" ? 2 * it.area : -2 * it.area) + per(it.pts) * L;
  });
  holes.forEach(function (h) {
    var r = +h[2];
    s += 2 * Math.PI * r * L;      /* drilled wall */
    s -= 2 * Math.PI * r * r;      /* openings replace caps */
  });
  return Math.max(0, s);
}

function emptyWithError(msg) {
  return { positions: new Float32Array(0), normals: new Float32Array(0), tris: 0, vol: 0, removed: 0, error: msg };
}

function payloadVol(profiles, holes, cuts, cutDepth, L, edgeOps) {
  function A(pts) { return Math.abs(polyArea(pts)); }
  var items = classifyContours(profiles);
  var full = 0;
  items.forEach(function (it) { full += it.role === "solid" ? it.area : -it.area; });
  full -= edgeOpsAreaDelta(edgeOps);
  /* a hole only removes material where there IS material (mesh rule) */
  function inMaterial(cx, cy) {
    var ok = false;
    items.forEach(function (it, i2) {
      if (it.role !== "solid" || !pointInPoly(it.pts, cx, cy)) { return; }
      var inV = false;
      items.forEach(function (h3) { if (h3.role === "hole" && h3.parent === i2 && pointInPoly(h3.pts, cx, cy)) { inV = true; } });
      if (!inV) { ok = true; }
    });
    return ok;
  }
  holes = holes.filter(function (h) { return inMaterial(+h[0], +h[1]); });
  var Athrough = 0;
  holes.forEach(function (h) {
    var r = +h[2], tI = h[3] | 0;
    if (tI !== 1) { Athrough += Math.PI * r * r; }
  });
  var V = (full - Athrough) * L;
  var cutA = 0; cuts.forEach(function (c) { cutA += A(c); });
  V -= cutA * Math.min(cutDepth, L);
  holes.forEach(function (h) {
    var r = +h[2], tI = h[3] | 0;
    if (tI === 1) { V -= Math.PI * r * r * Math.min(Math.max(+h[4] || 0, 0.5), Math.max(L - 0.5, 0.6)); }
    else if (tI === 2) {
      var R = Math.max((+h[5] || 0) / 2, r + 0.2), d = Math.min(Math.max(+h[6] || 0, 0.4), Math.max(L - 0.5, 0.5));
      V -= Math.PI * (R * R - r * r) * d;
    } else if (tI === 3) {
      var R2 = Math.max((+h[5] || 0) / 2, r + 0.2), hC = Math.min((R2 - r) / Math.tan(((+h[7] || 90) * Math.PI / 180) / 2), Math.max(L - 0.4, 0.4));
      V -= Math.max(0, (Math.PI * Math.max(hC, 0) / 3) * (R2 * R2 + R2 * r + r * r) - Math.PI * r * r * Math.max(hC, 0));
    }
  });
  return Math.max(0, V);
}

/* shells for blind / counterbore / countersink features (under z=L) */
function tri(P, N, a, b, c, n) {
  P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  N.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
}
function tube(P, N, cx, cy, r, z0, z1, seg, inward) {
  for (var i = 0; i < seg; i++) {
    var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    var p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    var n0 = [Math.cos(a0), Math.sin(a0), 0];
    if (inward) { n0 = [-n0[0], -n0[1], 0]; }
    var A = [p0[0], p0[1], z0], B = [p1[0], p1[1], z0], C = [p1[0], p1[1], z1], Dq = [p0[0], p0[1], z1];
    if (inward) { tri(P, N, A, C, B, n0); tri(P, N, A, Dq, C, n0); }
    else { tri(P, N, A, B, C, n0); tri(P, N, A, C, Dq, n0); }
  }
}
function disc(P, N, cx, cy, r, z, seg) {
  for (var i = 0; i < seg; i++) {
    var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    tri(P, N, [cx, cy, z], [cx + r * Math.cos(a1), cy + r * Math.sin(a1), z], [cx + r * Math.cos(a0), cy + r * Math.sin(a0), z], [0, 0, 1]);
  }
}
function annulus(P, N, cx, cy, R, r, z, seg) {
  for (var i = 0; i < seg; i++) {
    var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    var A = [cx + r * Math.cos(a0), cy + r * Math.sin(a0), z], B = [cx + r * Math.cos(a1), cy + r * Math.sin(a1), z],
        C = [cx + R * Math.cos(a1), cy + R * Math.sin(a1), z], Dq = [cx + R * Math.cos(a0), cy + R * Math.sin(a0), z];
    tri(P, N, A, B, C, [0, 0, 1]); tri(P, N, A, C, Dq, [0, 0, 1]);
  }
}
function frustum(P, N, cx, cy, R, r, z0, z1, seg) {
  for (var i = 0; i < seg; i++) {
    var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    var A = [cx + R * Math.cos(a0), cy + R * Math.sin(a0), z0], B = [cx + R * Math.cos(a1), cy + R * Math.sin(a1), z0],
        C = [cx + r * Math.cos(a1), cy + r * Math.sin(a1), z1], Dq = [cx + r * Math.cos(a0), cy + R * Math.sin(a0), z1];
    tri(P, N, A, B, C, [0, 0, 0.42]); tri(P, N, A, C, Dq, [0, 0, 0.42]);
  }
}
function shellFeatures(P, N, holes, L) {
  var removed = 0, seg = 28;
  holes.forEach(function (h) {
    var cx = +h[0], cy = +h[1], r = +h[2], tI = h[3] | 0;
    var depth = +h[4] || 0, cbD = +h[5] || 0, cbDepth = +h[6] || 0, ang = +h[7] || 90;
    if (tI === 1) {
      depth = Math.min(Math.max(depth, 0.5), Math.max(L - 0.5, 0.6));
      tube(P, N, cx, cy, r, L - depth, L, seg, true);
      disc(P, N, cx, cy, r, L - depth, seg);
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

/* ================================================================
   CATIA PartDesign tessellators: Shaft/Groove (revolve), Draft, Shell
   ================================================================ */
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
function ringPerimeter(pts) {
  var s = 0, i, q;
  for (i = 0; i < pts.length; i++) { q = pts[(i + 1) % pts.length]; s += Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]); }
  return s;
}
/* d > 0 SHRINKS the enclosed region (CCW rings shrink, CW air-voids grow) */
function offsetRing(pts, d) {
  var n = pts.length, out = [], i;
  for (i = 0; i < n; i++) {
    var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    var e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], l1 = Math.hypot(e1x, e1y) || 1;
    var e2x = p2[0] - p1[0], e2y = p2[1] - p1[1], l2 = Math.hypot(e2x, e2y) || 1;
    var n1x = -e1y / l1, n1y = e1x / l1, n2x = -e2y / l2, n2y = e2x / l2;
    var nx = n1x + n2x, ny = n1y + n2y;
    var k = 1 + n1x * n2x + n1y * n2y;
    var f = k > 1e-4 ? 1 / k : 3; if (f > 3) { f = 3; } if (f < 0) { f = 3; }
    out.push([p1[0] + nx * d * f, p1[1] + ny * d * f]);
  }
  return out;
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
  var shapes = [];
  items.forEach(function (it, idx) {
    if (it.role !== "solid") { return; }
    var rp = (mapFn ? mapFn(it.pts) : it.pts).slice();
    if (Math.abs(polyArea(rp)) < 0.01) { return; }
    if (polyArea(rp) < 0) { rp = rp.slice().reverse(); }
    var sh = new THREE.Shape();
    rp.forEach(function (q, i) { if (i === 0) { sh.moveTo(q[0], q[1]); } else { sh.lineTo(q[0], q[1]); } });
    sh.closePath();
    items.forEach(function (h2) {
      if (h2.role !== "hole" || h2.parent !== idx) { return; }
      var vp = (mapFn ? mapFn(h2.pts) : h2.pts).slice();
      if (polyArea(vp) > 0) { vp = vp.slice().reverse(); }
      var hp = new THREE.Path();
      vp.forEach(function (q, i) { if (i === 0) { hp.moveTo(q[0], q[1]); } else { hp.lineTo(q[0], q[1]); } });
      hp.closePath();
      sh.holes.push(hp);
    });
    shapes.push(sh);
  });
  return shapes;
}
function capsFromShapes(shapes, placeFn, P, N, hx, hy, hz) {
  var t = 0;
  shapes.forEach(function (sh) {
    var g = new THREE.ShapeGeometry(sh, 6);
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

/* ---- Shaft / Groove: revolve the classified profiles about x = axisX ---- */
function tessellateRevolve(items, angleDeg, ax) {
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
  if (bad) { return emptyWithError("revolve: every profile must stay on one side of the axis (draw a vertical centreline as the axis)"); }
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
    items.forEach(function (it) {
      if (it.role !== "solid") { return; }
      var mr = ringCentroid(it.pts)[0] - ax, s = mr >= 0 ? 1 : -1;
      /* my shapes are shared; place caps once per angle (solids & their voids are in the shapes) */
      return s;
    });
    var any = items.filter(function (it) { return it.role === "solid"; })[0];
    var sAny = any && (ringCentroid(any.pts)[0] - ax) >= 0 ? 1 : -1;
    holeFlip += capsFromShapes(shapes, function (x, y) { return [ax + (x - ax) * Math.cos(0), y, (x - ax) * Math.sin(0)]; }, P, N, sAny * Math.sin(0), 0, -sAny * Math.cos(0));
    holeFlip += capsFromShapes(shapes, function (x, y) { return [ax + (x - ax) * Math.cos(ang), y, (x - ax) * Math.sin(ang)]; }, P, N, -sAny * Math.sin(ang), 0, sAny * Math.cos(ang));
  }
  var vol = 0, area = 0;
  items.forEach(function (it) {
    var c = ringCentroid(it.pts), sgn = it.role === "solid" ? 1 : -1;
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
  if (!(deg > 0.01)) { return emptyWithError("draft: angle must be positive"); }
  if (deg > 30) { return emptyWithError("draft: keep the angle at 30° or less for a prismatic part"); }
  var tan = Math.tan(deg * Math.PI / 180);
  var shrinkL = L * tan;
  var okTop = items.some(function (it) {
    if (it.role !== "solid") { return false; }
    var r1 = offsetRing(it.pts, shrinkL);
    var a0 = polyArea(it.pts), a1 = polyArea(r1);
    if (a0 * a1 <= 0) { return false; }
    if (Math.abs(a1) >= 0.995 * Math.abs(a0)) { return false; }      /* must really shrink */
    if (Math.abs(a1) < 0.01 * Math.abs(a0)) { return false; }        /* must not vanish */
    var pr = ringProbe(r1);
    return pointInPoly(it.pts, pr[0], pr[1]);
  });
  if (!okTop) { return emptyWithError("draft: angle too steep for this length (top profile would vanish)"); }
  var P = [], N = [];
  var ns = Math.min(24, Math.max(2, Math.ceil(L / 4)));
  items.forEach(function (it) {
    var n = it.pts.length, flip = it.role === "hole" ? -1 : 1;
    var ring0 = it.pts.map(function (p) { return p.slice(); });
    for (var j = 1; j <= ns; j++) {
      var z0 = (j - 1) / ns * L, z1 = j / ns * L;
      var ring1 = offsetRing(it.pts, z1 * tan);
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
  var t2 = capsFromShapes(shapesFromItems(items, function (pts) { return offsetRing(pts, shrinkL); }), function (x, y) { return [x, y, L]; }, P, N, 0, 0, 1);
  /* drills ignored with draft (panel note), volume: Simpson on the signed area law */
  function signedA(z) {
    var s = 0;
    items.forEach(function (it) { s += (it.role === "solid" ? 1 : -1) * Math.abs(polyArea(offsetRing(it.pts, z * tan))); });
    return s;
  }
  var vol = L / 6 * (signedA(0) + 4 * signedA(L / 2) + signedA(L));
  var area = signedA(0) + signedA(L);
  items.forEach(function (it) { area += ringPerimeter(offsetRing(it.pts, shrinkL / 2)) * (L / Math.cos(deg * Math.PI / 180)); });
  return {
    positions: new Float32Array(P), normals: new Float32Array(N),
    tris: (P.length / 9) | 0,
    vol: Math.max(0, vol) / 1000, area: Math.max(0, area) / 100, removed: 0
  };
}

/* ---- Shell: hollow the solid, walls t, opening on the top face ---- */
function tessellateShell(items, holes, t, L) {
  if (!(t > 0)) { return emptyWithError("shell: thickness must be positive"); }
  if (t >= L - 0.2) { return emptyWithError("shell: keep the thickness below the feature length"); }
  var P = [], N = [];
  function accumGeom(shapes, z0, depth) {
    var g = new THREE.ExtrudeGeometry(shapes, { depth: Math.max(0.2, depth), bevelEnabled: false, curveSegments: 24 });
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
      if (!pointInPoly(pts, +h[0], +h[1])) { return; }
      if (innerR && pointInPoly(innerR, +h[0], +h[1])) { return; }
      var hp = new THREE.Path();
      hp.absarc(+h[0], +h[1], r, 0, Math.PI * 2, true);
      paths.push(hp);
    });
    return paths;
  }
  var vol = 0, area = 0, err = null;
  items.forEach(function (it, idx) {
    if (it.role !== "solid") { return; }
    var inner = offsetRing(it.pts, t);
    var aBase = polyArea(it.pts), aIn = polyArea(inner);
    var pr = ringProbe(inner);
    if (aBase * aIn <= 0 || Math.abs(aIn) >= 0.995 * Math.abs(aBase) || Math.abs(aIn) < 0.05 * it.area || !pointInPoly(it.pts, pr[0], pr[1])) { err = "shell: thickness too large for profile " + (idx + 1); return; }
    function shapeWith(innerAsHole) {
      var rp = it.pts.slice();
      if (polyArea(rp) < 0) { rp = rp.slice().reverse(); }
      var sh = new THREE.Shape();
      rp.forEach(function (q, i) { if (i === 0) { sh.moveTo(q[0], q[1]); } else { sh.lineTo(q[0], q[1]); } });
      sh.closePath();
      items.forEach(function (h2) {
        if (h2.role !== "hole" || h2.parent !== idx) { return; }
        var vp = h2.pts.slice();
        if (polyArea(vp) > 0) { vp = vp.slice().reverse(); }
        var hp = new THREE.Path();
        vp.forEach(function (q, i) { if (i === 0) { hp.moveTo(q[0], q[1]); } else { hp.lineTo(q[0], q[1]); } });
        hp.closePath();
        sh.holes.push(hp);
      });
      if (innerAsHole) {
        var ip = inner.slice();
        if (polyArea(ip) > 0) { ip = ip.slice().reverse(); }
        var hp2 = new THREE.Path();
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
    var Ai = Math.abs(polyArea(inner));
    var voidA = 0;
    items.forEach(function (h2) { if (h2.role === "hole" && h2.parent === idx) { voidA += h2.area; } });
    vol += it.area * t + (it.area - Ai) * (L - t) - voidA * L;
    area += ringPerimeter(it.pts) * L + ringPerimeter(inner) * (L - t) + 2 * (it.area - Ai);
  });
  if (err) { return emptyWithError(err); }
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
