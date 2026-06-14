<?php
// Run: php examples/wallet-and-payout.php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Banzami\BanzamiClient;

$client   = new BanzamiClient(getenv('BANZAMI_GATEWAY_URL'), getenv('BANZAMI_API_KEY'));
$walletId = getenv('BANZAMI_WALLET_ID');

$balance = $client->getWalletBalance($walletId);
echo 'Available: ' . BanzamiClient::formatAmount($balance['available_minor'], $balance['currency']) . PHP_EOL;
echo 'Reserved:  ' . BanzamiClient::formatAmount($balance['reserved_minor'],  $balance['currency']) . PHP_EOL;

// Request a payout (minimum 5.000 Kz)
if ($balance['available_minor'] >= 5000) {
    $payout = $client->createPayout([
        'wallet_id'                => $walletId,
        'amount_minor'             => 5000,
        'currency'                 => 'AOA',
        'destination_bank_account' => '0040 0000 0000 0001 010 10',
        'idempotency_key'          => uniqid('payout_', true),
    ]);
    echo 'Payout requested: ' . $payout['id'] . ' — status: ' . $payout['status'] . PHP_EOL;
} else {
    echo 'Insufficient balance for payout (minimum 5.000 Kz required).' . PHP_EOL;
}
