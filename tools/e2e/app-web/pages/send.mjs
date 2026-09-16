/** Send flow: recipient + amount + optional note, then review + confirm. */
export class SendPage {
  constructor(driver) { this.d = driver; this.page = driver.page; }

  async reach() {
    await this.d.enableSemantics();
    await this.d.waitForText('Para quem?', { timeout: 15000 });
    return this;
  }

  /** amountKz is the whole-Kwanza amount to type into the amount field. */
  async fill({ recipientHandle, amountKz }) {
    await this.d.fillFieldBySemantics('Destinatário', recipientHandle);
    // Give handle validation a moment (it resolves the @banza server-side).
    await this.page.waitForTimeout(1500);
    await this.d.fillFieldBySemantics('Montante', String(amountKz), { verify: false });
    await this.page.waitForTimeout(500);
  }

  async continue() {
    await this.d.tapButton('Continuar');
    await this.page.waitForTimeout(1500);
  }

  /** Review screen: confirm the irreversible send. */
  async confirm() {
    await this.d.enableSemantics();
    await this.d.waitForText('Confirmar envio', { timeout: 15000 });
    await this.d.tapButton('Confirmar envio');
    await this.page.waitForTimeout(3500);
  }
}
