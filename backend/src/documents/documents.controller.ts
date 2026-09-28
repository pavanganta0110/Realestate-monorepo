import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { RequiredAuthenticatedRequest } from '../auth/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  ApplyLeaseTermsDto,
  AttachTenantDocumentDto,
  CreateTenantDocumentUploadDto,
} from './dto/tenant-document.dto';
import { DocumentsService } from './documents.service';
import { LeaseDocumentExtractionService } from './lease-document-extraction.service';

@Controller('tenant/portal/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TENANT)
export class TenantDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@Request() request: RequiredAuthenticatedRequest) {
    return this.documents.listForTenant(request.user.sub);
  }

  @Post('upload-url')
  createUploadUrl(
    @Request() request: RequiredAuthenticatedRequest,
    @Body() body: CreateTenantDocumentUploadDto,
  ) {
    return this.documents.createTenantUploadUrl(
      { id: request.user.sub, role: request.user.role },
      body,
    );
  }

  @Post()
  attach(
    @Request() request: RequiredAuthenticatedRequest,
    @Body() body: AttachTenantDocumentDto,
  ) {
    return this.documents.attachForTenant(
      { id: request.user.sub, role: request.user.role },
      body,
    );
  }

  @Get(':id/download-url')
  download(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.documents.downloadForTenant(request.user.sub, id);
  }

  @Delete(':id')
  remove(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.documents.removeForTenant(
      { id: request.user.sub, role: request.user.role },
      id,
    );
  }
}

@Controller('admin/tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
export class AdminTenantDocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly leaseExtraction: LeaseDocumentExtractionService,
  ) {}

  @Get(':tenantId/documents')
  list(@Param('tenantId') tenantId: string) {
    return this.documents.listForAdmin(tenantId);
  }

  @Post(':tenantId/documents/upload-url')
  createUploadUrl(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: CreateTenantDocumentUploadDto,
  ) {
    return this.documents.createAdminUploadUrl(
      { id: request.user.sub, role: request.user.role },
      tenantId,
      body,
    );
  }

  @Post(':tenantId/documents')
  attach(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: AttachTenantDocumentDto,
  ) {
    return this.documents.attachForAdmin(
      { id: request.user.sub, role: request.user.role },
      tenantId,
      body,
    );
  }

  @Post(':tenantId/documents/:id/lease-extract')
  extractLease(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.leaseExtraction.extract(tenantId, id);
  }

  @Post(':tenantId/documents/:id/lease-terms')
  applyLeaseTerms(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: ApplyLeaseTermsDto,
  ) {
    return this.leaseExtraction.apply(request.user.sub, tenantId, id, body);
  }

  @Get(':tenantId/documents/:id/download-url')
  download(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.documents.downloadForAdmin(tenantId, id);
  }

  @Delete(':tenantId/documents/:id')
  remove(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.documents.removeForAdmin(
      { id: request.user.sub, role: request.user.role },
      tenantId,
      id,
    );
  }
}
