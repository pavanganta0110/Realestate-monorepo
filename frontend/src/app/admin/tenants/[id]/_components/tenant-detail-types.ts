import type { AdminPayment } from "../../../payments/_components/payment-management-dialog";

export type TenantDetail = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  dateOfBirth: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  vehicleInfo: string | null;
  petInfo: string | null;
  user: { id: string; email: string; status: string } | null;
  unit: {
    id: string;
    unitNumber: string;
    status: string;
    property: { id: string; name: string };
  } | null;
  leases: Array<{
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    monthlyRent: number;
    rentDueDay: number;
    gracePeriodDays: number;
    lateFeeAmount: number;
    securityDeposit: number;
  }>;
  payments: Array<
    AdminPayment & {
      dueDate: string;
      paidAt: string | null;
      billingPeriod: string | null;
      purpose: string;
    }
  >;
  maintenanceRequests: Array<{
    id: string;
    title?: string;
    description?: string;
    status: string;
    createdAt: string;
  }>;
  activity: Array<{
    id: string;
    action: string;
    resource: string;
    createdAt: string;
    user: { email: string } | null;
    newValue: string | null;
  }>;
};

export type EmailHistory = Array<{
  id: string;
  subject: string;
  templateKey: string;
  status: string;
  createdAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
}>;

export type ChatThread = {
  items: Array<{
    id: string;
    subject: string;
    body: string;
    createdAt: string;
    readAt: string | null;
    sender: { email: string; role: string };
    receiver: { email: string; role: string };
  }>;
  tenant: { user?: unknown };
};

export const tabs = ["Overview", "Lease", "Rent & Payments", "Email", "Chat", "Documents", "Activity"] as const;
export type Tab = (typeof tabs)[number];
export const dateLabel = (value?: string | null) => (value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value)) : "—");
export const money = (value?: number | string | null) => `$${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
