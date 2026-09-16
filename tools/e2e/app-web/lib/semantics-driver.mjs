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

export class FlutterSemanticsDriver {
  constructor(page, { label = 'flutter' } = {}) {
    this.page = page;
    this.label = label;
  }

  /** Wait for the Flutter engine to mount its view. */
  async waitForEngine(timeout = 40000) {
    await this.page.waitForSelector('flutter-view, flt-glass-pane', { timeout });
    await this.page.waitForTimeout(1200);
  }

  /**
   * Enable the accessibility tree. Idempotent: returns immediately if already on.
   * Throws (never silently continues) if activation does not produce a semantics
   * host — a coordinate-only fallback is explicitly disallowed.
   */
  async enableSemantics({ timeout = 20000 } = {}) {
    // NOTE: Flutter mounts an EMPTY <flt-semantics-host> as soon as the engine
    // boots, so the host's presence does NOT mean semantics are active. The real
    // signal is populated <flt-semantics> NODES, which appear only after the
    // placeholder is activated. Use the node count as the idempotency check.
    if (await this.semanticsActive()) return true;
    const ph = this.page.locator(PLACEHOLDER);
    const deadline = Date.now() + timeout;
    // The placeholder can appear a beat after the engine mounts, and it is
    // rebuilt after route changes, so retry the dispatch a few times.
    while (Date.now() < deadline) {
      if (await ph.count()) {
        await ph.first().dispatchEvent('click').catch(() => {});
        await this.page.waitForTimeout(800);
      }
      if (await this.semanticsActive()) return true;
      await this.page.waitForTimeout(500);
    }
    if (await this.semanticsActive()) return true;
    throw new Error(`${this.label}: FLUTTER_SEMANTICS_ACTIVATION failed — no flt-semantics nodes after enabling`);
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
