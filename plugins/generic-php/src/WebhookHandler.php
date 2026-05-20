<?php

declare(strict_types=1);

namespace Banza;

/**
 * Helper for processing Banzami webhook events.
 *
 * Usage:
 *   $handler = new WebhookHandler('your-webhook-secret');
 *
 *   try {
 *       $event = $handler->parse(
 *           file_get_contents('php://input'),
 *           $_SERVER['HTTP_X_BANZAMI_SIGNATURE'] ?? ''
 *       );
 *   } catch (BanzamiException $e) {
 *       http_response_code(401);
 *       exit('Invalid signature');
 *   }
 *
 *   switch ($event['type']) {
 *       case 'transaction.completed':
 *           // mark order as paid
 *           break;
 *       case 'payment_link.used':
 *           // mark link as fulfilled
 *           break;
 *   }
 */
class WebhookHandler
{
    private string $secret;

    public function __construct(string $secret)
    {
        $this->secret = $secret;
    }

    /**
     * Verify the signature and decode the event payload.
     *
     * @return array{type: string, payload: array}
     * @throws BanzamiException if signature is invalid or body is malformed.
     */
    public function parse(string $rawBody, string $signature): array
    {
        if (!BanzaClient::verifyWebhookSignature($rawBody, $signature, $this->secret)) {
            throw new BanzamiException('Invalid webhook signature', 401);
        }

        $data = json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data) || !isset($data['type'])) {
            throw new BanzamiException('Invalid webhook payload', 400);
        }

        return $data;
    }
}
