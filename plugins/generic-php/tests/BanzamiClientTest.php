<?php

declare(strict_types=1);

namespace Banzami\Tests;

use Banzami\BanzamiClient;
use Banzami\BanzamiException;
use PHPUnit\Framework\TestCase;

class BanzamiClientTest extends TestCase
{
    private function makeClient(int $status, array $responseBody): BanzamiClient
    {
        $handler = function (string $method, string $url, array $headers, ?string $body) use ($status, $responseBody): array {
            return ['status' => $status, 'body' => json_encode($responseBody)];
        };
        return new BanzamiClient('https://api.banzami.ao', 'bz_test_key', 30, $handler);
    }

    // -------------------------------------------------------------------------
    // Payment Links
    // -------------------------------------------------------------------------

    public function testCreatePaymentLinkHappyPath(): void
    {
        $fixture = [
            'id'          => 'pl_abc123',
            'slug'        => 'abc123',
            'merchant_id' => 'merch_1',
            'amount'      => ['minor' => 50000, 'currency' => 'AOA'],
            'status'      => 'active',
        ];
        $client = $this->makeClient(201, $fixture);

        $result = $client->createPaymentLink([
            'merchant_id'  => 'merch_1',
            'wallet_id'    => 'wal_1',
            'amount_minor' => 50000,
            'currency'     => 'AOA',
            'description'  => 'Pedido #1',
        ]);

        $this->assertSame('pl_abc123', $result['id']);
        $this->assertSame('abc123', $result['slug']);
    }

    public function testCreatePaymentLinkValidationError(): void
    {
        $this->expectException(BanzamiException::class);
        $this->expectExceptionCode(422);

        $client = $this->makeClient(422, [
            'error' => ['code' => 'VALIDATION_ERROR', 'message' => 'currency is required'],
        ]);
        $client->createPaymentLink(['merchant_id' => 'merch_1', 'wallet_id' => 'wal_1']);
    }

    public function testGetPaymentLinkHappyPath(): void
    {
        $fixture = ['id' => 'pl_abc123', 'slug' => 'abc123', 'status' => 'active'];
        $client  = $this->makeClient(200, $fixture);

        $result = $client->getPaymentLink('pl_abc123');

        $this->assertSame('pl_abc123', $result['id']);
        $this->assertSame('active', $result['status']);
    }

    public function testGetPaymentLinkNotFound(): void
    {
        $this->expectException(BanzamiException::class);
        $this->expectExceptionCode(404);

        $client = $this->makeClient(404, [
            'error' => ['code' => 'NOT_FOUND', 'message' => 'payment link not found'],
        ]);
        $client->getPaymentLink('pl_missing');
    }

    public function testCancelPaymentLink(): void
    {
        $fixture = ['id' => 'pl_abc123', 'status' => 'cancelled'];
        $client  = $this->makeClient(200, $fixture);

        $result = $client->cancelPaymentLink('pl_abc123');

        $this->assertSame('cancelled', $result['status']);
    }

    // -------------------------------------------------------------------------
    // Transactions
    // -------------------------------------------------------------------------

    public function testCreateTransactionHappyPath(): void
    {
        $fixture = [
            'id'       => 'txn_xyz',
            'status'   => 'pending',
            'amount'   => ['minor' => 10000, 'currency' => 'AOA'],
        ];
        $client = $this->makeClient(201, $fixture);

        $result = $client->createTransaction([
            'wallet_id'    => 'wal_1',
            'amount_minor' => 10000,
            'currency'     => 'AOA',
        ]);

        $this->assertSame('txn_xyz', $result['id']);
        $this->assertSame('pending', $result['status']);
    }

    public function testCreateTransactionInsufficientFunds(): void
    {
        $this->expectException(BanzamiException::class);
        $this->expectExceptionCode(422);

        $client = $this->makeClient(422, [
            'error' => ['code' => 'INSUFFICIENT_FUNDS', 'message' => 'wallet balance is too low'],
        ]);
        $client->createTransaction([
            'wallet_id'    => 'wal_1',
            'amount_minor' => 99999999,
            'currency'     => 'AOA',
        ]);
    }

    public function testListTransactionsWithCursor(): void
    {
        $fixture = [
            'items'       => [['id' => 'txn_1'], ['id' => 'txn_2']],
            'next_cursor' => 'cursor_abc',
        ];
        // Capture URL to verify cursor is forwarded
        $capturedUrl = null;
        $handler = function (string $method, string $url, array $headers, ?string $body) use ($fixture, &$capturedUrl): array {
            $capturedUrl = $url;
            return ['status' => 200, 'body' => json_encode($fixture)];
        };
        $client = new BanzamiClient('https://api.banzami.ao', 'bz_test_key', 30, $handler);

        $result = $client->listTransactions('merch_1', 10, 'cursor_prev');

        $this->assertCount(2, $result['items']);
        $this->assertSame('cursor_abc', $result['next_cursor']);
        $this->assertStringContainsString('cursor=cursor_prev', $capturedUrl);
        $this->assertStringContainsString('limit=10', $capturedUrl);
    }

    // -------------------------------------------------------------------------
    // Wallets
    // -------------------------------------------------------------------------

    public function testProvisionWallet(): void
    {
        $fixture = ['id' => 'wal_new', 'merchant_id' => 'merch_1', 'currency' => 'AOA'];
        $client  = $this->makeClient(201, $fixture);

        $result = $client->provisionWallet(['merchant_id' => 'merch_1', 'currency' => 'AOA']);

        $this->assertSame('wal_new', $result['id']);
        $this->assertSame('AOA', $result['currency']);
    }

    public function testGetWalletBalance(): void
    {
        $fixture = ['wallet_id' => 'wal_1', 'available_minor' => 75000, 'currency' => 'AOA'];
        $client  = $this->makeClient(200, $fixture);

        $result = $client->getWalletBalance('wal_1');

        $this->assertSame(75000, $result['available_minor']);
    }

    // -------------------------------------------------------------------------
    // Payouts
    // -------------------------------------------------------------------------

    public function testCreatePayout(): void
    {
        $fixture = ['id' => 'pay_1', 'status' => 'pending', 'amount' => ['minor' => 30000, 'currency' => 'AOA']];
        $client  = $this->makeClient(201, $fixture);

        $result = $client->createPayout([
            'wallet_id'                => 'wal_1',
            'amount_minor'             => 30000,
            'currency'                 => 'AOA',
            'destination_bank_account' => 'IBAN_AO_123',
        ]);

        $this->assertSame('pay_1', $result['id']);
        $this->assertSame('pending', $result['status']);
    }

    public function testListPayouts(): void
    {
        $fixture = ['items' => [['id' => 'pay_1'], ['id' => 'pay_2']], 'next_cursor' => null];
        $capturedUrl = null;
        $handler = function (string $method, string $url, array $headers, ?string $body) use ($fixture, &$capturedUrl): array {
            $capturedUrl = $url;
            return ['status' => 200, 'body' => json_encode($fixture)];
        };
        $client = new BanzamiClient('https://api.banzami.ao', 'bz_test_key', 30, $handler);

        $result = $client->listPayouts('merch_1', 5);

        $this->assertCount(2, $result['items']);
        $this->assertStringContainsString('merchant_id=merch_1', $capturedUrl);
        $this->assertStringContainsString('limit=5', $capturedUrl);
    }

    // -------------------------------------------------------------------------
    // Merchants
    // -------------------------------------------------------------------------

    public function testGetMerchant(): void
    {
        $fixture = ['id' => 'merch_1', 'name' => 'Loja ABC', 'status' => 'active'];
        $client  = $this->makeClient(200, $fixture);

        $result = $client->getMerchant('merch_1');

        $this->assertSame('merch_1', $result['id']);
        $this->assertSame('Loja ABC', $result['name']);
    }

    // -------------------------------------------------------------------------
    // Public payment link resolution
    // -------------------------------------------------------------------------

    public function testResolvePaymentLinkDoesNotSendAuthHeader(): void
    {
        $capturedHeaders = [];
        $handler = function (string $method, string $url, array $headers, ?string $body) use (&$capturedHeaders): array {
            $capturedHeaders = $headers;
            return ['status' => 200, 'body' => json_encode(['slug' => 'abc123', 'amount' => ['minor' => 5000, 'currency' => 'AOA']])];
        };
        $client = new BanzamiClient('https://api.banzami.ao', 'bz_test_key', 30, $handler);

        $result = $client->resolvePaymentLink('abc123');

        $this->assertSame('abc123', $result['slug']);
        foreach ($capturedHeaders as $header) {
            $this->assertStringNotContainsString('Authorization', $header);
        }
    }

    // -------------------------------------------------------------------------
    // Money helpers
    // -------------------------------------------------------------------------

    public function testFormatAmountAOA(): void
    {
        $this->assertSame('1.500 Kz', BanzamiClient::formatAmount(1500, 'AOA'));
        $this->assertSame('50.000 Kz', BanzamiClient::formatAmount(50000, 'AOA'));
    }

    public function testFormatAmountUSD(): void
    {
        $this->assertSame('15,00 USD', BanzamiClient::formatAmount(1500, 'USD'));
        $this->assertSame('500,00 USD', BanzamiClient::formatAmount(50000, 'USD'));
    }

    public function testToMinorUnitsAOA(): void
    {
        $this->assertSame(1500, BanzamiClient::toMinorUnits(1500.0, 'AOA'));
        $this->assertSame(1500, BanzamiClient::toMinorUnits(1499.6, 'AOA'));
    }

    public function testToMinorUnitsUSD(): void
    {
        $this->assertSame(1500, BanzamiClient::toMinorUnits(15.00, 'USD'));
        $this->assertSame(999, BanzamiClient::toMinorUnits(9.99, 'USD'));
    }

    // -------------------------------------------------------------------------
    // Webhook signature
    // -------------------------------------------------------------------------

    public function testVerifyWebhookSignatureValid(): void
    {
        $secret  = 'webhook_secret_123';
        $body    = '{"type":"transaction.completed","payload":{}}';
        $sig     = 'sha256=' . hash_hmac('sha256', $body, $secret);

        $this->assertTrue(BanzamiClient::verifyWebhookSignature($body, $sig, $secret));
    }

    public function testVerifyWebhookSignatureInvalid(): void
    {
        $secret = 'webhook_secret_123';
        $body   = '{"type":"transaction.completed","payload":{}}';
        $sig    = 'sha256=invalidsignature';

        $this->assertFalse(BanzamiClient::verifyWebhookSignature($body, $sig, $secret));
    }

    public function testVerifyWebhookSignatureEmpty(): void
    {
        $this->assertFalse(BanzamiClient::verifyWebhookSignature('body', '', 'secret'));
    }
}
