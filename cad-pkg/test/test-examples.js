/* Build every predesigned plate and assert it pads / draws. */
const { bootStudio, afterBoot } = require("./harness");

let pass = 0, failed = 0;
function expect(cond, label) {
  if (cond) { pass++; console.log("ok  ✓ " + label); }
  else { failed++; console.log("FAIL ✗ " + label); }
}

const { win, doc, jsErrors, close } = bootStudio();

afterBoot(function () {
  try {
    expect(jsErrors.length === 0, "boot clean");
    const U = win.__rgzcad1;
    expect(typeof win.RGZCAD_EXAMPLES === "function", "examples catalog loaded");
    const list = win.RGZCAD_EXAMPLES(U);
    const levels = { simple: 0, intermediate: 0, advanced: 0 };
    list.forEach(function (ex) { if (levels[ex.level] != null) levels[ex.level]++; });
    expect(list.length >= 45, "at least 45 plates (" + list.length + ")");
    expect(levels.simple >= 15, "simple ≥ 15 (" + levels.simple + ")");
    expect(levels.intermediate >= 15, "intermediate ≥ 15 (" + levels.intermediate + ")");
    expect(levels.advanced >= 15, "advanced ≥ 15 (" + levels.advanced + ")");
    expect(!!doc.querySelector("[data-examples]"), "Example plates button in the header");

    list.forEach(function (ex) {
      try {
        ex.build();
        const feats = U.S.design.features.length;
        const nEnt = U.S.design.sketches.reduce(function (n, s) { return n + (s.entities || []).length; }, 0);
        expect(feats >= 1, ex.id + " produced a 3D feature");
        expect(nEnt >= 1, ex.id + " has sketch entities (" + nEnt + ")");
        const vol = U.partVol();
        expect(vol > 0, ex.id + " has positive volume (" + vol.toFixed(1) + " mm³)");
      } catch (err) {
        failed++;
        console.log("FAIL ✗ " + ex.id + " threw: " + (err && err.stack ? err.stack.split("\n")[0] : err));
      }
    });

    /* ISO drawing on a couple of representatives, not all 45 (too slow in jsdom) */
    ["s01-rect", "i02-bolt", "a01-pocket"].forEach(function (id) {
      const ex = list.filter(function (x) { return x.id === id; })[0];
      if (!ex) { expect(false, id + " missing"); return; }
      ex.build();
      U.setStep("drawing");
      const svg = (doc.querySelector("[data-sheet]") || {}).innerHTML || "";
      expect(/<svg/.test(svg), id + " ISO drawing paints");
    });

    console.log("\n== examples: " + pass + " passed, " + failed + " failed ==");
  } catch (e) {
    failed++;
    console.log("FAIL ✗ suite threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e));
    console.log("\n== examples: " + pass + " passed, " + failed + " failed ==");
  }
  close();
  process.exit(failed ? 1 : 0);
}, 500);
