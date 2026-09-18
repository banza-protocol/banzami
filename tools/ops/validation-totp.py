#!/usr/bin/env python3
"""Generate a TOTP code from a Validation Studio actor's stored seed.

Runs ON the Sandbox host, where the seed lives. The seed is read from the
operator secret store and never printed, never passed as an argument (an
argument would land in the shell history and in `ps`), and never leaves the
machine. Only the six digits are printed.

This is what makes BANZADMIN automation possible without weakening MFA: A01
carries a real, confirmed second factor like any other operator. The only
difference is that the seed is held by the operator secret store rather than a
phone, so a routine Validation Run can prove the factor without a person.

    python3 validation-totp.py a01          # code for /auth/mfa/verify
    python3 validation-totp.py a01 --verify # code + how long it stays valid

RFC 6238, SHA-1, 6 digits, 30-second step — the defaults BANZADMIN's enrolment
uses (services/admin-api/internal/auth/totp.go).
"""
import base64, hashlib, hmac, os, struct, sys, time

SECRET_DIR = "/root/.banzami/validation"


def code_at(secret_b32: str, when: int) -> str:
    # Authenticator secrets are base32 without padding and often spaced in
    # groups of four for readability; both forms must work.
    raw = secret_b32.strip().replace(" ", "").upper()
    raw += "=" * (-len(raw) % 8)
    key = base64.b32decode(raw, casefold=True)
    counter = struct.pack(">Q", when // 30)
    digest = hmac.new(key, counter, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{value % 1_000_000:06d}"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    actor = sys.argv[1].lower()
    path = os.path.join(SECRET_DIR, f"{actor}_totp_seed")
    if not os.path.exists(path):
        print(f"no seed for {actor}: {path} does not exist", file=sys.stderr)
        return 1
    with open(path) as fh:
        secret = fh.read()
    if not secret.strip():
        print(f"no seed for {actor}: {path} is empty", file=sys.stderr)
        return 1

    now = int(time.time())
    print(code_at(secret, now))
    if "--verify" in sys.argv:
        remaining = 30 - (now % 30)
        # A code with two seconds left will expire mid-request. Say so rather
        # than let someone wonder why a correct code was refused.
        note = "  ← expires very soon, wait for the next one" if remaining <= 3 else ""
        print(f"valid for {remaining}s{note}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
