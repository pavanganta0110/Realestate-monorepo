-- Existing units can be recorded before every marketing fact is known.
-- Occupancy remains a unit status; these nullable facts can be filled in later.
ALTER TABLE "Unit"
  ALTER COLUMN "bedrooms" DROP NOT NULL,
  ALTER COLUMN "bathrooms" DROP NOT NULL,
  ALTER COLUMN "squareFeet" DROP NOT NULL,
  ALTER COLUMN "rentAmount" DROP NOT NULL,
  ALTER COLUMN "depositAmount" DROP NOT NULL;
