"use client";

import { useState, useEffect, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Search, Calendar, Loader2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { LeaseRentPolicyDialog } from "./_components/lease-rent-policy-dialog";
import { LeaseLifecycleLink } from "./_components/lease-lifecycle-link";
import { TenantDocumentManager } from "@/components/portal/tenant-document-manager";

type LeaseTenant = { id: string; firstName: string; lastName: string };
type LeaseUnit = {
  id: string;
  unitNumber: string;
  status: string;
  property: { name: string };
};
type Lease = {
  id: string;
  rentalApplicationId: string | null;
  tenant: LeaseTenant;
  unit: LeaseUnit;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  rentDueDay: number;
  gracePeriodDays: number;
  lateFeeAmount: number;
  status: string;
};
type LeaseForm = {
  tenantId: string;
  unitId: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  securityDeposit: string;
  rentDueDay: string;
  gracePeriodDays: string;
  lateFeeAmount: string;
};

function LeaseCreateDialog({
  open,
  creating,
  form,
  tenants,
  units,
  onOpenChange,
  onFormChange,
  onSubmit,
}: {
  open: boolean;
  creating: boolean;
  form: LeaseForm;
  tenants: LeaseTenant[];
  units: LeaseUnit[];
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: LeaseForm) => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[10px] uppercase tracking-widest px-8 py-6 rounded-2xl transition-[background-color,color,border-color,box-shadow,transform,opacity] font-heading group" />
        }
      >
        <Plus className="mr-2 h-4 w-4 text-current transition-transform group-hover:rotate-90" />
        Create active lease
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] rounded-xl border-border bg-card p-5 sm:p-6">
        <form onSubmit={onSubmit}>
          <DialogHeader className="mb-6">
            <DialogTitle className="text-xl font-semibold font-heading">
              Create active lease manually
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium mt-2">
              Use this only for an agreement signed outside the portal. For an
              approved application, send the lease from its review page.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-2">
            <div className="space-y-2">
              <Label htmlFor="lease-tenant">Select resident</Label>
              <select
                id="lease-tenant"
                className="w-full h-12 rounded-xl bg-secondary/50 border-transparent focus:border-primary focus:ring-1 focus:ring-primary px-4 outline-none font-medium text-foreground"
                value={form.tenantId}
                onChange={(event) =>
                  onFormChange({ ...form, tenantId: event.target.value })
                }
                required
              >
                <option value="">Choose a tenant…</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.firstName} {tenant.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lease-unit">Select unit</Label>
              <select
                id="lease-unit"
                className="w-full h-12 rounded-xl bg-secondary/50 border-transparent focus:border-primary focus:ring-1 focus:ring-primary px-4 outline-none font-medium text-foreground"
                value={form.unitId}
                onChange={(event) =>
                  onFormChange({ ...form, unitId: event.target.value })
                }
                required
              >
                <option value="">Choose a unit…</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Unit {unit.unitNumber} - {unit.property.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
              {(
                [
                  ["startDate", "Start date", "date"],
                  ["endDate", "End date", "date"],
                  ["monthlyRent", "Monthly rent", "number"],
                  ["securityDeposit", "Security deposit", "number"],
                ] as const
              ).map(([field, label, type]) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`lease-${field}`}>{label}</Label>
                  <Input
                    id={`lease-${field}`}
                    type={type}
                    min={type === "number" ? 0 : undefined}
                    step={type === "number" ? "0.01" : undefined}
                    className="h-12 rounded-xl bg-secondary/50 border-transparent focus:border-primary font-medium"
                    value={form[field]}
                    onChange={(event) =>
                      onFormChange({ ...form, [field]: event.target.value })
                    }
                    required
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-5 sm:grid-cols-3 sm:gap-6">
              {(
                [
                  ["rentDueDay", "Rent due day", "1", "28", "1"],
                  ["gracePeriodDays", "Grace period (days)", "0", "30", "1"],
                  ["lateFeeAmount", "Late fee", "0", undefined, "0.01"],
                ] as const
              ).map(([field, label, min, max, step]) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`lease-${field}`}>{label}</Label>
                  <Input
                    id={`lease-${field}`}
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    className="h-12 rounded-xl bg-secondary/50 border-transparent focus:border-primary font-medium"
                    value={form[field]}
                    onChange={(event) =>
                      onFormChange({ ...form, [field]: event.target.value })
                    }
                    required
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="mt-8">
            <Button type="submit" className="w-full h-14" disabled={creating}>
              {creating ? "Processing…" : "Create active lease"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminLeases() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [tenants, setTenants] = useState<LeaseTenant[]>([]);
  const [units, setUnits] = useState<LeaseUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTenantId, setUploadTenantId] = useState("");
  const [query, setQuery] = useState("");

  const [formData, setFormData] = useState({
    tenantId: "",
    unitId: "",
    startDate: "",
    endDate: "",
    monthlyRent: "",
    securityDeposit: "",
    rentDueDay: "1",
    gracePeriodDays: "5",
    lateFeeAmount: "50",
  });

  async function fetchData() {
    try {
      const [leasesData, tenantsData, unitsData] = await Promise.all([
        api.get("/admin/leases"),
        api.get("/admin/tenants"),
        api.get("/admin/units"),
      ]);
      setLeases(leasesData as Lease[]);
      setTenants(tenantsData as LeaseTenant[]);
      setUnits(unitsData as LeaseUnit[]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to load lease data"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([
      api.get("/admin/leases"),
      api.get("/admin/tenants"),
      api.get("/admin/units"),
    ])
      .then(([leasesData, tenantsData, unitsData]) => {
        setLeases(leasesData as Lease[]);
        setTenants(tenantsData as LeaseTenant[]);
        setUnits(unitsData as LeaseUnit[]);
      })
      .catch((error: unknown) =>
        toast.error(getErrorMessage(error, "Unable to load lease data")),
      )
      .finally(() => setLoading(false));
  }, []);

  const handleCreateLease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      await api.post("/admin/leases", {
        ...formData,
        monthlyRent: parseFloat(formData.monthlyRent),
        securityDeposit: parseFloat(formData.securityDeposit),
        rentDueDay: parseInt(formData.rentDueDay, 10),
        gracePeriodDays: parseInt(formData.gracePeriodDays, 10),
        lateFeeAmount: parseFloat(formData.lateFeeAmount),
        startDate: new Date(formData.startDate).toISOString(),
        endDate: new Date(formData.endDate).toISOString(),
      });
      toast.success("Lease created successfully");
      setOpen(false);
      void fetchData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to create lease"));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const updateStatus = async (lease: Lease, status: string) => {
    try {
      await api.patch(`/admin/leases/${lease.id}`, { status });
      toast.success("Lease status updated");
      await fetchData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to update lease"));
    }
  };

  const filteredLeases = leases.filter((lease) =>
    `${lease.tenant.firstName} ${lease.tenant.lastName} ${lease.unit.property.name} ${lease.unit.unitNumber}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const vacantUnits = units.reduce<LeaseUnit[]>((available, unit) => {
    if (unit.status === "vacant") available.push(unit);
    return available;
  }, []);
  const uploadTenant = tenants.find((tenant) => tenant.id === uploadTenantId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            Leases
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Manage lease agreements and contract terms.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Dialog
            open={uploadOpen}
            onOpenChange={(nextOpen) => {
              setUploadOpen(nextOpen);
              if (!nextOpen) setUploadTenantId("");
            }}
          >
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="px-6 py-6 rounded-2xl font-heading font-bold text-[10px] uppercase tracking-widest"
                />
              }
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload lease document
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-xl border-border bg-card p-5 sm:max-w-4xl sm:p-6">
              <DialogHeader className="mb-5">
                <DialogTitle className="text-xl font-semibold font-heading">
                  Upload lease document
                </DialogTitle>
                <DialogDescription className="mt-2 text-muted-foreground font-medium">
                  Select the resident first, then upload their signed lease.
                  The file will be attached to that resident and can be
                  analyzed without creating a duplicate lease.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="lease-upload-tenant">Select resident</Label>
                  <select
                    id="lease-upload-tenant"
                    className="h-12 w-full rounded-xl border border-input bg-card px-4 font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    value={uploadTenantId}
                    onChange={(event) => setUploadTenantId(event.target.value)}
                  >
                    <option value="">Choose a resident…</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.firstName} {tenant.lastName}
                      </option>
                    ))}
                  </select>
                </div>
                {uploadTenant ? (
                  <TenantDocumentManager
                    key={uploadTenant.id}
                    tenantId={uploadTenant.id}
                    tenantName={`${uploadTenant.firstName} ${uploadTenant.lastName}`}
                  />
                ) : (
                  <div className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                    Select a resident to show the lease upload controls.
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <LeaseCreateDialog
            open={open}
            creating={creating}
            form={formData}
            tenants={tenants}
            units={vacantUnits}
            onOpenChange={setOpen}
            onFormChange={setFormData}
            onSubmit={handleCreateLease}
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            aria-label="Search leases"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-12 h-12 rounded-2xl border-border bg-card shadow-sm focus:border-primary transition-[background-color,color,border-color,box-shadow,transform,opacity] font-medium"
            placeholder="Search leases"
          />
        </div>
      </div>

      <Card className="border-border bg-card shadow-sm rounded-[1.25rem] overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Tenant
              </TableHead>
              <TableHead className="font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Property/Unit
              </TableHead>
              <TableHead className="font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Term
              </TableHead>
              <TableHead className="font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Rent
              </TableHead>
              <TableHead className="font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Billing policy
              </TableHead>
              <TableHead className="font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Status
              </TableHead>
              <TableHead className="text-right font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeases.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-32 text-center text-muted-foreground font-medium uppercase tracking-widest text-[10px] font-heading"
                >
                  No leases found.
                </TableCell>
              </TableRow>
            ) : (
              filteredLeases.map((lease) => (
                <TableRow
                  key={lease.id}
                  className="hover:bg-secondary/30 transition-colors border-border"
                >
                  <TableCell className="py-4 font-bold text-foreground font-heading">
                    {lease.tenant.firstName} {lease.tenant.lastName}
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-foreground">
                        {lease.unit.property.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1 font-heading">
                        Unit {lease.unit.unitNumber}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-heading">
                      <Calendar className="w-4 h-4 text-accent" />
                      {format(new Date(lease.startDate), "MMM dd, yyyy")} -{" "}
                      {format(new Date(lease.endDate), "MMM dd, yyyy")}
                    </div>
                  </TableCell>
                  <TableCell className="py-4 font-bold text-foreground font-heading text-lg tabular-nums">
                    ${lease.monthlyRent.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-4 text-xs text-muted-foreground">
                    <p>Due on day {lease.rentDueDay}</p>
                    <p className="mt-1">
                      {lease.gracePeriodDays}-day grace · $
                      {lease.lateFeeAmount.toFixed(2)} fee
                    </p>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge
                      className={cn(
                        "font-bold uppercase tracking-widest text-[9px] px-3 py-1 rounded-md border-transparent",
                        lease.status === "active"
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                      )}
                    >
                      {lease.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <LeaseRentPolicyDialog
                        lease={lease}
                        onSaved={fetchData}
                        disabled={
                          Boolean(lease.rentalApplicationId) ||
                          ["renewed", "terminated"].includes(lease.status)
                        }
                      />
                      <select
                        aria-label={`Update lease status for ${lease.tenant.firstName} ${lease.tenant.lastName}`}
                        className="h-10 rounded-md border border-input bg-background px-3 text-xs font-semibold"
                        value={lease.status}
                        disabled={Boolean(lease.rentalApplicationId)}
                        onChange={(event) =>
                          void updateStatus(lease, event.target.value)
                        }
                      >
                        <option value="active">Active</option>
                        <option value="expiring">Expiring</option>
                        {["renewed", "terminated"].includes(lease.status) && (
                          <option value={lease.status}>{lease.status}</option>
                        )}
                        {lease.status === "pending_signature" && (
                          <option value="pending_signature">
                            Pending signature
                          </option>
                        )}
                        {lease.status === "signature_action_required" && (
                          <option value="signature_action_required">
                            Signature action required
                          </option>
                        )}
                      </select>
                      <LeaseLifecycleLink leaseId={lease.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
