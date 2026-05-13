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
            return new BanzamiClient(
                $config['gateway_url'],
                $config['api_key'],
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
