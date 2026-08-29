import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardCheck, QrCode, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Ride", icon: QrCode },
  { to: "/inspect", label: "Inspect", icon: ClipboardCheck },
  { to: "/ops", label: "Ops", icon: Shield },
] as const;

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <rect x="6" y="6" width="8" height="8" rx="1.5" fill="var(--color-paper)" />
      <rect x="8" y="8" width="4" height="4" rx="0.5" fill="var(--color-navy)" />
      <path
        d="M6 22c5-6 9-2 14-7 3 4 5 7 10 6"
        fill="none"
        stroke="var(--color-paper)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="20" y="20" width="6" height="6" rx="1" fill="var(--color-paper)" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-dvh bg-paper text-foreground">
      <header className="river-wash text-navy-foreground">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Mark className="size-9 text-teal" />
            <div>
              <p className="font-display text-[1.65rem] leading-none font-semibold tracking-tight">
                BFT FarePay
              </p>
              <p className="mt-1 text-[0.7rem] tracking-[0.16em] text-navy-foreground/70 uppercase">
                Benton-Franklin PTBA
              </p>
            </div>
          </div>
          <p className="hidden text-right text-[0.7rem] tracking-wide text-navy-foreground/70 sm:block">
            Demonstration pilot
            <br />
            RCW 36.57A.230
          </p>
        </div>
        <nav className="mx-auto max-w-3xl px-4 pb-4 sm:px-6">
          <div className="flex rounded-lg bg-navy-deep/45 p-1">
            {NAV.map((item) => {
              const active =
                item.to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-11 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium transition-[background-color,color] duration-150 ease-[var(--ease-out)]",
                    active
                      ? "bg-paper-elevated text-navy"
                      : "text-navy-foreground/80 hover:text-navy-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        {children}
      </main>
      <footer className="mx-auto max-w-3xl px-4 pb-10 text-xs leading-relaxed text-muted sm:px-6">
        Pilot for Ben Franklin Transit riders in Kennewick, Pasco, Richland,
        West Richland, Benton City, and Prosser. Not official BFT fare media.
        Card numbers never touch this system — payment is tokenized through a
        PCI DSS processor.
      </footer>
    </div>
  );
}
