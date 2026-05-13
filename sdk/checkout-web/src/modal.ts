import { PaymentLink, formatAmount } from './api';

declare const QRCode: any; // loaded from CDN in browser context

const WINE = '#6D071A';
const STYLE = `
  #bz-checkout-overlay {
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,.55);
    display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
    animation: bz-fade-in .15s ease;
  }
  @keyframes bz-fade-in { from { opacity:0 } to { opacity:1 } }
  #bz-checkout-box {
    background: #fff; border-radius: 16px; padding: 28px;
    max-width: 360px; width: calc(100vw - 32px);
    text-align: center; box-shadow: 0 8px 40px rgba(0,0,0,.18);
    animation: bz-slide-up .2s ease;
  }
  @keyframes bz-slide-up { from { transform: translateY(12px); opacity:0 } to { transform: none; opacity:1 } }
  #bz-checkout-close {
    position: absolute; top: 12px; right: 14px;
    background: none; border: none; font-size: 22px;
    cursor: pointer; color: #9E9A96; line-height: 1;
  }
  #bz-checkout-close:hover { color: #4A4744 }
  #bz-checkout-header {
    background: ${WINE}; color: #fff; border-radius: 10px;
    padding: 14px 18px; margin-bottom: 16px;
  }
  #bz-checkout-label { font-size: 11px; opacity: .7; text-transform: uppercase; letter-spacing: .05em; margin: 0 0 4px; }
  #bz-checkout-amount { font-size: 32px; font-weight: 700; margin: 0; font-variant-numeric: tabular-nums; }
  #bz-checkout-desc { font-size: 13px; margin: 8px 0 0; opacity: .75; }
  #bz-checkout-qr { display: flex; justify-content: center; margin: 12px 0; }
  #bz-checkout-btn {
    display: block; width: 100%; background: ${WINE};
    color: #fff; border: none; border-radius: 8px;
    padding: 12px; font-size: 14px; font-weight: 600;
    cursor: pointer; text-decoration: none; margin-bottom: 10px;
  }
  #bz-checkout-btn:hover { opacity: .9 }
  #bz-checkout-waiting { font-size: 12px; color: #9E9A96; margin: 0; }
  #bz-checkout-success { display: none; }
  #bz-checkout-success.bz-visible { display: block; }
  #bz-checkout-success-icon {
    width: 52px; height: 52px; border-radius: 50%;
    background: #ECFDF5; color: #1A7A4A;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 12px; font-size: 26px;
  }
`;

let styleInjected = false;

function injectStyle(): void {
  if (styleInjected) return;
  const el = document.createElement('style');
  el.textContent = STYLE;
  document.head.appendChild(el);
  styleInjected = true;
}

function loadQrScript(cb: () => void): void {
  if (typeof QRCode !== 'undefined') { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.integrity = 'sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSe7Vg2urhSgkXxmYWJDnOAUBxmBKMgNxIDg==';
  s.crossOrigin = 'anonymous';
  s.onload = cb;
  document.head.appendChild(s);
}

export interface ModalCallbacks {
  onSuccess: (link: PaymentLink) => void;
  onCancel:  () => void;
}

export class CheckoutModal {
  private overlay: HTMLElement | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  open(link: PaymentLink, callbacks: ModalCallbacks, pollFn: () => Promise<{ paid: boolean }>): void {
    injectStyle();
    this.cleanup();

    const deepLink  = `banzami://pay/link/${link.slug}`;
    const amountTxt = link.amount_minor != null
      ? formatAmount(link.amount_minor, link.currency)
      : 'Valor livre';

    const overlay = document.createElement('div');
    overlay.id = 'bz-checkout-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
      <div id="bz-checkout-box" style="position:relative">
        <button id="bz-checkout-close" aria-label="Fechar">&#x2715;</button>
        <div id="bz-checkout-header">
          <p id="bz-checkout-label">${link.description ?? 'Valor a pagar'}</p>
          <p id="bz-checkout-amount">${amountTxt}</p>
        </div>
        <div id="bz-checkout-qr"><canvas id="bz-qr-canvas"></canvas></div>
        <a id="bz-checkout-btn" href="${deepLink}">Abrir app Banzami</a>
        <p id="bz-checkout-waiting">A aguardar confirmação de pagamento…</p>
        <div id="bz-checkout-success">
          <div id="bz-checkout-success-icon">✓</div>
          <p style="font-weight:600;margin:0 0 4px">Pagamento confirmado!</p>
          <p style="font-size:12px;color:#9E9A96;margin:0">Obrigado pelo pagamento.</p>
        </div>
      </div>
    `;

    overlay.querySelector('#bz-checkout-close')!.addEventListener('click', () => {
      this.close();
      callbacks.onCancel();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { this.close(); callbacks.onCancel(); }
    });

    document.body.appendChild(overlay);
    this.overlay = overlay;

    // Trap focus
    const box = overlay.querySelector<HTMLElement>('#bz-checkout-box');
    box?.focus();

    loadQrScript(() => {
      const canvas = document.getElementById('bz-qr-canvas');
      if (!canvas || typeof QRCode === 'undefined') return;
      new QRCode(canvas, {
        text:         deepLink,
        width:        180,
        height:       180,
        colorDark:    WINE,
        colorLight:   '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    });

    this.pollTimer = setInterval(async () => {
      try {
        const { paid } = await pollFn();
        if (paid) {
          this.showSuccess();
          setTimeout(() => {
            this.close();
            callbacks.onSuccess(link);
          }, 1800);
        }
      } catch { /* keep polling */ }
    }, 3000);
  }

  private showSuccess(): void {
    if (!this.overlay) return;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.overlay.querySelector<HTMLElement>('#bz-checkout-waiting')!.style.display = 'none';
    this.overlay.querySelector<HTMLElement>('#bz-checkout-qr')!.style.display = 'none';
    this.overlay.querySelector<HTMLElement>('#bz-checkout-btn')!.style.display = 'none';
    const success = this.overlay.querySelector<HTMLElement>('#bz-checkout-success')!;
    success.classList.add('bz-visible');
  }

  close(): void {
    this.cleanup();
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  private cleanup(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }
}
