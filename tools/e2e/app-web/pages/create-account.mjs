/** Create-account screen: @banza + full name, then Continuar. */
export class CreateAccountPage {
  constructor(driver) { this.d = driver; this.page = driver.page; }

  async reach() {
    await this.d.enableSemantics();
    await this.d.waitForText('Escolha o seu @banza', { timeout: 15000 });
    return this;
  }

  async fill({ handle, name }) {
    await this.d.fillFieldBySemantics('O seu @banza', handle);
    await this.d.fillFieldBySemantics('Nome completo', name);
  }

  async submit() {
    await this.d.tapButton('Continuar');
    await this.page.waitForTimeout(1500);
  }
}
