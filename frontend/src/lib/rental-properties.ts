type RentalUnit = {
  id: string;
  unitNumber: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  rentAmount: number | null;
  depositAmount: number | null;
  availableDate?: string | null;
  amenities: string[];
};

export type RentalProperty = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  description?: string | null;
  rentAmount?: string | number | null;
  applicationFeeAmount: string | number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFeet?: number | null;
  availabilityDate?: string | null;
  amenities: string[];
  utilityInfo?: string | null;
  photos: string[];
  status: string;
  publishedAt?: string | null;
  updatedAt: string;
  units: RentalUnit[];
};

export function rentalPrice(property: RentalProperty) {
  if (property.units.length > 0 && property.units[0].rentAmount != null) {
    return property.units[0].rentAmount;
  }
  if (property.rentAmount != null) return Number(property.rentAmount);
  return null;
}
