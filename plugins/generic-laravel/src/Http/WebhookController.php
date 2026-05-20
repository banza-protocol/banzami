<?php

declare(strict_types=1);

namespace Banzami\Laravel\Http;

use Banzami\BanzamiException;
use Banzami\WebhookHandler;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Event;

/**
 * Handles incoming Banzami webhook events.
 *
 * Register in config/banzami.php and publish routes via the service provider.
 * The route is automatically registered at POST /banzami/webhook.
 *
 * Dispatches a Laravel event for each received type:
 *   - \Banzami\Laravel\Events\TransactionCompleted
 *   - \Banzami\Laravel\Events\TransactionFailed
 *   - \Banzami\Laravel\Events\PaymentLinkUsed
 *   - \Banzami\Laravel\Events\WalletProvisioned
 *   - \Banzami\Laravel\Events\PayoutRequested
 *
 * Or listen for the raw event type string via:
 *   Event::listen('banzami.webhook', function ($event) { ... });
 */
class WebhookController extends Controller
{
    public function handle(Request $request): Response
    {
        $secret = config('banzami.webhook_secret', '');

        $handler = new WebhookHandler($secret);

        try {
            $event = $handler->parse(
                $request->getContent(),
                $request->header('Banza-Signature', '')
            );
        } catch (BanzamiException $e) {
            return response('Invalid signature', 401);
        }

        // Fire a generic event for any listener
        Event::dispatch('banzami.webhook', [$event]);

        // Fire typed events for specific handlers
        $typed = self::typedEventClass($event['type'] ?? '');
        if ($typed !== null && class_exists($typed)) {
            Event::dispatch(new $typed($event['payload'] ?? $event));
        }

        return response('OK', 200);
    }

    private static function typedEventClass(string $type): ?string
    {
        return match ($type) {
            'transaction.completed' => \Banzami\Laravel\Events\TransactionCompleted::class,
            'transaction.failed'    => \Banzami\Laravel\Events\TransactionFailed::class,
            'payment_link.used'     => \Banzami\Laravel\Events\PaymentLinkUsed::class,
            'wallet.provisioned'    => \Banzami\Laravel\Events\WalletProvisioned::class,
            'payout.requested'      => \Banzami\Laravel\Events\PayoutRequested::class,
            default                 => null,
        };
    }
}
