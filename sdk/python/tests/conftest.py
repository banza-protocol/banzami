"""Shared test fixtures."""

from __future__ import annotations

import httpx
import pytest
import respx
from respx.transports import MockTransport

from banza import Banzami

TEST_API_KEY   = "bz_test_key"
TEST_BASE_URL  = "https://api.banzami.test"
WEBHOOK_SECRET = "whsec_test_secret_32_bytes_long!!"
