<?php

declare(strict_types=1);

namespace Banzami;

/**
 * Banzami API client for PHP.
 *
 * Requires only ext-json and a working HTTP stack (curl or allow_url_fopen).
 * No external dependencies — drop this library into any PHP project.
 *
 * Usage:
 *   $client = new BanzamiClient('https://api.banzami.ao', 'bz_live_...');
 *   $link   = $client->createPaymentLink([
 *       'merchant_id'  => '...',
 *       'wallet_id'    => '...',
 *       'amount_minor' => 50000,
 *       'currency'     => 'AOA',
 *       'description'  => 'Pedido #123',
 *   ]);
 *   echo $link['slug']; // redirect customer to pay.banzami.co/{slug}
 */
class BanzamiClient
{
    private string $baseUrl;
    private string $apiKey;
    private int    $timeout;

    public function __construct(string $baseUrl, string $apiKey, int $timeout = 30)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->apiKey  = $apiKey;
        $this->timeout = $timeout;
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
    // Webhooks
    // -------------------------------------------------------------------------

    /**
     * Verify an incoming Banzami webhook signature.
     *
     * The webhook payload is signed with HMAC-SHA256 using the webhook secret.
     * The signature header is in the format: sha256=<hex_digest>
     *
     * @param string $rawBody    Raw request body (do NOT decode).
     * @param string $signature  Value of the X-Banzami-Signature header.
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

    private function request(string $method, string $path, ?array $body = null): array
    {
        $url  = $this->baseUrl . $path;
        $json = $body !== null ? json_encode($body, JSON_THROW_ON_ERROR) : null;

        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Accept: application/json',
            'Content-Type: application/json',
        ];

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
            throw new BanzamiException("cURL error: {$err}");
        }

        $data = json_decode((string) $raw, true, 512, JSON_THROW_ON_ERROR);

        if ($code >= 400) {
            $message = $data['error']['message'] ?? "HTTP {$code}";
            $errCode = $data['error']['code']    ?? 'UNKNOWN';
            throw new BanzamiException("{$errCode}: {$message}", $code);
        }

        return $data;
    }
}
