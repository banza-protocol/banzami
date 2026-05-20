<?php

declare(strict_types=1);

namespace Banzami;

use Banzami\Exceptions\WebhookSignatureException;

/**
 * Banzami webhook signature verification.
 *
 * Implements the canonical signature format:
 *   Banza-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>
 *
 * The HMAC is computed over: "{timestamp}.{raw_body}"
 *
 * Spec: docs/standards/webhook-signature-spec.md
 */
final class Webhooks
{
    public const SIGNATURE_HEADER   = 'Banza-Signature';
    public const TOLERANCE_SECONDS  = 300;

    /**
     * Verify the webhook signature and return the decoded event payload.
     *
     * @param  string $rawBody   Raw HTTP request body (do NOT JSON-decode first).
     * @param  string $signature Value of the Banza-Signature header.
     * @param  string $secret    Webhook signing secret from the Banzami dashboard.
     * @return array<string, mixed>
     *
     * @throws WebhookSignatureException
     */
    public static function constructEvent(
        string $rawBody,
        string $signature,
        string $secret,
        int    $toleranceSeconds = self::TOLERANCE_SECONDS,
    ): array {
        self::verifySignature($rawBody, $signature, $secret, $toleranceSeconds);

        $payload = json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($payload)) {
            throw new WebhookSignatureException('Webhook payload is not a JSON object.');
        }

        return $payload;
    }

    /**
     * Verify only the signature without decoding the body.
     *
     * @throws WebhookSignatureException
     */
    public static function verifySignature(
        string $rawBody,
        string $signatureHeader,
        string $secret,
        int    $toleranceSeconds = self::TOLERANCE_SECONDS,
    ): void {
        $parts     = self::parseHeader($signatureHeader);
        $timestamp = $parts['t'] ?? null;
        $v1        = $parts['v1'] ?? null;

        if ($timestamp === null || $v1 === null) {
            throw new WebhookSignatureException('Malformed Banza-Signature header — missing t or v1.');
        }

        $timestampInt = (int) $timestamp;

        if ($toleranceSeconds > 0) {
            $age = abs(time() - $timestampInt);
            if ($age > $toleranceSeconds) {
                throw new WebhookSignatureException(
                    "Webhook timestamp is too old ({$age}s). Tolerance is {$toleranceSeconds}s."
                );
            }
        }

        $signed   = "{$timestamp}.{$rawBody}";
        $expected = hash_hmac('sha256', $signed, $secret);

        if (! hash_equals($expected, $v1)) {
            throw new WebhookSignatureException('Webhook signature verification failed — signatures do not match.');
        }
    }

    /** @return array<string, string> */
    private static function parseHeader(string $header): array
    {
        $parts = [];
        foreach (explode(',', $header) as $pair) {
            $kv = explode('=', trim($pair), 2);
            if (count($kv) === 2) {
                $parts[$kv[0]] = $kv[1];
            }
        }
        return $parts;
    }
}
