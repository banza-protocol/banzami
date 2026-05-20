"""QR checkout flow — create, poll, and confirm a dynamic QR payment.

Run:
    BANZAMI_API_KEY=bz_live_... BANZAMI_OWNER_ID=wallet_... python -m examples.qr_checkout.checkout
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone

from banza import Banzami
from banza.models.qr_payment import QrCodeStatus
from banza.utils.money import format_minor, to_minor


async def main() -> None:
    async with Banzami(api_key=os.environ["BANZAMI_API_KEY"]) as client:
        amount_kz = 2500  # 2 500 Kz

        print(f"Creating QR for {format_minor(amount_kz, 'AOA')}...")

        qr = await client.qr_payments.create_dynamic(
            owner_id=os.environ["BANZAMI_OWNER_ID"],
            amount=to_minor(amount_kz, "AOA"),
            expires_at=datetime.now(tz=timezone.utc) + timedelta(minutes=10),
            reference="ordem-001",
        )

        print(f"QR ID    : {qr.qr_code.id}")
        print(f"Payload  : {qr.payload}")
        print(f"Expira em: {qr.qr_code.expires_at}")
        print("Aguardando pagamento...")

        # Poll every 3 seconds up to 5 minutes.
        for _ in range(100):
            await asyncio.sleep(3)
            status = await client.qr_payments.check_status(qr.qr_code.id)

            if status == QrCodeStatus.USED:
                print("Pagamento confirmado!")
                return

            if status == QrCodeStatus.EXPIRED:
                print("QR expirado.")
                return

            print(f"  Status: {status} — aguardando...")

        print("Tempo esgotado.")


if __name__ == "__main__":
    asyncio.run(main())
