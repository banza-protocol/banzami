<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Banzami API Key
    |--------------------------------------------------------------------------
    |
    | Your Banzami secret API key. Prefix determines the environment:
    |   bz_live_... → live (real money)
    |   bz_test_... → sandbox (virtual funds)
    |
    | Never commit this value. Store it in .env as BANZAMI_API_KEY.
    |
    */
    'api_key' => env('BANZAMI_API_KEY'),

    /*
    |--------------------------------------------------------------------------
    | Environment
    |--------------------------------------------------------------------------
    |
    | 'live' or 'sandbox'. Defaults to 'live' in production.
    | If your API key prefix is bz_test_, use 'sandbox' here.
    |
    */
    'environment' => env('BANZAMI_ENVIRONMENT', 'live'),

    /*
    |--------------------------------------------------------------------------
    | Webhook Secret
    |--------------------------------------------------------------------------
    |
    | The signing secret for your webhook endpoint, obtained from the
    | Banzami dashboard when you register an endpoint. Used with
    | Webhooks::constructEvent() to verify incoming webhook signatures.
    |
    */
    'webhook_secret' => env('BANZAMI_WEBHOOK_SECRET'),

    /*
    |--------------------------------------------------------------------------
    | Base URL Override
    |--------------------------------------------------------------------------
    |
    | Override the default API base URL (e.g., for local development or
    | staging environments). Leave null to use the canonical Banzami URL.
    |
    */
    'base_url' => env('BANZAMI_BASE_URL'),

    /*
    |--------------------------------------------------------------------------
    | Max Retries
    |--------------------------------------------------------------------------
    |
    | Number of automatic retries on retryable errors (429, 502, 503, 504).
    |
    */
    'max_retries' => (int) env('BANZAMI_MAX_RETRIES', 3),
];
