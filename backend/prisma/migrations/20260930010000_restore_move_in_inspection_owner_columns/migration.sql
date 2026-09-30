ALTER TABLE "MoveInInspection"
  ADD COLUMN "propertyOwnerId" TEXT;

ALTER TABLE "MoveInInspectionAcknowledgement"
  ADD COLUMN "propertyOwnerId" TEXT;

ALTER TABLE "MoveInInspection"
  ADD CONSTRAINT "MoveInInspection_propertyOwnerId_fkey"
    FOREIGN KEY ("propertyOwnerId") REFERENCES "PropertyOwner"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MoveInInspectionAcknowledgement"
  ADD CONSTRAINT "MoveInInspectionAcknowledgement_propertyOwnerId_fkey"
    FOREIGN KEY ("propertyOwnerId") REFERENCES "PropertyOwner"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MoveInInspection_propertyOwnerId_idx"
  ON "MoveInInspection"("propertyOwnerId");

CREATE INDEX "MoveInInspectionAcknowledgement_propertyOwnerId_idx"
  ON "MoveInInspectionAcknowledgement"("propertyOwnerId");
