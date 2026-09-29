"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { money } from "./tenant-detail-types";

type Lease = {
  id: string;
  unitId?: string;
  startDate: string;
  monthlyRent: number;
  rentDueDay: number;
  status: string;
};

export function RecordPaymentDialog({
  tenantId,
  unitId,
  leases,
  onSaved,
}: {
  tenantId: string;
  unitId?: string;
  leases: Lease[];
  onSaved: () => Promise<void>;
}) {
  const lease =
    leases.find((item) => ["active", "expiring", "renewed"].includes(item.status.toLowerCase())) ??
    leases[0];
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState(lease ? String(lease.monthlyRent) : "");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  function reset() {
    setAmount(lease ? String(lease.monthlyRent) : "");
    setPaymentMethod("cash");
    setDueDate(new Date().toISOString().slice(0, 10));
    setNotes("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lease || !unitId) return;
    const paidAmount = Number(amount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      toast.error("Enter the amount received.");
      return;
    }
    const rentAmount = Number(lease.monthlyRent);
    const status = paidAmount >= rentAmount ? "PAID" : "PARTIAL";
    setSaving(true);
    try {
      await api.post("/payments/record", {
        clientRequestId: crypto.randomUUID(),
        tenantId,
        leaseId: lease.id,
        unitId,
        rentAmount,
        totalAmount: rentAmount,
        paidAmount,
        dueDate: new Date(`${dueDate}T12:00:00`).toISOString(),
        status,
        paymentMethod,
        notes: notes.trim() || undefined,
      });
      await onSaved();
      toast.success("Payment recorded and tenant notification queued");
      setOpen(false);
      reset();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to record payment"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) reset();
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus />
        Record payment
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Record offline payment</DialogTitle>
            <DialogDescription>
              Record cash, check, ACH, or another payment received from this tenant. The rent balance will update and the tenant will receive the normal payment confirmation email.
            </DialogDescription>
          </DialogHeader>
          {!lease || !unitId ? (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              This tenant needs an active lease and assigned unit before a rent payment can be recorded. Upload or create the lease first.
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
                <p className="text-muted-foreground">Lease rent</p>
                <p className="mt-1 font-semibold">{money(lease.monthlyRent)}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="record-payment-amount">Amount received</Label>
                  <Input id="record-payment-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="record-payment-date">Due date</Label>
                  <Input id="record-payment-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="record-payment-method">Payment method</Label>
                  <select id="record-payment-method" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="ach">ACH / bank transfer</option>
                    <option value="wire">Wire transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="record-payment-notes">Internal note (optional)</Label>
                <Textarea id="record-payment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} placeholder="Receipt number or staff note" />
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving || !lease || !unitId}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              Save payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
