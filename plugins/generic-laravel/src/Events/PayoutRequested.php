<?php

declare(strict_types=1);

namespace Banzami\Laravel\Events;

class PayoutRequested
{
    public function __construct(public readonly array $payout) {}
}
