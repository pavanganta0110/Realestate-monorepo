"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, MailCheck, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { date, failure, success, type Audience, type EmailLog, type EmailPage, type TenantOption } from "./_components/email-page-types";

export default function AdminEmailDeliveryPage() {
  const [items, setItems] = useState<EmailLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [section, setSection] = useState<"Compose" | "Sent" | "Delivery">("Compose");
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [audience, setAudience] = useState<Audience>("all_active");
  const [tenantId, setTenantId] = useState("");
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("General notice");
  const [templateKey, setTemplateKey] = useState<"tenant.custom_notice" | "tenant.dashboard_sign_in" | "rent.reminder" | "rent.late_notice">("tenant.custom_notice");
  const [audiencePreview, setAudiencePreview] = useState<{
    recipientCount: number;
    recipients: Array<{
      id: string;
      name: string;
      email: string;
      property: string | null;
      unit: string | null;
    }>;
  } | null>(null);
  const [requestId, setRequestId] = useState("");
  const [batches, setBatches] = useState<
    Array<{
      id: string;
      subject: string;
      audienceType: string;
      recipientCount: number;
      status: string;
      createdAt: string;
      property: { name: string } | null;
      createdBy: { email: string };
    }>
  >([]);
  const [sendingBulk, setSendingBulk] = useState(false);
  const previewSequence = useRef(0);

  function invalidatePreview() {
    previewSequence.current += 1;
    setAudiencePreview(null);
    setRequestId("");
  }

  const load = useCallback(async (nextCursor?: string) => {
    const page = (await api.get(`/admin/emails?limit=25${nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ""}`)) as EmailPage;
    setItems((current) => (nextCursor ? [...current, ...page.items] : page.items));
    setCursor(page.nextCursor);
  }, []);

  useEffect(() => {
    api
      .get("/admin/emails?limit=25")
      .then((data) => {
        const page = data as EmailPage;
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch((error) => toast.error(getErrorMessage(error, "Unable to load email delivery")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api
      .get("/admin/tenants")
      .then((rows) => setTenants(rows as TenantOption[]))
      .catch((error) => toast.error(getErrorMessage(error, "Unable to load tenant recipients")));
  }, []);

  async function loadBatches() {
    const data = await api.get("/admin/emails/batches?limit=100");
    setBatches(data as typeof batches);
  }
  useEffect(() => {
    if (section === "Sent") void loadBatches().catch((error) => toast.error(getErrorMessage(error, "Unable to load sent email batches")));
  }, [section]);

  const properties = Array.from(new Map(tenants.flatMap((tenant) => (tenant.unit?.property ? [[tenant.unit.property.id, tenant.unit.property] as const] : []))).values());
  function audiencePayload(id = requestId || crypto.randomUUID()) {
    return {
      audienceType: audience,
      tenantId: audience === "tenant" ? tenantId : undefined,
      tenantIds: audience === "selected" ? tenantIds : undefined,
      propertyId: audience === "property" ? propertyId : undefined,
      requestId: id,
      templateKey,
      subject,
      message,
      category,
    };
  }
  async function previewRecipients() {
    const sequence = ++previewSequence.current;
    try {
      const id = crypto.randomUUID();
      setRequestId(id);
      const result = await api.post("/admin/emails/preview", audiencePayload(id));
      if (previewSequence.current === sequence) setAudiencePreview(result as typeof audiencePreview);
    } catch (error) {
      if (previewSequence.current === sequence) toast.error(getErrorMessage(error, "Unable to preview recipients"));
    }
  }
  async function sendNotice() {
    if (!audiencePreview || !requestId) return;
    const target = audience === "property" ? `${properties.find((p) => p.id === propertyId)?.name ?? "selected property"}` : audience === "all_active" ? "all active residents" : "the selected resident(s)";
    const noticeTitle = templateKey === "rent.reminder" ? "Rent reminder" : templateKey === "rent.late_notice" ? "Late rent notice" : templateKey === "tenant.dashboard_sign_in" ? "Dashboard sign-in" : subject;
    if (!window.confirm(`Send “${noticeTitle}” to ${audiencePreview.recipientCount} resident(s) (${target})? Each resident will receive an individual email.`)) return;
    setSendingBulk(true);
    try {
      const result = await api.post("/admin/emails/send", audiencePayload());
      toast.success(`Notice processed for ${(result as { recipientCount: number }).recipientCount} resident(s)`);
      setSubject("");
      setMessage("");
      setAudiencePreview(null);
      setRequestId("");
      setSection("Sent");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to send notice"));
    } finally {
      setSendingBulk(false);
    }
  }

  async function retry(id: string) {
    setRetrying(id);
    try {
      await api.post(`/admin/emails/${id}/retry`, {});
      await load();
      toast.success("Email retry processed");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to retry email"));
    } finally {
      setRetrying(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading email delivery" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Company administration</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Email delivery</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Resend acceptance, delivery, opens, failures, and bounded retry attempts. Message bodies and secure links are intentionally excluded.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
      </header>

      <nav className="flex gap-2 border-b border-border pb-2">
        {(["Compose", "Sent", "Delivery"] as const).map((item) => (
          <Button key={item} variant={section === item ? "default" : "outline"} onClick={() => setSection(item)}>
            {item}
          </Button>
        ))}
      </nav>

      {section === "Compose" ? (
        <Card>
          <CardContent className="space-y-5 p-5">
            <div>
              <h2 className="text-xl font-semibold">Compose resident notice</h2>
              <p className="mt-1 text-sm text-muted-foreground">Sent individually through the existing Resend service. Addresses are never exposed to other recipients.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="audience">Recipients</Label>
                <select
                  id="audience"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={audience}
                  onChange={(e) => {
                    setAudience(e.target.value as Audience);
                    invalidatePreview();
                  }}
                >
                  <option value="tenant">One tenant</option>
                  <option value="selected">Selected tenants</option>
                  <option value="property">Property</option>
                  <option value="all_active">All active tenants</option>
                </select>
              </div>
              {audience === "tenant" ? (
                <div className="space-y-2">
                  <Label htmlFor="tenant-recipient">Tenant</Label>
                  <select
                    id="tenant-recipient"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={tenantId}
                    onChange={(e) => {
                      setTenantId(e.target.value);
                      invalidatePreview();
                    }}
                  >
                    <option value="">Choose tenant</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName} · {t.email}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {audience === "property" ? (
                <div className="space-y-2">
                  <Label htmlFor="property-recipient">Property</Label>
                  <select
                    id="property-recipient"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={propertyId}
                    onChange={(e) => {
                      setPropertyId(e.target.value);
                      invalidatePreview();
                    }}
                  >
                    <option value="">Choose property</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            {audience === "selected" ? (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                {tenants.map((tenant) => (
                  <label key={tenant.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={tenantIds.includes(tenant.id)}
                      onChange={(e) => {
                        setTenantIds((current) => (e.target.checked ? [...current, tenant.id] : current.filter((id) => id !== tenant.id)));
                        invalidatePreview();
                      }}
                    />
                    {tenant.firstName} {tenant.lastName} · {tenant.email}
                  </label>
                ))}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="bulk-template">Email type</Label>
              <select
                id="bulk-template"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={templateKey}
                onChange={(e) => {
                  setTemplateKey(e.target.value as typeof templateKey);
                  invalidatePreview();
                }}
              >
                <option value="tenant.custom_notice">Custom operational notice</option>
                <option value="tenant.dashboard_sign_in">Dashboard sign-in (linked accounts only)</option>
                <option value="rent.reminder">Rent reminder (server uses each resident’s current charge)</option>
                <option value="rent.late_notice">Late rent notice (server uses each resident’s current balance)</option>
              </select>
            </div>
            {templateKey === "tenant.custom_notice" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="category">Notice category</Label>
                    <Input
                      id="category"
                      value={category}
                      maxLength={80}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        invalidatePreview();
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notice-subject">Subject</Label>
                    <Input
                      id="notice-subject"
                      value={subject}
                      maxLength={180}
                      onChange={(e) => {
                        setSubject(e.target.value);
                        invalidatePreview();
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notice-body">Message</Label>
                  <Textarea
                    id="notice-body"
                    rows={7}
                    maxLength={10000}
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      invalidatePreview();
                    }}
                    placeholder="Write your notice. HTML is not accepted; text is safely escaped in the branded email template."
                  />
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-secondary/40 p-3 text-sm text-muted-foreground">
                {templateKey === "tenant.dashboard_sign_in" ? "Only tenants with a linked portal account will be included. The email links to the tenant dashboard sign-in page." : "Only recipients with an unpaid rent charge will be included. Amounts and due dates are resolved separately for each recipient."}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={
                  (templateKey === "tenant.custom_notice" && (!subject.trim() || !message.trim())) || (audience === "tenant" && !tenantId) || (audience === "selected" && !tenantIds.length) || (audience === "property" && !propertyId)
                }
                onClick={() => void previewRecipients()}
              >
                Preview recipients
              </Button>
              {audiencePreview ? (
                <span className="text-sm font-semibold">
                  Recipients: {audiencePreview.recipientCount} {audiencePreview.recipientCount === 1 ? "tenant" : "tenants"}
                </span>
              ) : null}
              <Button disabled={!audiencePreview?.recipientCount || sendingBulk} onClick={() => void sendNotice()}>
                {sendingBulk ? <Loader2 className="animate-spin" /> : <Send />}
                Send {audiencePreview?.recipientCount ? `to ${audiencePreview.recipientCount} residents` : "notice"}
              </Button>
            </div>
            {audiencePreview ? (
              <div className="max-h-40 overflow-auto rounded-lg bg-secondary/40 p-3 text-xs">
                <p className="mb-2 font-semibold">Recipient preview</p>
                {audiencePreview.recipients.map((r) => (
                  <p key={r.id}>
                    {r.name} · {r.email}
                    {r.property ? ` · ${r.property}${r.unit ? ` / Unit ${r.unit}` : ""}` : ""}
                  </p>
                ))}
              </div>
            ) : null}
            {audiencePreview ? (
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email preview</p>
                <h3 className="mt-2 font-semibold">{templateKey === "rent.reminder" ? "Rent reminder — Coach Johnson Realty" : templateKey === "rent.late_notice" ? "Important: late rent notice — Coach Johnson Realty" : templateKey === "tenant.dashboard_sign_in" ? "Sign in to your Coach Johnson Realty tenant dashboard" : subject}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{templateKey === "tenant.custom_notice" ? message : templateKey === "tenant.dashboard_sign_in" ? "A secure link to the tenant dashboard sign-in page will be included." : "Personalized rent information will be filled using each tenant’s current rent charge."}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {section === "Sent" ? (
        batches.length ? (
          <div className="space-y-3">
            {batches.map((batch) => (
              <Card key={batch.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div>
                    <h2 className="font-semibold">{batch.subject}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {batch.audienceType.replaceAll("_", " ")} · {batch.property?.name ?? ""} · {batch.recipientCount} recipients · {batch.createdBy.email}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{date(batch.createdAt)}</p>
                  </div>
                  <Badge variant={batch.status === "FAILED" ? "destructive" : "secondary"}>{batch.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">No manual notices sent yet.</CardContent>
          </Card>
        )
      ) : null}

      {section === "Delivery" && items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <MailCheck className="size-8 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No email events yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">New transactional messages will appear here.</p>
          </CardContent>
        </Card>
      ) : section === "Delivery" ? (
        <div className="space-y-3">
          {items.map((item) => {
            const canRetry = failure.has(item.status) || item.status === "RETRY_PENDING";
            return (
              <Card key={item.id}>
                <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={failure.has(item.status) ? "destructive" : success.has(item.status) ? "default" : "secondary"}>{item.status.replaceAll("_", " ")}</Badge>
                      {item.critical ? <Badge variant="outline">Critical</Badge> : null}
                      <span className="text-xs text-muted-foreground">v{item.templateVersion}</span>
                    </div>
                    <h2 className="mt-3 truncate font-semibold">{item.subject}</h2>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{item.to}</p>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">{item.templateKey}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{date(item.createdAt)}</dd>
                    <dt className="text-muted-foreground">Delivered</dt>
                    <dd>{date(item.deliveredAt)}</dd>
                    <dt className="text-muted-foreground">Opened</dt>
                    <dd>{date(item.openedAt)}</dd>
                    <dt className="text-muted-foreground">Attempts</dt>
                    <dd>
                      {item.attemptCount} / {item.maxAttempts}
                    </dd>
                    {item.nextRetryAt ? (
                      <>
                        <dt className="text-muted-foreground">Next retry</dt>
                        <dd>{date(item.nextRetryAt)}</dd>
                      </>
                    ) : null}
                  </dl>
                  <div className="lg:text-right">
                    {canRetry ? (
                      <Button size="sm" variant="outline" disabled={retrying === item.id} onClick={() => void retry(item.id)}>
                        {retrying === item.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                        Retry
                      </Button>
                    ) : success.has(item.status) ? (
                      <CheckCircle2 className="ml-auto text-emerald-600" aria-label="Successful" />
                    ) : item.status === "RETRY_PENDING" ? (
                      <Clock3 className="ml-auto text-amber-600" />
                    ) : (
                      <AlertTriangle className="ml-auto text-muted-foreground" />
                    )}
                    {item.lastError ? <p className="mt-2 max-w-xs text-xs leading-5 text-destructive">{item.lastError}</p> : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {section === "Delivery" && cursor ? (
        <div className="text-center">
          <Button
            variant="outline"
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              void load(cursor)
                .catch((error) => toast.error(getErrorMessage(error, "Unable to load more")))
                .finally(() => setLoadingMore(false));
            }}
          >
            {loadingMore ? <Loader2 className="animate-spin" /> : null}Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
