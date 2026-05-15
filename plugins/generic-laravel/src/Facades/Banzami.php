<?php

declare(strict_types=1);

namespace Banzami\Laravel\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @method static array createPaymentLink(array $params)
 * @method static array listPaymentLinks(string $merchantId, int $limit = 20, ?string $cursor = null)
 * @method static array getPaymentLink(string $id)
 * @method static array cancelPaymentLink(string $id)
 * @method static array createTransaction(array $params)
 * @method static array getTransaction(string $id)
 * @method static array listTransactions(string $merchantId, int $limit = 20, ?string $cursor = null)
 * @method static array provisionWallet(array $params)
 * @method static array getWallet(string $id)
 * @method static array getWalletBalance(string $id)
 * @method static array createPayout(array $params)
 * @method static array listPayouts(string $merchantId, int $limit = 20, ?string $cursor = null)
 * @method static array getPayout(string $id)
 * @method static array getMerchant(string $id)
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
