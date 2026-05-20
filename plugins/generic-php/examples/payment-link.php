<?php
// Run: php examples/payment-link.php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Banza\BanzaClient;

$client = new BanzaClient(
    baseUrl: getenv('BANZAMI_GATEWAY_URL') ?: 'https://api.banzami.ao',
    apiKey:  getenv('BANZAMI_API_KEY'),
);

$link = $client->createPaymentLink([
    'merchant_id'  => getenv('BANZAMI_MERCHANT_ID'),
    'wallet_id'    => getenv('BANZAMI_WALLET_ID'),
    'amount_minor' => 15000,    // 15.000 Kz
    'currency'     => 'AOA',
    'description'  => 'Pedido #' . uniqid(),
]);

echo 'Payment URL: https://pay.banzami.ao/' . $link['slug'] . PHP_EOL;
echo 'Link ID: ' . $link['id'] . PHP_EOL;
echo 'Status: ' . $link['status'] . PHP_EOL;

// In a web context, redirect the customer:
// header('Location: https://pay.banzami.ao/' . $link['slug']);
// exit;
