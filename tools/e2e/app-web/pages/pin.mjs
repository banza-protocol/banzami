/**
 * PIN screens. Registration uses a two-step create+confirm; login uses a single
 * entry. Digits are semantics buttons named "0".."9". The PIN itself is never
 * logged, stored, or included in evidence.
 */
export class PinPage {
  constructor(driver) { this.d = driver; this.page = driver.page; }

  async #enter(pin) {
    await this.d.enableSemantics();
    for (const ch of String(pin)) {
      await this.d.tapButton(ch, { exact: true });
      await this.page.waitForTimeout(180);
    }
    await this.page.waitForTimeout(800);
  }

  /** Registration: "Crie o seu PIN" then "Confirme o PIN"; advances to Home. */
  async createDuringOnboarding(pin) {
    await this.d.waitForText('Crie o seu PIN', { timeout: 15000 });
    await this.#enter(pin);
    // The confirm step appears automatically after six digits.
    await this.d.waitForText('Confirme o PIN', { timeout: 10000 });
    await this.#enter(pin);
    await this.page.waitForTimeout(2500);
  }

  /** Login: "Introduza o PIN", single entry. */
  async enterForLogin(pin) {
    await this.d.waitForText('Introduza o PIN', { timeout: 15000 });
    await this.#enter(pin);
    await this.page.waitForTimeout(2500);
  }
}
