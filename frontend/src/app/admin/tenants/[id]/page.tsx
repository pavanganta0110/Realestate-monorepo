"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Mail, MessageSquare, Pencil, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TenantDocumentManager } from "@/components/portal/tenant-document-manager";
import { PaymentManagementDialog } from "../../payments/_components/payment-management-dialog";
import { RecordPaymentDialog } from "./_components/record-payment-dialog";
import { dateLabel, money, tabs, type ChatThread, type EmailHistory, type Tab, type TenantDetail } from "./_components/tenant-detail-types";

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [emails, setEmails] = useState<EmailHistory>([]);
  const [chat, setChat] = useState<ChatThread | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("General notice");
  const [templateKey, setTemplateKey] = useState<"tenant.custom_notice" | "tenant.dashboard_sign_in" | "rent.reminder" | "rent.late_notice">("tenant.custom_notice");
  const [sending, setSending] = useState(false);
  const [chatBody, setChatBody] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    const [record, emailRows, thread] = await Promise.all([api.get(`/admin/tenants/${id}`), api.get(`/admin/emails/tenant/${id}`).catch(() => []), api.get(`/admin/messages/${id}`).catch(() => null)]);
    setTenant(record as TenantDetail);
    setEmails(emailRows as EmailHistory);
    setChat(thread as ChatThread | null);
  }, [id]);
  useEffect(() => {
    load()
      .catch((error: unknown) => toast.error(getErrorMessage(error, "Unable to load tenant")))
      .finally(() => setLoading(false));
  }, [load]);

  const currentLease = useMemo(() => tenant?.leases.find((lease) => ["active", "expiring", "renewed"].includes(lease.status.toLowerCase())) ?? tenant?.leases[0], [tenant]);
  const outstanding = useMemo(() => tenant?.payments.reduce((sum, payment) => sum + Math.max(0, payment.balanceDue), 0) ?? 0, [tenant]);
  const activityItems = useMemo(
    () =>
      [
        ...(tenant?.activity ?? []).map((event) => ({
          id: event.id,
          action: event.action,
          resource: event.resource,
          createdAt: event.createdAt,
          actor: event.user?.email ?? null,
          details: event.newValue,
        })),
        ...(tenant?.maintenanceRequests ?? []).map((event) => ({
          id: event.id,
          action: `Maintenance ${event.status}`,
          resource: "maintenance",
          createdAt: event.createdAt,
          actor: null,
          details: event.title ?? event.description ?? null,
        })),
        ...emails.map((event) => ({
          id: event.id,
          action: `Email ${event.status}`,
          resource: event.templateKey,
          createdAt: event.createdAt,
          actor: null,
          details: event.subject,
        })),
        ...(chat?.items ?? []).map((event) => ({
          id: event.id,
          action: "Chat message",
          resource: "tenant_message",
          createdAt: event.createdAt,
          actor: event.sender.email,
          details: event.subject,
        })),
      ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [tenant, emails, chat],
  );

  async function sendEmail(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    try {
      const requestId = crypto.randomUUID();
      await api.post("/admin/emails/send", {
        audienceType: "tenant",
        tenantId: id,
        requestId,
        templateKey,
        subject,
        message,
        category,
      });
      toast.success("Email queued through the existing delivery service");
      setCompose(false);
      setSubject("");
      setMessage("");
      await load();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to send email"));
    } finally {
      setSending(false);
    }
  }

  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    if (!chatBody.trim()) return;
    setSending(true);
    try {
      await api.post(`/admin/messages/${id}`, {
        body: chatBody.trim(),
        subject: "Resident support",
      });
      setChatBody("");
      await load();
      toast.success("Chat message sent");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to send chat message"));
    } finally {
      setSending(false);
    }
  }

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  if (!tenant) return <p className="p-8 text-muted-foreground">Tenant record not found.</p>;
  const title = `${tenant.firstName} ${tenant.lastName}`;

  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-12">
      <Link href="/admin/tenants" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" />
        Back to tenants
      </Link>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
              <Badge>{tenant.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {tenant.unit ? `${tenant.unit.property.name} · Unit ${tenant.unit.unitNumber}` : "No unit assigned"} · {currentLease ? `${currentLease.status} lease` : "No lease on file"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tenant.email}
              {tenant.phone ? ` · ${tenant.phone}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setTab("Email");
                setCompose(true);
              }}
            >
              <Mail />
              Send Email
            </Button>
            <Button variant="outline" onClick={() => setTab("Chat")}>
              <MessageSquare />
              Send Chat
            </Button>
            <div onClick={() => setTab("Rent & Payments")}>
              <RecordPaymentDialog
                tenantId={tenant.id}
                unitId={tenant.unit?.id}
                leases={tenant.leases}
                onSaved={load}
              />
            </div>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit Tenant
            </Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-4 text-sm">
          <span>
            Monthly rent: <b>{money(currentLease?.monthlyRent)}</b>
          </span>
          <span>
            Due day: <b>{currentLease?.rentDueDay ?? "—"}</b>
          </span>
          <span>
            Outstanding: <b className={outstanding ? "text-destructive" : "text-primary"}>{money(outstanding)}</b>
          </span>
        </div>
      </section>
      <nav aria-label="Tenant details" className="flex gap-2 overflow-x-auto border-b border-border pb-2">
        {tabs.map((item) => (
          <button
            key={item}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tab === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            {item}
          </button>
        ))}
      </nav>

      {tab === "Overview" ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Email", tenant.email],
            ["Phone", tenant.phone],
            ["Date of birth", dateLabel(tenant.dateOfBirth)],
            ["Emergency contact", tenant.emergencyContactName],
            ["Emergency phone", tenant.emergencyContactPhone],
            ["Vehicle", tenant.vehicleInfo],
            ["Pets", tenant.petInfo],
            ["Property", tenant.unit?.property.name],
            ["Unit", tenant.unit?.unitNumber],
            ["Portal account", tenant.user ? `${tenant.user.email} · ${tenant.user.status}` : "Not linked"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-2 text-sm">{value || "—"}</p>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "Lease" ? (
        <section className="space-y-3">
          {tenant.leases.map((lease) => (
            <article key={lease.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex justify-between">
                <h2 className="font-semibold">{lease.status} lease</h2>
                <Badge variant="outline">{lease.status}</Badge>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <p>
                  Start <b>{dateLabel(lease.startDate)}</b>
                </p>
                <p>
                  End <b>{dateLabel(lease.endDate)}</b>
                </p>
                <p>
                  Monthly rent <b>{money(lease.monthlyRent)}</b>
                </p>
                <p>
                  Rent due day <b>{lease.rentDueDay}</b>
                </p>
                <p>
                  Grace period <b>{lease.gracePeriodDays} days</b>
                </p>
                <p>
                  Late fee <b>{money(lease.lateFeeAmount)}</b>
                </p>
                <p>
                  Security deposit <b>{money(lease.securityDeposit)}</b>
                </p>
              </div>
            </article>
          ))}
          {!tenant.leases.length ? <p className="rounded-xl border p-6 text-muted-foreground">No lease history is available.</p> : null}
        </section>
      ) : null}

      {tab === "Rent & Payments" ? (
        <section className="space-y-3">
          <div className="flex justify-end">
            <RecordPaymentDialog
              tenantId={tenant.id}
              unitId={tenant.unit?.id}
              leases={tenant.leases}
              onSaved={load}
            />
          </div>
          {tenant.payments.map((payment) => (
            <article key={payment.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{payment.billingPeriod ? dateLabel(payment.billingPeriod) : "Rent charge"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Due {dateLabel(payment.dueDate)} · {payment.status} · {payment.paymentMethod ?? "No method recorded"} · Paid {dateLabel(payment.paidAt)} · Ref {payment.referenceNumber ?? "—"}
                  </p>
                </div>
                <PaymentManagementDialog
                  payment={{
                    ...payment,
                    tenant: {
                      firstName: tenant.firstName,
                      lastName: tenant.lastName,
                    },
                  }}
                  onSaved={load}
                />
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                <p>Rent {money(payment.rentAmount)}</p>
                <p>Late fee {money(payment.lateFee)}</p>
                <p>Paid {money(payment.paidAmount)}</p>
                <p>Balance {money(payment.balanceDue)}</p>
              </div>
            </article>
          ))}
          {!tenant.payments.length ? <p className="rounded-xl border p-6 text-muted-foreground">No rent charges recorded.</p> : null}
        </section>
      ) : null}

      {tab === "Email" ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Email history</h2>
            <Button onClick={() => setCompose(true)}>
              <Mail />
              Send Email
            </Button>
          </div>
          {emails.map((email) => (
            <article key={email.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{email.subject}</h3>
                <Badge variant="outline">{email.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {email.templateKey} · {dateLabel(email.createdAt)} · delivered {dateLabel(email.deliveredAt)} · opened {dateLabel(email.openedAt)}
                {email.bouncedAt ? ` · bounced ${dateLabel(email.bouncedAt)}` : ""}
              </p>
            </article>
          ))}
          {!emails.length ? <p className="rounded-xl border p-6 text-muted-foreground">No emails have been logged for this tenant.</p> : null}
        </section>
      ) : null}

      {tab === "Chat" ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Tenant chat</h2>
            <p className="text-sm text-muted-foreground">Chat is separate from email. Existing admin replies also send the system’s normal email notification.</p>
          </div>
          {!tenant.user ? <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">This tenant has no linked portal account yet. Link an account before sending in-app chat.</p> : null}
          <div className="space-y-3">
            {chat?.items.map((item) => (
              <article key={item.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">
                  {item.sender.email} · {dateLabel(item.createdAt)} · {item.readAt ? "Read" : "Unread"}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{item.body}</p>
              </article>
            ))}
            {!chat?.items.length ? <p className="rounded-xl border p-6 text-muted-foreground">No chat messages yet.</p> : null}
          </div>
          <form onSubmit={sendChat} className="flex flex-col gap-2 sm:flex-row">
            <Input value={chatBody} onChange={(e) => setChatBody(e.target.value)} placeholder="Type a message…" disabled={!tenant.user} maxLength={5000} />
            <Button disabled={!tenant.user || sending || !chatBody.trim()}>
              <Send />
              Send
            </Button>
          </form>
        </section>
      ) : null}

      {tab === "Documents" ? <TenantDocumentManager tenantId={tenant.id} tenantName={title} /> : null}
      {tab === "Activity" ? (
        <section className="space-y-3">
          {activityItems.map((event) => (
            <article key={`${event.resource}-${event.id}`} className="rounded-xl border border-border bg-card p-4">
              <div className="flex justify-between gap-4">
                <b className="text-sm">{event.action.replaceAll("_", " ")}</b>
                <span className="text-xs text-muted-foreground">{dateLabel(event.createdAt)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {event.resource}
                {event.actor ? ` · ${event.actor}` : ""}
                {event.details ? ` · ${event.details}` : ""}
              </p>
            </article>
          ))}
          {!activityItems.length ? <p className="rounded-xl border p-6 text-muted-foreground">No activity recorded.</p> : null}
        </section>
      ) : null}

      {compose ? (
        <div role="dialog" aria-modal="true" aria-labelledby="tenant-email-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={sendEmail} className="w-full max-w-xl space-y-4 rounded-2xl bg-card p-6 shadow-xl">
            <div>
              <h2 id="tenant-email-title" className="text-xl font-semibold">
                Send email to {title}
              </h2>
              <p className="text-sm text-muted-foreground">Uses the existing branded email templates and delivery tracking.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-template">Email type</Label>
              <select id="email-template" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={templateKey} onChange={(e) => setTemplateKey(e.target.value as typeof templateKey)}>
                <option value="tenant.custom_notice">Custom operational notice</option>
                <option value="tenant.dashboard_sign_in">Dashboard sign-in</option>
                <option value="rent.reminder">Rent reminder (server uses current charge)</option>
                <option value="rent.late_notice">Late rent notice (server uses current balance)</option>
              </select>
            </div>
            {templateKey === "tenant.custom_notice" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="notice-category">Category</Label>
                  <Input id="notice-category" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notice-subject">Subject</Label>
                  <Input id="notice-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={180} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notice-message">Message</Label>
                  <Textarea id="notice-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={10000} rows={7} required />
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-secondary/50 p-3 text-sm text-muted-foreground">
                {templateKey === "tenant.dashboard_sign_in" ? "This sends the tenant a link to the dashboard sign-in page. The tenant must already have a linked portal account." : "Financial amounts and due dates are resolved from this tenant’s current rent charge on the server. Sending is unavailable if no unpaid rent charge exists."}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCompose(false)}>
                Cancel
              </Button>
              <Button disabled={sending}>{sending ? <Loader2 className="animate-spin" /> : <Send />}Send Email</Button>
            </div>
          </form>
        </div>
      ) : null}

      {editOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="tenant-edit-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              try {
                await api.patch(`/admin/tenants/${id}`, {
                  firstName: form.get("firstName"),
                  lastName: form.get("lastName"),
                  phone: form.get("phone") || null,
                  emergencyContactName: form.get("emergencyContactName") || null,
                  emergencyContactPhone: form.get("emergencyContactPhone") || null,
                  vehicleInfo: form.get("vehicleInfo") || null,
                  petInfo: form.get("petInfo") || null,
                });
                setEditOpen(false);
                await load();
                toast.success("Tenant updated");
              } catch (error: unknown) {
                toast.error(getErrorMessage(error, "Unable to update tenant"));
              }
            }}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-card p-6 shadow-xl"
          >
            <h2 id="tenant-edit-title" className="text-xl font-semibold">
              Edit tenant
            </h2>
            {(
              [
                ["firstName", "First name", tenant.firstName],
                ["lastName", "Last name", tenant.lastName],
                ["phone", "Phone", tenant.phone ?? ""],
                ["emergencyContactName", "Emergency contact", tenant.emergencyContactName ?? ""],
                ["emergencyContactPhone", "Emergency phone", tenant.emergencyContactPhone ?? ""],
                ["vehicleInfo", "Vehicle", tenant.vehicleInfo ?? ""],
                ["petInfo", "Pet information", tenant.petInfo ?? ""],
              ] as const
            ).map(([name, label, value]) => (
              <div key={name} className="space-y-1">
                <Label htmlFor={`edit-${name}`}>{label}</Label>
                <Input id={`edit-${name}`} name={name} defaultValue={value} />
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button>Save</Button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
