/** Receipt / success confirmation screen. */
const SUCCESS_TITLES = [
  'Pagamento concluído', 'Enviado com sucesso', 'Pagamento recebido', 'Transferência recebida',
];

export class ReceiptPage {
  constructor(driver) { this.d = driver; this.page = driver.page; }

  /** Wait for any success confirmation. Returns the matched title. */
  async waitForSuccess({ timeout = 25000 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await this.d.enableSemantics().catch(() => {});
      const t = await this.d.visibleText();
      const hit = SUCCESS_TITLES.find((s) => t.includes(s));
      if (hit) return hit;
      // Comprovativo header also marks the receipt screen.
      if (t.includes('Comprovativo')) return 'Comprovativo';
      await this.page.waitForTimeout(1000);
    }
    return null;
  }

  /**
   * The proof reference AS SHOWN on the receipt. The app deliberately abbreviates
   * it — first two groups, an ellipsis, then the last group (e.g.
   * "BZM-F34R-K4N0-…-N6P4") — so the full random reference is never displayed.
   * Returns { display, prefix, suffix, full } where `full` is set only when the
   * whole reference happens to be shown; otherwise resolve it from the stored
   * proof via prefix+suffix (operator-read.resolveProofReference).
   */
  async reference() {
    const t = (await this.d.fullText()).replace(/ /g, ' ');
    // Abbreviated: BZM-XXXX-XXXX-…-XXXX
    const abbr = t.match(/BZM-([A-Z0-9]{4})-([A-Z0-9]{4})-(?:…|\.\.\.)-([A-Z0-9]{4})/i);
    if (abbr) {
      return { display: abbr[0], prefix: `BZM-${abbr[1]}-${abbr[2]}`, suffix: abbr[3], full: null };
    }
    // Full (rare): BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
    const full = t.match(/BZM(?:-[A-Z0-9]{4}){2,8}/i);
    if (full) return { display: full[0], prefix: null, suffix: null, full: full[0] };
    return null;
  }

  async done() { await this.d.tapButton('Concluído').catch(() => {}); await this.page.waitForTimeout(1200); }
}
