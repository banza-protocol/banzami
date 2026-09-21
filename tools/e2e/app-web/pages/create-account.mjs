/** Create-account screen: @banza + full name, then Continuar. */
import { ownCreated } from '../lib/e2e-own.mjs';

export class CreateAccountPage {
  constructor(driver) { this.d = driver; this.page = driver.page; this.handle = null; }

  async reach() {
    await this.d.enableSemantics();
    await this.d.waitForText('Escolha o seu @banza', { timeout: 15000 });
    return this;
  }

  async fill({ handle, name }) {
    // Remembered so submit() can hand the account over. The page object is the
    // creation primitive for a UI-registered consumer, and it is the only
    // thing that knows the identity at the moment the account comes into
    // existence.
    this.handle = handle;
    await this.d.fillFieldBySemantics('O seu @banza', handle);
    await this.d.fillFieldBySemantics('Nome completo', name);
  }

  async submit() {
    await this.d.tapButton('Continuar');
    // OWNED HERE. The account exists and its 1 000 000 grant is issued the
    // moment Continuar is accepted; the PIN step and everything after it can
    // fail. registerConsumer() already did this, but proofs that drive the
    // screen directly — proof 03 among them — bypassed it and produced no
    // manifest at all. The primitive registers, so no caller has to remember.
    if (this.handle) ownCreated('consumer', this.handle, { creation_source: 'CreateAccountPage.submit' });
    await this.page.waitForTimeout(1500);
  }
}
