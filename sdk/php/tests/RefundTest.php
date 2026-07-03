<?php

declare(strict_types=1);

namespace Banzami\Tests;

use Banzami\BanzamiClient;
use PHPUnit\Framework\TestCase;

/**
 * Typed-source refund contract (BANZA ADR-030) + financial-safety guard: the SDK
 * never mints an idempotency key for a refund. A refund moves money, so the
 * caller MUST supply a stable, server-generated key; omitting it throws BEFORE
 * any HTTP dispatch. Mirrors the TypeScript and Python SDKs.
 */
final class RefundTest extends TestCase
{
    private function client(): BanzamiClient
    {
        return new BanzamiClient('bz_test_key', 'sandbox');
    }

    public function testCreateRefundRequiresIdempotencyKey(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/idempotency_key/');
        // No idempotency_key → must throw before building any request.
        $this->client()->createRefund([
            'source_type'  => 'WALLET_PAYMENT',
            'source_id'    => 'wp_001',
            'amount_minor' => 100,
            'currency'     => 'AOA',
        ]);
    }

    public function testCreateRefundRejectsBlankIdempotencyKey(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/idempotency_key/');
        $this->client()->createRefund([
            'source_type'     => 'WALLET_PAYMENT',
            'source_id'       => 'wp_001',
            'amount_minor'    => 100,
            'currency'        => 'AOA',
            'idempotency_key' => '   ',
        ]);
    }
}
