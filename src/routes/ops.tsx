import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getOpsSnapshot } from "@/lib/fare/actions";
import { RCW } from "@/lib/fare/rcw";
import { formatPacific, formatUsd } from "@/lib/utils";

export const Route = createFileRoute("/ops")({ component: OpsPage });

function OpsPage() {
  const ops = useQuery({
    queryKey: ["ops"],
    queryFn: () => getOpsSnapshot(),
    refetchInterval: 8000,
  });

  const data = ops.data;
  const validRate =
    data && data.inspectionCount > 0
      ? Math.round((data.validInspections / data.inspectionCount) * 100)
      : null;

  return (
    <AppShell>
      <p className="text-xs tracking-[0.18em] text-subtle uppercase">
        Agency operations
      </p>
      <h1 className="font-display mt-1 text-4xl leading-none font-semibold tracking-tight">
        Fare ledger
      </h1>
      <p className="mt-3 max-w-prose text-sm text-muted">
        Locally owned Postgres ledger. Tokenized payments, HMAC-signed QR
        challenges, append-only inspections. The signing kernel is a handful of
        functions that port to a small Python service without vendor lock-in.
      </p>

      {ops.isLoading || !data ? (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Stat label="Tickets issued" value={String(data.ticketsIssued)} />
            <Stat
              label="Captured (tokenized)"
              value={formatUsd(data.amountCapturedCents)}
            />
            <Stat label="Inspections" value={String(data.inspectionCount)} />
            <Stat
              label="Valid rate"
              value={validRate == null ? "—" : `${validRate}%`}
            />
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{RCW.cite}</CardTitle>
              <CardDescription>{RCW.title}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-4 text-sm">
                {RCW.duties.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">{RCW.infraction}</p>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Product mix</CardTitle>
              <CardDescription>Issued fare media in this ledger</CardDescription>
            </CardHeader>
            <CardContent>
              {data.productMix.length === 0 ? (
                <p className="text-sm text-muted">No tickets yet. Buy a fare on Ride.</p>
              ) : (
                <MixList items={data.productMix} />
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Inspections</CardTitle>
              <CardDescription>Append-only proof-of-payment log</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentInspections.length === 0 ? (
                <p className="text-sm text-muted">No inspections yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentInspections.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {row.productName ?? "Unknown media"}
                        </p>
                        <p className="text-xs text-muted tabular-nums">
                          {formatPacific(row.createdAt)}
                          {row.routeHint ? ` · ${row.routeHint}` : ""}
                        </p>
                      </div>
                      <Badge variant={row.result === "valid" ? "valid" : "invalid"}>
                        {row.result.replace("_", " ")}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Signing kernel</CardTitle>
              <CardDescription>Minimal custom surface</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <Row k="QR signing" v={data.signingAlg} />
              <Row k="Challenge TTL" v={`${data.qrTtlSeconds} seconds`} />
              <Row k="Replay" v="Single-use nonce" />
              <Row k="Processor" v={data.processor} />
              <Row k="PAN stored" v="Never" />
              <Row k="Statute" v={RCW.cite} />
              <Separator className="my-3" />
              <pre className="overflow-x-auto rounded-md bg-secondary px-3 py-2 font-mono text-[0.7rem] leading-relaxed text-foreground">
{`v=1|t=<ticket>|e=<unix>|n=<nonce>
HMAC-SHA256 → base64url
BFT1.<payload>.<sig>`}
              </pre>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Same string signs in Python with{" "}
                <span className="font-mono">hmac.new(key, msg, hashlib.sha256)</span>.
                Seven tables, no card data, no vendor SDK. A PTBA can own this
                ledger for years.
              </p>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Audit</CardTitle>
              <CardDescription>Purchases and inspections</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentAudit.length === 0 ? (
                <p className="text-sm text-muted">Ledger is empty.</p>
              ) : (
                <ul className="space-y-2">
                  {data.recentAudit.map((row) => (
                    <li key={row.id} className="font-mono text-[0.7rem] text-muted">
                      <span className="text-foreground">{row.kind}</span>
                      {" · "}
                      {formatPacific(row.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}

function MixList({ items }: { items: { name: string; count: number }[] }) {
  const max = Math.max(...items.map((row) => row.count), 1);
  return (
    <ul className="space-y-2">
      {items.map((row) => (
        <li key={row.name} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-sm">{row.name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-teal"
              style={{ width: `${Math.round((row.count / max) * 100)}%` }}
            />
          </div>
          <span className="w-6 text-right text-sm tabular-nums">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="font-display mt-1 text-3xl leading-none font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-muted">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
