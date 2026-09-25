"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Search, Mail, Loader2, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";
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
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { TenantDocumentsDialog } from "@/components/portal/tenant-document-manager";

type TenantUnit = {
  id: string;
  unitNumber: string;
  status: string;
  tenants: Array<{ id: string }>;
  property: { name: string };
};
type TenantRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  user?: { id: string; email: string; status: string } | null;
  unit?: TenantUnit | null;
};
type InviteForm = {
  firstName: string;
  lastName: string;
  email: string;
  unitId: string;
};

function TenantInviteDialog({
  open,
  inviting,
  form,
  availableUnits,
  onOpenChange,
  onFormChange,
  onSubmit,
}: {
  open: boolean;
  inviting: boolean;
  form: InviteForm;
  availableUnits: TenantUnit[];
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: InviteForm) => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[10px] uppercase tracking-widest px-8 py-6 rounded-2xl transition-[background-color,color,border-color,box-shadow,transform,opacity] font-heading group" />
        }
      >
        <UserPlus className="mr-2 h-4 w-4 text-current transition-transform group-hover:scale-110" />
        Invite Tenant
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] rounded-xl border-border bg-card p-5 sm:p-6">
        <form onSubmit={onSubmit}>
          <DialogHeader className="mb-6">
            <DialogTitle className="text-xl font-semibold font-heading">
              Invite Resident
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium mt-2">
              Send an invitation to a new resident.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-2">
            <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
              {(
                [
                  ["firstName", "First name", "given-name"],
                  ["lastName", "Last name", "family-name"],
                ] as const
              ).map(([field, label, autoComplete]) => (
                <div key={field} className="space-y-2">
                  <Label
                    htmlFor={`invite-${field}`}
                    className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 font-heading"
                  >
                    {label}
                  </Label>
                  <Input
                    id={`invite-${field}`}
                    name={field}
                    autoComplete={autoComplete}
                    className="h-12 rounded-xl bg-secondary/50 border-transparent focus:border-primary transition-[background-color,color,border-color,box-shadow,transform,opacity] font-medium"
                    value={form[field]}
                    onChange={(event) =>
                      onFormChange({ ...form, [field]: event.target.value })
                    }
                    required
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="invite-email"
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 font-heading"
              >
                Email address
              </Label>
              <Input
                id="invite-email"
                name="email"
                autoComplete="email"
                type="email"
                className="h-12 rounded-xl bg-secondary/50 border-transparent focus:border-primary transition-[background-color,color,border-color,box-shadow,transform,opacity] font-medium"
                value={form.email}
                onChange={(event) =>
                  onFormChange({ ...form, email: event.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="invite-unit"
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 font-heading"
              >
                Assign unit
              </Label>
              <select
                id="invite-unit"
                className="w-full h-12 rounded-xl bg-secondary/50 border-transparent focus:border-primary focus:ring-1 focus:ring-primary px-4 outline-none font-medium text-foreground transition-[background-color,color,border-color,box-shadow,transform,opacity]"
                value={form.unitId}
                onChange={(event) =>
                  onFormChange({ ...form, unitId: event.target.value })
                }
                required
              >
                <option value="">Select a unit…</option>
                {availableUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Unit {unit.unitNumber} - {unit.property.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="mt-8">
            <Button
              type="submit"
              className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 transition-[background-color,color,border-color,box-shadow,transform,opacity] font-heading"
              disabled={inviting}
            >
              {inviting ? "Sending…" : "Send Invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminTenants() {
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [units, setUnits] = useState<TenantUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [query, setQuery] = useState("");
  const invitingRef = useRef(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    unitId: "",
  });

  async function fetchData() {
    try {
      const [tenantsData, unitsData] = await Promise.all([
        api.get("/admin/tenants"),
        api.get("/admin/units"),
      ]);
      setTenants(tenantsData as TenantRecord[]);
      setUnits(unitsData as TenantUnit[]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to load residents"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([api.get("/admin/tenants"), api.get("/admin/units")])
      .then(([tenantsData, unitsData]) => {
        setTenants(tenantsData as TenantRecord[]);
        setUnits(unitsData as TenantUnit[]);
      })
      .catch((error: unknown) =>
        toast.error(getErrorMessage(error, "Unable to load residents")),
      )
      .finally(() => setLoading(false));
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invitingRef.current) return;
    invitingRef.current = true;
    setInviting(true);
    try {
      await api.post("/auth/invite", formData);
      toast.success("Invitation sent successfully");
      setOpen(false);
      setFormData({ firstName: "", lastName: "", email: "", unitId: "" });
      void fetchData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to send invitation"));
    } finally {
      invitingRef.current = false;
      setInviting(false);
    }
  };

  const filteredTenants = tenants.filter((tenant) =>
    `${tenant.firstName} ${tenant.lastName} ${tenant.email} ${tenant.unit?.property?.name ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const availableUnits = units.reduce<TenantUnit[]>((available, unit) => {
    if (unit.status === "vacant" && unit.tenants.length === 0) {
      available.push(unit);
    }
    return available;
  }, []);

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
            Tenants
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Manage your tenant list and invites.
          </p>
        </div>

        <TenantInviteDialog
          open={open}
          inviting={inviting}
          form={formData}
          availableUnits={availableUnits}
          onOpenChange={setOpen}
          onFormChange={setFormData}
          onSubmit={handleInvite}
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            aria-label="Search tenants"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-12 h-12 rounded-2xl border-border bg-card shadow-sm font-medium focus:border-primary transition-[background-color,color,border-color,box-shadow,transform,opacity]"
            placeholder="Search tenants"
          />
        </div>
      </div>

      <Card className="border-border bg-card shadow-sm rounded-[1.25rem] overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Resident
              </TableHead>
              <TableHead className="font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Contact
              </TableHead>
              <TableHead className="font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Unit Info
              </TableHead>
              <TableHead className="font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Status
              </TableHead>
              <TableHead className="text-right font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Account
              </TableHead>
              <TableHead className="text-right font-heading font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-5">
                Records
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTenants.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-muted-foreground font-medium uppercase tracking-widest text-[10px] font-heading"
                >
                  No residents found.
                </TableCell>
              </TableRow>
            ) : (
              filteredTenants.map((tenant) => (
                <TableRow
                  key={tenant.id}
                  className="hover:bg-secondary/30 transition-colors border-border"
                >
                  <TableCell className="py-4">
                    <div className="flex flex-col">
                      <Link
                        href={`/admin/tenants/${tenant.id}`}
                        className="font-bold text-primary font-heading hover:underline"
                      >
                        {tenant.firstName} {tenant.lastName}
                      </Link>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1 font-heading">
                        ID: #{tenant.id.slice(-6).toUpperCase()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <Mail className="w-4 h-4 text-accent" />
                      {tenant.email}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-foreground uppercase tracking-widest font-heading">
                        {tenant.unit?.property?.name || "Unassigned"}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1 font-heading">
                        Unit {tenant.unit?.unitNumber || "N/A"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge
                      className={cn(
                        "font-bold uppercase tracking-widest text-[9px] px-3 py-1 rounded-md border-transparent",
                        tenant.status === "active"
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                      )}
                    >
                      {tenant.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 text-right">
                    <span className="text-xs text-muted-foreground">
                      {tenant.user
                        ? `Portal ${tenant.user.status.toLowerCase()}`
                        : "No portal account"}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 text-right">
                    <TenantDocumentsDialog
                      tenantId={tenant.id}
                      tenantName={`${tenant.firstName} ${tenant.lastName}`}
                    />
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
