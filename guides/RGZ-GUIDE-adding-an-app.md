# Adding a New App to the RGZ Mechanical Deck — User Guide

**For:** the site owner (Houman) · **No programming required**
**Plugin:** RGZ Engineering Studio v1.0.0 · **Site:** houmanrgz.ir
**Where:** WP Admin → **RGZ Engineering Studio → Mechanical Deck → Apps**

---

## 1. How apps work on this site

An app on the Mechanical Deck is made of **two connected parts**:

1. **The app package** — one `.zip` file the programmer sends you (e.g. a Mechatronics Studio). It contains the whole app **including its own shortcode, chosen by the programmer** — e.g. `[rgz_mechatronics_studio]`. You upload this zip inside the plugin (once), and the plugin activates the shortcode sitewide.
2. **The deck card** — the tile on the *Mechanical Engineering Deck* landing page. The plugin **creates it automatically** from the package (title, description, icon, accent, category) and **links it automatically** to the page where you place the shortcode. You can restyle it any time, point-and-click.

> **The flow in one sentence:** developer sends a zip → you install it → you create a page with its shortcode → the card appears on the deck and opens that page.

Your two existing apps (Hydraulic / Pneumatic Studio) are built into the plugin itself — everything below is for adding **the next ones**.

---

## 2. Installing a developer's app package — the main recipe (≈ 3 minutes)

1. **Ask the programmer for the package.** Tell them: *"Read `docs/APP-DEVELOPMENT-GUIDE.md` inside the RGZ Engineering Studio plugin and build me an app package — start from `docs/app-package-template.zip`. Choose your shortcode yourself."* They hand you back **one .zip file**.
2. **Upload it.** WP Admin → *RGZ Engineering Studio → Mechanical Deck* → **Apps** tab → scroll to **Install app package (.zip)** → choose the file → press **Install package**.
   - Updating the same app later? Tick **Overwrite** and install again — the new files replace the old.
3. **Read the result.** Green notice = installed. Under **Installed app packages** you now see the app with:
   - its **shortcode** (e.g. `[rgz_mechatronics_demo]`) with a **Copy** button,
   - a **status badge** — must be green **ok**,
   - the **App page** column — until step 4 it says *"create a page with […]"*.
4. **Create the app page.** WordPress → Pages → **Add New** → title it (e.g. "Mechatronics Studio") → paste the shortcode → **Publish**. *The deck card now links itself to this page automatically — you never paste a URL for packages.*
5. **Check like a visitor** (incognito): the card is on the deck; **Open app →** opens your page; the app runs. Done.

> Want a different title, icon, accent or category for the card? It also appears as a row in the app list — click it, restyle, flip Enabled on/off, **Save apps**. Your copy wins over the package defaults.

---

## 3. What gets installed where (and what survives updates)

- Package files live in `wp-content/uploads/rgz-apps/<app-id>/` — **outside** the plugin folder, so updating/re-installing the RGZ plugin never deletes your apps.
- The plugin activates the package's shortcode on every page load — if you ever visit *Installed app packages* and see status **error** or **warning**, the badge explains why; the rest of the site is unaffected (a broken app can never take the site down).
- **Remove** link next to a package deletes its files, its shortcode and its deck card. If you had customized the card, delete that row too.
- Package zips are max **5 MB**. For big media (videos, PDFs), the developer should reference files you upload normally into the Media Library.

---

## 4. Adding a simple card without a programmer (link cards)

For apps that are just **a page you already have** (or an external tool), you don't need a package:

1. *Mechanical Deck → Apps* → press **＋ Add app** (or **＋ Add app (starter template)** for a pre-filled example).
2. Fill title, description, category, icon, accent, optional badge.
3. Paste the page URL into **App URL**, optionally pick a **Learning hub topic**, switch **Enabled** on.
4. **Save apps**. Reorder by drag & drop.

Cards without a URL show a grey **"Coming soon"** button — perfect for preparing the roadmap of the next 10+ apps while **Enabled** is off (invisible to visitors).

---

## 5. Field reference (card editor)

| Field | Rules | Visitor-visible effect |
|---|---|---|
| **App ID** | lowercase, digits, dashes; unique | internal identity (dedupe, exports) |
| **Title** | any language (Persian OK) | card headline |
| **Description** | 1–2 sentences | card body |
| **Category** | pick or type new | filter chip + small badge |
| **Icon** | one of 17 built-in icons (programmers can add more) | round icon, top-left |
| **Accent** | `#rrggbb` | icon tint, card hover glow |
| **Badge** | short text, optional | second pill ("New", "Beta") |
| **App URL** | full `https://…`; **auto-filled for packages** | **Open app →** / "Coming soon" |
| **Learning hub topic** | Hydraulics / Pneumatics / General (+ custom via code) | **📖 Learning** button → Learn tab filtered |
| **Enabled** | on/off | off = hidden from visitors |

**Icon keys:** `hydraulic` (droplet) · `pneumatic` · `gear` · `electric` · `motor` · `pump` · `valve` · `cylinder` · `gauge` · `robot` · `thermal` · `cad` · `wrench` · `book` · `flow` · `spring` · `generic`.

---

## 6. Learning content for the new app

1. *RGZ Engineering Studio → Learning Hub* → **＋ New lesson** — until the app has its own topic, file under **General** and link the card to *General topics*.
2. A programmer can register a dedicated topic (e.g. `mechatronics`) via the `rgz_deck_learn_topics` hook (one line, in the development guide) — then it appears in the lesson editor, the topic chips and the card dropdown automatically.
3. Lesson figures support the same media as the factory library: ISO 1219 SVG schematics, photos and animated GIF loops from `assets/learn/`.

---

## 7. Backup, move, restore

- **Before big changes:** *Mechanical Deck → Data → Export deck (JSON)* — settings, all cards, all lessons in one file. (App *packages* are files + registry; back them up by downloading `uploads/rgz-apps/`.)
- **Restore:** *Data → Import deck* replaces settings/cards/lessons from a previous export.
- **Reset to defaults** restores the two factory studios + factory lessons. It does **not** touch installed packages or app pages.

---

## 8. Troubleshooting the installer

| Message / symptom | What it means & what to do |
|---|---|
| *"A package with this ID is already installed"* | tick **Overwrite** if this is an update of the same app; otherwise ask the developer for a different `id`. |
| *"Shortcode […] is already in use"* | the developer chose a shortcode that already exists on the site (another package, a plugin, or a built-in one) — they must pick another, re-zip, resend. |
| *"Invalid rgz-app.json: …"* | the manifest inside the zip is malformed — the quoted reason says exactly which field; forward it to the developer. |
| *"rgz-app.json was not found"* | the zip has the wrong layout — manifest must sit at zip root (or in its single top folder). Developer re-zips correctly. |
| *"The entry file crashed when loaded: …"* | the developer's PHP has a fatal error — the message names it; send it back to them. **Your site was never at risk** — nothing was activated. |
| *"Unsafe path inside the ZIP"* | tampered/sloppy zip (paths like `../x.php`) — rejected on purpose; ask for a clean package. |
| *"Please upload a .zip"* / *"larger than 5 MB"* | wrong file type or too big — see §3 note about media. |
| Card says **"Coming soon"** after install | you haven't created the page with the shortcode yet (step 4) — or the page is still a draft/trashed. |
| Status badge is red **error** / amber **warning** | hover the message: usually a missing/crashed entry file or no render function. Only that app is affected; ask the developer for a fixed zip and re-install with Overwrite. |
| Everything saved but the site looks old | LiteSpeed/browser cache → hard refresh (Ctrl+F5) and purge LiteSpeed cache. |

---

## 9. FAQ

- **Who chooses the shortcode — me or the programmer?** The programmer, inside the package. After installing, you simply copy it from the *Installed app packages* table into a new page. If you want a different one, the programmer changes it in the manifest and you re-install (shortcode names must stay unique on the site).
- **Can several packages be installed?** Yes — each gets its row, its shortcode, its card.
- **Do packages slow the site down?** Their code loads on every request like any plugin; a reasonable number of well-written apps is fine.
- **Is installing a zip safe?** The installer validates the manifest, blocks unsafe paths, test-loads the PHP before activation and blocks direct web execution of package PHP. Still: only install packages from developers you trust — same trust level as installing any WordPress plugin.
- **What about simple external links?** Use ＋ Add app (§4) — no package needed.

---

## 10. Handing work to a programmer (copy-paste brief)

> *"Please build my app as an **RGZ app package** for the RGZ Engineering Studio plugin (v1.0.0). Read `docs/APP-DEVELOPMENT-GUIDE.md` in the plugin and start from `docs/app-package-template.zip`. Choose the shortcode yourself and declare it in `rgz-app.json`. Deliverable: ONE .zip I can install in WP Admin → RGZ Engineering Studio → Mechanical Deck → Apps. My app is: …(describe what it does)… Branding: title '…', category '…', accent '#…', icon '…'."*

When the zip comes back: **§2** — two minutes, done.
