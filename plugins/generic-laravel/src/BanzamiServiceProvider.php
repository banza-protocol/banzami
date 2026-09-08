<?php

declare(strict_types=1);

namespace Banzami\Laravel;

use Banzami\BanzamiClient;
use Illuminate\Support\ServiceProvider;

class BanzamiServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/../config/banzami.php', 'banzami');

        $this->app->singleton(BanzamiClient::class, function ($app) {
            $config = $app['config']['banzami'];

            // BanzamiClient's signature is (apiKey, environment, baseUrl). This
            // used to pass (gateway_url, api_key) positionally, so the gateway
            // URL was taken as the API key and the API key as the environment —
            // which then failed looking up a default base URL under a key named
            // after the credential. Named arguments so the order cannot silently
            // rot again.
            $apiKey = (string) ($config['api_key'] ?? '');

            return new BanzamiClient(
                apiKey:      $apiKey,
                environment: str_starts_with($apiKey, 'bz_test_') ? 'sandbox' : 'live',
                // Null lets the SDK pick its own default for the environment.
                baseUrl:     $config['gateway_url'] ?: null,
            );
        });

        $this->app->alias(BanzamiClient::class, 'banzami');
    }

    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->publishes([
                __DIR__ . '/../config/banzami.php' => config_path('banzami.php'),
            ], 'banzami-config');
        }

        $this->loadRoutesFrom(__DIR__ . '/../routes/banzami.php');
    }
}
