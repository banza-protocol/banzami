<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

// -----------------------------------------------------------------------
// WordPress / WooCommerce stubs
// These allow the plugin classes to be loaded without a real WP install.
// -----------------------------------------------------------------------

if (! defined('ABSPATH')) {
    define('ABSPATH', '/');
}

if (! defined('BANZAMI_PLUGIN_DIR')) {
    define('BANZAMI_PLUGIN_DIR', __DIR__ . '/../');
}

if (! class_exists('WC_Payment_Gateway')) {
    abstract class WC_Payment_Gateway
    {
        public string $id                 = '';
        public string $method_title       = '';
        public string $method_description = '';
        public bool   $has_fields         = false;
        public array  $supports           = [];
        public string $title              = '';
        public string $description        = '';
        protected array $settings         = [];
        protected array $form_fields      = [];

        abstract public function init_form_fields(): void;

        public function init_settings(): void {}
        public function process_admin_options(): void {}

        public function get_option(string $key, $default = null)
        {
            return $this->settings[$key] ?? $default;
        }
    }
}

if (! class_exists('WP_Error')) {
    class WP_Error
    {
        public function __construct(
            private string $code    = '',
            private string $message = '',
            private array  $data    = [],
        ) {}

        public function get_error_message(): string { return $this->message; }
        public function get_error_code():    string { return $this->code; }
    }
}

if (! function_exists('add_action')) {
    function add_action(string $hook, callable $callback, int $priority = 10): void {}
}

// Load plugin classes.
require_once __DIR__ . '/../includes/class-banzami-api.php';
require_once __DIR__ . '/../includes/class-banzami-webhook.php';
require_once __DIR__ . '/../includes/class-banzami-gateway.php';
