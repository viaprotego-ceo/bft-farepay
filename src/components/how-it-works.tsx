import { CreditCard, QrCode, ScanLine } from "lucide-react";

const STEPS = [
  {
    n: "01",
    title: "Pay once",
    body: "Buy a fare. The charge hits a tokenized processor — this app never sees a card number.",
    icon: CreditCard,
  },
  {
    n: "02",
    title: "Show the QR",
    body: "Your phone issues a 90-second HMAC-signed challenge bound to that ticket.",
    icon: QrCode,
  },
  {
    n: "03",
    title: "Inspect",
    body: "A fare monitor scans it. Valid proof is logged. Replay of the same QR is rejected.",
    icon: ScanLine,
  },
] as const;

export function HowItWorks() {
  return (
    <ol className="mt-6 grid gap-2 sm:grid-cols-3">
      {STEPS.map((step) => {
        const Icon = step.icon;
        return (
          <li
            key={step.n}
            className="rounded-lg bg-card px-4 py-3 shadow-[var(--shadow-border)]"
          >
            <p className="flex items-center gap-2 text-[0.65rem] tracking-[0.16em] text-subtle uppercase">
              <Icon className="size-3.5 text-teal" />
              {step.n}
            </p>
            <p className="mt-1.5 font-medium">{step.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{step.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
