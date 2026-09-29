"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2, Pencil, Save, Send, Trash2, UserRoundPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "sonner";

type Owner = {
  id: string;
  ownerName: string | null;
  companyName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  commissionRate: number;
  payoutStatus: "PENDING_ONBOARDING" | "ACTIVE" | "RESTRICTED" | "DISABLED";
  stripeConnectedAccountId: string | null;
  _count: { properties: number; payments: number };
};

const emptyOwner = {
  ownerName: "",
  companyName: "",
  contactEmail: "",
  contactPhone: "",
  commissionRate: "10",
};

export default function AdminOwnersPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [form, setForm] = useState(emptyOwner);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [savingCommissionId, setSavingCommissionId] = useState<string | null>(
    null,
  );
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [savingOwnerId, setSavingOwnerId] = useState<string | null>(null);
  const [deletingOwnerId, setDeletingOwnerId] = useState<string | null>(null);
  const [ownerDraft, setOwnerDraft] = useState({
    ownerName: "",
    companyName: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [commissionDrafts, setCommissionDrafts] = useState<
    Record<string, string>
  >({});

  const loadOwners = () =>
    api.get("/property-owners").then((data: Owner[]) => {
      setOwners(data);
      setCommissionDrafts(
        Object.fromEntries(
          data.map((owner) => [owner.id, String(owner.commissionRate)]),
        ),
      );
    });

  useEffect(() => {
    loadOwners()
      .catch((error: unknown) =>
        toast.error(getErrorMessage(error, "Unable to load property owners")),
      )
      .finally(() => setLoading(false));
  }, []);

  async function createOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/property-owners", {
        contactEmail: form.contactEmail.trim(),
        commissionRate: Number(form.commissionRate),
        ...(form.ownerName.trim() ? { ownerName: form.ownerName.trim() } : {}),
        ...(form.companyName.trim()
          ? { companyName: form.companyName.trim() }
          : {}),
        ...(form.contactPhone.trim()
          ? { contactPhone: form.contactPhone.trim() }
          : {}),
      });
      setForm(emptyOwner);
      await loadOwners();
      toast.success(
        "Property owner created. Send payout onboarding when ready.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to create property owner"));
    } finally {
      setSubmitting(false);
    }
  }

  async function inviteOwner(owner: Owner) {
    setInvitingId(owner.id);
    try {
      await api.post(`/property-owners/${owner.id}/stripe-onboarding`, {});
      await loadOwners();
      toast.success(
        `Secure payout setup was emailed to ${owner.contactEmail}.`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to send payout onboarding"));
    } finally {
      setInvitingId(null);
    }
  }

  async function saveCommission(owner: Owner) {
    const commissionRate = Number(commissionDrafts[owner.id]);
    if (
      !Number.isFinite(commissionRate) ||
      commissionRate < 0 ||
      commissionRate > 100
    ) {
      toast.error("Commission must be between 0% and 100%");
      return;
    }
    setSavingCommissionId(owner.id);
    try {
      await api.patch(`/property-owners/${owner.id}`, { commissionRate });
      await loadOwners();
      toast.success("Management commission updated");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update commission"));
    } finally {
      setSavingCommissionId(null);
    }
  }

  function startEditingOwner(owner: Owner) {
    setEditingOwnerId(owner.id);
    setOwnerDraft({
      ownerName: owner.ownerName ?? "",
      companyName: owner.companyName ?? "",
      contactEmail: owner.contactEmail,
      contactPhone: owner.contactPhone ?? "",
    });
  }

  async function saveOwnerDetails(owner: Owner) {
    const ownerName = ownerDraft.ownerName.trim();
    const contactEmail = ownerDraft.contactEmail.trim();
    if (ownerName.length < 2) {
      toast.error("Owner name must be at least 2 characters");
      return;
    }
    if (!contactEmail) {
      toast.error("Owner email is required");
      return;
    }
    setSavingOwnerId(owner.id);
    try {
      await api.patch(`/property-owners/${owner.id}`, {
        ownerName,
        companyName: ownerDraft.companyName.trim() || undefined,
        contactEmail,
        contactPhone: ownerDraft.contactPhone.trim() || undefined,
      });
      setEditingOwnerId(null);
      await loadOwners();
      toast.success("Owner information updated");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update owner information"));
    } finally {
      setSavingOwnerId(null);
    }
  }

  async function deleteOwner(owner: Owner) {
    const label = owner.companyName || owner.ownerName || owner.contactEmail;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setDeletingOwnerId(owner.id);
    try {
      await api.delete(`/property-owners/${owner.id}`);
      await loadOwners();
      toast.success("Property owner deleted");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to delete property owner"));
    } finally {
      setDeletingOwnerId(null);
    }
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
          Property owners
        </h1>
        <p className="mt-2 font-medium text-muted-foreground">
          Set the management commission per owner, then invite them to securely
          connect their payout bank account.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRoundPlus className="size-5" />
            Add property owner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-x-5 gap-y-5 md:grid-cols-2 xl:grid-cols-3"
            onSubmit={createOwner}
          >
            <div className="grid gap-2">
              <Label htmlFor="owner-name">Owner name</Label>
              <Input
                id="owner-name"
                required
                minLength={2}
                maxLength={160}
                value={form.ownerName}
                onChange={(event) =>
                  setForm({ ...form, ownerName: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company-name">Company name</Label>
              <Input
                id="company-name"
                value={form.companyName}
                onChange={(event) =>
                  setForm({ ...form, companyName: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="owner-email">Email</Label>
              <Input
                id="owner-email"
                type="email"
                required
                value={form.contactEmail}
                onChange={(event) =>
                  setForm({ ...form, contactEmail: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="owner-phone">Phone (optional)</Label>
              <Input
                id="owner-phone"
                value={form.contactPhone}
                onChange={(event) =>
                  setForm({ ...form, contactPhone: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="commission-rate">
                Johnson Realty commission (%)
              </Label>
              <Input
                id="commission-rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={form.commissionRate}
                onChange={(event) =>
                  setForm({ ...form, commissionRate: event.target.value })
                }
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserRoundPlus className="size-4" />
                )}
                Create owner
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Owner payout status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : owners.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No property owners yet.
            </p>
          ) : (
            owners.map((owner) => (
              <div
                key={owner.id}
                className="flex flex-col gap-4 rounded-xl border border-border p-5 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">
                    {owner.companyName || owner.ownerName || "Unnamed owner"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {owner.contactEmail} ·{" "}
                    {Number(owner.commissionRate).toFixed(2)}% Johnson Realty
                    commission · {owner._count.properties} properties
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payout: {owner.payoutStatus.replaceAll("_", " ")}
                  </p>
                  <div className="mt-4 flex max-w-sm flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="grid flex-1 gap-2">
                      <Label htmlFor={`owner-commission-${owner.id}`}>
                        Management commission (%)
                      </Label>
                      <Input
                        id={`owner-commission-${owner.id}`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={commissionDrafts[owner.id] ?? ""}
                        onChange={(event) =>
                          setCommissionDrafts((current) => ({
                            ...current,
                            [owner.id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={savingCommissionId !== null}
                      onClick={() => void saveCommission(owner)}
                    >
                      {savingCommissionId === owner.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Save rate
                    </Button>
                  </div>
                  {editingOwnerId === owner.id ? (
                    <div className="mt-5 grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor={`edit-owner-name-${owner.id}`}>
                          Owner name
                        </Label>
                        <Input
                          id={`edit-owner-name-${owner.id}`}
                          value={ownerDraft.ownerName}
                          onChange={(event) =>
                            setOwnerDraft({
                              ...ownerDraft,
                              ownerName: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`edit-company-name-${owner.id}`}>
                          Company name
                        </Label>
                        <Input
                          id={`edit-company-name-${owner.id}`}
                          value={ownerDraft.companyName}
                          onChange={(event) =>
                            setOwnerDraft({
                              ...ownerDraft,
                              companyName: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`edit-owner-email-${owner.id}`}>
                          Email
                        </Label>
                        <Input
                          id={`edit-owner-email-${owner.id}`}
                          type="email"
                          value={ownerDraft.contactEmail}
                          onChange={(event) =>
                            setOwnerDraft({
                              ...ownerDraft,
                              contactEmail: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`edit-owner-phone-${owner.id}`}>
                          Phone
                        </Label>
                        <Input
                          id={`edit-owner-phone-${owner.id}`}
                          value={ownerDraft.contactPhone}
                          onChange={(event) =>
                            setOwnerDraft({
                              ...ownerDraft,
                              contactPhone: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <Button
                          type="button"
                          disabled={savingOwnerId !== null}
                          onClick={() => void saveOwnerDetails(owner)}
                        >
                          {savingOwnerId === owner.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Save className="size-4" />
                          )}
                          Save information
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={savingOwnerId !== null}
                          onClick={() => setEditingOwnerId(null)}
                        >
                          <X className="size-4" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => startEditingOwner(owner)}
                    disabled={savingOwnerId !== null}
                  >
                    <Pencil className="size-4" />
                    Edit owner
                  </Button>
                  <Button
                    variant={
                      owner.payoutStatus === "ACTIVE" ? "outline" : "default"
                    }
                    disabled={
                      invitingId !== null || owner.payoutStatus === "ACTIVE"
                    }
                    onClick={() => inviteOwner(owner)}
                  >
                    {invitingId === owner.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {owner.payoutStatus === "ACTIVE"
                      ? "Payouts active"
                      : "Send payout setup"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    disabled={
                      deletingOwnerId !== null ||
                      owner._count.properties > 0 ||
                      (owner._count.payments ?? 0) > 0 ||
                      Boolean(owner.stripeConnectedAccountId)
                    }
                    title={
                      owner._count.properties > 0 ||
                      (owner._count.payments ?? 0) > 0 ||
                      owner.stripeConnectedAccountId
                        ? "Owners with linked properties, payments, or payout accounts cannot be deleted"
                        : "Delete owner"
                    }
                    onClick={() => void deleteOwner(owner)}
                  >
                    {deletingOwnerId === owner.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    Delete owner
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
