import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bath,
  BedDouble,
  CalendarDays,
  CircleDollarSign,
  MapPin,
  Ruler,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { rentalPrice, type RentalProperty } from "@/lib/rental-properties";
import { formatCurrency } from "@/lib/sale-listings";

const fallbackPhoto = "/images/coach-johnson/missouri-brick-rental.webp";

const availabilityDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function availabilityLabel(property: RentalProperty) {
  if (property.status === "rented") return "Rented";

  const value = property.units[0]?.availableDate ?? property.availabilityDate;
  if (!value) return "Availability by request";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Availability by request";

  const today = new Date();
  const startOfToday = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  return date.getTime() <= startOfToday
    ? "Available now"
    : `Available ${availabilityDateFormatter.format(date)}`;
}

export function RentalListingCard({
  property,
  prioritizeImage = false,
}: {
  property: RentalProperty;
  prioritizeImage?: boolean;
}) {
  const unit = property.units[0];
  const price = rentalPrice(property);
  const rented = property.status === "rented";
  const canApply = !rented && price != null;
  const detailsHref = `/rentals/${property.id}`;
  const applyHref = `${detailsHref}/apply${unit ? `?unitId=${encodeURIComponent(unit.id)}` : ""}`;

  return (
    <Card className="group flex h-full flex-col overflow-hidden transition-[border-color,box-shadow] hover:border-primary/35 hover:shadow-sm">
      <Link
        href={detailsHref}
        className="focus-ring relative block aspect-[4/3] overflow-hidden bg-secondary"
        aria-label={`View ${property.name} rental details`}
      >
        <Image
          src={property.photos[0] || fallbackPhoto}
          alt={`${property.name} rental`}
          fill
          loading={prioritizeImage ? "eager" : "lazy"}
          fetchPriority={prioritizeImage ? "high" : "auto"}
          sizes="(min-width: 1280px) 32vw, (min-width: 768px) 48vw, 100vw"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <span className="absolute left-4 top-4 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm">
          {rented ? "Rented" : "Available"}
        </span>
      </Link>

      <CardContent className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <p className="text-lg font-semibold tracking-[-0.025em] text-primary">
            {price == null
              ? "Contact for pricing"
              : `${formatCurrency(price)} / month`}
          </p>
          <p className="inline-flex min-h-7 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
            {availabilityLabel(property)}
          </p>
        </div>

        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">
          <Link
            href={detailsHref}
            className="focus-ring rounded-sm transition-colors hover:text-primary"
          >
            {property.name}
          </Link>
        </h2>
        <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
          <MapPin
            className="mt-1 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <span>
            {property.address}, {property.city}, {property.state} {property.zip}
          </span>
        </p>

        <dl className="mt-5 grid grid-cols-3 border-y border-border py-4 text-sm">
          <RentalFact
            icon={BedDouble}
            label="Beds"
            value={unit?.bedrooms ?? property.bedrooms ?? "—"}
          />
          <RentalFact
            icon={Bath}
            label="Baths"
            value={unit?.bathrooms ?? property.bathrooms ?? "—"}
          />
          <RentalFact
            icon={Ruler}
            label="Sq ft"
            value={unit?.squareFeet ?? property.squareFeet ?? "—"}
          />
        </dl>

        <div className="mt-4 flex items-center justify-between gap-4 text-sm">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <CircleDollarSign
              className="size-4 text-primary"
              aria-hidden="true"
            />
            Security deposit
          </span>
          <strong className="font-semibold text-foreground">
            {unit?.depositAmount != null
              ? formatCurrency(unit.depositAmount)
              : "Confirm with team"}
          </strong>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link
            href={detailsHref}
            className={buttonVariants({
              variant: "outline",
              className: "w-full",
            })}
          >
            View details
          </Link>
          <Link
            href={canApply ? applyHref : detailsHref}
            className={buttonVariants({
              variant: canApply ? "default" : "secondary",
              className: "w-full",
            })}
          >
            {rented
              ? "View history"
              : canApply
                ? "Apply now"
                : "Ask availability"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function RentalFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BedDouble;
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
