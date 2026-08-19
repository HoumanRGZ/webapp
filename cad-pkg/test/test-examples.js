/* Build every predesigned book plate and assert it pads / draws. */
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
    expect(list.length >= 12, "at least 14 book plates (" + list.length + ")");
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
        U.setStep("drawing");
        const svg = (doc.querySelector("[data-sheet]") || {}).innerHTML || "";
        expect(/<svg/.test(svg), ex.id + " ISO drawing paints");
      } catch (err) {
        failed++;
        console.log("FAIL ✗ " + ex.id + " threw: " + (err && err.stack ? err.stack.split("\n")[0] : err));
      }
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
