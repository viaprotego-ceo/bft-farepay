import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Bus, CreditCard, LoaderCircle, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { FareQr } from "@/components/fare-qr";
import { HowItWorks } from "@/components/how-it-works";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { buyFare, getWalletState, issueQr, listProducts } from "@/lib/fare/actions";
import { SERVICE_CITIES } from "@/lib/fare/rcw";
import {
  CATEGORY_LABEL,
  ROUTES,
  SERVICE_LABEL,
  type FareProduct,
  type IssuedQr,
  type Ticket as FareTicket,
} from "@/lib/fare/types";
import { getOrCreateWalletId, shortWallet } from "@/lib/fare/wallet";
import { formatPacific, formatUsd, secondsLeft } from "@/lib/utils";

export const Route = createFileRoute("/")({
  loader: () => listProducts(),
  component: RidePage,
});

function usable(ticket: FareTicket) {
  if (ticket.status === "expired") return false;
  if (ticket.ridesRemaining == null) return ticket.status === "active";
  const rideOpen =
    ticket.rideValidUntil && new Date(ticket.rideValidUntil).getTime() > Date.now();
  return rideOpen || ticket.ridesRemaining > 0;
}

function remainingLabel(ticket: FareTicket) {
  if (ticket.ridesRemaining == null) return "Unlimited";
  const open =
    ticket.rideValidUntil && new Date(ticket.rideValidUntil).getTime() > Date.now();
  if (open) {
    return ticket.ridesRemaining > 0
      ? `Transfer · ${ticket.ridesRemaining} left`
      : "Transfer window";
  }
  return `${ticket.ridesRemaining} ride${ticket.ridesRemaining === 1 ? "" : "s"}`;
}

function needsRoute(ticket: FareTicket) {
  if (ticket.ridesRemaining == null) return false;
  const rideOpen =
    ticket.rideValidUntil && new Date(ticket.rideValidUntil).getTime() > Date.now();
  return !rideOpen;
}

function RidePage() {
  const products = Route.useLoaderData();
  const [walletId, setWalletId] = useState<string | null>(null);
  const [buying, setBuying] = useState<FareProduct | null>(null);
  const [boarding, setBoarding] = useState<FareTicket | null>(null);
  const [boardRoute, setBoardRoute] = useState("20");
  const [proof, setProof] = useState<IssuedQr | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setWalletId(getOrCreateWalletId());
  }, []);

  const state = useQuery({
    queryKey: ["wallet", walletId],
    enabled: Boolean(walletId),
    queryFn: () => getWalletState({ data: { walletId: walletId! } }),
  });

  const buy = useMutation({
    mutationFn: (input: { productId: string; tokenId?: string }) =>
      buyFare({ data: { walletId: walletId!, ...input } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["wallet", walletId] });
      if (result.receipt) {
        toast.success(
          `Captured ${formatUsd(result.receipt.amountCents)} · ${result.receipt.processorIntent}`,
        );
      } else {
        toast.success(`${result.ticket.productName} added to wallet`);
      }
      setBuying(null);
      if (result.ticket.kind === "ten_ride") return;
      showProof.mutate({ ticketId: result.ticket.id });
    },
    onError: (err) => toast.error(err.message),
  });

  const showProof = useMutation({
    mutationFn: (input: { ticketId: string; routeHint?: string }) =>
      issueQr({
        data: {
          walletId: walletId!,
          ticketId: input.ticketId,
          routeHint: input.routeHint,
        },
      }),
    onSuccess: (issued) => {
      setProof(issued);
      setBoarding(null);
      void queryClient.invalidateQueries({ queryKey: ["wallet", walletId] });
    },
    onError: (err) => toast.error(err.message),
  });

  const proofTicketId = proof?.ticket.id;
  const proofExpires = proof?.expiresAt;
  const issueProof = showProof.mutate;
  useEffect(() => {
    if (!proofTicketId || !proofExpires) return;
    const wait = Math.max(2, secondsLeft(proofExpires) - 8);
    const id = window.setTimeout(() => {
      issueProof({ ticketId: proofTicketId });
    }, wait * 1000);
    return () => window.clearTimeout(id);
  }, [proofTicketId, proofExpires, issueProof]);

  const tickets = state.data?.tickets ?? [];
  const live = tickets.filter(usable);
  const past = tickets.filter((t) => !usable(t)).slice(0, 4);
  const token = state.data?.tokens[0];
  const grouped = useMemo(() => groupProducts(products), [products]);

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-subtle uppercase">
            Rider wallet
          </p>
          <h1 className="font-display mt-1 text-4xl leading-none font-semibold tracking-tight">
            Show your fare
          </h1>
        </div>
        {walletId ? (
          <p className="font-mono text-[0.7rem] text-muted tabular-nums">
            {shortWallet(walletId)}
          </p>
        ) : null}
      </div>
      <p className="mt-3 max-w-prose text-sm text-muted">
        Generate a short-lived signed QR. Fare inspectors scan it as proof of
        payment under RCW 36.57A.230.
      </p>
      <p className="mt-2 text-[0.7rem] tracking-wide text-subtle">
        {SERVICE_CITIES.join(" · ")}
      </p>

      {state.isLoading || !walletId ? (
        <Skeleton className="mt-6 h-72 w-full rounded-xl" />
      ) : proof && usable(proof.ticket) ? (
        <ProofCard
          issued={proof}
          refreshing={showProof.isPending}
          onClose={() => setProof(null)}
          onRefresh={() => issueProof({ ticketId: proof.ticket.id })}
        />
      ) : (
        <>
          <HowItWorks />
          <div className="mt-6 space-y-3">
            {live.length === 0 ? (
              <EmptyPass />
            ) : (
              live.map((ticket) => (
                <PassRow
                  key={ticket.id}
                  ticket={ticket}
                  pending={showProof.isPending}
                  onShow={() => {
                    if (needsRoute(ticket)) setBoarding(ticket);
                    else showProof.mutate({ ticketId: ticket.id });
                  }}
                />
              ))
            )}
          </div>
        </>
      )}

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.18em] text-subtle uppercase">
              Fare table
            </p>
            <h2 className="font-display mt-1 text-3xl leading-none font-semibold">
              Buy or activate
            </h2>
          </div>
          {token ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <CreditCard className="size-3.5" />
              {token.brand} ···· {token.last4}
            </span>
          ) : null}
        </div>
        <div className="mt-5 space-y-6">
          {grouped.map((group) => (
            <div key={group.key}>
              <h3 className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
                {group.label}
              </h3>
              <div className="mt-2 grid gap-2">
                {group.items.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setBuying(product)}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-lg bg-card px-4 py-3 text-left shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
                  >
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{product.blurb}</p>
                    </div>
                    <p className="font-display shrink-0 text-2xl font-semibold tabular-nums">
                      {product.priceCents === 0
                        ? "Free"
                        : formatUsd(product.priceCents)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {past.length > 0 && !proof ? (
        <section className="mt-10">
          <h2 className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
            Used or expired
          </h2>
          <ul className="mt-2 divide-y divide-border rounded-lg bg-card shadow-[var(--shadow-border)]">
            {past.map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span>{ticket.productName}</span>
                <span className="text-xs text-muted capitalize">{ticket.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog open={Boolean(buying)} onOpenChange={(open) => !open && setBuying(null)}>
        {buying ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{buying.name}</DialogTitle>
              <DialogDescription>{buying.blurb}</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Category</dt>
                <dd>{CATEGORY_LABEL[buying.category]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Valid on</dt>
                <dd>{SERVICE_LABEL[buying.service]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Amount</dt>
                <dd className="tabular-nums">{formatUsd(buying.priceCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Payment</dt>
                <dd>
                  {buying.priceCents === 0
                    ? "No charge"
                    : token
                      ? `${token.brand} ···· ${token.last4}`
                      : "Token required"}
                </dd>
              </div>
            </dl>
            {buying.priceCents > 0 ? (
              <p className="mt-3 text-xs text-muted">
                Charged through Columbia Vault. Only a processor token is stored
                here — never a card number.
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted">
                Production issuance requires ID at Three Rivers Transit Center.
                This demo records an attestation only.
              </p>
            )}
            <Button
              className="mt-5 w-full"
              variant="navy"
              size="lg"
              disabled={buy.isPending}
              onClick={() =>
                buy.mutate({
                  productId: buying.id,
                  tokenId: buying.priceCents > 0 ? token?.id : undefined,
                })
              }
            >
              {buy.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : buying.priceCents === 0 ? (
                "Activate pass"
              ) : (
                `Pay ${formatUsd(buying.priceCents)}`
              )}
            </Button>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(boarding)}
        onOpenChange={(open) => !open && setBoarding(null)}
      >
        {boarding ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Board</DialogTitle>
              <DialogDescription>
                Choose the route you are boarding. This starts the 3-hour
                transfer window and issues a signed QR.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label htmlFor="board-route">Route</Label>
              <select
                id="board-route"
                value={boardRoute}
                onChange={(e) => setBoardRoute(e.target.value)}
                className="mt-1 flex h-11 w-full rounded-md border border-border bg-paper-elevated px-3 text-sm shadow-[var(--shadow-border)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {ROUTES.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.label} · {route.area}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className="mt-5 w-full"
              variant="navy"
              size="lg"
              disabled={showProof.isPending}
              onClick={() =>
                showProof.mutate({
                  ticketId: boarding.id,
                  routeHint: boardRoute,
                })
              }
            >
              {showProof.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                "Start ride & show proof"
              )}
            </Button>
          </DialogContent>
        ) : null}
      </Dialog>
    </AppShell>
  );
}

function ProofCard({
  issued,
  refreshing,
  onClose,
  onRefresh,
}: {
  issued: IssuedQr;
  refreshing: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const ticket = issued.ticket;
  return (
    <section className="pass-grain mt-6 overflow-hidden rounded-2xl p-5 text-navy-foreground shadow-navy">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] tracking-[0.22em] text-navy-foreground/70 uppercase">
            Proof of payment
          </p>
          <h2 className="font-display mt-1 text-3xl leading-none font-semibold">
            {ticket.productName}
          </h2>
        </div>
        <Badge variant="teal">RCW 36.57A.230</Badge>
      </div>
      <div className="mt-5">
        <FareQr payload={issued.payload} expiresAt={issued.expiresAt} tone="dark" />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[0.65rem] tracking-wide text-navy-foreground/60 uppercase">
            Ride window
          </dt>
          <dd className="tabular-nums">
            {ticket.rideValidUntil
              ? formatPacific(ticket.rideValidUntil)
              : "Until pass ends"}
          </dd>
        </div>
        <div>
          <dt className="text-[0.65rem] tracking-wide text-navy-foreground/60 uppercase">
            Pass expires
          </dt>
          <dd className="tabular-nums">{formatPacific(ticket.validUntil)}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] tracking-wide text-navy-foreground/60 uppercase">
            Signature
          </dt>
          <dd className="font-mono text-xs">{issued.signatureHint}… HMAC</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] tracking-wide text-navy-foreground/60 uppercase">
            Remaining
          </dt>
          <dd>
            {remainingLabel(ticket)}
          </dd>
        </div>
      </dl>
      {ticket.paymentIntent ? (
        <p className="mt-3 font-mono text-[0.65rem] text-navy-foreground/60">
          Tokenized {formatUsd(ticket.amountCents ?? 0)} · {ticket.paymentIntent}
        </p>
      ) : null}
      {issued.routeHint ? (
        <p className="mt-1 text-xs text-navy-foreground/70">
          Boarded {issued.routeHint}
        </p>
      ) : null}
      <p className="mt-4 text-xs leading-relaxed text-navy-foreground/70">
        Present this QR when requested by a person designated to monitor fare
        payment. Each challenge is single-use and expires in 90 seconds.
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="paper" className="flex-1" onClick={onClose}>
          Hide
        </Button>
        <Button
          variant="paper"
          className="flex-1"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {refreshing ? <LoaderCircle className="animate-spin" /> : "Refresh"}
        </Button>
        <Button
          variant="paper"
          className="flex-1"
          onClick={() =>
            navigator.clipboard
              .writeText(issued.payload)
              .then(() => toast.success("Payload copied"))
          }
        >
          Copy
        </Button>
      </div>
    </section>
  );
}

function PassRow({
  ticket,
  pending,
  onShow,
}: {
  ticket: FareTicket;
  pending: boolean;
  onShow: () => void;
}) {
  const counted = ticket.ridesRemaining != null;
  const rideOpen =
    ticket.rideValidUntil && new Date(ticket.rideValidUntil).getTime() > Date.now();
  const label = counted && !rideOpen ? "Start ride" : "Show proof";
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
      <div className="flex size-12 items-center justify-center rounded-md bg-navy text-navy-foreground">
        <Ticket className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{ticket.productName}</p>
        <p className="truncate text-xs text-muted">
          {ticket.ridesRemaining == null
            ? `Valid through ${formatPacific(ticket.validUntil, false)}`
            : `${ticket.ridesRemaining} remaining · ${SERVICE_LABEL[ticket.service]}`}
        </p>
      </div>
      <Button size="default" variant="navy" disabled={pending} onClick={onShow}>
        {pending ? <LoaderCircle className="animate-spin" /> : label}
      </Button>
    </div>
  );
}

function EmptyPass() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-10 text-center">
      <Bus className="mx-auto size-8 text-teal" />
      <p className="font-display mt-3 text-2xl font-semibold">No active fare</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        Buy an adult single ($1.50) below, then open Inspect and tap Latest QR
        to see a valid proof of payment.
      </p>
    </div>
  );
}

function groupProducts(products: FareProduct[]) {
  const order = [
    { key: "adult", label: "Adult" },
    { key: "reduced", label: "Reduced fare" },
    { key: "freedom", label: "FREEDOM — all services" },
    { key: "youth", label: "Entitlements" },
  ] as const;
  return order
    .map((group) => ({
      ...group,
      items: products.filter((p) =>
        group.key === "youth"
          ? p.category === "youth" || p.category === "senior" || p.category === "veteran"
          : p.category === group.key,
      ),
    }))
    .filter((g) => g.items.length > 0);
}
