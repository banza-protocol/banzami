<?php
// Runs when the plugin is deleted via the WordPress admin.
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'woocommerce_banzami_settings' );
