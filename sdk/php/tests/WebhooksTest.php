<?php

declare(strict_types=1);

namespace Banzami\Tests;

use Banzami\Webhooks;
use Banzami\WebhookSignatureException;
use PHPUnit\Framework\TestCase;

/**
 * Banza-Signature webhook wire-contract tests (mirrors the TypeScript/Go SDKs
 * and the gateway signer). The HMAC input is "<unix>.<rawBody>".
 */
final class WebhooksTest extends TestCase
{
    private function sign(string $body, string $secret, ?int $ts = null): string
    {
        $ts ??= time();
        $v1 = hash_hmac('sha256', "{$ts}.{$body}", $secret);
        return "t={$ts},v1={$v1}";
    }

    public function testConstructEventAcceptsValidSignature(): void
    {
        $secret = 'whsec_test';
        $body   = '{"type":"payment.completed","id":"evt_1"}';
        $event  = Webhooks::constructEvent($body, $this->sign($body, $secret), $secret);

        $this->assertSame('payment.completed', $event['type']);
        $this->assertSame('evt_1', $event['id']);
    }

    public function testRejectsTamperedPayload(): void
    {
        $secret = 'whsec_test';
        $sig    = $this->sign('{"amount":100}', $secret);

        $this->expectException(WebhookSignatureException::class);
        Webhooks::verifySignature('{"amount":999999}', $sig, $secret);
    }

    public function testRejectsWrongSecret(): void
    {
        $body = '{"type":"payout.sent"}';
        $sig  = $this->sign($body, 'whsec_real');

        $this->expectException(WebhookSignatureException::class);
        Webhooks::verifySignature($body, $sig, 'whsec_attacker');
    }

    public function testRejectsReplayOutsideTolerance(): void
    {
        $secret = 'whsec_test';
        $body   = '{"type":"payment.completed"}';
        // Signed 10 minutes ago, tolerance 60s → rejected.
        $sig = $this->sign($body, $secret, time() - 600);

        $this->expectException(WebhookSignatureException::class);
        Webhooks::verifySignature($body, $sig, $secret, 60);
    }
}
