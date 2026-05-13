<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Banzami Gateway URL
    |--------------------------------------------------------------------------
    | The base URL of the Banzami API gateway.
    */
    'gateway_url' => env('BANZAMI_GATEWAY_URL', 'https://api.banzami.ao'),

    /*
    |--------------------------------------------------------------------------
    | API Key
    |--------------------------------------------------------------------------
    | Your Banzami merchant API key. Keep this in your .env file — never
    | commit it to source control.
    */
    'api_key' => env('BANZAMI_API_KEY', ''),

    /*
    |--------------------------------------------------------------------------
    | Webhook Secret
    |--------------------------------------------------------------------------
    | Used to verify the HMAC-SHA256 signature on incoming webhook events.
    */
    'webhook_secret' => env('BANZAMI_WEBHOOK_SECRET', ''),

    /*
    |--------------------------------------------------------------------------
    | Merchant / Wallet IDs
    |--------------------------------------------------------------------------
    | Pre-configure the default merchant and wallet if your app serves a
    | single merchant. You can also set these per-request.
    */
    'merchant_id' => env('BANZAMI_MERCHANT_ID', ''),
    'wallet_id'   => env('BANZAMI_WALLET_ID', ''),
];
