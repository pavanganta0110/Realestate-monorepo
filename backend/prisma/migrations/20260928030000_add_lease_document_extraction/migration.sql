ALTER TABLE "Document"
  ADD COLUMN "contentType" TEXT,
  ADD COLUMN "extractionStatus" TEXT,
  ADD COLUMN "extractedTerms" JSONB,
  ADD COLUMN "extractedAt" TIMESTAMP(3);
