<?php
/**
 * Plugin Name:  Banzami Payment Gateway
 * Plugin URI:   https://banzami.ao
 * Description:  Accept payments via the Banzami platform in WooCommerce.
 * Version:      1.0.0
 * Author:       Banzami Engineering
 * Author URI:   https://banzami.ao
 * License:      UNLICENSED
 * Text Domain:  banzami-payment
 * Requires PHP: 7.4
 * WC requires at least: 7.0
 * WC tested up to: 8.9
 */

defined( 'ABSPATH' ) || exit;

define( 'BANZAMI_PLUGIN_VERSION', '1.0.0' );
define( 'BANZAMI_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'BANZAMI_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

// Bail if WooCommerce is not active.
function banzami_check_woocommerce(): void {
    if ( ! class_exists( 'WooCommerce' ) ) {
        add_action( 'admin_notices', function () {
            echo '<div class="error"><p><strong>Banzami Payment Gateway</strong> requires WooCommerce to be installed and active.</p></div>';
        } );
    }
}
add_action( 'plugins_loaded', 'banzami_check_woocommerce' );

// Register the gateway with WooCommerce.
add_filter( 'woocommerce_payment_gateways', function ( array $gateways ): array {
    $gateways[] = 'WC_Banzami_Gateway';
    return $gateways;
} );

// Initialise the gateway class after WooCommerce loads.
add_action( 'plugins_loaded', function (): void {
    if ( ! class_exists( 'WC_Payment_Gateway' ) ) {
        return;
    }
    require_once BANZAMI_PLUGIN_DIR . 'includes/class-banzami-api.php';
    require_once BANZAMI_PLUGIN_DIR . 'includes/class-banzami-gateway.php';
    require_once BANZAMI_PLUGIN_DIR . 'includes/class-banzami-webhook.php';
    Banzami_Webhook_Handler::init();
} );

// Declare HPOS compatibility.
add_action( 'before_woocommerce_init', function (): void {
    if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
    }
} );

register_uninstall_hook( __FILE__, 'banzami_uninstall' );
function banzami_uninstall(): void {
    delete_option( 'woocommerce_banzami_settings' );
}
