/**
 * FlutterSemanticsDriver — the single Flutter-web automation bridge.
 *
 * app.banzami.com is a Flutter CanvasKit app: it paints to a canvas and exposes
 * NO ordinary DOM for its widgets. Automation goes through Flutter's on-demand
 * accessibility (Semantics) tree. Everything peculiar about driving Flutter web
 * is encoded here ONCE — page objects use these primitives and never re-derive
 * them (FLUTTER_TEXT_FIELD_AUTOMATION_HELPER=ONE, FLUTTER_SEMANTICS_ACTIVATION).
 *
 * The three non-obvious facts this encapsulates:
 *
 *  1. Semantics is off until requested. Flutter mounts a hidden
 *     <flt-semantics-placeholder aria-label="Enable accessibility"> positioned
 *     OUTSIDE the viewport, so a normal click never lands. We activate it with a
 *     dispatched click event, then confirm <flt-semantics-host> exists.
 *
 *  2. Buttons are <flt-semantics role="button"> whose accessible name is the
 *     node's text (aria-label is usually empty). getByRole/getByText resolve them.
 *
 *  3. Text fields expose a DISABLED <input data-semantics-role="text-field"> as a
 *     read-only screen-reader proxy — you cannot type into it. The REAL editable
 *     is a separate, enabled <input> that Flutter focuses only after a pointer
 *     activation on the field. So we derive the field's live bounding box FROM
 *     its semantics node (semantics-anchored, never a fixed coordinate), click
 *     its centre, wait for the enabled editable, type with real key events, and
 *     verify the value landed.
 *
 * No fixed screen coordinates anywhere (CANONICAL_E2E_FIXED_COORDINATE_ACTIONS=0):
 * every pointer interaction derives its point from a live semantics boundingBox.
 */

const PLACEHOLDER = 'flt-semantics-placeholder[aria-label="Enable accessibility"]';

/* ── the two budgets, kept apart on purpose ──────────────────────────────────
 *
 * Starting the Flutter engine and activating its semantics tree are different
 * things that fail for different reasons, and they used to share one 20 s
 * budget: enableSemantics() dispatched clicks at a placeholder that did not
 * exist yet, and spent the whole allowance waiting for the engine. Under the
 * FULL run — measurably 1.4x to 2.2x slower than GOLDEN — three journeys died
 * that way, reporting "no flt-semantics nodes after enabling" as though
 * activation had been refused.
 *
 * The fix is not a longer timeout. A single 60 s budget would hide the state
 * machine instead of repairing it, and would still report the wrong phase.
 *
 * Measured against the deployed app on 2026-09-19:
 *
 *   domcontentloaded → flutter-view      1130-1600 ms
 *   flutter-view → placeholder               4-11 ms
 *   activation → first flt-semantics       204-217 ms
 *
 * So activation is a fifth of a second once the engine is up, and the engine
 * is what takes time. Sizing them separately means a slow machine spends its
 * slowness where the slowness is.
 */
const ENGINE_BUDGET_MS = 40_000;
const ACTIVATION_BUDGET_MS = 20_000;

/**
 * A timeout that says WHICH phase ran out. `phase` is machine-readable, and
 * `timing` carries the measurement that was in flight when it expired — a
 * timeout whose evidence dies with it forces the next reader to reproduce the
 * failure before they can even describe it.
 */
export class DriverPhaseTimeout extends Error {
  constructor(phase, label, detail, timing = null) {
    super(`${label}: ${phase} — ${detail}`);
    this.name = 'DriverPhaseTimeout';
    this.phase = phase;
    this.timing = timing;
  }
}

export class FlutterSemanticsDriver {
  constructor(page, { label = 'flutter' } = {}) {
    this.page = page;
    this.label = label;
    /** Filled by waitForEngine/enableSemantics. Read through `timing`. */
    this.engineReadyMs = null;
    this.semanticsReadyMs = null;
    /** Activation forensics, kept whether activation succeeds or times out. */
    this.semanticsDispatches = 0;
    this.semanticsElapsedMs = null;
    this.timeoutPhase = null;
    this.timeoutBoundMs = null;
  }

  /**
   * Did the APPLICATION boot? Structure only — no accessibility involved.
   *
   * S05-LNK-001 failed `APP_BOOTS_ON_DEEPLINK` and `APP_NO_BLANK_SCREEN` in
   * BZV-20260920-0001, and both were derived from the semantics tree. The app
   * had in fact booted and painted; what was late was accessibility
   * activation. Two assertions named after the product reported a fault in the
   * instrument — the same class as `(a ?? 0) - (b ?? 0)` reporting that a
   * consumer was debited 0.
   *
   * The boot signal is the engine's own mount: <flutter-view> containing a
   * <flt-glass-pane> whose shadow root holds the scene host it paints into.
   *
   * It WAITS, because the mount is genuinely later than engine-ready: measured
   * on this build, waitForEngine() returns while <body> holds only the
   * placeholder, the announcement host and a script — flutter-view appears
   * afterwards. The placeholder is the right signal for activation, which
   * dispatches at it, and the wrong one for boot. Sampling boot at that
   * instant reports false for an application that is booting normally.
   */
  async appBooted({ timeout = 25_000, every = 100 } = {}) {
    const t0 = Date.now();
    const read = () => this.page.evaluate(() => {
      const view = document.querySelector('flutter-view');
      const pane = document.querySelector('flt-glass-pane');
      const shadow = pane?.shadowRoot ?? null;
      const scene = shadow?.querySelector('flt-scene-host') ?? null;
      const r = view?.getBoundingClientRect?.() ?? null;
      return {
        booted: Boolean(view && pane && shadow && scene && r && r.width > 0 && r.height > 0),
        flutterView: !!view, glassPane: !!pane, shadowRoot: !!shadow, sceneHost: !!scene,
        viewW: r ? Math.round(r.width) : 0, viewH: r ? Math.round(r.height) : 0,
      };
    });
    let state = await read();
    while (!state.booted && Date.now() - t0 < timeout) {
      await this.page.waitForTimeout(every);
      state = await read();
    }
    this.appBootMs = Date.now() - t0;
    return { ...state, ms: this.appBootMs, bound_ms: timeout };
  }

  /**
   * Is anything actually PAINTED? Pixels, because nothing else can answer it.
   *
   * This build paints through a surface that is not a DOM canvas: with
   * semantics off, the scene host is empty, body text is 0 characters and
   * there is no <canvas> anywhere in the document — while the viewport shows a
   * complete screen. So DOM inspection cannot distinguish "rendered" from
   * "blank", and a screenshot can: a blank screen is one flat colour.
   *
   * THE CONTRACT, stated exactly: the rendered frame differs materially from a
   * uniform, unpainted surface, under a calibrated VISUAL-COMPLEXITY
   * threshold. It is not a colour count and not a non-white pixel count — the
   * measurement is the compressed size of a LOSSLESS frame per pixel, and PNG
   * encodes a flat field to almost nothing whatever colour it is.
   *
   * An earlier draft of this comment called it a colour count. It never was,
   * and naming a proxy after the thing it approximates is how a proxy stops
   * being questioned.
   *
   * Calibrated at 1280×720 rather than assumed — an earlier version of this
   * method counted distinct bytes of the compressed stream, which is not a
   * colour count at all, and reported a screen as painted before the app had
   * mounted:
   *
   *   about:blank              0.0047 bytes/pixel
   *   flat white page          0.0047
   *   flat #B5101F page        0.0047   ← colour does not move it
   *   app, before first paint  0.0047
   *   app, painted             0.1184   ← 25× clear of every flat frame
   *
   * The threshold sits 4× above every flat frame measured and ~6× below the
   * painted one. Dimensions come from the PNG's own IHDR, so the ratio does
   * not silently change with the viewport.
   *
   * Deliberately coarse. It proves NOT-BLANK, which is what the assertion
   * claims — it does not claim the RIGHT screen was drawn, and must not be
   * used as if it did.
   */
  async renderedPixels({ minBytesPerPixel = 0.02 } = {}) {
    const png = await this.page.screenshot({ type: 'png' });
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    const perPixel = w && h ? png.length / (w * h) : 0;
    return {
      width: w, height: h, bytes: png.length,
      bytesPerPixel: Number(perPixel.toFixed(4)),
      threshold: minBytesPerPixel,
      painted: perPixel >= minBytesPerPixel,
    };
  }

  /**
   * Wait until the engine is ready FOR THE THING WE ARE ABOUT TO DO.
   *
   * The authoritative signal is the accessibility placeholder, because that is
   * what activation dispatches against — or an already-populated semantics
   * tree, which means activation already happened. The previous signal was
   * `flutter-view, flt-glass-pane` followed by a blind 1200 ms sleep; measured,
   * the placeholder lands 4-11 ms after flutter-view, so that sleep was
   * compensating for a ten-millisecond gap with more than a second of latency
   * on every call, while proving nothing about the element actually needed.
   *
   * Returns milliseconds waited. Throws DriverPhaseTimeout('ENGINE_TIMEOUT').
   */
  async waitForEngine({ timeout = ENGINE_BUDGET_MS } = {}) {
    const t0 = Date.now();
    if (await this.semanticsActive()) { this.engineReadyMs = 0; return 0; }
    try {
      await this.page.waitForSelector(`${PLACEHOLDER}, flt-semantics`, { timeout, state: 'attached' });
    } catch {
      this.timeoutPhase = 'ENGINE';
      this.timeoutBoundMs = timeout;
      this.engineReadyMs = Date.now() - t0;
      throw new DriverPhaseTimeout('ENGINE_TIMEOUT', this.label,
        `no accessibility placeholder after ${timeout} ms — the Flutter engine did not become ready`,
        this.timing);
    }
    this.engineReadyMs = Date.now() - t0;
    return this.engineReadyMs;
  }

  /**
   * Enable the accessibility tree. Idempotent: returns immediately if already on.
   * Throws (never silently continues) if activation does not produce a semantics
   * host — a coordinate-only fallback is explicitly disallowed.
   */
  async enableSemantics({ engineTimeout = ENGINE_BUDGET_MS, activationTimeout = ACTIVATION_BUDGET_MS } = {}) {
    // NOTE: Flutter mounts an EMPTY <flt-semantics-host> as soon as the engine
    // boots, so the host's presence does NOT mean semantics are active. The real
    // signal is populated <flt-semantics> NODES, which appear only after the
    // placeholder is activated. Use the node count as the idempotency check.
    if (await this.semanticsActive()) { this.engineReadyMs ??= 0; this.semanticsReadyMs ??= 0; return true; }

    // THE DRIVER OWNS ITS PREREQUISITE. Nine of the ten proofs that call this
    // never called waitForEngine, because nothing told them they had to — and
    // a prerequisite a caller has to remember is a prerequisite that gets
    // forgotten by everyone except whoever wrote it.
    await this.waitForEngine({ timeout: engineTimeout });

    const t0 = Date.now();
    const ph = this.page.locator(PLACEHOLDER);
    const deadline = t0 + activationTimeout;
    // Dispatch, then poll FINELY. Sleeping 250 ms after each dispatch made
    // semantics_ready_ms report the poll interval rather than the activation —
    // 251 ms for a tree that was up in 20 — and a measurement quantised to its
    // own sampling rate cannot tell anyone where the time went.
    //
    // The placeholder is rebuilt after a route change, so re-dispatch
    // periodically rather than once; DISPATCH_EVERY_MS is long enough that a
    // normal activation (measured 204-217 ms) never needs a second one.
    const POLL_MS = 25;
    const DISPATCH_EVERY_MS = 1_000;
    let lastDispatch = -Infinity;
    while (Date.now() < deadline) {
      if (Date.now() - lastDispatch >= DISPATCH_EVERY_MS && await ph.count()) {
        lastDispatch = Date.now();
        this.semanticsDispatches++;
        await ph.first().dispatchEvent('click').catch(() => {});
      }
      if (await this.semanticsActive()) {
        this.semanticsReadyMs = Date.now() - t0;
        this.semanticsElapsedMs = this.semanticsReadyMs;
        // One line per real activation, so a slow run says WHERE it was slow
        // instead of leaving the next reader to re-derive it from a timeout.
        // Only on the activation that did work — the idempotent early return
        // above logs nothing, or proof 13 would print this four times.
        console.log(`[semantics] ${this.label} engine_ready=${this.engineReadyMs}ms ` +
          `semantics_ready=${this.semanticsReadyMs}ms total=${this.engineReadyMs + this.semanticsReadyMs}ms`);
        return true;
      }
      await this.page.waitForTimeout(POLL_MS);
    }
    if (await this.semanticsActive()) {
      this.semanticsReadyMs = Date.now() - t0;
      this.semanticsElapsedMs = this.semanticsReadyMs;
      return true;
    }
    // Record the forensics BEFORE throwing. The bound is not raised here: what
    // the correct bound should be is a question for measured distribution, and
    // a timeout that reports how close it came is what makes that measurable.
    this.semanticsElapsedMs = Date.now() - t0;
    this.timeoutPhase = 'SEMANTICS_ACTIVATION';
    this.timeoutBoundMs = activationTimeout;
    throw new DriverPhaseTimeout('SEMANTICS_ACTIVATION_TIMEOUT', this.label,
      `engine was ready after ${this.engineReadyMs} ms but no flt-semantics node appeared ` +
      `within ${activationTimeout} ms of activation (${this.semanticsDispatches} dispatch(es))`,
      this.timing);
  }

  /**
   * Harness observability, never product truth.
   *
   * Populated on the failure path too. A driver that reports its timings only
   * when it succeeds tells you nothing on the one run you need to explain.
   */
  get timing() {
    return {
      engine_ready_ms: this.engineReadyMs ?? null,
      semantics_ready_ms: this.semanticsReadyMs ?? null,
      total_ready_ms: this.engineReadyMs == null || this.semanticsReadyMs == null
        ? null : this.engineReadyMs + this.semanticsReadyMs,
      semantics_dispatches: this.semanticsDispatches,
      semantics_elapsed_ms: this.semanticsElapsedMs ?? null,
      timeout_phase: this.timeoutPhase,
      timeout_bound_ms: this.timeoutBoundMs,
    };
  }

  /** The five forensic fields as one line, for an evidence `detail`. */
  get timingLine() {
    const t = this.timing;
    return `engine_ready_ms=${t.engine_ready_ms ?? '—'} ` +
      `semantics_dispatches=${t.semantics_dispatches} ` +
      `semantics_elapsed_ms=${t.semantics_elapsed_ms ?? '—'} ` +
      `timeout_phase=${t.timeout_phase ?? 'none'} ` +
      `timeout_bound_ms=${t.timeout_bound_ms ?? '—'}`;
  }

  /** True once the accessibility tree has real nodes (not just the empty host). */
  async semanticsActive() {
    return (await this.page.locator('flt-semantics').count()) > 0;
  }

  /**
   * Tap a button by its accessible name. Buttons live inside the semantics tree
   * and are hit-testable, so getByRole's normal click works.
   */
  async tapButton(name, { exact = false, timeout = 8000 } = {}) {
    await this.enableSemantics();
    const btn = this.page.getByRole('button', { name, exact });
    await btn.first().click({ timeout });
    return true;
  }

  /** Tap any semantics node whose text matches, via its live bounding box. */
  async tapText(text, { timeout = 8000 } = {}) {
    await this.enableSemantics();
    const node = this.page.locator('flt-semantics', { hasText: text }).last();
    await node.waitFor({ state: 'attached', timeout });
    return this.tapLocatorBox(node);
  }

  /** Pointer-click the centre of a locator's LIVE bounding box (no fixed coords). */
  async tapLocatorBox(locator, { retries = 3 } = {}) {
    for (let i = 0; i < retries; i++) {
      const box = await locator.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await this.page.waitForTimeout(300);
        return true;
      }
      await this.page.waitForTimeout(400);
    }
    throw new Error(`${this.label}: could not resolve a bounding box to tap`);
  }

  /**
   * THE text-field helper. Focus the real Flutter editable behind a field
   * identified by its accessibility label, type `value`, and verify Flutter
   * actually received it. `secret` keeps the value out of all logs.
   */
  async fillFieldBySemantics(label, value, { secret = false, verify = true } = {}) {
    await this.enableSemantics();
    // The semantics proxy for the field (disabled) gives us the field's position.
    const proxy = this.page
      .locator(`input[aria-label="${label}"], flt-semantics[aria-label="${label}"]`)
      .first();
    await proxy.waitFor({ state: 'attached', timeout: 8000 });
    await this.tapLocatorBox(proxy);
    await this.page.waitForTimeout(400);

    // After the pointer activation the enabled editable is the focused element.
    await this.page.keyboard.type(value, { delay: 40 });
    await this.page.waitForTimeout(300);

    if (verify) {
      const landed = await this.page.evaluate(() => {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return active.value;
        const enabled = [...document.querySelectorAll('input:not([disabled]), textarea:not([disabled])')];
        return enabled.map((i) => i.value).find((v) => v) ?? '';
      });
      const ok = String(landed).includes(value);
      if (!ok) {
        throw new Error(secret
          ? `${this.label}: secret field "${label}" did not register in Flutter state`
          : `${this.label}: field "${label}" expected "${value}" but Flutter holds "${landed}"`);
      }
    }
    return true;
  }

  /**
   * Dump the current semantics tree as compact rows. Used by page objects for
   * assertions and by the accessibility audit. Never returns input VALUES (so a
   * secret typed into a field is never surfaced here).
   */
  async readTree() {
    await this.enableSemantics().catch(() => {});
    return this.page.evaluate(() => {
      const host = document.querySelector('flt-semantics-host');
      if (!host) return [];
      return [...host.querySelectorAll('flt-semantics,input,textarea')].map((e) => ({
        tag: e.tagName.toLowerCase(),
        role: e.getAttribute('role') || (e.getAttribute('data-semantics-role') || null),
        label: (e.getAttribute('aria-label') || '').slice(0, 60),
        text: (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA')
          ? '[input]'
          : (e.textContent || '').trim().slice(0, 60),
      })).filter((x) => x.role || x.label || (x.text && x.text !== '[input]'));
    });
  }

  /** All accessible text visible in the semantics tree, joined. */
  async visibleText() {
    const rows = await this.readTree();
    return rows.map((r) => `${r.label} ${r.text}`).join(' · ');
  }

  /** The FULL, untruncated accessible text of the semantics host (for exact
   *  references like a BZM-… proof code that readTree's slicing would cut). */
  async fullText() {
    await this.enableSemantics().catch(() => {});
    return this.page.evaluate(() => {
      const host = document.querySelector('flt-semantics-host');
      return host ? (host.textContent || '') : '';
    });
  }

  /** Wait until a substring appears in the accessible text (re-enabling semantics). */
  async waitForText(substr, { timeout = 20000, every = 1000 } = {}) {
    const deadline = Date.now() + timeout;
    let last = '';
    while (Date.now() < deadline) {
      await this.enableSemantics().catch(() => {});
      last = await this.visibleText();
      if (last.includes(substr)) return true;
      await this.page.waitForTimeout(every);
    }
    throw new Error(`${this.label}: "${substr}" not visible within ${timeout}ms. Saw: ${last.slice(0, 300)}`);
  }

  /** Whether a substring is currently visible (no waiting). */
  async hasText(substr) {
    return (await this.visibleText()).includes(substr);
  }

  /** Count semantics nodes carrying a role (for the accessibility audit). */
  async countRoles() {
    return this.page.evaluate(() => {
      const host = document.querySelector('flt-semantics-host');
      if (!host) return {};
      const out = {};
      for (const e of host.querySelectorAll('[role]')) {
        const r = e.getAttribute('role');
        out[r] = (out[r] || 0) + 1;
      }
      return out;
    });
  }
}
