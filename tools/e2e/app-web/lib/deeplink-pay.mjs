/**
 * The decisive flow: pay a Payment Link through the real App Banzami Web
 * consumer UI, reached by its deep link app.banzami.com/pay/{slug}.
 *
 * A fresh, signed-out consumer opens the deep link. The app parks the slug,
 * shows normal auth, the consumer registers through the real UI, and the payment
 * RESUMES to the review screen — WITHOUT paying automatically. Only an explicit
 * tap on the real Pagar control moves money. Every step is the real Flutter UI;
 * nothing is substituted by an API call.
 *
 * Returns a result object of observations; the caller records the gates.
 */
import { freshContext } from './consumer.mjs';
import { WelcomePage } from '../pages/welcome.mjs';
import { CreateAccountPage } from '../pages/create-account.mjs';
import { PinPage } from '../pages/pin.mjs';
import { PaymentRequestPage } from '../pages/payment-request.mjs';
import { ReceiptPage } from '../pages/receipt.mjs';
import { consumerBalanceMinor } from './operator-read.mjs';

const START_BALANCE_MINOR = 1000000; // fresh consumer funding (10 000 Kz)

/**
 * @param browser Playwright browser
 * @param opts { appWebUrl, consumer:{handle,name,pin} }
 * @returns rich observations
 */
export async function payViaAppWebDeepLink(browser, { appWebUrl, consumer }) {
  const out = {
    appBooted: false, authRequired: false, reviewShown: false,
    autoPaidBeforeConfirm: null, balanceBeforeConfirm: null, balanceAfterConfirm: null,
    paidSuccess: false, successTitle: null, receiptRef: null,
    context: null,
  };

  const { context, page, driver } = await freshContext(browser, { url: appWebUrl, label: 'payer' });
  out.context = context;
  await driver.waitForEngine();
  await driver.enableSemantics();
  out.appBooted = await driver.semanticsActive();

  const pr = new PaymentRequestPage(driver);
  // Signed-out: the app should show auth first (welcome), parking the slug.
  await page.waitForTimeout(2000);
  const early = await driver.visibleText();
  out.authRequired = early.includes('Criar conta') || early.includes('Já tenho conta');

  if (out.authRequired) {
    const welcome = new WelcomePage(driver);
    const create = new CreateAccountPage(driver);
    const pinPage = new PinPage(driver);
    await welcome.reach();
    await welcome.tapCreateAccount();
    await create.reach();
    await create.fill({ handle: consumer.handle, name: consumer.name });
    await create.submit();
    await pinPage.createDuringOnboarding(consumer.pin);
    await page.waitForTimeout(3500);
  }

  // After auth the parked link resumes to the review screen.
  const state = await pr.resolve({ timeout: 30000 });
  out.reviewShown = state === 'active';

  // Prove NO auto-payment: at the review screen, before any confirm, the
  // consumer's ledger balance is still the untouched starting balance.
  out.balanceBeforeConfirm = consumerBalanceMinor(consumer.handle);
  out.autoPaidBeforeConfirm = out.balanceBeforeConfirm !== START_BALANCE_MINOR;

  // Explicit confirmation through the real Pagar control.
  if (out.reviewShown) {
    await pr.pay();
    const receipt = new ReceiptPage(driver);
    out.successTitle = await receipt.waitForSuccess({ timeout: 25000 });
    out.paidSuccess = Boolean(out.successTitle);
    out.receiptRef = await receipt.reference();
  }

  out.balanceAfterConfirm = consumerBalanceMinor(consumer.handle);
  return out;
}
