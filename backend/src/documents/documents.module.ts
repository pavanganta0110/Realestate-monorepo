import { Module } from '@nestjs/common';
import {
  AdminTenantDocumentsController,
  TenantDocumentsController,
} from './documents.controller';
import { DocumentsService } from './documents.service';
import { LeaseDocumentExtractionService } from './lease-document-extraction.service';

@Module({
  controllers: [TenantDocumentsController, AdminTenantDocumentsController],
  providers: [DocumentsService, LeaseDocumentExtractionService],
})
export class DocumentsModule {}
