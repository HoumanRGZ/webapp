/* Shared jsdom boot for RGZ 3D CAD Studio tests. */
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");

const PKG = "/home/user/webapp/rgz-3d-cad-studio";

function studioMarkup(php) {
  let html = php
    .replace(/<\?php echo esc_html\(\$atts\['title'\]\); \?>/, "RGZ 3D CAD Studio")
    .replace(/<\?php echo esc_url\(home_url\('\/mechanical-engineering-deck\/#learn-cad'\); \?>/g, "#")
    .replace(/<\?php[\s\S]*?\?>/g, "");
  const start = html.indexOf('<div class="rgzcad rgzcad-root"');
  if (start >= 0) html = html.slice(start);
  const close = html.lastIndexOf("</div>");
  return html.slice(0, close + 6);
}

function bootStudio() {
  const PHP = fs.readFileSync(PKG + "/app.php", "utf8");
  const markup = studioMarkup(PHP);
  const vc = new VirtualConsole();
  const jsErrors = [];
  vc.on("jsdomError", function (e) {
    const m = String(e.message || e);
    if (!/WebGL/i.test(m)) jsErrors.push(m);
  });
  const dom = new JSDOM("<!DOCTYPE html><html><body>" + markup + "</body></html>", {
    url: "https://houmanrgz.ir/rgz-3d-studio/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window, doc = win.document;
  win.HTMLCanvasElement.prototype.getContext = function (kind) {
    if (kind !== "2d") return null;
    const cv = this;
    return new Proxy({}, {
      get: function (t, k) {
        if (k === "canvas") return cv;
        if (k === "measureText") return function (s) { return { width: 7 * String(s).length }; };
        if (k === "getImageData") return function (x, y, w, h) {
          return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)) };
        };
        if (k === "createLinearGradient" || k === "createRadialGradient") {
          return function () { return { addColorStop: function () {} }; };
        }
        if (k === "isPointInPath") return function () { return false; };
        return function () {};
      },
      set: function () { return true; }
    });
  };
  win.RGZCAD = {
    accent: "#eb4e3c", worker: "", version: "1.0.0", units: "mm",
    ajaxUrl: "", nonce: "", hubUrl: "#", user: null
  };
  win.confirm = function () { return true; };
  const t = doc.createElement("script");
  t.textContent = fs.readFileSync(PKG + "/assets/three.min.js", "utf8");
  doc.body.appendChild(t);
  const c = doc.createElement("script");
  c.textContent = fs.readFileSync(PKG + "/assets/cad.js", "utf8");
  doc.body.appendChild(c);
  const exPath = PKG + "/assets/examples.js";
  if (fs.existsSync(exPath)) {
    const e = doc.createElement("script");
    e.textContent = fs.readFileSync(exPath, "utf8");
    doc.body.appendChild(e);
  }
  return { win, doc, jsErrors, close: function () { try { win.close(); } catch (e) {} } };
}

function afterBoot(fn, ms) {
  setTimeout(fn, ms || 450);
}

module.exports = { bootStudio, afterBoot, PKG };
