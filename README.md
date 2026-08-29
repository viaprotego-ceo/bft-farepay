# BFT FarePay

QR-code mobile fare payment for [Ben Franklin Transit](https://www.bft.org/) riders across the Tri-Cities (Benton-Franklin PTBA).

Riders buy a fare on their phone. The charge is tokenized through a PCI processor — this app never stores a card number. The phone then issues a **90-second HMAC-signed QR**. A fare monitor scans it. Valid proof is written to an append-only ledger, satisfying [RCW 36.57A.230](https://app.leg.wa.gov/rcw/default.aspx?cite=36.57A.230). Replaying the same QR is rejected.

This is a demonstration pilot, not official BFT fare media.

## What you can do

- **Ride** — buy adult, reduced, FREEDOM, or entitlement fares; show a short-lived signed QR
- **Inspect** — scan or paste a payload (or use the latest live QR) and log pass/fail
- **Ops** — locally owned Postgres ledger: captured fares, inspections, statute, signing kernel

## Stack

- TanStack Start + React 19 + Tailwind v4
- Postgres (Neon in production, embedded PGLite in local preview)
- HMAC-SHA256 QR challenges (`BFT1.<payload>.<sig>`), 90s TTL, single-use nonce
- Tokenized payments (demo processor: Columbia Vault — last4 only, never PAN)

The signing kernel is a handful of functions and seven tables. The same canonical string signs in Python with `hmac.new(key, msg, hashlib.sha256)`.

## Local development

```bash
npm install
npm run dev
```

```bash
npm run typecheck
npm run build
```

Set `DATABASE_URL` for Neon. Without it, the app uses embedded PGLite and applies `migrations/` on startup.

## License

Demonstration code for local PTBA ownership. Not affiliated with Ben Franklin Transit.
