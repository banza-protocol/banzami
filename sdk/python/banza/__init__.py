"""Banzami Python SDK.

Quick start:

    from banza import Banzami

    async with Banzami(api_key="bz_live_...") as client:
        tx = await client.transactions.create(amount=50000, currency="AOA")
        print(tx.id)
"""

from .client import BanzaClient, BanzaHooks, Banzami
from .config import BanzamiConfig
from .exceptions import (
    BanzaAPIError,
    BanzaError,
    BanzamiAuthenticationError,
    BanzamiConflictError,
    BanzamiInsufficientFundsError,
    BanzamiNotFoundError,
    BanzamiPermissionError,
    BanzamiRateLimitError,
    BanzamiServerError,
    BanzamiTimeoutError,
    BanzamiValidationError,
    BanzaNetworkError,
    BanzaWebhookSignatureError,
)
from .models import (
    ApiKey,
    Dispute,
    DisputeStatus,
    Merchant,
    NewApiKey,
    Payout,
    PayoutStatus,
    PaymentLink,
    PaymentLinkStatus,
    PaymentRequest,
    PaymentRequestStatus,
    QrCode,
    QrPayment,
    Refund,
    RefundStatus,
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
    "BanzaClient",
    "BanzamiConfig",
    "BanzaHooks",
    # Exceptions
    "BanzaError",
    "BanzaAPIError",
    "BanzamiAuthenticationError",
    "BanzamiPermissionError",
    "BanzamiNotFoundError",
    "BanzamiConflictError",
    "BanzamiValidationError",
    "BanzamiRateLimitError",
    "BanzamiInsufficientFundsError",
    "BanzamiServerError",
    "BanzaNetworkError",
    "BanzamiTimeoutError",
    "BanzaWebhookSignatureError",
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
    "PaymentLink",
    "PaymentLinkStatus",
    "Refund",
    "RefundStatus",
    "Dispute",
    "DisputeStatus",
    "PaymentRequest",
    "PaymentRequestStatus",
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
