"""Banzami Python SDK.

Quick start:

    from banzami import Banzami

    async with Banzami(api_key="bz_live_...") as client:
        tx = await client.transactions.create(amount=50000, currency="AOA")
        print(tx.id)
"""

from .client import Banzami, BanzamiClient, BanzamiHooks
from .config import BanzamiConfig
from .exceptions import (
    BanzamiAPIError,
    BanzamiAuthenticationError,
    BanzamiConflictError,
    BanzamiError,
    BanzamiInsufficientFundsError,
    BanzamiNetworkError,
    BanzamiNotFoundError,
    BanzamiPermissionError,
    BanzamiRateLimitError,
    BanzamiServerError,
    BanzamiTimeoutError,
    BanzamiValidationError,
    BanzamiWebhookSignatureError,
)
from .models import (
    ApiKey,
    Merchant,
    NewApiKey,
    Payout,
    PayoutStatus,
    QrCode,
    QrPayment,
    Transaction,
    TransactionStatus,
    Transfer,
    TransferStatus,
    Wallet,
    WalletBalance,
    WebhookEndpoint,
    WebhookEvent,
    WebhookEventType,
)
from .pagination import Page, auto_paginate
from .signature import generate_test_signature
from .utils import format_minor, new_idempotency_key, to_minor

__version__ = "0.1.0"

__all__ = [
    # Primary entry point
    "Banzami",
    "BanzamiClient",
    "BanzamiConfig",
    "BanzamiHooks",
    # Exceptions
    "BanzamiError",
    "BanzamiAPIError",
    "BanzamiAuthenticationError",
    "BanzamiPermissionError",
    "BanzamiNotFoundError",
    "BanzamiConflictError",
    "BanzamiValidationError",
    "BanzamiRateLimitError",
    "BanzamiInsufficientFundsError",
    "BanzamiServerError",
    "BanzamiNetworkError",
    "BanzamiTimeoutError",
    "BanzamiWebhookSignatureError",
    # Models
    "Transaction",
    "TransactionStatus",
    "QrCode",
    "QrPayment",
    "Transfer",
    "TransferStatus",
    "Payout",
    "PayoutStatus",
    "Wallet",
    "WalletBalance",
    "Merchant",
    "ApiKey",
    "NewApiKey",
    "WebhookEndpoint",
    "WebhookEvent",
    "WebhookEventType",
    # Test helpers
    "generate_test_signature",
    # Pagination
    "Page",
    "auto_paginate",
    # Money utilities
    "format_minor",
    "to_minor",
    "new_idempotency_key",
]
