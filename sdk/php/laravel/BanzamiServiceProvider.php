<?php

declare(strict_types=1);

namespace Banzami\Laravel;

use Banzami\BanzamiClient;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\ServiceProvider;

class BanzamiServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/config/banzami.php', 'banzami');

        $this->app->singleton(BanzamiClient::class, function (Application $app): BanzamiClient {
            $config = $app['config']['banzami'];
            return new BanzamiClient(
                apiKey:      $config['api_key'],
                environment: $config['environment'] ?? 'live',
                baseUrl:     $config['base_url'] ?? null,
                maxRetries:  $config['max_retries'] ?? 3,
            );
        });

        $this->app->alias(BanzamiClient::class, 'banzami');
    }

    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->publishes([
                __DIR__ . '/config/banzami.php' => $this->app->configPath('banzami.php'),
            ], 'banzami-config');
        }
    }

    public function provides(): array
    {
        return [BanzamiClient::class, 'banzami'];
    }
}
