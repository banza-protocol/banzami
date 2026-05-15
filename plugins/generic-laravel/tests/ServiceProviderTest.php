<?php

declare(strict_types=1);

namespace Banzami\Laravel\Tests;

use Banzami\BanzamiClient;
use Banzami\Laravel\BanzamiServiceProvider;
use Banzami\Laravel\Facades\Banzami;
use Orchestra\Testbench\TestCase;

class ServiceProviderTest extends TestCase
{
    protected function getPackageProviders($app): array
    {
        return [BanzamiServiceProvider::class];
    }

    protected function getEnvironmentSetUp($app): void
    {
        $app['config']->set('banzami.gateway_url', 'https://api.banzami.ao');
        $app['config']->set('banzami.api_key', 'test-api-key');
    }

    public function test_banzami_client_is_bound_as_singleton(): void
    {
        $a = $this->app->make(BanzamiClient::class);
        $b = $this->app->make(BanzamiClient::class);

        $this->assertInstanceOf(BanzamiClient::class, $a);
        $this->assertSame($a, $b, 'BanzamiClient must be a singleton');
    }

    public function test_facade_resolves_to_banzami_client(): void
    {
        $resolved = Banzami::getFacadeRoot();

        $this->assertInstanceOf(BanzamiClient::class, $resolved);
    }

    public function test_config_is_merged_with_defaults(): void
    {
        $this->assertSame('https://api.banzami.ao', config('banzami.gateway_url'));
        $this->assertSame('test-api-key', config('banzami.api_key'));
        $this->assertArrayHasKey('webhook_secret', config('banzami'));
        $this->assertArrayHasKey('merchant_id', config('banzami'));
        $this->assertArrayHasKey('wallet_id', config('banzami'));
    }

    public function test_config_is_publishable(): void
    {
        $paths = BanzamiServiceProvider::pathsToPublish(BanzamiServiceProvider::class, 'banzami-config');

        $this->assertNotEmpty($paths, 'banzami-config tag must register at least one publishable path');

        $sourceFile = array_key_first($paths);
        $this->assertFileExists($sourceFile, 'The published config source file must exist');
    }
}
