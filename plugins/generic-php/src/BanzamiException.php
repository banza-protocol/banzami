<?php

declare(strict_types=1);

namespace Banza;

class BanzamiException extends \RuntimeException
{
    public function __construct(string $message, int $httpStatus = 0, \Throwable $previous = null)
    {
        parent::__construct($message, $httpStatus, $previous);
    }

    public function getHttpStatus(): int
    {
        return $this->getCode();
    }

    public function isNotFound(): bool
    {
        return $this->getCode() === 404;
    }

    public function isUnauthorized(): bool
    {
        return $this->getCode() === 401;
    }
}
