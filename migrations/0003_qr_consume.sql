-- Kept for ledger evolution. Replay is enforced via inspections.qr_id
-- (a valid inspection of a nonce cannot be reused). Extra columns are unused.
alter table qr_tokens add column if not exists consumed_at timestamptz;
alter table qr_tokens add column if not exists route_hint text;
