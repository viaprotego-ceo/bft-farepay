import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Camera,
  CheckCircle2,
  ClipboardPaste,
  LoaderCircle,
  ScanLine,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLatestIssuedQr, getOpsSnapshot, verifyQr } from "@/lib/fare/actions";
import { RCW } from "@/lib/fare/rcw";
import { ROUTES, type InspectVerdict } from "@/lib/fare/types";
import { formatPacific } from "@/lib/utils";

export const Route = createFileRoute("/inspect")({ component: InspectPage });

function InspectPage() {
  const [routeHint, setRouteHint] = useState("20");
  const [payload, setPayload] = useState("");
  const [verdict, setVerdict] = useState<InspectVerdict | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const queryClient = useQueryClient();

  const latest = useQuery({
    queryKey: ["latest-qr"],
    queryFn: () => getLatestIssuedQr(),
    refetchInterval: 4000,
  });

  const recent = useQuery({
    queryKey: ["ops"],
    queryFn: () => getOpsSnapshot(),
    refetchInterval: 8000,
  });

  const inspect = useMutation({
    mutationFn: (raw: string) =>
      verifyQr({ data: { payload: raw.trim(), routeHint } }),
    onSuccess: (result) => {
      setVerdict(result);
      void queryClient.invalidateQueries({ queryKey: ["ops"] });
      void queryClient.invalidateQueries({ queryKey: ["latest-qr"] });
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    return () => stopScan();
  }, []);

  async function startScan() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
    } catch {
      toast.error("Camera is blocked in this preview — paste a payload or use latest QR");
    }
  }

  useEffect(() => {
    if (!scanning) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream) {
      video.srcObject = stream;
      void video.play();
    }
    void loopScan();
  }, [scanning]);

  function stopScan() {
    setScanning(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function loopScan() {
    const jsQR = (await import("jsqr")).default;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const tick = () => {
      const video = videoRef.current;
      if (!video || !ctx || video.readyState < 2) {
        if (streamRef.current) requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height);
      if (code?.data?.startsWith("BFT1.")) {
        stopScan();
        setPayload(code.data);
        inspect.mutate(code.data);
        return;
      }
      if (streamRef.current) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const lastInspections = recent.data?.recentInspections.slice(0, 5) ?? [];

  return (
    <AppShell>
      <p className="text-xs tracking-[0.18em] text-subtle uppercase">
        Fare monitor
      </p>
      <h1 className="font-display mt-1 text-4xl leading-none font-semibold tracking-tight">
        Request proof
      </h1>
      <p className="mt-3 max-w-prose text-sm text-muted">
        {RCW.duties[1]} Signature, expiry, ticket state, and replay are checked
        before a pass or fail is written to the ledger.
      </p>

      <div className="mt-6 grid gap-3">
        <div>
          <Label htmlFor="route">Assignment</Label>
          <select
            id="route"
            value={routeHint}
            onChange={(e) => setRouteHint(e.target.value)}
            className="mt-1 flex h-11 w-full rounded-md border border-border bg-paper-elevated px-3 text-sm shadow-[var(--shadow-border)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {ROUTES.map((route) => (
              <option key={route.id} value={route.id}>
                {route.label} · {route.area}
              </option>
            ))}
          </select>
        </div>

        <div
          className={
            scanning ? "overflow-hidden rounded-xl bg-navy text-navy-foreground" : undefined
          }
        >
          <div className={scanning ? "relative aspect-[4/3] bg-navy-deep" : "sr-only"}>
            <video
              ref={videoRef}
              className="size-full object-cover"
              playsInline
              muted
            />
          </div>
          {scanning ? (
            <div className="p-3">
              <Button variant="paper" className="w-full" onClick={stopScan}>
                Stop camera
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => void startScan()}
              >
                <Camera />
                Open camera
              </Button>
              <Button
                variant="navy"
                className="flex-1"
                disabled={!latest.data || inspect.isPending}
                onClick={() => {
                  if (!latest.data) return;
                  setPayload(latest.data.payload);
                  inspect.mutate(latest.data.payload);
                }}
              >
                {inspect.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <ScanLine />
                )}
                Latest QR
              </Button>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="payload">Or paste payload</Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="payload"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              placeholder="BFT1.…"
              className="font-mono text-xs"
            />
            <Button
              variant="navy"
              disabled={!payload.trim() || inspect.isPending}
              onClick={() => inspect.mutate(payload)}
            >
              <ClipboardPaste />
              Verify
            </Button>
          </div>
        </div>
      </div>

      {verdict ? <VerdictCard verdict={verdict} /> : <DemoHint hasLive={Boolean(latest.data)} />}

      {lastInspections.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
            This assignment
          </h2>
          <ul className="mt-2 divide-y divide-border rounded-lg bg-card shadow-[var(--shadow-border)]">
            {lastInspections.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
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
        </section>
      ) : null}
    </AppShell>
  );
}

function DemoHint({ hasLive }: { hasLive: boolean }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-border bg-card/60 px-4 py-5">
      <p className="font-display text-2xl font-semibold">Ready to inspect</p>
      <p className="mt-1 text-sm text-muted">
        {hasLive
          ? "A live signed QR is waiting. Tap Latest to produce proof of payment."
          : "On Ride, buy an adult single and show the QR, then come back here."}
      </p>
    </div>
  );
}

function VerdictCard({ verdict }: { verdict: InspectVerdict }) {
  if (verdict.ok) {
    return (
      <section className="mt-6 rounded-xl bg-valid-soft p-5 text-valid">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-7" />
          <h2 className="font-display text-4xl leading-none font-semibold">Valid</h2>
        </div>
        <p className="mt-2 text-sm text-ink">
          Proof of payment produced as required by {RCW.cite}.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-ink">
          <div>
            <dt className="text-xs text-muted">Product</dt>
            <dd className="font-medium">{verdict.productName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Route</dt>
            <dd>{verdict.routeHint ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Pass valid through</dt>
            <dd className="tabular-nums">{formatPacific(verdict.validUntil)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Ride window</dt>
            <dd className="tabular-nums">
              {verdict.rideValidUntil
                ? formatPacific(verdict.rideValidUntil)
                : "Pass"}
            </dd>
          </div>
        </dl>
        <p className="mt-4 font-mono text-[0.65rem] text-muted">
          Inspection {verdict.inspectionId.slice(0, 8)} · ticket{" "}
          {verdict.ticketId.slice(0, 8)}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-xl bg-invalid-soft p-5 text-invalid">
      <div className="flex items-center gap-2">
        <XCircle className="size-7" />
        <h2 className="font-display text-4xl leading-none font-semibold">
          {verdict.result === "expired"
            ? "Expired"
            : verdict.result === "replay"
              ? "Already used"
              : "Invalid"}
        </h2>
      </div>
      <p className="mt-2 text-sm text-ink">{verdict.reason}</p>
      <div className="mt-3">
        <Badge variant="invalid">{verdict.result.replace("_", " ")}</Badge>
      </div>
      <p className="mt-4 text-xs text-muted">{RCW.infraction}</p>
    </section>
  );
}
