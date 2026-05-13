<?php
defined( 'ABSPATH' ) || exit;

/**
 * Banzami WooCommerce Payment Gateway.
 *
 * Flow:
 *  1. Customer places order → process_payment() creates a Banzami transaction
 *     and redirects to a hosted "pending payment" page showing a QR code.
 *  2. Customer scans the QR with the Banzami mobile app and confirms.
 *  3. Banzami fires a webhook (transaction.completed) → Banzami_Webhook_Handler
 *     marks the WC order as complete.
 */
class WC_Banzami_Gateway extends WC_Payment_Gateway {

    public function __construct() {
        $this->id                 = 'banzami';
        $this->method_title       = 'Banzami';
        $this->method_description = 'Accept payments via the Banzami payment platform (QR code / mobile).';
        $this->has_fields         = false;
        $this->supports           = [ 'products' ];

        $this->init_form_fields();
        $this->init_settings();

        $this->title       = $this->get_option( 'title' );
        $this->description = $this->get_option( 'description' );

        add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, [ $this, 'process_admin_options' ] );
        add_action( 'woocommerce_receipt_' . $this->id, [ $this, 'receipt_page' ] );
    }

    // -------------------------------------------------------------------------
    // Admin settings
    // -------------------------------------------------------------------------

    public function init_form_fields(): void {
        $this->form_fields = [
            'enabled' => [
                'title'   => 'Enable',
                'type'    => 'checkbox',
                'label'   => 'Enable Banzami Payment Gateway',
                'default' => 'no',
            ],
            'title' => [
                'title'       => 'Title',
                'type'        => 'text',
                'description' => 'Payment method title shown at checkout.',
                'default'     => 'Banzami',
                'desc_tip'    => true,
            ],
            'description' => [
                'title'       => 'Description',
                'type'        => 'textarea',
                'description' => 'Description shown at checkout.',
                'default'     => 'Pay securely using your Banzami wallet — scan the QR code with the Banzami app.',
            ],
            'gateway_url' => [
                'title'       => 'Gateway URL',
                'type'        => 'text',
                'description' => 'URL of the Banzami API gateway.',
                'default'     => 'https://api.banzami.ao',
                'desc_tip'    => true,
            ],
            'api_key' => [
                'title'       => 'API Key',
                'type'        => 'password',
                'description' => 'Your Banzami merchant API key.',
                'default'     => '',
                'desc_tip'    => true,
            ],
            'webhook_secret' => [
                'title'       => 'Webhook Secret',
                'type'        => 'password',
                'description' => 'Secret used to verify Banzami webhook signatures.',
                'default'     => '',
                'desc_tip'    => true,
            ],
            'currency' => [
                'title'       => 'Currency',
                'type'        => 'select',
                'description' => 'Currency for transactions.',
                'default'     => 'AOA',
                'options'     => [ 'AOA' => 'AOA — Angolan Kwanza', 'USD' => 'USD — US Dollar' ],
                'desc_tip'    => true,
            ],
            'payment_timeout' => [
                'title'       => 'Payment Timeout (minutes)',
                'type'        => 'number',
                'description' => 'Cancel the order if not paid within this many minutes.',
                'default'     => '30',
                'desc_tip'    => true,
            ],
        ];
    }

    // -------------------------------------------------------------------------
    // Payment processing
    // -------------------------------------------------------------------------

    public function process_payment( $order_id ): array {
        $order = wc_get_order( $order_id );

        if ( ! $order ) {
            wc_add_notice( 'Order not found.', 'error' );
            return [ 'result' => 'failure' ];
        }

        $amount_minor = $this->to_minor_units( (float) $order->get_total(), $order->get_currency() );

        $api    = $this->get_api();
        $result = $api->create_transaction( [
            'amount_minor' => $amount_minor,
            'currency'     => $order->get_currency() ?: $this->get_option( 'currency', 'AOA' ),
            'reference'    => (string) $order_id,
            'description'  => 'Order #' . $order->get_order_number() . ' — ' . get_bloginfo( 'name' ),
        ] );

        if ( is_wp_error( $result ) ) {
            wc_add_notice( 'Payment error: ' . $result->get_error_message(), 'error' );
            $order->add_order_note( 'Banzami API error: ' . $result->get_error_message() );
            return [ 'result' => 'failure' ];
        }

        $transaction_id = $result['id'] ?? '';
        $order->update_meta_data( '_banzami_transaction_id', $transaction_id );
        $order->update_meta_data( '_banzami_amount_minor', $amount_minor );
        $order->save();

        $order->update_status( 'pending', 'Awaiting Banzami payment.' );
        WC()->cart->empty_cart();

        return [
            'result'   => 'success',
            'redirect' => $order->get_checkout_payment_url( true ),
        ];
    }

    // -------------------------------------------------------------------------
    // Receipt page — show QR code
    // -------------------------------------------------------------------------

    public function receipt_page( int $order_id ): void {
        $order = wc_get_order( $order_id );
        if ( ! $order ) return;

        $transaction_id = $order->get_meta( '_banzami_transaction_id' );
        $amount_minor   = (int) $order->get_meta( '_banzami_amount_minor' );
        $currency       = $order->get_currency();
        $timeout_mins   = (int) $this->get_option( 'payment_timeout', 30 );

        include BANZAMI_PLUGIN_DIR . 'templates/payment-page.php';
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    public function get_api(): Banzami_API {
        return new Banzami_API(
            $this->get_option( 'gateway_url', 'https://api.banzami.ao' ),
            $this->get_option( 'api_key', '' )
        );
    }

    public function get_webhook_secret(): string {
        return $this->get_option( 'webhook_secret', '' );
    }

    /**
     * Convert a WooCommerce float total to minor units.
     * AOA: integer kwanzas (no decimal). All others: ×100.
     */
    private function to_minor_units( float $total, string $currency ): int {
        if ( strtoupper( $currency ) === 'AOA' ) {
            return (int) round( $total );
        }
        return (int) round( $total * 100 );
    }
}
