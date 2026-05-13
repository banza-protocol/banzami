<?php
defined( 'ABSPATH' ) || exit;

/**
 * Handles incoming Banzami webhooks.
 *
 * Register your webhook endpoint in the Banzami dashboard as:
 *   https://your-store.com/wc-api/banzami
 *
 * Supported events:
 *   transaction.completed  → mark WC order as processing/complete
 *   transaction.failed     → mark WC order as failed
 */
class Banzami_Webhook_Handler {

    public static function init(): void {
        add_action( 'woocommerce_api_banzami',        [ self::class, 'handle' ] );
        add_action( 'woocommerce_api_banzami_status', [ self::class, 'handle_status' ] );
    }

    /**
     * Lightweight polling endpoint for the payment page JS.
     * Returns {"paid": true} once the order is no longer pending.
     */
    public static function handle_status(): void {
        $order_id  = isset( $_GET['order_id'] ) ? absint( $_GET['order_id'] ) : 0;
        $order_key = isset( $_GET['key'] )       ? sanitize_text_field( wp_unslash( $_GET['key'] ) ) : '';

        $order = wc_get_order( $order_id );
        $paid  = false;

        if ( $order && $order->key_is_valid( $order_key ) ) {
            $paid = $order->is_paid();
        }

        wp_send_json( [ 'paid' => $paid ] );
    }

    public static function handle(): void {
        $raw_body = file_get_contents( 'php://input' );

        // --- Signature verification ----------------------------------------
        $gateway = self::get_gateway();
        if ( $gateway ) {
            $secret    = $gateway->get_webhook_secret();
            $signature = isset( $_SERVER['HTTP_X_BANZAMI_SIGNATURE'] )
                ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_BANZAMI_SIGNATURE'] ) )
                : '';

            if ( $secret && ! self::verify_signature( $raw_body, $signature, $secret ) ) {
                status_header( 401 );
                exit( 'Invalid signature' );
            }
        }

        // --- Parse payload --------------------------------------------------
        $payload = json_decode( $raw_body, true );
        if ( ! is_array( $payload ) ) {
            status_header( 400 );
            exit( 'Invalid JSON' );
        }

        $event_type = $payload['type']    ?? '';
        $data       = $payload['payload'] ?? $payload['data'] ?? [];

        self::process_event( $event_type, $data );

        status_header( 200 );
        exit( 'OK' );
    }

    // -------------------------------------------------------------------------

    private static function process_event( string $event_type, array $data ): void {
        $reference = $data['reference'] ?? '';
        if ( ! $reference ) return;

        $order = wc_get_order( (int) $reference );
        if ( ! $order ) return;

        // Only process orders that belong to this gateway.
        if ( $order->get_payment_method() !== 'banzami' ) return;

        switch ( $event_type ) {
            case 'transaction.completed':
                if ( ! $order->is_paid() ) {
                    $transaction_id = $data['id'] ?? '';
                    $order->payment_complete( $transaction_id );
                    $order->add_order_note( 'Banzami payment confirmed. Transaction ID: ' . $transaction_id );
                }
                break;

            case 'transaction.failed':
                if ( in_array( $order->get_status(), [ 'pending', 'on-hold' ], true ) ) {
                    $order->update_status( 'failed', 'Banzami payment failed.' );
                }
                break;

            case 'transaction.refunded':
                if ( ! $order->get_meta( '_banzami_refund_processed' ) ) {
                    $order->update_status( 'refunded', 'Banzami payment refunded.' );
                    $order->update_meta_data( '_banzami_refund_processed', '1' );
                    $order->save();
                }
                break;
        }
    }

    // -------------------------------------------------------------------------

    private static function verify_signature( string $body, string $signature, string $secret ): bool {
        if ( ! $signature ) return false;
        $expected = 'sha256=' . hash_hmac( 'sha256', $body, $secret );
        return hash_equals( $expected, $signature );
    }

    private static function get_gateway(): ?WC_Banzami_Gateway {
        $gateways = WC()->payment_gateways()->payment_gateways();
        return $gateways['banzami'] ?? null;
    }
}
