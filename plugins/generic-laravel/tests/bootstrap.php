<?php

require_once __DIR__ . '/../vendor/autoload.php';

// Provide stub classes for the banzami/banzami-php SDK so the test suite
// runs without requiring the real HTTP client to be installed or reachable.
// These stubs replicate only the interface that the Laravel package depends on.

if (!class_exists(\Banzami\BanzamiException::class)) {
    class_alias(\RuntimeException::class, \Banzami\BanzamiException::class);
}

if (!class_exists(\Banzami\BanzamiClient::class)) {
    class BanzamiClientStub
    {
        public function __construct(string $gatewayUrl, string $apiKey) {}
    }
    class_alias(BanzamiClientStub::class, \Banzami\BanzamiClient::class);
}

if (!class_exists(\Banzami\WebhookHandler::class)) {
    class WebhookHandlerStub
    {
        public function __construct(private readonly string $secret) {}

        public function parse(string $body, string $signature): array
        {
            $expected = 'sha256=' . hash_hmac('sha256', $body, $this->secret);

            if (!hash_equals($expected, $signature)) {
                throw new \Banzami\BanzamiException('Invalid webhook signature');
            }

            return json_decode($body, true);
        }
    }
    class_alias(WebhookHandlerStub::class, \Banzami\WebhookHandler::class);
}
