/**
 * Signing in to Business Web, defined ONCE.
 *
 * Seven proofs each carried their own copy of this sequence. When the product
 * put a Welcome screen in front of `/business` and split the form into a handle
 * step and a PIN keypad, one copy was updated and six were not — so six proofs
 * spent months waiting for a one-screen form the app no longer renders, and
 * failed on a locator timeout that reads like a product fault.
 *
 * The flow is the rendered one, not a remembered one:
 *
 *   /business (logged out)  →  "Conectar conta"
 *                           →  handle field, labelled by its hint 'cantina_alex'
 *                           →  "Continuar"      (the handle lookup goes through the BFF)
 *                           →  "Digite o seu PIN", tapped digit by digit
 *
 * The handle field has no label of its own — only a hint — so its accessible
 * name IS the hint. That is worth knowing rather than worth working around:
 * if the hint changes, this breaks in one place.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Drive the native Business sign-in through the rendered screens.
 * Leaves the driver on the Business Home; callers assert what they came for.
 */
export async function businessWebSignIn(d, biz, { timeout = 30000 } = {}) {
  await d.waitForText('Conectar conta', { timeout: 25000 });
  await d.tapButton('Conectar conta');
  await d.waitForText('Entrar', { timeout: 15000 });
  await d.fillFieldBySemantics('cantina_alex', biz.handle, { verify: false });
  await d.tapButton('Continuar');
  // Reaching the PIN step proves the handle lookup succeeded through the BFF.
  await d.waitForText('Digite o seu PIN', { timeout });
  for (const ch of String(biz.pin)) {
    await d.tapButton(ch, { exact: true });
    await sleep(160);
  }
}

/** Sign in and wait for Home. Returns whether Home was reached. */
export async function businessWebSignInToHome(d, biz, { timeout = 30000 } = {}) {
  await businessWebSignIn(d, biz, { timeout });
  return d.waitForText('Saldo disponível', { timeout }).then(() => true).catch(() => false);
}
