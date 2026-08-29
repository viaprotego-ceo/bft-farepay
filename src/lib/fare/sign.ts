import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const QR_TTL_SECONDS = 90;
export const SIGNING_ALG = "HMAC-SHA256";
export const QR_PREFIX = "BFT1";

export type QrPayload = {
  v: 1;
  t: string;
  e: number;
  n: string;
};

function signingKey(): Buffer {
  const raw =
    process.env.FARE_SIGNING_KEY ??
    "bft-farepay-demo-signing-key-not-for-production";
  return Buffer.from(raw, "utf8");
}

export function canonicalize(payload: QrPayload): string {
  return `v=${payload.v}|t=${payload.t}|e=${payload.e}|n=${payload.n}`;
}

export function signCanonical(message: string): string {
  return createHmac("sha256", signingKey()).update(message).digest("base64url");
}

export function newNonce(): string {
  return randomBytes(8).toString("base64url");
}

export function encodeQr(payload: QrPayload, sig: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${QR_PREFIX}.${body}.${sig}`;
}

export function parseQr(raw: string): { payload: QrPayload; sig: string } | null {
  const parts = raw.trim().split(".");
  if (parts.length !== 3 || parts[0] !== QR_PREFIX) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(json) as QrPayload;
    if (parsed.v !== 1 || typeof parsed.t !== "string") return null;
    if (typeof parsed.e !== "number" || typeof parsed.n !== "string") return null;
    return { payload: parsed, sig: parts[2] };
  } catch {
    return null;
  }
}

export function verifySig(payload: QrPayload, sig: string): boolean {
  const expected = signCanonical(canonicalize(payload));
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
