/** Welcome / landing screen: the two entry CTAs. */
export class WelcomePage {
  constructor(driver) { this.d = driver; this.page = driver.page; }

  async reach() {
    await this.d.waitForEngine();
    await this.d.enableSemantics();
    await this.d.waitForText('Criar conta', { timeout: 25000 });
    return this;
  }

  async tapCreateAccount() { await this.d.tapButton('Criar conta'); }
  async tapSignIn() { await this.d.tapButton('Já tenho conta'); }
}
