<?php
// Run: php -S 0.0.0.0:8080 examples/webhook-handler.php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Banza\WebhookHandler;

$rawBody = file_get_contents('php://input');
$sig     = $_SERVER['HTTP_X_BANZAMI_SIGNATURE'] ?? '';
$secret  = getenv('BANZAMI_WEBHOOK_SECRET');

$handler = new WebhookHandler($secret);

try {
    $event = $handler->parse($rawBody, $sig);
} catch (\Exception $e) {
    http_response_code(401);
    exit('Unauthorized');
}

switch ($event['type']) {
    case 'transaction.completed':
        $txId    = $event['payload']['id']        ?? '';
        $orderId = $event['payload']['reference'] ?? '';
        // Mark order as paid in your database
        error_log("Transaction {$txId} completed for order {$orderId}");
        break;

    case 'transaction.failed':
        $orderId = $event['payload']['reference'] ?? '';
        // Mark order as failed
        error_log("Transaction failed for order {$orderId}");
        break;

    case 'payment_link.used':
        $linkId = $event['payload']['id'] ?? '';
        error_log("Payment link {$linkId} was used");
        break;

    case 'payout.completed':
        $payoutId = $event['payload']['id'] ?? '';
        error_log("Payout {$payoutId} completed");
        break;
}

http_response_code(200);
echo 'OK';
