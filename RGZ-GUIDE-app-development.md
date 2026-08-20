# RGZ Engineering Studio — App Development Guide

**Audience:** programmers and AI agents building a **new full app** for the RGZ Mechanical Deck
(something on the level of the existing Hydraulic Studio / Pneumatic Studio).
**Plugin:** RGZ Engineering Studio **v1.0.0** — the version string stays `1.0.0` everywhere, do not bump it.
**Site:** houmanrgz.ir (WordPress + LiteSpeed cache) · accent `#EB4E3C` · plugin UI English.

> **TL;DR — the app package contract:** You deliver **one .zip** containing `rgz-app.json`
> (manifest, with **a shortcode you choose**) plus `app.php` (entry). The site owner uploads it
> in *RGZ Engineering Studio → Mechanical Deck → Apps → Install app package*. The plugin installs it to
> `uploads/rgz-apps/<id>/`, **registers your shortcode automatically**, creates the deck card and
> links it to the page where the owner pastes `[your_shortcode]`. Start from
> `docs/app-package-template.zip` and you'll be done in an afternoon.

---

## 1. Repository / file map

Shipped plugin folder (`wp-content/plugins/rgz-engineering-studio/`):

| File | Responsibility |
|---|---|
| `rgz-engineering-studio.php` | Bootstrap: menu, the two factory studios (`RGZ_Hydraulic_Studio_Plugin`, `RGZ_Pneumatic_Studio_Plugin`) — read these for house style. Requires the deck + packages files and boots them. |
| `rgz-mechanical-deck.php` | `RGZ_Mechanical_Deck` — deck landing `[rgz_mechanical_deck]`, learning hub `[rgz_learning_hub]`, app-card registry (admin editor, **package-card merge** in `get_apps()`), guided tours, profile/designs/progress AJAX, `rgz_deck_*` hooks, lesson KSES allow-list. |
| `rgz-app-packages.php` | `RGZ_Mech_App_Packages` — **the installer/loader you are targeting**: manifest validation, safe zip extraction, runtime loader + shortcode auto-registration, package deck cards, admin manager UI, uninstall. |
| `rgz-learning-library.php` | 275+ factory lessons + inline-SVG figure engine + GIF map. |
| `assets/app.min.js` (+ `app.css`) | The two studios' shared engine — **do not edit the minified file** (master source workflow, §8). Your own app ships its own assets inside its package. |
| `assets/deck.css/js`, `assets/admin-deck.css/js` | Deck front-end + admin screens. |
| `assets/learn/` | Learning media: `fig-*.svg` (ISO 1219-1), `photo-*.jpg`, `anim-*.gif`, `cov-*.svg`. |
| `docs/ADDING-AN-APP.md` · `docs/APP-DEVELOPMENT-GUIDE.md` | Owner guide · this file. |
| `docs/app-package-template/` + `docs/app-package-template.zip` | Your scaffold — a complete, working, installable demo package. |

Dev workspace (Arena session workspace, persists across sessions): the ship tree at
`/home/user/work/extracted/rgz-engineering-studio/`, test harness `/home/user/work/harness/`,
master JS `/home/user/work/app-formatted.js` (+ `solver.js`, `sync-solver.cjs`),
deliverable zip `/home/user/rgz-engineering-studio.zip`, changelog `/home/user/CHANGELOG-rgz-engineering-studio.md`.

---

## 2. The app package format (your primary contract)

### 2.1 Zip layout

```
your-app.zip
├── rgz-app.json      ← manifest, REQUIRED (zip root or the single top-level folder)
├── app.php           ← entry file, REQUIRED (root; name from manifest "entry")
├── style.css         ← your assets (any structure you like)
├── app.js
└── assets/…
```

Rules enforced by the installer (violations = clean rejection with a message to the owner):

- Zip ≤ **5 MB**, ≤ **200 files**, ≤ **20 MB** unpacked; no `..`/absolute paths; PHP ≤ those limits.
- The manifest must validate (below) and the entry file must exist and **load without errors**
  (the installer test-includes it in a sandboxed `include` — parse errors / crashes reject the install).
- Shortcode must be **free** (not used by another package, plugin, or core) and not in the reserved list.
- Installing an existing `id` requires the owner's **Overwrite** checkbox (that is your update channel).

### 2.2 `rgz-app.json` reference

```jsonc
{
  "id": "mechatronics-demo",          // REQUIRED. 2–49 chars a-z 0-9 dash. = install folder name.
  "name": "Mechatronics Demo",        // REQUIRED. ≤ 80 chars. Shown in the admin packages table.
  "version": "1.0.0",                 // x.y.z — project rule: 1.0.0
  "author": "You",                    // optional, any extra keys are ignored
  "shortcode": "rgz_mechatronics_demo", // REQUIRED. YOU choose it: 3–40 chars a-z 0-9 _.
  "entry": "app.php",                 // REQUIRED. A .php filename in the package root (no folders).
  "class": "RGZ_Mechatronics_Demo",   // optional — see auto-registration below
  "render": "render_shortcode",       // optional — static class method OR plain function name
  "card": {                           // optional deck-card seed (owner can override later)
    "title": "Mechatronics Demo",
    "desc": "One or two sentences shown on the card.",
    "category": "Mechanics",          // new names become filter chips automatically
    "icon": "gear",                   // see icon keys in the owner guide; add your own via rgz_deck_icons
    "accent": "#f59e0b",
    "badge": "Demo",
    "learnTopic": ""                  // '', 'hydraulics', 'pneumatics', 'general' or your rgz_deck_learn_topics key
  }
}
```

**Shortcode choice:** pick something short, namespaced and stable — `rgz_<subject>_<thing>` works well
(`rgz_mechatronics_studio`, `rgz_gear_designer`). Reserved: `rgz_hydraulic_studio`, `rgz_pneumatic_studio`,
`rgz_mechanical_deck`, `rgz_learning_hub`, `gallery`, `caption`, `embed`, `video`, `audio`, `playlist`, `code`.
Validation is in `RGZ_Mech_App_Packages::validate_manifest()` — read it if your manifest is rejected.

### 2.3 Entry file contract (`app.php`)

```php
<?php
if (!defined('ABSPATH')) { exit; }        // REQUIRED first line — direct-web guard

final class RGZ_Mechatronics_Demo {
    public static function render_shortcode($atts = []) {   // shortcode callbacks RETURN, never echo
        // enqueue your assets (see 2.5), print your app shell…
        return '<div class="myapp" id="myapp-root">…</div>';
    }
}
```

- The plugin **auto-registers `[shortcode]`** after including your entry, in this order:
  1. `class` + `render` both set and `method_exists` → `add_shortcode($sc, [Class, method])`
  2. else `render` set and `function_exists` → `add_shortcode($sc, 'function_name')`
  3. else it assumes your entry file registered the shortcode itself; if it didn't, the admin shows a **warning** badge (and your card still installs).
- Your entry file is **included on every request** (front and admin) at plugin-bootstrap time — that makes
  `add_action`/`add_filter` calls in it work normally (`wp_ajax_*`, `init`, `plugins_loaded`-later hooks…).
  Keep top-level side effects to hook registration; do heavy work inside callbacks.
- **Naming discipline:** prefix ALL classes, functions, handles, option names, nonces and AJAX actions with your app id
  (e.g. `rgzm_`) to avoid collisions with the core plugin and other packages.
- Your class is only in memory after your entry loads — the loader guards with `method_exists`, no fatals.

### 2.4 Runtime model & safety

- Installed files live in `wp-content/uploads/rgz-apps/<id>/` — **they survive plugin updates**.
- `.htaccess` (`<FilesMatch "\.php$"> Require all denied`) blocks direct web execution where honored;
  your `ABSPATH` guard covers the rest. Package PHP is only ever `include`d by WordPress.
- The loader wraps includes in `try/catch(\Throwable)` — a runtime problem in your file becomes a red
  admin badge with your error message; **it cannot white-screen the site**. The deck card auto-disables while
  a package is in `error` state.
- Status shown to the owner: `ok` · `warning` (shortcode not registered / no renderer) · `error` (missing/crashed entry).
- The deck card URL **auto-detects** the published page containing your shortcode (scans up to 20 pages,
  `has_shortcode`) — if none exists yet, the card shows "Coming soon" until the owner publishes the page.
- Removal deletes files + registry + card.

### 2.5 Assets inside a package

Use the loader's URL/path helpers (they resolve the uploads folder for you):

```php
$path = RGZ_Mech_App_Packages::package_path('mechatronics-demo'); // /…/uploads/rgz-apps/mechatronics-demo/
$url  = RGZ_Mech_App_Packages::package_url('mechatronics-demo');  // https://…/uploads/rgz-apps/mechatronics-demo/
if (file_exists($path . 'app.css')) {
    wp_enqueue_style('rgzm-app', $url . 'app.css', [], '1.0.0-' . filemtime($path . 'app.css'));
}
```

Cache-bust with `'1.0.0-' . filemtime(...)` exactly like the core plugin does. **No CDN/external requests at runtime.**

### 2.6 Building & delivering

```bash
# edit manifest + app.php (+ assets), then:
cd your-app-folder && zip -r ../your-app.zip . && cd ..
# deliver that your-app.zip to the site owner (they install it in Mechanical Deck → Apps)
# try it yourself first on any WordPress dev site with the RGZ plugin installed —
# the template package installs as-is and is a working reference app.
```

Hand-over checklist for the owner: zip installs green → they see your shortcode in *Installed app packages* →
they create a page with it → the deck card links itself. Also tell them your preferred card branding
(title/desc/category/icon/accent) if the manifest card should be changed.

---

## 3. Optional deeper integrations

Everything below is optional — a plain shortcode app already works. These hooks (all in
`RGZ_Mechanical_Deck`, standard WP filter semantics) let you blend into the deck more deeply,
e.g. from a **must-use plugin or the theme** (they do not belong inside a package, but your package may
also use them if its app needs them):

| Hook | Args | Use it to |
|---|---|---|
| `rgz_deck_apps` | `($apps)` | register/override deck cards in code (deduped by `id`; admin-edited copy wins). Packages already create cards — this is for code-first integrations. |
| `rgz_deck_app_categories` | `($cats)` | add category names. |
| `rgz_deck_icons` | `($icons)` | add SVG icon keys (accepted by the editor picker and the save validation). |
| `rgz_deck_learn_topics` | `($topics)` | register a Learning topic for your app (`$t['mechatronics'] = 'Mechatronics';`) — flows into the lesson sanitizer, card dropdown and hub chips. |
| `rgz_deck_topic_accents` | `($accents)` | per-topic accent colors (fallback `#a78bfa`). |
| `rgz_deck_tour_enabled` | `($on, $app)` | expose a tour switch for your app key. |
| `rgz_deck_tour_text` | `($text, $app)` | supply your tour welcome text. |
| `rgz_deck_profile_designs` | `($out, $identity, $with_thumbs)` | merge your app's saved designs into the deck profile modal (item shape `{id,name,size,date,open,thumb?}`, your own top-level key). |

**House patterns worth copying** (all visible in `rgz-engineering-studio.php` / `rgz-mechanical-deck.php`):

- assets versioned `VERSION . '-' . filemtime($file)`; Page auto-detection via `get_posts` + `has_shortcode`
  (see `FGZ_Hydraulic_Studio_Plugin::studio_url()`);
- account tokens: `base64url(payload) . '.' . hash_hmac('sha256', payload, wp_salt('auth') . $secret)` —
  the deck's `decode_studio_token()` understands exactly that shape, so apps using it plug into the
  unified visitor profile for free;
- AJAX: nonce always, both `wp_ajax_` + `wp_ajax_nopriv_`, `wp_send_json_success/error`;
- sanitization matrix: `sanitize_key` / `sanitize_text_field` / `sanitize_textarea_field` / `esc_url_raw` /
  `sanitize_hex_color` / `absint` and `esc_*` at output; PRG redirect after every POST;
- deck look reuse: `.rgzd` scope, `--rgzd-accent`, `.rgzd-btn`, `.rgzd-badge` — restyle only inside your own prefix.

---

## 4. Coding rules (non-negotiable)

1. Version `1.0.0` everywhere. 2. PHP 7.4+ syntax, WordPress 5.8+ APIs only. 3. No external requests/assets at runtime.
4. ABSPATH guard first line of every PHP file in a package. 5. Prefix all global symbols. 6. Escape everything at output; nonces on every state change.
7. Shortcode callbacks return markup. 8. Never edit the core plugin — packages integrate via their own files (+ hooks above). If a genuinely new *core* hook is needed, add it beside the existing ones in `rgz-mechanical-deck.php`, document it in §3 and cover it in `test-wp.js`.
9. Keep UI strings English. 10. Append a `**Update N:**` block to `/home/user/CHANGELOG-rgz-engineering-studio.md` when working inside the monorepo.

---

## 5. Test & ship workflow (for work inside the core plugin)

```bash
cd /home/user/work/harness
npm install --no-fund --no-audit --silent jsdom@24 php-parser @resvg/resvg-js @php-wasm/node@1.0.13 \
  && ln -sfn node/asyncify node_modules/@php-wasm/nodeasyncify   # if node_modules was wiped

node harness/lint-php.js extracted/rgz-engineering-studio/rgz-app-packages.php    # PHP lint (php-parser)
node harness/test-wp.js            # php-wasm + WP stubs — full integration suite, expect ALL PASS
#   The suite includes the package flow end-to-end: manifest validation, loader with a real
#   package, deck-card merge + admin-override, and the upload handler driven with real zips
#   (ZipArchive is available in the php-wasm runtime). RGZ_PKG_TEST replaces exit() with a
#   catchable __REDIRECT__ so several install scenarios run in one request.
node harness/test-deck.js && node harness/test-deck-e2e.js   # if deck.js/css or render_deck() changed

# package the plugin for the site:
cd /home/user/work/extracted && rm -f /home/user/rgz-engineering-studio.zip \
  && zip -r -X -q /home/user/rgz-engineering-studio.zip rgz-engineering-studio
# if assets/app.min.js changed: rebuild from /home/user/work/app-formatted.js via esbuild and
# re-run the whole JS battery (test-solver 102, test-charts 41, test-varload-ui 28, …) as documented in the changelog.
```

---

## 6. Acceptance checklist for a new app

- [ ] `rgz-app.json` passes every rule in §2.2; shortcode is free, namespaced, final.
- [ ] Template-derived package installs green on a dev site; packages table shows **status ok**.
- [ ] Page with `[your_shortcode]` renders the app (incognito), no console errors, works at 360 px.
- [ ] Deck card: correct title/icon/accent/category; **Open app →** auto-links the page; *📖 Learning* correct if linked.
- [ ] Assets loaded from the package folder, filemtime-versioned; zero external network calls (DevTools → Network).
- [ ] Re-install with Overwrite swaps files cleanly; Remove deletes files + card.
- [ ] Broken-PHP sanity: temporarily introduce a syntax error in a copy → installer rejects with your message (site never breaks).
- [ ] If using accounts/designs/tours: token shape per §3, `rgz_deck_profile_designs` items shaped `{id,name,size,date,open,thumb?}`, `#rgz-open=<id>` honored.
- [ ] (Core changes only) `node harness/test-wp.js` ALL PASS, zip rebuilt + md5-verified, changelog appended.

---

## 7. Quick grep cheat-sheet

| You need… | Look at |
|---|---|
| Manifest rules | `RGZ_Mech_App_Packages::validate_manifest()` |
| Shortcode auto-registration | `::load_apps()` in `rgz-app-packages.php` |
| Install steps & safety checks | `::handle_upload()` |
| Package → deck card | `::deck_cards()` + merge point in `RGZ_Mechanical_Deck::get_apps()` |
| Admin manager UI (upload form, table) | `::render_manager()` (rendered in *Mechanical Deck → Apps*) |
| House studio anatomy | `RGZ_Hydraulic_Studio_Plugin` (`init()`, `render_shortcode()`, `studio_url()`, AJAX block) |
| Token validation | `RGZ_Mechanical_Deck::decode_studio_token()` / `request_identity()` |
| Lesson HTML allow-list | `rgz_deck_kses_lesson()` |
| PHP integration harness | `/home/user/work/harness/test-wp.js` (functional filter stubs + package e2e blocks) |

---

### Final note for AI agents

The default deliverable is **one zip that installs green** — nothing else. Contracts live in
`validate_manifest()`, `load_apps()`, and the template package; read those before inventing anything.
Keep the owner's experience in mind: they never see your code — they see an upload box, a shortcode with a
Copy button, a green badge, and a card on their deck.
