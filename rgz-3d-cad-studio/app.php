<?php
/**
 * RGZ 3D CAD Studio — app package entry (v3 "feature tree" edition).
 *
 * Feature-based parametric modeler in the browser: sketches (multi-entity,
 * on the base plane or on any flat face of the model) → pads & pockets in a
 * specification tree → edge chamfers/fillets, holes, section & measure →
 * ISO drawing + STL. Everything runs client-side; designs are stored on the
 * server only when the user explicitly saves to an RGZ account.
 *
 * Package: rgz-app.json + app.php + assets/{three.min.js, cad.css, cad.js,
 * cad-geometry-worker.js, examples.js}. No external requests are made at runtime.
 * three.js r149 is MIT-licensed (LICENSE text preserved in the file banner).
 */
if (!defined('ABSPATH')) { exit; }

final class RGZ_CAD_Studio {
    const PKG_ID  = '3d-cad-studio';
    const VERSION = '1.0.0';

    /* Register asset loading early (wp_enqueue_scripts, before wp_head) so the
       stylesheet is guaranteed to land in the <head> on every theme. */
    public static function register_hooks() {
        add_action('wp_enqueue_scripts', [__CLASS__, 'maybe_enqueue_assets']);
    }

    public static function maybe_enqueue_assets() {
        if (!is_singular()) { return; }
        $post = get_post();
        if (!$post || !has_shortcode($post->post_content, 'rgz_3d_cad_studio')) { return; }
        self::enqueue_assets();
    }

    private static function pkg_url() {
        $url = class_exists('RGZ_Mech_App_Packages') ? RGZ_Mech_App_Packages::package_url(self::PKG_ID) : plugin_dir_url(__FILE__);
        return '/' === substr($url, -1) ? $url : $url . '/';
    }
    private static function pkg_path() {
        $path = class_exists('RGZ_Mech_App_Packages') ? RGZ_Mech_App_Packages::package_path(self::PKG_ID) : plugin_dir_path(__FILE__);
        return '/' === substr($path, -1) ? $path : $path . '/';
    }

    public static function enqueue_assets() {
        $url  = self::pkg_url();
        $path = self::pkg_path();
        $ver = function ($rel) use ($path) {
            $f = $path . $rel;
            return self::VERSION . '-' . (file_exists($f) ? filemtime($f) : time());
        };

        wp_enqueue_style('rgz-cad', $url . 'assets/cad.css', [], $ver('assets/cad.css'));
        wp_enqueue_script('rgz-cad-three', $url . 'assets/three.min.js', [], $ver('assets/three.min.js'), true);
        wp_enqueue_script('rgz-cad', $url . 'assets/cad.js', ['rgz-cad-three'], $ver('assets/cad.js'), true);
        wp_enqueue_script('rgz-cad-examples', $url . 'assets/examples.js', ['rgz-cad'], $ver('assets/examples.js'), true);
        wp_localize_script('rgz-cad', 'RGZCAD', [
            'accent'   => '#eb4e3c',
            'worker'   => $url . 'assets/cad-geometry-worker.js',
            'version'  => self::VERSION,
            'units'    => 'mm',
            'ajaxUrl'  => admin_url('admin-ajax.php'),
            'nonce'    => wp_create_nonce('rgz_cad_public'),
            'hubUrl'   => home_url('/mechanical-engineering-deck/#learn-cad'),
            'user'     => null,
        ]);
    }

    public static function render_shortcode($atts = []) {
        $atts = shortcode_atts(['title' => 'RGZ 3D CAD Studio'], $atts, 'rgz_3d_cad_studio');
        self::enqueue_assets(); /* no-op if already enqueued; keeps footer scripts on any theme */

        ob_start();
        ?>
        <div class="rgzcad rgzcad-root" data-rgzcad style="--rgzc-accent:#eb4e3c">

          <!-- ================= HEADER (compact, like the other studios) ================= -->
          <header class="rgzcad-hero">
            <div class="rgzcad-hero-l">
              <svg class="rgzcad-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 21 7.5v9l-9 5-9-5v-9l9-5Z"/><path d="M12 12 21 7.5M12 12v9.5M12 12 3 7.5"/></svg>
              <div>
                <h1><?php echo esc_html($atts['title']); ?></h1>
                <p>Feature-based 3D part design — sketch, pad, pocket, fillet, drill, measure, and take home an ISO drawing and an STL. Runs in your browser, nothing to install.</p>
              </div>
            </div>
            <div class="rgzcad-hero-r">
              <span class="rgzcad-unit">mm · ISO</span>
              <button type="button" class="rgzcad-btn ghost" data-resume hidden title="Reopen the design you last worked on in this browser">↩ Resume last design</button>
              <button type="button" class="rgzcad-btn ghost" data-newdesign title="Start a new empty part (the current one stays in My designs if you saved it)">＋ New part</button>
              <button type="button" class="rgzcad-btn ghost" data-examples title="Load a predesigned plate from 100 Exercícios AutoCAD — like the ready-made circuits in Hydraulic / Pneumatic Studio">▤ Example plates</button>
              <a class="rgzcad-btn ghost" data-hub-link href="<?php echo esc_url(home_url('/mechanical-engineering-deck/#learn-cad')); ?>">📖 CAD &amp; Design course</a>
              <button type="button" class="rgzcad-btn ghost" data-account-chip>Sign in / Sign up<span data-account-sub></span></button>
              <button type="button" class="rgzcad-btn ghost" data-fullscreen title="Fullscreen">⤢ Fullscreen</button>
            </div>
          </header>

          <nav class="rgzcad-steps" data-steps aria-label="CAD workflow">
            <button type="button" data-step="sketch" class="on"><b>1</b> Sketch</button>
            <button type="button" data-step="model" disabled><b>2</b> 3D Features</button>
            <button type="button" data-step="drawing" disabled><b>3</b> ISO Drawing</button>
          </nav>

          <div class="rgzcad-work">
            <!-- ================= FEATURE TREE (specification tree, CATIA-style) ================= -->
            <aside class="rgzcad-tree" data-tree aria-label="Specification tree"></aside>

            <!-- ================= CENTER STAGE ================= -->
            <section class="rgzcad-center">
              <div class="rgzcad-bar rgzcad-modebar" data-modebar>
                <span class="grp" role="group" aria-label="Select">
                  <button type="button" data-mode="select" class="on" title="Select / move / edit what you already drew (plain mouse)">➤<i>Select</i></button>
                </span>
                <span class="grp" role="group" aria-label="Profile tools">
                  <button type="button" data-tool="line" title="Line — drag a straight segment (stays active for chaining)">╱<i>Line</i></button>
                  <button type="button" data-tool="rect" title="Rectangle — drag on the grid">▭<i>Rectangle</i></button>
                  <button type="button" data-tool="circle" title="Circle — drag from center">◯<i>Circle</i></button>
                  <button type="button" data-tool="poly" title="Free polygon — click points, close on the start point or press Enter">⬠<i>Polygon</i></button>
                  <button type="button" data-tool="ngon" title="Regular N-sided polygon — sides in the panel">⬡<i>N-gon</i></button>
                  <button type="button" data-tool="arc" title="Arc by 3 points">⌒<i>Arc</i></button>
                  <button type="button" data-tool="slot" title="Slotted (obround) profile">⌓<i>Slot</i></button>
                  <button type="button" data-tool="ellipse" title="Ellipse">⬯<i>Ellipse</i></button>
                  <button type="button" data-tool="spline" title="Spline — click control points, Enter to finish">∿<i>Spline</i></button>
                </span>
                <span class="grp" role="group" aria-label="Reference geometry">
                  <button type="button" data-tool="point" title="Point — reference/center marker (never part of the solid)">+<i>Point</i></button>
                  <button type="button" data-tool="cline" title="Construction / center line (dashed, never part of the solid)">╌<i>Centerline</i></button>
                </span>
                <span class="grp" role="group" aria-label="Operations (CATIA Operation toolbar)">
                  <button type="button" data-op2="corner" title="Corner (fillet) — two lines, or a rectangle/polygon (all corners). True circular radius, like AutoCAD FILLET.">◜<i>Corner</i></button>
                  <button type="button" data-op2="chamfer" title="Chamfer — two lines, or a rectangle/polygon (all corners), like AutoCAD CHAMFER">◺<i>Chamfer</i></button>
                  <button type="button" data-op2="trim" title="Trim — click curve 1 on the part to KEEP, then curve 2: lines, circles, rectangle/polygon edges all pair up; circles become arcs, rings open (CATIA Trim)">✂<i>Trim</i></button>
                  <button type="button" data-op2="qtrim" title="Quick Trim — ONE click erases exactly the curve piece you click (lines, circles, rectangle/polygon edges — cut at the nearest crossings)">⌦<i>Q-Trim</i></button>
                  <button type="button" data-op2="break" title="Break — click a line, circle or polygon edge to split it exactly at that point (CATIA Break)">⫶<i>Break</i></button>
                  <button type="button" data-op2="offset" title="Offset — parallel copy of the selection, click the side to offset to (CATIA Offset)">⧉<i>Offset</i></button>
                  <button type="button" data-op2="array" title="Array — rectangular or polar copies of the selection (AutoCAD ARRAY)">⿻<i>Array</i></button>
                  <button type="button" data-op2="mirror2" title="Mirror — copy the selection across the world Y or X axis (AutoCAD MIRROR)">⇋<i>Mirror</i></button>
                  <button type="button" data-op2="cons" title="Construction on/off — the selected element becomes dashed reference geometry (CATIA construction element)">◇<i>Constr.</i></button>
                </span>
                <span class="grp rgzcad-geo" role="group" aria-label="Constraints — apply to the selection (first element = reference)">
                  <button type="button" data-geo="h" title="Horizontal — selected line(s) become exactly horizontal">H<i>Horiz</i></button>
                  <button type="button" data-geo="v" title="Vertical — selected line(s) become exactly vertical">V<i>Vert</i></button>
                  <button type="button" data-geo="par" title="Parallel — later lines take the first line's angle">∥<i>Parallel</i></button>
                  <button type="button" data-geo="perp" title="Perpendicular — later lines at 90° to the first">⊥<i>Perp</i></button>
                  <button type="button" data-geo="eq" title="Equal length — later lines get the first line's length">=<i>Equal</i></button>
                  <button type="button" data-geo="coin" title="Coincident — nearest endpoints snap exactly together (connects Line-drawn shapes into closed profiles)">⇹<i>Coinc</i></button>
                  <button type="button" data-geo="con" title="Concentric — later circles take the first circle's center">◎<i>Conc</i></button>
                  <button type="button" data-geo="tan" title="Tangent — a circle against a line, a rectangle/polygon side, or another circle (first selection = fixed reference)">T<i>Tangent</i></button>
                  <button type="button" data-geo="fix" title="Fix — lock/unlock position (locked elements ignore constraints and drags)">⚿<i>Fix</i></button>
                </span>
                <span class="grp" role="group" aria-label="Features">
                  <button type="button" data-tool="hole" title="Hole (drill) — placed in the sketch, cut by every pad using it">◎<i>Hole</i></button>
                </span>
                <span class="grp" role="group" aria-label="Precision">
                  <button type="button" data-snap class="on" title="Snap to 1 mm (off = 0.1 mm)">⌗<i>Snap</i></button>
                  <button type="button" data-zoom-fit title="Fit sketch to window">⤢<i>Fit</i></button>
                  <button type="button" data-undo title="Undo (Ctrl+Z)">↶<i>Undo</i></button>
                  <button type="button" data-redo title="Redo (Ctrl+Y)">↷<i>Redo</i></button>
                  <button type="button" class="rgzcad-closebtn" data-close-profile title="Finish sketching and pad this sketch">Close sketch → Pad</button>
                </span>
              </div>

              <div class="rgzcad-bar rgzcad-makebar" data-makebar>
                <span class="cap">Make 3D · active sketch</span>
                <button type="button" data-featmk="pad" title="Pad — extrude the closed profile(s) of the active sketch into a solid (CATIA Pad)">▮<i>Pad</i></button>
                <button type="button" data-featmk="pocket" title="Pocket — cut the closed profile(s) into an existing solid (CATIA Pocket)">▱<i>Pocket</i></button>
                <button type="button" data-featmk="shaft" title="Shaft — revolve the profile about a vertical centreline drawn in the same sketch (CATIA Shaft)">↻<i>Shaft</i></button>
                <button type="button" data-featmk="groove" title="Groove — revolved cut about a vertical centreline (CATIA Groove)">⊖<i>Groove</i></button>
                <button type="button" data-featmk="rib" title="Rib — thicken an OPEN polyline into a thin web and extrude it (CATIA Rib)">═<i>Rib</i></button>
              </div>

              <div class="rgzcad-bar rgzcad-glbar" data-glbar hidden>
                <span class="grp" role="group" aria-label="Standard views">
                  <button type="button" data-view="iso" class="on" title="Isometric view">⌂ Iso</button>
                  <button type="button" data-view="front" title="Front view">Front</button>
                  <button type="button" data-view="top" title="Top view">Top</button>
                  <button type="button" data-view="right" title="Right view">Right</button>
                </span>
                <span class="grp" role="group" aria-label="Display">
                  <button type="button" data-opt="wire" title="Wireframe">▦</button>
                  <button type="button" data-opt="shadows" class="on" title="Shadows">◐</button>
                  <button type="button" data-opt="grid" class="on" title="Reference grid">⌗</button>
                  <button type="button" data-opt="ortho" title="Orthographic / perspective camera">▢ Ortho</button>
                </span>
                <span class="grp" role="group" aria-label="Inspection">
                  <button type="button" data-opt="section" title="Section view — slice the model with a plane">✂ Section</button>
                  <select data-section-axis title="Section axis" hidden><option value="x">X</option><option value="y" selected>Y</option><option value="z">Z</option></select>
                  <input type="range" data-section-pos min="0" max="100" value="50" title="Section plane position" hidden>
                  <button type="button" data-opt="measure" title="Measure — click two points on the model">📏 Measure</button>
                  <button type="button" data-tool3d="holeface" title="Drill a hole — click a flat face, then set type/depth/ISO thread/position in the Hole Definition popup">⬤ Hole on face</button>
                  <button type="button" data-tool3d="facesketch" title="Start a new sketch on a face — click a flat face">✏ Sketch on face</button>
                </span>
                <span class="grp" role="group" aria-label="Dress-up — applied to the selected feature">
                  <button type="button" data-dress="chamfer" title="Chamfer — Definition popup: size, then pick single edges or the whole rim">◺ Chamfer</button>
                  <button type="button" data-dress="fillet" title="Fillet — Definition popup: radius, then pick single edges or the whole rim">◜ Fillet</button>
                  <button type="button" data-dress="draft" title="Draft — Definition popup: wall-lean angle for mould release">∠ Draft</button>
                  <button type="button" data-dress="shell" title="Shell — Definition popup: wall thickness for a hollow body (open top)">◍ Shell</button>
                  <button type="button" data-dress="pattern" title="Pattern — Definition popup: rectangular/circular repeat of the selected feature">⿻ Pattern</button>
                  <button type="button" data-dress="mirror" title="Mirror — Definition popup: mirror the whole part about a plane">⇋ Mirror</button>
                </span>
                <span class="grp" role="group">
                  <button type="button" data-fit title="Fit model to window">⤢ Fit</button>
                  <button type="button" data-fullscreen title="Fullscreen mode">⛶ Fullscreen</button>
                </span>
                <span class="hint">LMB orbit · RMB pan · wheel zoom · F fit · ◺/◜ = pick the exact edges to dress</span>
              </div>

              <div class="rgzcad-viewport-wrap">
              <div class="rgzcad-viewport" data-viewport>
                <canvas data-sketch-canvas aria-label="2D sketch canvas"></canvas>
                <div class="rgzcad-gl" data-gl>
                  <div class="rgzcad-webglnote" data-webgl-fail hidden>
                    <b>The live 3D preview could not start on this device.</b>
                    <span>Don't worry — sketching, the feature tree and the ISO drawing still work. For the live 3D view, open this page in a current browser (Chrome, Edge, Firefox or Safari) and make sure graphics acceleration is not disabled in its settings.</span>
                    <button type="button" class="rgzcad-btn ghost" data-gl-retry>↻ Try again</button>
                  </div>
                </div>
                <div class="rgzcad-sheet" data-sheet></div>
                <div class="rgzcad-measuretag" data-measure-tag hidden></div>
                <div class="rgzcad-planehint" data-planehint hidden><b>Start here — pick a datum plane for your sketch.</b><br>Click the <span class="c-xy">XY</span> (flat), <span class="c-xz">XZ</span> or <span class="c-yz">YZ</span> plane — the sketch is added to the tree and the 2D editor opens. Drag to orbit, wheel to zoom.</div>
                <div class="rgzcad-facehint" data-facehint hidden>✏ <b>Sketch on face:</b> click a flat face of the model (Esc to cancel)</div>
                <div class="rgzcad-facehint rgzcad-edgehint" data-edgehint hidden>◜ <b>Edge round:</b> click the vertical edges of the pad (Esc to finish)</div>
                <div class="rgzcad-sketchhint" data-sketchhint></div>
              </div>
              </div>

              <div class="rgzcad-notelink"><span class="rgzcad-stagenote" data-stagenote></span></div>
            </section>

            <!-- ================= PROPERTIES / CONTEXT PANEL ================= -->
            <aside class="rgzcad-panel" data-panel></aside>
          </div>

          <!-- ================= ACCOUNT / DESIGNS OVERLAYS ================= -->
          <div class="rgzcad-modal" data-auth-modal hidden>
            <div class="rgzcad-modal-card">
              <button type="button" class="rgzcad-x" data-auth-close aria-label="Close">×</button>
              <h3 data-auth-title>Sign in to RGZ 3D Studio</h3>
              <p class="sub">Save your designs to your account and open them from any device — the same sign-in as the Hydraulic/Pneumatic studios.</p>
              <div class="rgzcad-auth-body" data-auth-body></div>
              <div class="rgzcad-auth-err" data-auth-err role="alert"></div>
            </div>
          </div>

          <div class="rgzcad-modal" data-designs-modal hidden>
            <div class="rgzcad-modal-card wide">
              <button type="button" class="rgzcad-x" data-designs-close aria-label="Close">×</button>
              <h3>My 3D designs</h3>
              <p class="sub">Saved to your account on houmanrgz.ir — click one to load it.</p>
              <div class="rgzcad-designs-body" data-designs-body></div>
            </div>
          </div>

          <input type="file" data-open-file accept=".json,application/json" hidden>
        </div>
        <?php
        return ob_get_clean();
    }
}

RGZ_CAD_Studio::register_hooks();
/* Register the shortcode from the package itself so the page never falls
   back to printing [rgz_3d_cad_studio] as plain text if the installer
   skipped auto-registration (overwrite / already-defined class). */
if (!shortcode_exists('rgz_3d_cad_studio')) {
    add_shortcode('rgz_3d_cad_studio', ['RGZ_CAD_Studio', 'render_shortcode']);
}
