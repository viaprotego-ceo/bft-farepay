export type ProductKind = "single" | "ten_ride" | "day" | "monthly" | "entitlement";
export type ProductCategory =
  | "adult"
  | "reduced"
  | "freedom"
  | "youth"
  | "senior"
  | "veteran";
export type ServiceMode = "fixed" | "all";

export type FareProduct = {
  id: string;
  name: string;
  category: ProductCategory;
  service: ServiceMode;
  kind: ProductKind;
  priceCents: number;
  rideCount: number | null;
  rideWindowSeconds: number;
  passSeconds: number | null;
  blurb: string;
  sortOrder: number;
};

export type PaymentToken = {
  id: string;
  processor: string;
  tokenRef: string;
  brand: string;
  last4: string;
};

export type Ticket = {
  id: string;
  productId: string;
  productName: string;
  category: ProductCategory;
  service: ServiceMode;
  kind: ProductKind;
  ridesRemaining: number | null;
  rideValidUntil: string | null;
  validFrom: string;
  validUntil: string;
  status: "active" | "exhausted" | "expired";
  createdAt: string;
  paymentIntent: string | null;
  amountCents: number | null;
};

export type PurchaseResult = {
  ticket: Ticket;
  receipt: {
    processorIntent: string;
    amountCents: number;
    brand: string;
    last4: string;
    processor: string;
  } | null;
};

export type IssuedQr = {
  payload: string;
  expiresAt: string;
  ticket: Ticket;
  signatureHint: string;
  routeHint: string | null;
};

export type LatestQr = {
  payload: string;
  expiresAt: string;
  productName: string;
};

export type InspectOk = {
  ok: true;
  result: "valid";
  ticketId: string;
  productName: string;
  category: string;
  service: string;
  kind: string;
  validUntil: string;
  rideValidUntil: string | null;
  qrExpiresAt: string;
  inspectedAt: string;
  inspectionId: string;
  routeHint: string | null;
};

export type InspectFail = {
  ok: false;
  result: "expired" | "invalid_sig" | "not_found" | "exhausted" | "malformed" | "replay";
  reason: string;
  inspectionId: string;
};

export type InspectVerdict = InspectOk | InspectFail;

export type InspectionRow = {
  id: string;
  result: string;
  reason: string | null;
  routeHint: string | null;
  productName: string | null;
  createdAt: string;
};

export type AuditRow = {
  id: number;
  kind: string;
  subjectId: string | null;
  detail: string;
  createdAt: string;
};

export type OpsSnapshot = {
  ticketsIssued: number;
  amountCapturedCents: number;
  inspectionCount: number;
  validInspections: number;
  productMix: { name: string; count: number }[];
  recentInspections: InspectionRow[];
  recentAudit: AuditRow[];
  qrTtlSeconds: number;
  signingAlg: string;
  processor: string;
};

export const ROUTES = [
  { id: "1", label: "Route 1", area: "Richland" },
  { id: "2X", label: "2X Express", area: "Tri-Cities" },
  { id: "20", label: "Route 20", area: "Pasco" },
  { id: "26", label: "Route 26", area: "Kennewick" },
  { id: "67", label: "Route 67", area: "West Richland" },
  { id: "110", label: "Route 110", area: "Kennewick" },
  { id: "225", label: "Route 225", area: "Pasco" },
  { id: "240X", label: "240X Express", area: "Tri-Cities" },
  { id: "CONNECT", label: "CONNECT", area: "On-demand" },
  { id: "DAR", label: "Dial-A-Ride", area: "PTBA" },
] as const;

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  adult: "Adult",
  reduced: "Reduced",
  freedom: "FREEDOM",
  youth: "Youth",
  senior: "Senior",
  veteran: "Veteran",
};

export const SERVICE_LABEL: Record<ServiceMode, string> = {
  fixed: "Fixed route & CONNECT",
  all: "All BFT services",
};
