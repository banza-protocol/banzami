<?php

declare(strict_types=1);

namespace Banzami\Laravel\Events;

class WalletProvisioned
{
    public function __construct(public readonly array $wallet) {}
}
