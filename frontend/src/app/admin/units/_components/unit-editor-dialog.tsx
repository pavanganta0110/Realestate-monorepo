"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const UNIT_AMENITIES = [
  "Washer",
  "Dryer",
  "Microwave",
  "Oven",
  "Refrigerator",
  "Dishwasher",
  "Air conditioning",
  "Heating",
  "Parking",
  "Secure entry",
] as const;

export type Unit = {
  id: string;
  propertyId: string;
  unitNumber: string;
  floor: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  rentAmount: number | null;
  depositAmount: number | null;
  availableDate: string | null;
  amenities: string[];
  status:
    | "vacant"
    | "reserved"
    | "occupied"
    | "under_maintenance"
    | "off_market";
  property: Pick<Property, "id" | "name" | "publishStatus">;
  tenants: Array<{ id: string; firstName: string; lastName: string }>;
};

export type Property = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  publishStatus: "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
};

export type UnitForm = {
  propertyId: string;
  unitNumber: string;
  floor: string;
  bedrooms: string;
  bathrooms: string;
  status: Unit["status"];
  squareFeet: string;
  rentAmount: string;
  depositAmount: string;
  availableDate: string;
  amenities: string[];
  customAmenities: string;
};

export const initialUnitForm: UnitForm = {
  propertyId: "",
  unitNumber: "",
  floor: "",
  bedrooms: "",
  bathrooms: "",
  status: "occupied",
  squareFeet: "",
  rentAmount: "",
  depositAmount: "",
  availableDate: "",
  amenities: [],
  customAmenities: "",
};

type UnitEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  editingUnit: Unit | null;
  form: UnitForm;
  setForm: Dispatch<SetStateAction<UnitForm>>;
  properties: Property[];
  creating: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function UnitEditorDialog({
  open,
  onOpenChange,
  onCancel,
  editingUnit,
  form,
  setForm,
  properties,
  creating,
  onSubmit,
}: UnitEditorDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {editingUnit ? "Edit rental unit" : "Add rental unit"}
          </DialogTitle>
          <DialogDescription>
            {editingUnit
              ? "Update the recorded unit facts. Occupancy is handled by the lease workflow."
              : "Record an existing unit here. Choosing Occupied does not create a tenant account, lease, or invitation. Unknown facts can be added later; creating a unit does not publish its property."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
          {!editingUnit ? (
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="unit-property">Property</Label>
              <select
                id="unit-property"
                className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"
                value={form.propertyId}
                onChange={(event) =>
                  setForm({ ...form, propertyId: event.target.value })
                }
                required
              >
                <option value="">Choose a rental property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name} · {property.address}, {property.city},{" "}
                    {property.state} ({property.publishStatus.toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid gap-2 sm:col-span-2">
              <Label>Property</Label>
              <p className="text-sm text-muted-foreground">
                {editingUnit.property.name}
              </p>
            </div>
          )}
          {!editingUnit ? (
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="unit-status">Current occupancy</Label>
              <select
                id="unit-status"
                className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as Unit["status"],
                  })
                }
                required
              >
                <option value="occupied">Occupied — existing resident</option>
                <option value="vacant">Vacant</option>
                <option value="under_maintenance">Under maintenance</option>
                <option value="off_market">Off market</option>
              </select>
            </div>
          ) : null}
          {(
            [
              ["unitNumber", "Unit number", "text"],
              ["floor", "Floor (optional)", "text"],
              ["bedrooms", "Bedrooms (optional)", "number"],
              ["bathrooms", "Bathrooms (optional)", "number"],
              ["squareFeet", "Square feet (optional)", "number"],
              ["rentAmount", "Monthly rent (optional)", "number"],
              [
                "depositAmount",
                "Security deposit (defaults to monthly rent)",
                "number",
              ],
              ["availableDate", "Available date", "date"],
            ] as const
          ).map(([field, label, type]) => (
            <div key={field} className="grid gap-2">
              <Label htmlFor={`unit-${field}`}>{label}</Label>
              <Input
                id={`unit-${field}`}
                type={type}
                min={type === "number" ? 0 : undefined}
                step={field === "bathrooms" ? "0.5" : undefined}
                value={form[field]}
                onChange={(event) =>
                  setForm({ ...form, [field]: event.target.value })
                }
                required={
                  ![
                    "floor",
                    "availableDate",
                    "bedrooms",
                    "bathrooms",
                    "squareFeet",
                    "rentAmount",
                    "depositAmount",
                  ].includes(field)
                }
              />
            </div>
          ))}
          <fieldset className="grid gap-3 sm:col-span-2">
            <legend className="text-sm font-medium">Unit features</legend>
            <p className="text-sm text-muted-foreground">
              Select only features available in this unit. Checked features will
              appear with this unit on the public rental page.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {UNIT_AMENITIES.map((amenity) => {
                const id = `unit-amenity-${amenity.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                return (
                  <label
                    key={amenity}
                    htmlFor={id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={form.amenities.includes(amenity)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          amenities: event.target.checked
                            ? [...form.amenities, amenity]
                            : form.amenities.filter((item) => item !== amenity),
                        })
                      }
                    />
                    {amenity}
                  </label>
                );
              })}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="unit-custom-amenities">
                Other features (comma separated)
              </Label>
              <Input
                id="unit-custom-amenities"
                value={form.customAmenities}
                onChange={(event) =>
                  setForm({ ...form, customAmenities: event.target.value })
                }
                placeholder="Balcony, hardwood floors"
              />
            </div>
          </fieldset>
          <div className="flex justify-end gap-3 border-t border-border pt-5 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="animate-spin" /> : null}
              {editingUnit ? "Save changes" : "Create unit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
