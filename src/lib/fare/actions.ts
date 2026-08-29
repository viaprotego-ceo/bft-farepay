import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import {
  encodeQr,
  newNonce,
  parseQr,
  QR_TTL_SECONDS,
  SIGNING_ALG,
  canonicalize,
  signCanonical,
  verifySig,
} from "@/lib/fare/sign";
import type {
  AuditRow,
  FareProduct,
  InspectionRow,
  InspectFail,
  InspectVerdict,
  IssuedQr,
  LatestQr,
  OpsSnapshot,
  PaymentToken,
  ProductCategory,
  ProductKind,
  PurchaseResult,
  ServiceMode,
  Ticket,
} from "@/lib/fare/types";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
    return value;
  }
  return String(value);
}

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  return iso(value);
}

type ProductRow = {
  id: string;
  name: string;
  category: string;
  service: string;
  kind: string;
  price_cents: number;
  ride_count: number | null;
  ride_window_seconds: number;
  pass_seconds: number | null;
  blurb: string;
  sort_order: number;
};

type TicketRow = {
  id: string;
  product_id: string;
  product_name: string;
  category: string;
  service: string;
  kind: string;
  rides_remaining: number | null;
  ride_valid_until: unknown;
  valid_from: unknown;
  valid_until: unknown;
  status: string;
  created_at: unknown;
  processor_intent: string | null;
  amount_cents: number | null;
};

function mapProduct(row: ProductRow): FareProduct {
  return {
    id: row.id,
    name: row.name,
    category: row.category as ProductCategory,
    service: row.service as ServiceMode,
    kind: row.kind as ProductKind,
    priceCents: Number(row.price_cents),
    rideCount: row.ride_count == null ? null : Number(row.ride_count),
    rideWindowSeconds: Number(row.ride_window_seconds),
    passSeconds: row.pass_seconds == null ? null : Number(row.pass_seconds),
    blurb: row.blurb,
    sortOrder: Number(row.sort_order),
  };
}

function mapTicket(row: TicketRow): Ticket {
  const validUntil = iso(row.valid_until);
  const rideValidUntil = isoOrNull(row.ride_valid_until);
  const now = Date.now();
  let status: Ticket["status"] = row.status === "exhausted" ? "exhausted" : "active";
  if (new Date(validUntil).getTime() <= now) status = "expired";
  if (
    status === "active" &&
    row.rides_remaining === 0 &&
    (!rideValidUntil || new Date(rideValidUntil).getTime() <= now)
  ) {
    status = "exhausted";
  }
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    category: row.category as ProductCategory,
    service: row.service as ServiceMode,
    kind: row.kind as ProductKind,
    ridesRemaining: row.rides_remaining == null ? null : Number(row.rides_remaining),
    rideValidUntil,
    validFrom: iso(row.valid_from),
    validUntil,
    status,
    createdAt: iso(row.created_at),
    paymentIntent: row.processor_intent,
    amountCents: row.amount_cents == null ? null : Number(row.amount_cents),
  };
}

async function audit(
  kind: string,
  subjectId: string | null,
  detail: Record<string, unknown>,
) {
  const sql = await getSql();
  await sql`
    insert into audit_events (kind, subject_id, detail)
    values (${kind}, ${subjectId}, ${JSON.stringify(detail)})
  `;
}

async function ensureWallet(walletId: string) {
  const sql = await getSql();
  await sql`insert into wallets (id) values (${walletId}) on conflict (id) do nothing`;
  const tokens = await sql<{ id: string }>`
    select id from payment_tokens where wallet_id = ${walletId} limit 1
  `;
  if (tokens.length === 0) {
    await sql`
      insert into payment_tokens (id, wallet_id, processor, token_ref, brand, last4)
      values (
        ${randomUUID()},
        ${walletId},
        'columbia_vault',
        ${"tok_" + walletId.replace(/-/g, "").slice(0, 12)},
        'visa',
        '4242'
      )
    `;
  }
}

const ticketSelect = `
  select t.id, t.product_id, p.name as product_name, p.category, p.service, p.kind,
         t.rides_remaining, t.ride_valid_until, t.valid_from, t.valid_until,
         t.status, t.created_at, p.ride_window_seconds,
         pay.processor_intent, pay.amount_cents
  from tickets t
  join fare_products p on p.id = t.product_id
  left join payments pay on pay.id = t.payment_id
`;

export const listProducts = createServerFn({ method: "GET" }).handler(
  async () => {
    const sql = await getSql();
    const productRows = await sql<ProductRow>`
      select id, name, category, service, kind, price_cents, ride_count,
             ride_window_seconds, pass_seconds, blurb, sort_order
      from fare_products
      where active = true
      order by sort_order
    `;
    return productRows.map(mapProduct);
  },
);

export const getWalletState = createServerFn({ method: "GET" })
  .validator(z.object({ walletId: z.uuid() }))
  .handler(async ({ data }) => {
    await ensureWallet(data.walletId);
    const sql = await getSql();
    const productRows = await sql<ProductRow>`
      select id, name, category, service, kind, price_cents, ride_count,
             ride_window_seconds, pass_seconds, blurb, sort_order
      from fare_products
      where active = true
      order by sort_order
    `;
    const ticketRows = await sql.query<TicketRow>(
      `${ticketSelect} where t.wallet_id = $1 order by t.created_at desc`,
      [data.walletId],
    );
    const tokenRows = await sql<{
      id: string;
      processor: string;
      token_ref: string;
      brand: string;
      last4: string;
    }>`
      select id, processor, token_ref, brand, last4
      from payment_tokens
      where wallet_id = ${data.walletId}
      order by created_at
    `;
    const products = productRows.map(mapProduct);
    const tickets = ticketRows.map(mapTicket);
    const tokens: PaymentToken[] = tokenRows.map((row) => ({
      id: row.id,
      processor: row.processor,
      tokenRef: row.token_ref,
      brand: row.brand,
      last4: row.last4,
    }));
    return { products, tickets, tokens };
  });

export const buyFare = createServerFn({ method: "POST" })
  .validator(
    z.object({
      walletId: z.uuid(),
      productId: z.string().min(1),
      tokenId: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<PurchaseResult> => {
    await ensureWallet(data.walletId);
    const sql = await getSql();
    const products = await sql<ProductRow>`
      select id, name, category, service, kind, price_cents, ride_count,
             ride_window_seconds, pass_seconds, blurb, sort_order
      from fare_products
      where id = ${data.productId} and active = true
    `;
    const product = products[0];
    if (!product) throw new Error("Unknown fare product");

    const price = Number(product.price_cents);
    let paymentId: string | null = null;
    let receipt: PurchaseResult["receipt"] = null;
    if (price > 0) {
      if (!data.tokenId) throw new Error("A tokenized card is required");
      const tokens = await sql<{
        id: string;
        token_ref: string;
        brand: string;
        last4: string;
        processor: string;
      }>`
        select id, token_ref, brand, last4, processor from payment_tokens
        where id = ${data.tokenId} and wallet_id = ${data.walletId}
      `;
      const token = tokens[0];
      if (!token) throw new Error("Payment token not found");
      paymentId = randomUUID();
      const intent = `pi_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      await sql`
        insert into payments (
          id, wallet_id, token_id, product_id, amount_cents, processor_intent, status
        ) values (
          ${paymentId}, ${data.walletId}, ${token.id}, ${product.id},
          ${price}, ${intent}, 'captured'
        )
      `;
      receipt = {
        processorIntent: intent,
        amountCents: price,
        brand: token.brand,
        last4: token.last4,
        processor: token.processor,
      };
    }

    const ticketId = randomUUID();
    const passSeconds = product.pass_seconds ?? product.ride_window_seconds;
    const validUntil = new Date(Date.now() + Number(passSeconds) * 1000).toISOString();
    const rideCount = product.ride_count == null ? null : Number(product.ride_count);
    await sql`
      insert into tickets (
        id, wallet_id, product_id, payment_id, rides_remaining, valid_until, status
      ) values (
        ${ticketId}, ${data.walletId}, ${product.id}, ${paymentId},
        ${rideCount}, ${validUntil}, 'active'
      )
    `;
    await audit("fare.purchased", ticketId, {
      productId: product.id,
      amountCents: price,
      tokenized: price > 0,
    });
    const rows = await sql.query<TicketRow>(`${ticketSelect} where t.id = $1`, [ticketId]);
    const ticket = rows[0] ? mapTicket(rows[0]) : null;
    if (!ticket) throw new Error("Ticket insert failed");
    return { ticket, receipt };
  });

async function activateRide(ticketId: string) {
  const sql = await getSql();
  const rows = await sql.query<TicketRow & { ride_window_seconds: number }>(
    `${ticketSelect} where t.id = $1`,
    [ticketId],
  );
  const row = rows[0];
  if (!row) throw new Error("Ticket not found");
  const ticket = mapTicket(row);
  if (ticket.status === "expired") {
    throw new Error("Pass is no longer valid");
  }
  const nowIso = new Date().toISOString();
  const windowOpen =
    ticket.rideValidUntil && new Date(ticket.rideValidUntil).getTime() > Date.now();
  if (windowOpen) return ticket;

  const until = new Date(
    Date.now() + Number(row.ride_window_seconds) * 1000,
  ).toISOString();

  if (ticket.ridesRemaining != null) {
    const updated = await sql<{ id: string }>`
      update tickets
      set rides_remaining = rides_remaining - 1,
          ride_valid_until = ${until}
      where id = ${ticketId}
        and rides_remaining > 0
        and (ride_valid_until is null or ride_valid_until <= ${nowIso})
      returning id
    `;
    if (updated.length === 0) {
      const again = await sql.query<TicketRow>(`${ticketSelect} where t.id = $1`, [
        ticketId,
      ]);
      if (!again[0]) throw new Error("Ticket not found");
      const mapped = mapTicket(again[0]);
      const open =
        mapped.rideValidUntil && new Date(mapped.rideValidUntil).getTime() > Date.now();
      if (open) return mapped;
      throw new Error("No rides remaining");
    }
  } else {
    if (ticket.status !== "active") throw new Error("Pass is no longer valid");
    await sql`
      update tickets
      set ride_valid_until = ${until}
      where id = ${ticketId}
        and (ride_valid_until is null or ride_valid_until <= ${nowIso})
    `;
  }

  const refreshed = await sql.query<TicketRow>(`${ticketSelect} where t.id = $1`, [
    ticketId,
  ]);
  if (!refreshed[0]) throw new Error("Ticket refresh failed");
  return mapTicket(refreshed[0]);
}

async function mintQr(
  ticket: Ticket,
  routeHint: string | null,
): Promise<IssuedQr> {
  const sql = await getSql();
  const nonce = newNonce();
  const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);
  const payload = {
    v: 1 as const,
    t: ticket.id,
    e: Math.floor(expiresAt.getTime() / 1000),
    n: nonce,
  };
  const sig = signCanonical(canonicalize(payload));
  const encoded = encodeQr(payload, sig);
  const qrId = randomUUID();
  await sql`
    insert into qr_tokens (id, ticket_id, nonce, payload, expires_at)
    values (
      ${qrId}, ${ticket.id}, ${nonce}, ${encoded},
      ${expiresAt.toISOString()}
    )
  `;
  return {
    payload: encoded,
    expiresAt: expiresAt.toISOString(),
    ticket,
    signatureHint: sig.slice(0, 8),
    routeHint,
  };
}

export const issueQr = createServerFn({ method: "POST" })
  .validator(
    z.object({
      walletId: z.uuid(),
      ticketId: z.uuid(),
      routeHint: z.string().max(32).optional(),
    }),
  )
  .handler(async ({ data }): Promise<IssuedQr> => {
    const sql = await getSql();
    const owned = await sql<{ id: string }>`
      select id from tickets where id = ${data.ticketId} and wallet_id = ${data.walletId}
    `;
    if (!owned[0]) throw new Error("Ticket not found");
    const ticket = await activateRide(data.ticketId);
    return mintQr(ticket, data.routeHint ?? null);
  });

export const verifyQr = createServerFn({ method: "POST" })
  .validator(
    z.object({
      payload: z.string().min(8).max(800),
      routeHint: z.string().max(32).optional(),
    }),
  )
  .handler(async ({ data }): Promise<InspectVerdict> => {
    const sql = await getSql();
    const inspectionId = randomUUID();
    const fail = async (
      result: InspectFail["result"],
      reason: string,
    ): Promise<InspectFail> => {
      await sql`
        insert into inspections (id, result, reason, route_hint)
        values (${inspectionId}, ${result}, ${reason}, ${data.routeHint ?? null})
      `;
      await audit("fare.inspected", null, { result, reason });
      return { ok: false, result, reason, inspectionId };
    };

    if (data.payload.trim().startsWith("BFTV1.")) {
      return fail("malformed", "That is a vehicle validator, not rider proof");
    }

    const parsed = parseQr(data.payload);
    if (!parsed) return fail("malformed", "Not a BFT FarePay QR payload");
    if (!verifySig(parsed.payload, parsed.sig)) {
      return fail("invalid_sig", "Signature did not verify");
    }
    const expMs = parsed.payload.e * 1000;
    if (expMs < Date.now()) {
      return fail("expired", "QR challenge has expired — ask the rider to refresh");
    }

    const rows = await sql.query<TicketRow>(`${ticketSelect} where t.id = $1`, [
      parsed.payload.t,
    ]);
    if (!rows[0]) return fail("not_found", "No ticket matches this QR");
    const ticket = mapTicket(rows[0]);
    if (ticket.status === "expired") {
      return fail("expired", "Pass validity window has ended");
    }
    const rideOpen =
      ticket.rideValidUntil && new Date(ticket.rideValidUntil).getTime() > Date.now();
    if (ticket.status === "exhausted" && !rideOpen) {
      return fail("exhausted", "No remaining rides on this fare");
    }
    if (ticket.kind !== "day" && ticket.kind !== "monthly" && ticket.kind !== "entitlement") {
      if (!rideOpen) {
        return fail("expired", "Transfer window has closed");
      }
    }

    const qrRows = await sql<{
      id: string;
    }>`
      select id from qr_tokens
      where ticket_id = ${ticket.id} and nonce = ${parsed.payload.n}
      order by issued_at desc
      limit 1
    `;
    if (!qrRows[0]) return fail("not_found", "QR challenge is not in the ledger");
    const qrId = qrRows[0].id;
    const prior = await sql<{ id: string }>`
      select id from inspections
      where qr_id = ${qrId} and result = 'valid'
      limit 1
    `;
    if (prior[0]) {
      return fail("replay", "This QR was already used — ask the rider to refresh");
    }

    await sql`
      insert into inspections (id, ticket_id, qr_id, result, reason, route_hint, product_name)
      values (
        ${inspectionId}, ${ticket.id}, ${qrId}, 'valid', ${null},
        ${data.routeHint ?? null}, ${ticket.productName}
      )
    `;
    await audit("fare.inspected", ticket.id, {
      result: "valid",
      routeHint: data.routeHint ?? null,
    });
    return {
      ok: true,
      result: "valid",
      ticketId: ticket.id,
      productName: ticket.productName,
      category: ticket.category,
      service: ticket.service,
      kind: ticket.kind,
      validUntil: ticket.validUntil,
      rideValidUntil: ticket.rideValidUntil,
      qrExpiresAt: new Date(expMs).toISOString(),
      inspectedAt: new Date().toISOString(),
      inspectionId,
      routeHint: data.routeHint ?? null,
    };
  });

export const getLatestIssuedQr = createServerFn({ method: "GET" }).handler(
  async (): Promise<LatestQr | null> => {
    const sql = await getSql();
    const rows = await sql<{
      payload: string;
      expires_at: unknown;
      product_name: string;
    }>`
      select q.payload, q.expires_at, p.name as product_name
      from qr_tokens q
      join tickets t on t.id = q.ticket_id
      join fare_products p on p.id = t.product_id
      where q.expires_at > ${new Date().toISOString()}
        and not exists (
          select 1 from inspections i
          where i.qr_id = q.id and i.result = 'valid'
        )
      order by q.issued_at desc
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      payload: row.payload,
      expiresAt: iso(row.expires_at),
      productName: row.product_name,
    };
  },
);

export const getOpsSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<OpsSnapshot> => {
    const sql = await getSql();
    const ticketCount = await sql<{ n: number }>`select count(*)::int as n from tickets`;
    const captured = await sql<{ n: number }>`
      select coalesce(sum(amount_cents), 0)::int as n from payments where status = 'captured'
    `;
    const inspectCount = await sql<{ n: number }>`select count(*)::int as n from inspections`;
    const validCount = await sql<{ n: number }>`
      select count(*)::int as n from inspections where result = 'valid'
    `;
    const mix = await sql<{ name: string; count: number }>`
      select p.name as name, count(*)::int as count
      from tickets t
      join fare_products p on p.id = t.product_id
      group by p.name
      order by count desc, p.name
    `;
    const inspections = await sql<{
      id: string;
      result: string;
      reason: string | null;
      route_hint: string | null;
      product_name: string | null;
      created_at: unknown;
    }>`
      select id, result, reason, route_hint, product_name, created_at
      from inspections
      order by created_at desc
      limit 12
    `;
    const auditRows = await sql<{
      id: number;
      kind: string;
      subject_id: string | null;
      detail: string;
      created_at: unknown;
    }>`
      select id, kind, subject_id, detail, created_at
      from audit_events
      order by created_at desc
      limit 12
    `;
    const recentInspections: InspectionRow[] = inspections.map((row) => ({
      id: row.id,
      result: row.result,
      reason: row.reason,
      routeHint: row.route_hint,
      productName: row.product_name,
      createdAt: iso(row.created_at),
    }));
    const recentAudit: AuditRow[] = auditRows.map((row) => ({
      id: Number(row.id),
      kind: row.kind,
      subjectId: row.subject_id,
      detail: row.detail,
      createdAt: iso(row.created_at),
    }));
    return {
      ticketsIssued: Number(ticketCount[0]?.n ?? 0),
      amountCapturedCents: Number(captured[0]?.n ?? 0),
      inspectionCount: Number(inspectCount[0]?.n ?? 0),
      validInspections: Number(validCount[0]?.n ?? 0),
      productMix: mix.map((row) => ({ name: row.name, count: Number(row.count) })),
      recentInspections,
      recentAudit,
      qrTtlSeconds: QR_TTL_SECONDS,
      signingAlg: SIGNING_ALG,
      processor: "Columbia Vault (tokenized, no PAN)",
    };
  },
);
