<?php

declare(strict_types=1);

namespace Banzami\Tests;

use Banzami\Webhooks;
use Banzami\Exceptions\WebhookSignatureException;
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

    /** A2-03: an event signed with the empty key is never accepted. */
    public function testRefusesAnEmptySecret(): void
    {
        $body = '{"type":"payment_link.paid","id":"evt_1"}';
        foreach (['', '   '] as $secret) {
            try {
                Webhooks::verifySignature($body, $this->sign($body, ''), $secret);
                $this->fail("secret '{$secret}': an event signed with the empty key was accepted");
            } catch (WebhookSignatureException $e) {
                $this->addToAssertionCount(1);
            }
        }
    }

    /**
     * A3-04: the MAC was computed over the raw `t` while freshness read (int) $t,
     * so a `t` of "<T>.<first bytes of the body>" verified a body never signed.
     */
    public function testRefusesATimestampThatIsNotDigits(): void
    {
        $secret = 'whsec_test';
        $ts     = time();
        $full   = '{"created_at":"2026-09-11T10:00:00.123Z","type":"payment_link.paid"}';
        // Split the signed input "<ts>.<body>" at the body's first '.' and move
        // the head into the header's t.
        $cut      = strpos($full, '.');
        $head     = substr($full, 0, $cut);
        $tail     = substr($full, $cut + 1);
        $v1       = hash_hmac('sha256', "{$ts}.{$full}", $secret);
        $header   = "t={$ts}.{$head},v1={$v1}";

        $this->expectException(WebhookSignatureException::class);
        Webhooks::verifySignature($tail, $header, $secret);
    }
}
