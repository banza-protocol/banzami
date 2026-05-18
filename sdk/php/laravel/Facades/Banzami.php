<?php

declare(strict_types=1);

namespace Banzami\Laravel\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @method static array createPaymentLink(array $params)
 * @method static array getPaymentLink(string $id)
 * @method static array listPaymentLinks(string $merchantId, int $limit = 20, ?string $cursor = null)
 * @method static array cancelPaymentLink(string $id)
 * @method static array createTransaction(array $params)
 * @method static array getTransaction(string $id)
 * @method static array listTransactions(int $limit = 20, ?string $cursor = null)
 * @method static array createRefund(array $params)
 * @method static array getRefund(string $id)
 * @method static array listRefunds(int $limit = 20, ?string $transactionId = null)
 * @method static array openDispute(array $params)
 * @method static array getDispute(string $id)
 * @method static array listDisputes(int $limit = 20, ?string $status = null)
 * @method static array createPaymentRequest(array $params)
 * @method static array getPaymentRequest(string $id)
 * @method static array listPaymentRequests(int $limit = 20, ?string $status = null)
 * @method static array payPaymentRequest(string $id, string $payerId)
 * @method static array declinePaymentRequest(string $id, string $payerId)
 * @method static array cancelPaymentRequest(string $id, string $requesterId)
 * @method static array registerWebhookEndpoint(string $url, array $events)
 * @method static array listWebhookEndpoints()
 * @method static void  deleteWebhookEndpoint(string $id)
 * @method static array listWebhookEvents(int $limit = 20, ?string $cursor = null)
 * @method static array getWallet(string $id)
 * @method static array getWalletBalance(string $id)
 * @method static array getWalletForMerchant(string $merchantId, string $currency = 'AOA')
 *
 * @see \Banzami\BanzamiClient
 */
class Banzami extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return 'banzami';
    }
}
