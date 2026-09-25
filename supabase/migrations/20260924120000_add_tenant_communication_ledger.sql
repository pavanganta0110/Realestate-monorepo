CREATE TABLE "EmailBatch" (
  "id" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "audienceType" TEXT NOT NULL,
  "propertyId" TEXT,
  "recipientCount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "idempotencyKey" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmailLog"
  ADD COLUMN "tenantId" TEXT,
  ADD COLUMN "propertyId" TEXT,
  ADD COLUMN "unitId" TEXT,
  ADD COLUMN "sentByUserId" TEXT,
  ADD COLUMN "batchId" TEXT;

CREATE UNIQUE INDEX "EmailBatch_idempotencyKey_key" ON "EmailBatch"("idempotencyKey");
CREATE INDEX "EmailBatch_createdByUserId_createdAt_id_idx" ON "EmailBatch"("createdByUserId", "createdAt" DESC, "id" DESC);
CREATE INDEX "EmailBatch_propertyId_createdAt_id_idx" ON "EmailBatch"("propertyId", "createdAt" DESC, "id" DESC);
CREATE INDEX "EmailLog_tenantId_createdAt_id_idx" ON "EmailLog"("tenantId", "createdAt" DESC, "id" DESC);
CREATE INDEX "EmailLog_batchId_createdAt_id_idx" ON "EmailLog"("batchId", "createdAt" DESC, "id" DESC);

ALTER TABLE "EmailBatch" ADD CONSTRAINT "EmailBatch_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailBatch" ADD CONSTRAINT "EmailBatch_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_sentByUserId_fkey"
  FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "EmailBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
