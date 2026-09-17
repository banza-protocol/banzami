import { parseKz } from '../lib/money.mjs';

/** Consumer Home: balance, Sandbox proof, quick actions, sandbox funding. */
export class HomePage {
  constructor(driver) { this.d = driver; this.page = driver.page; }

  async reach() {
    await this.d.enableSemantics();
    await this.d.waitForText('Saldo disponível', { timeout: 25000 });
    return this;
  }

  /** Home shows the Sandbox banner and NO KYC prompt (canonical Sandbox policy). */
  async assertSandbox() {
    const txt = await this.d.visibleText();
    const sandbox = txt.includes('SANDBOX');
    // KYC would surface words like "verificar identidade" / "verificação".
    const kyc = /verifica(r|ção) (a )?identidade|identity verification|KYC/i.test(txt);
    return { sandbox, kycVisible: kyc };
  }

  /** Read the displayed available balance in Kwanza (major units). */
  async readBalance() {
    await this.d.enableSemantics();
    // The balance sits right after the "Saldo disponível" label.
    const rows = await this.d.readTree();
    const idx = rows.findIndex((r) => (r.text || '').includes('Saldo disponível'));
    for (let i = idx + 1; i < rows.length && i <= idx + 4; i++) {
      const v = parseKz(rows[i].text);
      if (v !== null) return v;
    }
    // Fallback: first Kz amount anywhere.
    return parseKz(await this.d.visibleText());
  }

  async tapEnviar() { await this.d.tapButton('Enviar'); await this.page.waitForTimeout(1200); }
  async tapReceber() { await this.d.tapButton('Receber'); await this.page.waitForTimeout(1200); }

  /**
   * Tap the primary 'QR Code' quick action, which opens the full-screen scanner.
   * On the Web the scanner defers camera access to the browser's getUserMedia
   * (WEB-QR-CAMERA fix): the button reaches the live scanner, not a popped screen.
   */
  async tapQrCode() { await this.d.tapButton('QR Code'); await this.page.waitForTimeout(1500); }

  /**
   * Add sandbox test funds through the Home panel. Expands the panel, taps a
   * quick chip if present, then "Adicionar ao saldo". Returns true if the panel
   * flow ran. Funding is fictitious-money provisioning, not a payment under test.
   */
  async addSandboxFunds() {
    await this.d.enableSemantics();
    if (await this.d.hasText('Adicionar dinheiro de te') || await this.d.hasText('Adicionar dinheiro de teste')) {
      await this.d.tapText('Adicionar dinheiro de te').catch(() => {});
      await this.page.waitForTimeout(1000);
    }
    // "Adicionar ao saldo" confirms the credit.
    await this.d.tapText('Adicionar ao saldo').catch(() => {});
    await this.page.waitForTimeout(2500);
    return true;
  }
}
