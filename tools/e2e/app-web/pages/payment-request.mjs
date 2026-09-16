import { parseKz } from '../lib/money.mjs';

/**
 * The payer surface reached by app.banzami.com/pay/{slug}:
 * BanzamiPaymentLinkScreen -> BanzamiPaymentRequestScreen for active links.
 * Also models the truthful invalid/not-found states.
 */
export class PaymentRequestPage {
  constructor(driver) { this.d = driver; this.page = driver.page; }

  /** Wait until the screen resolves to a definite state. */
  async resolve({ timeout = 30000 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await this.d.enableSemantics().catch(() => {});
      const t = await this.d.visibleText();
      if (t.includes('Confirmar pagamento')) return 'active';
      if (t.includes('Link de pagamento não encontrado')) return 'not_found';
      if (t.includes('Link inválido') || /Este link (já foi utilizado|de pagamento expirou|foi cancelado)/.test(t)) return 'invalid';
      await this.page.waitForTimeout(1000);
    }
    return 'unresolved';
  }

  async readAmount() { return parseKz(await this.d.visibleText()); }

  async visible() { return this.d.visibleText(); }

  /** Confirm the payment through the real UI. Pay button label is "Pagar[ <amt>]". */
  async pay() {
    await this.d.enableSemantics();
    await this.d.tapButton('Pagar', { exact: false });
    await this.page.waitForTimeout(3500);
  }
}
