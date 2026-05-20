<?php

declare(strict_types=1);

namespace Banza;

/**
 * Banzami API client for PHP.
 *
 * Requires only ext-json and a working HTTP stack (curl or allow_url_fopen).
 * No external dependencies — drop this library into any PHP project.
 *
 * Usage:
 *   $client = new BanzaClient('https://api.banzami.ao', 'bz_live_...');
 *   $link   = $client->createPaymentLink([
 *       'merchant_id'  => '...',
 *       'wallet_id'    => '...',
 *       'amount_minor' => 50000,
 *       'currency'     => 'AOA',
 *       'description'  => 'Pedido #123',
 *   ]);
 *   echo $link['slug']; // redirect customer to pay.banzami.co/{slug}
 */
class BanzaClient
{
    private string $baseUrl;
    private string $apiKey;
    private int    $timeout;
    /** @var callable|null */
    private $httpHandler;
    private int $maxRetries;
    private int $retryDelayMs;
    /**
     * Observability hooks.
     *
     * Keys: 'onRequest', 'onResponse', 'onError'
     *   onRequest  fn(string $method, string $path, int $attempt): void
     *   onResponse fn(string $method, string $path, int $status, int $durationMs): void
     *   onError    fn(string $method, string $path, \Throwable $err, int $attempts): void
     *
     * @var array<string, callable>
     */
    private array $hooks;

    /**
     * @param callable|null          $httpHandler  Test seam — never pass this in production.
     *                                             Signature: fn(string $method, string $url, array $headers, ?string $body): array{status: int, body: string}
     * @param int                    $maxRetries   Maximum number of retry attempts after the first (default 3).
     * @param int                    $retryDelayMs Base delay in milliseconds for exponential backoff (default 500ms).
     * @param array<string,callable> $hooks        Optional observability hooks.
     */
    public function __construct(
        string $baseUrl,
        string $apiKey,
        int $timeout = 30,
        ?callable $httpHandler = null,
        int $maxRetries = 3,
        int $retryDelayMs = 500,
        array $hooks = []
    ) {
        $this->baseUrl      = rtrim($baseUrl, '/');
        $this->apiKey       = $apiKey;
        $this->timeout      = $timeout;
        $this->httpHandler  = $httpHandler;
        $this->maxRetries   = $maxRetries;
        $this->retryDelayMs = $retryDelayMs;
        $this->hooks        = $hooks;
    }

    // -------------------------------------------------------------------------
    // Payment Links
    // -------------------------------------------------------------------------

    /**
     * Create a shareable payment link.
     *
     * @param array{
     *   merchant_id: string,
     *   wallet_id: string,
     *   amount_minor?: int,
     *   currency: string,
     *   description?: string,
     *   expires_at?: string,
     * } $params
     * @return array The created payment link object.
     * @throws BanzamiException
     */
    public function createPaymentLink(array $params): array
    {
        return $this->post('/v1/payment-links', $params);
    }

    /**
     * List payment links for a merchant.
     *
     * @return array{items: array, next_cursor: ?string}
     * @throws BanzamiException
     */
    public function listPaymentLinks(string $merchantId, int $limit = 20, ?string $cursor = null): array
    {
        $query = http_build_query(array_filter([
            'merchant_id' => $merchantId,
            'limit'       => $limit,
            'cursor'      => $cursor,
        ]));
        return $this->get("/v1/payment-links?{$query}");
    }

    /**
     * Get a payment link by ID.
     *
     * @throws BanzamiException
     */
    public function getPaymentLink(string $id): array
    {
        return $this->get("/v1/payment-links/{$id}");
    }

    /**
     * Cancel a payment link.
     *
     * @throws BanzamiException
     */
    public function cancelPaymentLink(string $id): array
    {
        return $this->post("/v1/payment-links/{$id}/cancel", []);
    }

    // -------------------------------------------------------------------------
    // Transactions
    // -------------------------------------------------------------------------

    /**
     * Create a payment transaction.
     *
     * @param array{
     *   wallet_id: string,
     *   amount_minor: int,
     *   currency: string,
     *   description?: string,
     *   idempotency_key?: string,
     * } $params
     * @throws BanzamiException
     */
    public function createTransaction(array $params): array
    {
        return $this->post('/v1/transactions', $params);
    }

    /**
     * Get a transaction by ID.
     *
     * @throws BanzamiException
     */
    public function getTransaction(string $id): array
    {
        return $this->get("/v1/transactions/{$id}");
    }

    /**
     * List transactions for a merchant.
     *
     * @throws BanzamiException
     */
    public function listTransactions(string $merchantId, int $limit = 20, ?string $cursor = null): array
    {
        $query = http_build_query(array_filter([
            'merchant_id' => $merchantId,
            'limit'       => $limit,
            'cursor'      => $cursor,
        ]));
        return $this->get("/v1/transactions?{$query}");
    }

    // -------------------------------------------------------------------------
    // Wallets
    // -------------------------------------------------------------------------

    /**
     * Provision a new wallet for a merchant.
     *
     * @param array{
     *   merchant_id: string,
     *   currency: string,
     * } $params
     * @throws BanzamiException
     */
    public function provisionWallet(array $params): array
    {
        return $this->post('/v1/wallets', $params);
    }

    /**
     * Get a wallet by ID.
     *
     * @throws BanzamiException
     */
    public function getWallet(string $id): array
    {
        return $this->get("/v1/wallets/{$id}");
    }

    /**
     * Get the current balance for a wallet.
     *
     * @throws BanzamiException
     */
    public function getWalletBalance(string $id): array
    {
        return $this->get("/v1/wallets/{$id}/balance");
    }

    // -------------------------------------------------------------------------
    // Payouts
    // -------------------------------------------------------------------------

    /**
     * Create a payout from a wallet to a bank account.
     *
     * @param array{
     *   wallet_id: string,
     *   amount_minor: int,
     *   currency: string,
     *   destination_bank_account: string,
     *   idempotency_key?: string,
     * } $params
     * @throws BanzamiException
     */
    public function createPayout(array $params): array
    {
        return $this->post('/v1/payouts', $params);
    }

    /**
     * List payouts for a merchant.
     *
     * @return array{items: array, next_cursor: ?string}
     * @throws BanzamiException
     */
    public function listPayouts(string $merchantId, int $limit = 20, ?string $cursor = null): array
    {
        $query = http_build_query(array_filter([
            'merchant_id' => $merchantId,
            'limit'       => $limit,
            'cursor'      => $cursor,
        ]));
        return $this->get("/v1/payouts?{$query}");
    }

    /**
     * Get a payout by ID.
     *
     * @throws BanzamiException
     */
    public function getPayout(string $id): array
    {
        return $this->get("/v1/payouts/{$id}");
    }

    // -------------------------------------------------------------------------
    // Merchants
    // -------------------------------------------------------------------------

    /**
     * Get a merchant by ID.
     *
     * @throws BanzamiException
     */
    public function getMerchant(string $id): array
    {
        return $this->get("/v1/merchants/{$id}");
    }

    // -------------------------------------------------------------------------
    // Public (unauthenticated) endpoints
    // -------------------------------------------------------------------------

    /**
     * Resolve a payment link by its public slug.
     * Does not send an Authorization header — safe to call from a public checkout page.
     *
     * @throws BanzamiException
     */
    public function resolvePaymentLink(string $slug): array
    {
        return $this->request('GET', "/v1/public/pay/{$slug}", null, false);
    }

    // -------------------------------------------------------------------------
    // Webhooks
    // -------------------------------------------------------------------------

    /**
     * Verify an incoming Banzami webhook signature.
     *
     * The webhook payload is signed with HMAC-SHA256 using the webhook secret.
     * The signature header is in the format: sha256=<hex_digest>
     *
     * @param string $rawBody    Raw request body (do NOT decode).
     * @param string $signature  Value of the Banza-Signature header.
     * @param string $secret     Webhook secret from the Banzami dashboard.
     */
    public static function verifyWebhookSignature(
        string $rawBody,
        string $signature,
        string $secret
    ): bool {
        if (empty($signature)) {
            return false;
        }
        $expected = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
        return hash_equals($expected, $signature);
    }

    // -------------------------------------------------------------------------
    // Money helpers
    // -------------------------------------------------------------------------

    /**
     * Format a minor-unit amount for display.
     * AOA: integer kwanzas. USD and others: divided by 100.
     */
    public static function formatAmount(int $amountMinor, string $currency): string
    {
        if (strtoupper($currency) === 'AOA') {
            return number_format($amountMinor, 0, ',', '.') . ' Kz';
        }
        return number_format($amountMinor / 100, 2, ',', '.') . ' ' . strtoupper($currency);
    }

    /**
     * Convert a decimal total to minor units.
     * AOA: round to integer kwanzas. Others: multiply by 100.
     */
    public static function toMinorUnits(float $total, string $currency): int
    {
        if (strtoupper($currency) === 'AOA') {
            return (int) round($total);
        }
        return (int) round($total * 100);
    }

    // -------------------------------------------------------------------------
    // HTTP internals
    // -------------------------------------------------------------------------

    private function post(string $path, array $body): array
    {
        return $this->request('POST', $path, $body);
    }

    private function get(string $path): array
    {
        return $this->request('GET', $path);
    }

    protected function request(
        string $method,
        string $path,
        ?array $body = null,
        bool $authenticated = true
    ): array {
        // Generate idempotency key once before the first attempt so all retries
        // of the same logical operation share the key — critical for financial safety.
        $idempotencyKey = ($method === 'POST') ? $this->generateIdempotencyKey() : null;
        $lastException  = null;

        for ($attempt = 0; $attempt <= $this->maxRetries; $attempt++) {
            if ($attempt > 0) {
                $delayUs = ($this->retryDelayMs * (2 ** ($attempt - 1))) * 1000;
                usleep($delayUs);
            }
            if (isset($this->hooks['onRequest'])) {
                ($this->hooks['onRequest'])($method, $path, $attempt);
            }
            try {
                $t0     = (int) round(microtime(true) * 1000);
                $result = $this->executeRequest($method, $path, $body, $authenticated, $idempotencyKey);
                if (isset($this->hooks['onResponse'])) {
                    ($this->hooks['onResponse'])($method, $path, 200, (int) round(microtime(true) * 1000) - $t0);
                }
                return $result;
            } catch (BanzamiException $e) {
                if (!$this->shouldRetry($e->getCode(), $attempt)) {
                    if (isset($this->hooks['onError'])) {
                        ($this->hooks['onError'])($method, $path, $e, $attempt + 1);
                    }
                    throw $e;
                }
                $lastException = $e;
            }
        }
        if (isset($this->hooks['onError'])) {
            ($this->hooks['onError'])($method, $path, $lastException, $this->maxRetries + 1);
        }
        throw $lastException;
    }

    private function executeRequest(
        string $method,
        string $path,
        ?array $body,
        bool $authenticated,
        ?string $idempotencyKey
    ): array {
        $url  = $this->baseUrl . $path;
        $json = $body !== null ? json_encode($body, JSON_THROW_ON_ERROR) : null;

        $headers = [
            'Accept: application/json',
            'Content-Type: application/json',
        ];

        if ($authenticated) {
            $headers[] = 'Authorization: Bearer ' . $this->apiKey;
        }

        if ($idempotencyKey !== null) {
            $headers[] = 'Idempotency-Key: ' . $idempotencyKey;
        }

        if ($this->httpHandler !== null) {
            $result = ($this->httpHandler)($method, $url, $headers, $json);
            $code   = $result['status'];
            $raw    = $result['body'];
        } else {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => $this->timeout,
                CURLOPT_HTTPHEADER     => $headers,
                CURLOPT_CUSTOMREQUEST  => $method,
            ]);

            if ($json !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
            }

            $raw  = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err  = curl_error($ch);
            curl_close($ch);

            if ($raw === false) {
                throw new BanzamiException("cURL error: {$err}", 0);
            }
        }

        $data = json_decode((string) $raw, true, 512, JSON_THROW_ON_ERROR);

        if ($code >= 400) {
            $message = $data['error']['message'] ?? "HTTP {$code}";
            $errCode = $data['error']['code']    ?? 'UNKNOWN';
            throw new BanzamiException("{$errCode}: {$message}", $code);
        }

        return $data;
    }

    private function shouldRetry(int $httpCode, int $attempt): bool
    {
        if ($attempt >= $this->maxRetries) {
            return false;
        }
        // Retry on network errors (code 0), rate limiting, and transient server errors.
        // Never retry 4xx client errors (except 429) — they won't resolve on their own.
        return $httpCode === 0
            || $httpCode === 429
            || ($httpCode >= 500 && $httpCode <= 599);
    }

    private function generateIdempotencyKey(): string
    {
        return bin2hex(random_bytes(16));
    }
}
