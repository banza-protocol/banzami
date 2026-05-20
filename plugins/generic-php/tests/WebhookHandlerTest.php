<?php

declare(strict_types=1);

namespace Banza\Tests;

use Banza\BanzaClient;
use Banza\BanzamiException;
use Banza\WebhookHandler;
use PHPUnit\Framework\TestCase;

class WebhookHandlerTest extends TestCase
{
    private const SECRET = 'wh_secret_test';

    private function makeSignature(string $body): string
    {
        return 'sha256=' . hash_hmac('sha256', $body, self::SECRET);
    }

    public function testParseValidPayload(): void
    {
        $body    = json_encode(['type' => 'transaction.completed', 'payload' => ['id' => 'txn_1']]);
        $handler = new WebhookHandler(self::SECRET);

        $event = $handler->parse($body, $this->makeSignature($body));

        $this->assertSame('transaction.completed', $event['type']);
        $this->assertSame('txn_1', $event['payload']['id']);
    }

    public function testParsePaymentLinkUsedEvent(): void
    {
        $body    = json_encode(['type' => 'payment_link.used', 'payload' => ['slug' => 'abc123']]);
        $handler = new WebhookHandler(self::SECRET);

        $event = $handler->parse($body, $this->makeSignature($body));

        $this->assertSame('payment_link.used', $event['type']);
    }

    public function testParseThrowsOnInvalidSignature(): void
    {
        $this->expectException(BanzamiException::class);
        $this->expectExceptionCode(401);

        $body    = json_encode(['type' => 'transaction.completed', 'payload' => []]);
        $handler = new WebhookHandler(self::SECRET);

        $handler->parse($body, 'sha256=tampered_signature');
    }

    public function testParseThrowsOnEmptySignature(): void
    {
        $this->expectException(BanzamiException::class);
        $this->expectExceptionCode(401);

        $body    = json_encode(['type' => 'transaction.completed', 'payload' => []]);
        $handler = new WebhookHandler(self::SECRET);

        $handler->parse($body, '');
    }

    public function testParseThrowsOnMissingTypeField(): void
    {
        $this->expectException(BanzamiException::class);
        $this->expectExceptionCode(400);

        $body    = json_encode(['payload' => ['id' => 'txn_1']]);
        $handler = new WebhookHandler(self::SECRET);

        $handler->parse($body, $this->makeSignature($body));
    }
}
