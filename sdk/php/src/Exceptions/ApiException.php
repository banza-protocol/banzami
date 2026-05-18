<?php

declare(strict_types=1);

namespace Banzami\Exceptions;

class ApiException extends BanzamiException
{
    public function __construct(
        private readonly int    $statusCode,
        private readonly string $errorCode,
        string                  $message,
    ) {
        parent::__construct($message, $statusCode);
    }

    public function getStatusCode(): int   { return $this->statusCode; }
    public function getErrorCode(): string { return $this->errorCode; }

    public function isNotFound():     bool { return $this->statusCode === 404; }
    public function isUnauthorized(): bool { return $this->statusCode === 401; }
    public function isRateLimited():  bool { return $this->statusCode === 429; }
}
