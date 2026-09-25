"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DoorOpen, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import {
  initialUnitForm,
  UNIT_AMENITIES,
  UnitEditorDialog,
  type Property,
  type Unit,
  type UnitForm,
} from "./_components/unit-editor-dialog";

export default function AdminUnits() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Unit | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<UnitForm>(initialUnitForm);

  const load = async () => {
    try {
      const [unitRows, propertyRows] = await Promise.all([
        api.get("/admin/units") as Promise<Unit[]>,
        api.get("/admin/properties") as Promise<Property[]>,
      ]);
      setUnits(unitRows);
      setProperties(propertyRows);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to load rental units"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      api.get("/admin/units") as Promise<Unit[]>,
      api.get("/admin/properties") as Promise<Property[]>,
    ])
      .then(([unitRows, propertyRows]) => {
        setUnits(unitRows);
        setProperties(propertyRows);
      })
      .catch((error: unknown) =>
        toast.error(getErrorMessage(error, "Unable to load rental units")),
      )
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return units;
    return units.filter((unit) =>
      `${unit.property.name} ${unit.unitNumber}`.toLowerCase().includes(term),
    );
  }, [query, units]);

  const createUnit = async (event: FormEvent) => {
    event.preventDefault();
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const payload = {
        ...form,
        floor: form.floor || undefined,
        bedrooms: form.bedrooms === "" ? undefined : Number(form.bedrooms),
        bathrooms: form.bathrooms === "" ? undefined : Number(form.bathrooms),
        squareFeet:
          form.squareFeet === "" ? undefined : Number(form.squareFeet),
        rentAmount:
          form.rentAmount === "" ? undefined : Number(form.rentAmount),
        depositAmount:
          form.depositAmount === ""
            ? form.rentAmount === ""
              ? undefined
              : Number(form.rentAmount)
            : Number(form.depositAmount),
        availableDate: form.availableDate
          ? new Date(form.availableDate).toISOString()
          : undefined,
        amenities: [
          ...form.amenities,
          ...form.customAmenities
            .split(",")
            .map((amenity) => amenity.trim())
            .filter(Boolean),
        ].filter((amenity, index, values) => values.indexOf(amenity) === index),
      };
      if (editingUnit) {
        const { status: _status, ...editablePayload } = payload;
        void _status;
        await api.patch(`/admin/units/${editingUnit.id}`, editablePayload);
        toast.success("Rental unit updated");
      } else {
        await api.post("/admin/units", payload);
        toast.success("Rental unit created");
      }
      setForm(initialUnitForm);
      setEditingUnit(null);
      setOpen(false);
      await load();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to create unit"));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const updateStatus = async (unit: Unit, status: Unit["status"]) => {
    try {
      await api.patch(`/admin/units/${unit.id}`, { status });
      toast.success("Unit status updated");
      await load();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to update unit"));
    }
  };

  const deleteUnit = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/units/${pendingDelete.id}`);
      toast.success(`Unit ${pendingDelete.unitNumber} deleted`);
      setPendingDelete(null);
      await load();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to delete this unit"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Rental inventory</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Units
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Units can be added to draft rentals. Creating a unit does not
            publish its property; public visibility stays under the property’s
            Publish control.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingUnit(null);
            setForm(initialUnitForm);
            setOpen(true);
          }}
          disabled={properties.length === 0}
        >
          <Plus aria-hidden="true" /> Add unit
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search
          className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Search rental units"
          className="pl-11"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search property or unit"
        />
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <DoorOpen
              className="mx-auto size-10 text-primary"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-xl font-semibold">No units found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a rental property first, then create its units here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((unit) => (
            <Card key={unit.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {unit.property.name}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">
                      Unit {unit.unitNumber}
                    </h2>
                  </div>
                  <Badge
                    variant={unit.status === "vacant" ? "default" : "outline"}
                  >
                    {unit.status.replaceAll("_", " ")}
                  </Badge>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-border py-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Beds</dt>
                    <dd className="mt-1 font-semibold">
                      {unit.bedrooms ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Baths</dt>
                    <dd className="mt-1 font-semibold">
                      {unit.bathrooms ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Size</dt>
                    <dd className="mt-1 font-semibold">
                      {unit.squareFeet == null
                        ? "—"
                        : `${unit.squareFeet.toLocaleString()} sq ft`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Floor</dt>
                    <dd className="mt-1 font-semibold">{unit.floor || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Rent</dt>
                    <dd className="mt-1 font-semibold">
                      {unit.rentAmount == null
                        ? "Not entered"
                        : `$${unit.rentAmount.toLocaleString()}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Deposit</dt>
                    <dd className="mt-1 font-semibold">
                      {unit.depositAmount == null
                        ? "—"
                        : `$${unit.depositAmount.toLocaleString()}`}
                    </dd>
                  </div>
                </dl>
                {unit.amenities.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {unit.amenities.map((amenity) => (
                      <Badge key={amenity} variant="outline">
                        {amenity}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">
                    No unit features selected
                  </p>
                )}
                <p className="mt-4 text-sm text-muted-foreground">
                  {unit.tenants.length > 0
                    ? unit.tenants
                        .map(
                          (tenant) => `${tenant.firstName} ${tenant.lastName}`,
                        )
                        .join(", ")
                    : unit.status === "occupied"
                      ? "Occupied · no tenant profile linked"
                      : "No tenant profile linked"}
                </p>
                <div className="mt-4 grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingUnit(unit);
                        setForm({
                          propertyId: unit.propertyId,
                          unitNumber: unit.unitNumber,
                          floor: unit.floor ?? "",
                          bedrooms:
                            unit.bedrooms == null ? "" : String(unit.bedrooms),
                          bathrooms:
                            unit.bathrooms == null
                              ? ""
                              : String(unit.bathrooms),
                          status: unit.status,
                          squareFeet:
                            unit.squareFeet == null
                              ? ""
                              : String(unit.squareFeet),
                          rentAmount:
                            unit.rentAmount == null
                              ? ""
                              : String(unit.rentAmount),
                          depositAmount:
                            unit.depositAmount == null
                              ? ""
                              : String(unit.depositAmount),
                          availableDate: unit.availableDate?.slice(0, 10) ?? "",
                          amenities: unit.amenities.filter((amenity) =>
                            UNIT_AMENITIES.includes(
                              amenity as (typeof UNIT_AMENITIES)[number],
                            ),
                          ),
                          customAmenities: unit.amenities
                            .filter(
                              (amenity) =>
                                !UNIT_AMENITIES.includes(
                                  amenity as (typeof UNIT_AMENITIES)[number],
                                ),
                            )
                            .join(", "),
                        });
                        setOpen(true);
                      }}
                    >
                      Edit unit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => setPendingDelete(unit)}
                    >
                      <Trash2 aria-hidden="true" /> Delete
                    </Button>
                  </div>
                  <Label htmlFor={`unit-status-${unit.id}`}>
                    Operational status
                  </Label>
                  <select
                    id={`unit-status-${unit.id}`}
                    className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"
                    value={unit.status}
                    onChange={(event) =>
                      void updateStatus(
                        unit,
                        event.target.value as Unit["status"],
                      )
                    }
                    disabled={["occupied", "reserved"].includes(unit.status)}
                  >
                    <option value="vacant">Vacant</option>
                    <option value="under_maintenance">Under maintenance</option>
                    <option value="off_market">Off market</option>
                    {unit.status === "occupied" ? (
                      <option value="occupied">Occupied</option>
                    ) : null}
                    {unit.status === "reserved" ? (
                      <option value="reserved">Reserved for signing</option>
                    ) : null}
                  </select>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {["occupied", "reserved"].includes(unit.status)
                    ? unit.status === "occupied"
                      ? "Occupied records an existing resident; this does not create a lease or send an invitation."
                      : "Reserved while an approved applicant signs the lease."
                    : "Use this for availability. Existing residents can be recorded as occupied without starting a lease or sending an invitation."}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UnitEditorDialog
        open={open}
        onOpenChange={setOpen}
        onCancel={() => {
          setOpen(false);
          setEditingUnit(null);
          setForm(initialUnitForm);
        }}
        editingUnit={editingUnit}
        form={form}
        setForm={setForm}
        properties={properties}
        creating={creating}
        onSubmit={createUnit}
      />
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleting) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete unit {pendingDelete?.unitNumber}?</DialogTitle>
            <DialogDescription>
              This permanently removes the unit from{" "}
              <strong>{pendingDelete?.property.name}</strong>. The system will
              block deletion if tenant, lease, payment, or maintenance history
              is linked to it. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void deleteUnit()}
            >
              {deleting ? <Loader2 className="animate-spin" /> : null}
              Delete unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
