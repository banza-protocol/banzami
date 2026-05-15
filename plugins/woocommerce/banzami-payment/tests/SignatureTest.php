<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

class SignatureTest extends TestCase
{
    private function sign(string $body, string $secret): string
    {
        return 'sha256=' . hash_hmac('sha256', $body, $secret);
    }

    private function verify(string $body, string $signature, string $secret): bool
    {
        $method = new ReflectionMethod(Banzami_Webhook_Handler::class, 'verify_signature');
        $method->setAccessible(true);
        return $method->invoke(null, $body, $signature, $secret);
    }

    public function test_valid_signature_returns_true(): void
    {
        $body   = '{"type":"transaction.completed"}';
        $secret = 'test-secret';
        $this->assertTrue($this->verify($body, $this->sign($body, $secret), $secret));
    }

    public function test_wrong_secret_returns_false(): void
    {
        $body = '{"type":"transaction.completed"}';
        $this->assertFalse($this->verify($body, $this->sign($body, 'real-secret'), 'wrong-secret'));
    }

    public function test_tampered_body_returns_false(): void
    {
        $secret = 'test-secret';
        $sig    = $this->sign('original body', $secret);
        $this->assertFalse($this->verify('tampered body', $sig, $secret));
    }

    public function test_empty_signature_returns_false(): void
    {
        $this->assertFalse($this->verify('body', '', 'secret'));
    }

    public function test_missing_sha256_prefix_returns_false(): void
    {
        $body   = 'body';
        $secret = 'secret';
        $rawHex = hash_hmac('sha256', $body, $secret);
        $this->assertFalse($this->verify($body, $rawHex, $secret));
    }
}
