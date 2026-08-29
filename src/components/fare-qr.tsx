import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatCountdown, secondsLeft } from "@/lib/utils";

export function FareQr({
  payload,
  expiresAt,
  tone = "dark",
}: {
  payload: string;
  expiresAt: string;
  tone?: "dark" | "light";
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [left, setLeft] = useState(() => secondsLeft(expiresAt));

  useEffect(() => {
    let cancelled = false;
    void import("qrcode").then((QR) =>
      QR.toDataURL(payload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 280,
        color: { dark: "#12263A", light: "#FCFAF6" },
      }).then((url) => {
        if (!cancelled) setDataUrl(url);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [payload]);

  useEffect(() => {
    setLeft(secondsLeft(expiresAt));
    const id = window.setInterval(() => setLeft(secondsLeft(expiresAt)), 250);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const pct = Math.max(0, Math.min(1, left / 90));
  const dark = tone === "dark";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative rounded-lg bg-paper-elevated p-3 shadow-[var(--shadow-border)]">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Signed proof-of-payment QR code"
            className="mx-auto h-auto w-full max-w-52"
          />
        ) : (
          <div className="mx-auto aspect-square w-full max-w-52 animate-pulse bg-secondary" />
        )}
      </div>
      <div
        className={cn(
          "flex w-full max-w-52 flex-col gap-1.5 text-sm",
          dark ? "text-navy-foreground/75" : "text-muted",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span
              className="inline-block size-2 rounded-full bg-teal"
              style={{ opacity: 0.45 + pct * 0.55 }}
            />
            Refreshes in
          </span>
          <span
            className={cn(
              "font-mono tabular-nums",
              dark ? "text-navy-foreground" : "text-foreground",
            )}
          >
            {formatCountdown(left)}
          </span>
        </div>
        <div
          className={cn(
            "h-1 overflow-hidden rounded-full",
            dark ? "bg-navy-foreground/15" : "bg-secondary",
          )}
        >
          <div
            className="h-full rounded-full bg-teal transition-[width] duration-200 ease-[var(--ease-out)]"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
