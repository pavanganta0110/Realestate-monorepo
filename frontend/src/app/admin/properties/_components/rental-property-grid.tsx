import Image from "next/image";
import { Building2, Eye, EyeOff, ImagePlus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RentalProperty } from "./rental-property-types";

function occupancySummary(units: RentalProperty["units"]) {
  if (units.length === 0) return "No units recorded";

  const counts = units.reduce<Record<string, number>>((result, unit) => {
    const status = unit.status.toLowerCase();
    result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {});
  const occupied = counts.occupied ?? 0;
  const vacant = counts.vacant ?? 0;
  const maintenance = counts.under_maintenance ?? 0;
  const other = Object.entries(counts)
    .filter(
      ([status]) =>
        !["occupied", "vacant", "under_maintenance"].includes(status),
    )
    .map(([status, count]) => `${count} ${status.replaceAll("_", " ")}`);

  return [
    `${occupied} occupied`,
    vacant > 0 ? `${vacant} vacant` : null,
    maintenance > 0 ? `${maintenance} under maintenance` : null,
    ...other,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function RentalPropertyGrid({
  properties,
  busy,
  deletingId,
  onEdit,
  onDelete,
  onPublishChange,
}: {
  properties: RentalProperty[];
  busy: boolean;
  deletingId: string | null;
  onEdit: (property: RentalProperty) => void;
  onDelete: (property: RentalProperty) => void;
  onPublishChange: (property: RentalProperty) => Promise<void>;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {properties.map((property) => (
        <Card key={property.id} className="overflow-hidden">
          <CardContent className="grid gap-5 p-5 sm:grid-cols-[9rem_1fr]">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-secondary">
              {property.photos[0] ? (
                <Image
                  src={property.photos[0]}
                  alt={`${property.name} exterior`}
                  fill
                  sizes="144px"
                  className="object-cover"
                />
              ) : (
                <Building2 className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{property.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {property.address}, {property.city}, {property.state}
                  </p>
                </div>
                <Badge
                  variant={
                    property.publishStatus === "PUBLISHED"
                      ? "default"
                      : "outline"
                  }
                >
                  {property.publishStatus.toLowerCase()}
                </Badge>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {property.units.length} units · Property status:{" "}
                {property.status}
              </p>
              <p className="mt-1 text-sm font-medium">
                Occupancy: {occupancySummary(property.units)}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(property)}
                >
                  <ImagePlus aria-hidden="true" /> Edit & photos
                </Button>
                <Button
                  size="sm"
                  variant={
                    property.publishStatus === "PUBLISHED"
                      ? "outline"
                      : "default"
                  }
                  disabled={busy}
                  onClick={() => void onPublishChange(property)}
                >
                  {property.publishStatus === "PUBLISHED" ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                  {property.publishStatus === "PUBLISHED"
                    ? "Unpublish"
                    : "Publish"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  disabled={
                    busy ||
                    deletingId !== null ||
                    property.publishStatus === "PUBLISHED" ||
                    property.units.length > 0
                  }
                  title={
                    property.publishStatus === "PUBLISHED"
                      ? "Unpublish this rental before deleting it"
                      : property.units.length > 0
                        ? "Remove all rental units before deleting it"
                        : "Delete rental"
                  }
                  onClick={() => onDelete(property)}
                >
                  <Trash2 aria-hidden="true" /> Delete
                </Button>
              </div>
              {(property.publishStatus === "PUBLISHED" ||
                property.units.length > 0) && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {property.publishStatus === "PUBLISHED"
                    ? "Unpublish this rental before deleting it."
                    : "Remove all units before deleting this rental."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
