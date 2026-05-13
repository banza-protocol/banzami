<?php

declare(strict_types=1);

namespace Banzami\Laravel\Events;

class TransactionFailed
{
    public function __construct(public readonly array $payload) {}
}
