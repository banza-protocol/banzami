<?php

declare(strict_types=1);

namespace Banzami\Laravel\Tests;

use Banzami\Laravel\BanzamiServiceProvider;
use Banzami\Laravel\Events\PaymentLinkUsed;
use Banzami\Laravel\Events\PayoutRequested;
use Banzami\Laravel\Events\TransactionCompleted;
use Banzami\Laravel\Events\TransactionFailed;
use Banzami\Laravel\Events\WalletProvisioned;
use Illuminate\Support\Facades\Event;
use Orchestra\Testbench\TestCase;

class WebhookControllerTest extends TestCase
{
    protected function getPackageProviders($app): array
    {
        return [BanzamiServiceProvider::class];
    }

    protected function getEnvironmentSetUp($app): void
    {
        $app['config']->set('banzami.webhook_secret', 'test-secret');
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function signedPayload(array $data): array
    {
        $body = json_encode($data);
        $sig  = 'sha256=' . hash_hmac('sha256', $body, 'test-secret');

        return [$body, $sig];
    }

    private function postWebhook(string $body, string $signature): \Illuminate\Testing\TestResponse
    {
        return $this->call(
            'POST',
            route('banzami.webhook'),
            [],
            [],
            [],
            ['HTTP_Banza-Signature' => $signature, 'CONTENT_TYPE' => 'application/json'],
            $body,
        );
    }

    // -------------------------------------------------------------------------
    // Typed event dispatch
    // -------------------------------------------------------------------------

    public function test_transaction_completed_dispatches_event(): void
    {
        Event::fake();

        [$body, $sig] = $this->signedPayload([
            'type'    => 'transaction.completed',
            'payload' => ['id' => 'txn_1', 'amount' => 5000],
        ]);

        $this->postWebhook($body, $sig)->assertStatus(200);

        Event::assertDispatched(TransactionCompleted::class, function ($e) {
            return $e->payload['id'] === 'txn_1';
        });
    }

    public function test_transaction_failed_dispatches_event(): void
    {
        Event::fake();

        [$body, $sig] = $this->signedPayload([
            'type'    => 'transaction.failed',
            'payload' => ['id' => 'txn_2', 'reason' => 'insufficient_funds'],
        ]);

        $this->postWebhook($body, $sig)->assertStatus(200);

        Event::assertDispatched(TransactionFailed::class, function ($e) {
            return $e->payload['reason'] === 'insufficient_funds';
        });
    }

    public function test_payment_link_used_dispatches_event(): void
    {
        Event::fake();

        [$body, $sig] = $this->signedPayload([
            'type'    => 'payment_link.used',
            'payload' => ['link_id' => 'lnk_99'],
        ]);

        $this->postWebhook($body, $sig)->assertStatus(200);

        Event::assertDispatched(PaymentLinkUsed::class, function ($e) {
            return $e->payload['link_id'] === 'lnk_99';
        });
    }

    public function test_wallet_provisioned_dispatches_event(): void
    {
        Event::fake();

        [$body, $sig] = $this->signedPayload([
            'type'    => 'wallet.provisioned',
            'payload' => ['wallet_id' => 'wal_42', 'merchant_id' => 'mch_1'],
        ]);

        $this->postWebhook($body, $sig)->assertStatus(200);

        Event::assertDispatched(WalletProvisioned::class, function ($e) {
            return $e->wallet['wallet_id'] === 'wal_42';
        });
    }

    public function test_payout_requested_dispatches_event(): void
    {
        Event::fake();

        [$body, $sig] = $this->signedPayload([
            'type'    => 'payout.requested',
            'payload' => ['payout_id' => 'pay_7', 'amount' => 20000],
        ]);

        $this->postWebhook($body, $sig)->assertStatus(200);

        Event::assertDispatched(PayoutRequested::class, function ($e) {
            return $e->payout['payout_id'] === 'pay_7';
        });
    }

    // -------------------------------------------------------------------------
    // Generic event is always dispatched
    // -------------------------------------------------------------------------

    public function test_unknown_event_type_returns_200_and_dispatches_generic(): void
    {
        Event::fake();

        [$body, $sig] = $this->signedPayload([
            'type'    => 'some.future.event',
            'payload' => ['foo' => 'bar'],
        ]);

        $this->postWebhook($body, $sig)->assertStatus(200);

        Event::assertDispatched('banzami.webhook');
        Event::assertNotDispatched(TransactionCompleted::class);
        Event::assertNotDispatched(TransactionFailed::class);
        Event::assertNotDispatched(PaymentLinkUsed::class);
        Event::assertNotDispatched(WalletProvisioned::class);
        Event::assertNotDispatched(PayoutRequested::class);
    }

    // -------------------------------------------------------------------------
    // Signature verification
    // -------------------------------------------------------------------------

    public function test_invalid_signature_returns_401(): void
    {
        [$body] = $this->signedPayload(['type' => 'transaction.completed', 'payload' => []]);

        $this->postWebhook($body, 'sha256=badsignature')->assertStatus(401);
    }

    public function test_missing_signature_header_returns_401(): void
    {
        $body = json_encode(['type' => 'transaction.completed', 'payload' => []]);

        // Pass an empty string, which is what the controller receives when the
        // header is absent (header() returns null → fallback to '').
        $this->postWebhook($body, '')->assertStatus(401);
    }
}
