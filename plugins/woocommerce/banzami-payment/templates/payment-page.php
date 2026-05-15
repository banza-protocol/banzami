<?php
/**
 * Template: pending payment page shown after order placement.
 *
 * Variables passed by WC_Banzami_Gateway::receipt_page():
 *   $order          WC_Order
 *   $transaction_id string
 *   $amount_minor   int
 *   $currency       string
 *   $timeout_mins   int
 */
defined( 'ABSPATH' ) || exit;

$currency_display = strtoupper( $currency ) === 'AOA'
    ? number_format( $amount_minor, 0, ',', '.' ) . ' Kz'
    : number_format( $amount_minor / 100, 2, ',', '.' ) . ' ' . strtoupper( $currency );

$deep_link = 'banzami://pay/transaction/' . rawurlencode( $transaction_id );
$timeout_secs = $timeout_mins * 60;
?>

<div id="banzami-payment-page" style="max-width:480px;margin:2rem auto;text-align:center;font-family:system-ui,sans-serif;">

    <div style="background:#990011;color:#fff;border-radius:12px;padding:2rem;margin-bottom:1.5rem;">
        <p style="margin:0 0 .25rem;font-size:.75rem;opacity:.7;letter-spacing:.05em;text-transform:uppercase;">Valor a pagar</p>
        <p style="margin:0;font-size:2.5rem;font-weight:700;font-variant-numeric:tabular-nums;"><?php echo esc_html( $currency_display ); ?></p>
        <p style="margin:.5rem 0 0;font-size:.8rem;opacity:.6;">Pedido #<?php echo esc_html( $order->get_order_number() ); ?></p>
    </div>

    <div style="background:#fff;border-radius:12px;padding:2rem;box-shadow:0 2px 8px rgba(0,0,0,.08);margin-bottom:1.5rem;">
        <p style="margin:0 0 1rem;font-size:.9rem;color:#4A4744;">
            Abra a app Banzami e digitalize o código QR, ou toque no botão abaixo no seu telemóvel.
        </p>

        <?php if ( $transaction_id ) : ?>
            <div id="banzami-qr" style="display:flex;justify-content:center;margin-bottom:1rem;">
                <!-- QR generated client-side by qrcode.js from the deep link payload -->
                <canvas id="banzami-qr-canvas"></canvas>
            </div>
        <?php endif; ?>

        <a href="<?php echo esc_url( $deep_link ); ?>"
           style="display:inline-block;background:#990011;color:#fff;border-radius:8px;padding:.75rem 2rem;text-decoration:none;font-weight:600;font-size:.9rem;margin-bottom:1rem;">
            Abrir app Banzami
        </a>

        <p style="font-size:.75rem;color:#9E9A96;margin:0;">
            A aguardar confirmação de pagamento<span id="banzami-dots">…</span>
        </p>
    </div>

    <p id="banzami-timeout-notice" style="font-size:.8rem;color:#B45309;background:#FFFBEB;border-radius:8px;padding:.75rem;display:none;">
        Tempo de pagamento expirou. O seu pedido foi cancelado.
    </p>

    <p style="font-size:.75rem;color:#9E9A96;">
        Não feche esta página. Será redirecionado automaticamente após o pagamento.
    </p>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" integrity="sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSe7Vg2urhSgkXxmYWJDnOAUBxmBKMgNxIDg==" crossorigin="anonymous" referrerpolicy="no-referrer" defer></script>

<script>
(function () {
    var transactionId = <?php echo wp_json_encode( $transaction_id ); ?>;
    var deepLink      = <?php echo wp_json_encode( $deep_link ); ?>;
    var orderKey      = <?php echo wp_json_encode( $order->get_order_key() ); ?>;
    var orderId       = <?php echo (int) $order->get_id(); ?>;
    var successUrl    = <?php echo wp_json_encode( $order->get_checkout_order_received_url() ); ?>;
    var timeoutSecs   = <?php echo (int) $timeout_secs; ?>;
    var checkUrl      = <?php echo wp_json_encode( add_query_arg( [ 'wc-api' => 'banzami_status', 'order_id' => $order->get_id(), 'key' => $order->get_order_key() ], home_url( '/' ) ) ); ?>;

    // Generate QR code
    window.addEventListener('load', function () {
        if (typeof QRCode !== 'undefined' && transactionId) {
            new QRCode(document.getElementById('banzami-qr-canvas'), {
                text:          deepLink,
                width:         200,
                height:        200,
                colorDark:     '#990011',
                colorLight:    '#ffffff',
                correctLevel:  QRCode.CorrectLevel.M,
            });
        }
    });

    // Animate the "waiting" dots
    var dots = document.getElementById('banzami-dots');
    var dotCount = 0;
    var dotTimer = setInterval(function () {
        dotCount = (dotCount + 1) % 4;
        dots.textContent = '.'.repeat(dotCount + 1);
    }, 500);

    // Poll for payment confirmation
    var pollInterval = 3000;
    var elapsed      = 0;

    function poll() {
        elapsed += pollInterval;
        if (elapsed >= timeoutSecs * 1000) {
            clearInterval(dotTimer);
            document.getElementById('banzami-timeout-notice').style.display = 'block';
            return;
        }
        fetch(checkUrl)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.paid) {
                    clearInterval(dotTimer);
                    window.location.href = successUrl;
                }
            })
            .catch(function () { /* network error — keep polling */ });
    }

    setInterval(poll, pollInterval);
})();
</script>
