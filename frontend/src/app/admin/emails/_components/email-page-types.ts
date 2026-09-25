export type EmailLog = {
  id: string;
  to: string;
  subject: string;
  templateKey: string;
  templateVersion: number;
  status: string;
  critical: boolean;
  resendEmailId: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
};

export type EmailPage = { items: EmailLog[]; nextCursor: string | null };
export type TenantOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  unit: { status: string; property: { id: string; name: string } } | null;
};
export type Audience = "tenant" | "selected" | "property" | "all_active";

export const success = new Set(["SENT", "DELIVERED", "OPENED", "CLICKED"]);
export const failure = new Set([
  "FAILED",
  "BOUNCED",
  "COMPLAINED",
  "SUPPRESSED",
]);
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function date(value: string | null) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}
