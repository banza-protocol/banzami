<?php

declare(strict_types=1);

namespace Banzami;

use Banzami\Exceptions\ApiException;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestFactoryInterface;
use Psr\Http\Message\StreamFactoryInterface;

/**
 * Banzami PHP SDK — official server-side client.
 *
 * All financial operations on the Banzami network must flow through this
 * client. Direct HTTP integrations bypass idempotency, retry logic, and
 * signature verification provided by the SDK layer.
 *
 * @see https://banzami.com/docs/sdk/php
 */
class BanzamiClient
{
    private const DEFAULT_BASE_URLS = [
        'live'    => 'https://api.banzami.com',
        'sandbox' => 'https://sandbox-api.banzami.com',
    ];

    private string $baseUrl;
    private ?string $jwt       = null;
    private ?int   $jwtExpiry  = null;

    /** Webhook helpers. Access via $client->webhooks->... */
    public readonly Webhooks $webhooks;

    public function __construct(
        private readonly string                  $apiKey,
        private readonly string                  $environment   = 'live',
        ?string                                  $baseUrl       = null,
        private readonly int                     $maxRetries    = 3,
        private readonly int                     $retryDelay    = 500,
        private readonly ?ClientInterface        $httpClient    = null,
        private readonly ?RequestFactoryInterface $requestFactory = null,
        private readonly ?StreamFactoryInterface  $streamFactory  = null,
    ) {
        $this->baseUrl  = rtrim($baseUrl ?? self::DEFAULT_BASE_URLS[$environment], '/');
        $this->webhooks = new Webhooks();
    }

    // -------------------------------------------------------------------------
    // Authentication — JWT exchange (transparent)
    // -------------------------------------------------------------------------

    private function ensureJwt(): void
    {
        $buffer = 5 * 60; // renew 5 min before expiry
        if ($this->jwt !== null && $this->jwtExpiry !== null && time() < $this->jwtExpiry - $buffer) {
            return;
        }

        $res  = $this->rawRequest('POST', '/v1/auth/token', ['api_key' => $this->apiKey], authenticated: false);
        $this->jwt       = $res['token'];
        $this->jwtExpiry = strtotime($res['expires_at']);
    }

    // -------------------------------------------------------------------------
    // Internal HTTP
    // -------------------------------------------------------------------------

    /**
     * @param  array<string, mixed> $body
     * @return array<string, mixed>
     */
    private function request(string $method, string $path, array $body = [], bool $idempotent = false): array
    {
        $this->ensureJwt();
        return $this->rawRequest($method, "/v1{$path}", $body, authenticated: true, idempotent: $idempotent);
    }

    /**
     * @param  array<string, mixed> $body
     * @return array<string, mixed>
     */
    private function rawRequest(
        string $method,
        string $path,
        array  $body          = [],
        bool   $authenticated = true,
        bool   $idempotent    = false,
    ): array {
        $url     = $this->baseUrl . $path;
        $headers = ['Content-Type' => 'application/json', 'Accept' => 'application/json'];

        if ($authenticated && $this->jwt !== null) {
            $headers['Authorization'] = "Bearer {$this->jwt}";
        }
        if ($idempotent || $method === 'POST') {
            $headers['Idempotency-Key'] = $this->generateIdempotencyKey();
        }

        $jsonBody = $method !== 'GET' && $body !== [] ? json_encode($body, JSON_THROW_ON_ERROR) : null;

        $lastError = null;
        for ($attempt = 0; $attempt <= $this->maxRetries; $attempt++) {
            if ($attempt > 0) {
                usleep((int) ($this->retryDelay * 1000 * (2 ** ($attempt - 1))));
            }

            [$status, $responseBody] = $this->send($method, $url, $headers, $jsonBody);

            if ($status === 204) {
                return [];
            }

            $decoded = json_decode($responseBody, true, 512, JSON_THROW_ON_ERROR);

            if ($status >= 200 && $status < 300) {
                return $decoded;
            }

            $code    = $decoded['error']['code']    ?? 'UNKNOWN';
            $message = $decoded['error']['message'] ?? "HTTP {$status}";
            $exc     = new ApiException($status, $code, $message);

            if ($attempt < $this->maxRetries && in_array($status, [429, 502, 503, 504])) {
                $lastError = $exc;
                continue;
            }

            throw $exc;
        }

        throw $lastError;
    }

    /**
     * @param  array<string, string> $headers
     * @return array{int, string}
     */
    private function send(string $method, string $url, array $headers, ?string $body): array
    {
        if ($this->httpClient !== null && $this->requestFactory !== null && $this->streamFactory !== null) {
            $request = $this->requestFactory->createRequest($method, $url);
            foreach ($headers as $name => $value) {
                $request = $request->withHeader($name, $value);
            }
            if ($body !== null) {
                $request = $request->withBody($this->streamFactory->createStream($body));
            }
            $response = $this->httpClient->sendRequest($request);
            return [$response->getStatusCode(), (string) $response->getBody()];
        }

        // Fallback: built-in file_get_contents (zero dependency, works everywhere)
        $options = [
            'http' => [
                'method'        => $method,
                'header'        => array_map(fn($k, $v) => "{$k}: {$v}", array_keys($headers), $headers),
                'content'       => $body,
                'ignore_errors' => true,
            ],
        ];
        $context  = stream_context_create($options);
        $raw      = file_get_contents($url, false, $context);
        $raw      = $raw !== false ? $raw : '{}';

        // Parse HTTP status from $http_response_header
        $status   = 500;
        if (isset($http_response_header[0]) && preg_match('/HTTP\/\S+ (\d{3})/', $http_response_header[0], $m)) {
            $status = (int) $m[1];
        }

        return [$status, $raw];
    }

    private function generateIdempotencyKey(): string
    {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        );
    }

    private function qs(array $params): string
    {
        $filtered = array_filter($params, fn($v) => $v !== null);
        return $filtered ? '?' . http_build_query($filtered) : '';
    }

    // -------------------------------------------------------------------------
    // Transactions
    // -------------------------------------------------------------------------

    public function createTransaction(array $params): array
    {
        return $this->request('POST', '/transactions', [
            'idempotency_key'  => $params['idempotency_key'] ?? $this->generateIdempotencyKey(),
            'amount_minor'     => $params['amount_minor'],
            'currency'         => $params['currency'] ?? 'AOA',
            'description'      => $params['description'] ?? null,
            'wallet_id'        => $params['wallet_id'] ?? null,
            'transaction_type' => $params['transaction_type'] ?? 'payment',
        ]);
    }

    public function getTransaction(string $id): array
    {
        return $this->request('GET', "/transactions/{$id}");
    }

    public function listTransactions(int $limit = 20, ?string $cursor = null): array
    {
        return $this->request('GET', '/transactions' . $this->qs(['limit' => $limit, 'cursor' => $cursor]));
    }

    // -------------------------------------------------------------------------
    // Payment links — primary QR commerce surface
    // -------------------------------------------------------------------------

    public function createPaymentLink(array $params): array
    {
        return $this->request('POST', '/payment-links', [
            'merchant_id'  => $params['merchant_id'],
            'wallet_id'    => $params['wallet_id'],
            'currency'     => $params['currency'] ?? 'AOA',
            'amount_minor' => $params['amount_minor'] ?? null,
            'description'  => $params['description'] ?? null,
            'expires_at'   => $params['expires_at'] ?? null,
        ]);
    }

    public function getPaymentLink(string $id): array
    {
        return $this->request('GET', "/payment-links/{$id}");
    }

    public function listPaymentLinks(string $merchantId, int $limit = 20, ?string $cursor = null): array
    {
        return $this->request('GET', '/payment-links' . $this->qs([
            'merchant_id' => $merchantId,
            'limit'       => $limit,
            'cursor'      => $cursor,
        ]));
    }

    public function cancelPaymentLink(string $id): array
    {
        return $this->request('DELETE', "/payment-links/{$id}");
    }

    // -------------------------------------------------------------------------
    // Refunds
    // -------------------------------------------------------------------------

    /**
     * Issue a refund against a TYPED, captured payment source (BANZA ADR-030).
     * The source is always named explicitly — never a generic transfer, never
     * an inferred type.
     *
     * Required params: source_type (ACQUIRING_PAYMENT | WALLET_PAYMENT),
     * source_id, amount_minor, currency, idempotency_key. Optional: reason.
     *
     * idempotency_key is MANDATORY and validated before any HTTP dispatch: a
     * refund moves money, so the SDK never mints a key — a generated one would
     * let a retried refund create a second movement. Supply a stable,
     * server-generated key scoped to the refund intent.
     */
    public function createRefund(array $params): array
    {
        $key = $params['idempotency_key'] ?? null;
        if (!is_string($key) || trim($key) === '') {
            throw new \InvalidArgumentException(
                'createRefund requires an explicit idempotency_key (a stable, server-generated key scoped to the refund intent). The SDK does not generate one for financial writes.'
            );
        }
        return $this->request('POST', '/refunds', [
            'source_type'     => $params['source_type'],
            'source_id'       => $params['source_id'],
            'amount_minor'    => $params['amount_minor'],
            'currency'        => $params['currency'],
            'reason'          => $params['reason'] ?? null,
            'idempotency_key' => $key,
        ]);
    }

    public function getRefund(string $id): array
    {
        return $this->request('GET', "/refunds/{$id}");
    }

    public function listRefunds(int $limit = 20, ?string $sourceId = null): array
    {
        return $this->request('GET', '/refunds' . $this->qs([
            'limit'     => $limit,
            'source_id' => $sourceId,
        ]));
    }

    // -------------------------------------------------------------------------
    // Disputes
    // -------------------------------------------------------------------------

    public function openDispute(array $params): array
    {
        return $this->request('POST', '/disputes', [
            'transaction_id'    => $params['transaction_id'],
            // consumer_id is no longer sent: a dispute names no consumer the
            // caller asserts (the disputed payment has none).
            'amount_minor'      => $params['amount_minor'],
            'currency'          => $params['currency'] ?? 'AOA',
            'reason'            => $params['reason'],
            'evidence_deadline' => $params['evidence_deadline'] ?? null,
        ]);
    }

    public function getDispute(string $id): array
    {
        return $this->request('GET', "/disputes/{$id}");
    }

    public function listDisputes(int $limit = 20, ?string $status = null): array
    {
        return $this->request('GET', '/disputes' . $this->qs(['limit' => $limit, 'status' => $status]));
    }

    // Payment requests are not here: /v1/payment-requests was withdrawn by the
    // operator (RA-057) — it let a Business credential name any requester and
    // debit any payer — and every call answered 404.

    // -------------------------------------------------------------------------
    // Webhooks
    // -------------------------------------------------------------------------

    public function registerWebhookEndpoint(string $url, array $events): array
    {
        return $this->request('POST', '/webhooks/endpoints', ['url' => $url, 'events' => $events]);
    }

    public function listWebhookEndpoints(): array
    {
        return $this->request('GET', '/webhooks/endpoints');
    }

    public function deleteWebhookEndpoint(string $id): void
    {
        $this->request('DELETE', "/webhooks/endpoints/{$id}");
    }

    public function listWebhookEvents(int $limit = 20, ?string $cursor = null): array
    {
        return $this->request('GET', '/webhooks/events' . $this->qs(['limit' => $limit, 'cursor' => $cursor]));
    }

    // -------------------------------------------------------------------------
    // Wallets
    // -------------------------------------------------------------------------

    public function getWallet(string $id): array
    {
        return $this->request('GET', "/wallets/{$id}");
    }

    public function getWalletBalance(string $id): array
    {
        return $this->request('GET', "/wallets/{$id}/balance");
    }

    public function getWalletForMerchant(string $merchantId, string $currency = 'AOA'): array
    {
        return $this->request('GET', '/wallets' . $this->qs([
            'merchant_id' => $merchantId,
            'currency'    => $currency,
        ]));
    }
}
