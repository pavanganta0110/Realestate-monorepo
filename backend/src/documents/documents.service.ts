import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  type AttachTenantDocumentDto,
  TENANT_UPLOADABLE_DOCUMENT_TYPES,
  type CreateTenantDocumentUploadDto,
} from './dto/tenant-document.dto';

const DOCUMENT_BUCKET = 'tenant-documents';
const MAX_DOCUMENTS_PER_TENANT = 50;
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export type DocumentActor = {
  id: string;
  role: Role;
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listForTenant(userId: string) {
    const tenant = await this.getTenantForUser(userId);
    return this.listForTenantId(tenant.id);
  }

  async listForAdmin(tenantId: string) {
    await this.assertTenantExists(tenantId);
    return this.listForTenantId(tenantId);
  }

  async createTenantUploadUrl(
    actor: DocumentActor,
    data: CreateTenantDocumentUploadDto,
  ) {
    const tenant = await this.getTenantForUser(actor.id);
    return this.createUploadUrl(actor, tenant.id, data);
  }

  async createAdminUploadUrl(
    actor: DocumentActor,
    tenantId: string,
    data: CreateTenantDocumentUploadDto,
  ) {
    await this.assertTenantExists(tenantId);
    return this.createUploadUrl(actor, tenantId, data);
  }

  async attachForTenant(actor: DocumentActor, data: AttachTenantDocumentDto) {
    const tenant = await this.getTenantForUser(actor.id);
    return this.attach(actor, tenant.id, data);
  }

  async attachForAdmin(
    actor: DocumentActor,
    tenantId: string,
    data: AttachTenantDocumentDto,
  ) {
    await this.assertTenantExists(tenantId);
    return this.attach(actor, tenantId, data);
  }

  async downloadForTenant(userId: string, documentId: string) {
    const tenant = await this.getTenantForUser(userId);
    return this.download(tenant.id, documentId);
  }

  async downloadForAdmin(tenantId: string, documentId: string) {
    await this.assertTenantExists(tenantId);
    return this.download(tenantId, documentId);
  }

  async removeForTenant(actor: DocumentActor, documentId: string) {
    const tenant = await this.getTenantForUser(actor.id);
    const document = await this.findDocument(tenant.id, documentId);
    if (document.uploadedByUserId !== actor.id) {
      throw new NotFoundException('Tenant document not found');
    }
    return this.remove(actor.id, document);
  }

  async removeForAdmin(
    actor: DocumentActor,
    tenantId: string,
    documentId: string,
  ) {
    await this.assertTenantExists(tenantId);
    const document = await this.findDocument(tenantId, documentId);
    return this.remove(actor.id, document);
  }

  private async createUploadUrl(
    actor: DocumentActor,
    tenantId: string,
    data: CreateTenantDocumentUploadDto,
  ) {
    this.assertActorCanUploadType(actor, data.type);
    const count = await this.prisma.document.count({ where: { tenantId } });
    if (count >= MAX_DOCUMENTS_PER_TENANT) {
      throw new BadRequestException(
        `A resident can have up to ${MAX_DOCUMENTS_PER_TENANT} documents`,
      );
    }
    const path = `tenants/${tenantId}/${randomUUID()}-${this.safeName(data.fileName)}`;
    const { data: signed, error } = await this.storage()
      .storage.from(DOCUMENT_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !signed) {
      throw new BadRequestException(
        error?.message || 'Unable to prepare document upload',
      );
    }
    return {
      bucket: DOCUMENT_BUCKET,
      path: signed.path,
      token: signed.token,
      expiresIn: 7200,
    };
  }

  private async attach(
    actor: DocumentActor,
    tenantId: string,
    data: AttachTenantDocumentDto,
  ) {
    this.assertActorCanUploadType(actor, data.type);
    if (!data.path.startsWith(`tenants/${tenantId}/`)) {
      throw new BadRequestException('Invalid tenant document path');
    }
    const count = await this.prisma.document.count({ where: { tenantId } });
    if (count >= MAX_DOCUMENTS_PER_TENANT) {
      throw new BadRequestException(
        `A resident can have up to ${MAX_DOCUMENTS_PER_TENANT} documents`,
      );
    }
    const slash = data.path.lastIndexOf('/');
    const directory = data.path.slice(0, slash);
    const fileName = data.path.slice(slash + 1);
    const storage = this.storage();
    const { data: objects, error } = await storage.storage
      .from(DOCUMENT_BUCKET)
      .list(directory, { search: fileName, limit: 2 });
    const object = objects?.find((item) => item.name === fileName);
    if (error || !object) {
      throw new BadRequestException('Upload the document before attaching it');
    }
    const actualSize = Number(object.metadata?.size ?? 0);
    if (!Number.isFinite(actualSize) || actualSize < 1) {
      throw new BadRequestException('Unable to verify the uploaded document');
    }
    if (actualSize > MAX_DOCUMENT_SIZE_BYTES) {
      await storage.storage.from(DOCUMENT_BUCKET).remove([data.path]);
      throw new BadRequestException('Document exceeds the 10 MB limit');
    }
    const actualContentType = object.metadata?.mimetype;
    if (actualContentType && actualContentType !== data.contentType) {
      await storage.storage.from(DOCUMENT_BUCKET).remove([data.path]);
      throw new BadRequestException('Uploaded document type does not match');
    }
    const existing = await this.prisma.document.findFirst({
      where: { storagePath: data.path },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Document is already attached');

    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          tenantId,
          name: this.safeName(data.fileName),
          type: data.type,
          contentType: data.contentType,
          storagePath: data.path,
          uploadedByUserId: actor.id,
        },
        select: documentListSelect,
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'TENANT_DOCUMENT_ATTACHED',
          resource: 'tenant_document',
          resourceId: document.id,
          newValue: JSON.stringify({ tenantId, type: document.type }),
        },
      });
      return document;
    });
  }

  private async download(tenantId: string, documentId: string) {
    const document = await this.findDocument(tenantId, documentId);
    if (!document.storagePath.startsWith(`tenants/${tenantId}/`)) {
      throw new ConflictException('This legacy document must be re-uploaded');
    }
    const { data, error } = await this.storage()
      .storage.from(DOCUMENT_BUCKET)
      .createSignedUrl(document.storagePath, 300, { download: document.name });
    if (error || !data?.signedUrl) {
      throw new BadRequestException(
        error?.message || 'Unable to prepare document download',
      );
    }
    return { url: data.signedUrl, expiresIn: 300 };
  }

  private async remove(
    actorUserId: string,
    document: Awaited<ReturnType<DocumentsService['findDocument']>>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.document.delete({ where: { id: document.id } });
      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          action: 'TENANT_DOCUMENT_REMOVED',
          resource: 'tenant_document',
          resourceId: document.id,
          oldValue: JSON.stringify({
            tenantId: document.tenantId,
            type: document.type,
          }),
        },
      });
    });
    if (document.storagePath.startsWith(`tenants/${document.tenantId}/`)) {
      const { error } = await this.storage()
        .storage.from(DOCUMENT_BUCKET)
        .remove([document.storagePath]);
      if (error) {
        this.logger.warn(
          `Document ${document.id} was removed from the database but its storage object could not be removed: ${error.message}`,
        );
      }
    }
    return { id: document.id };
  }

  private listForTenantId(tenantId: string) {
    return this.prisma.document.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_DOCUMENTS_PER_TENANT,
      select: documentListSelect,
    });
  }

  private async findDocument(tenantId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        type: true,
        storagePath: true,
        uploadedByUserId: true,
      },
    });
    if (!document) throw new NotFoundException('Tenant document not found');
    return document;
  }

  private async getTenantForUser(userId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Tenant profile not found');
    return tenant;
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
  }

  private assertActorCanUploadType(actor: DocumentActor, type: string) {
    if (
      actor.role === Role.TENANT &&
      !TENANT_UPLOADABLE_DOCUMENT_TYPES.includes(
        type as (typeof TENANT_UPLOADABLE_DOCUMENT_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        'Residents can upload identification, insurance, or other supporting documents only',
      );
    }
  }

  private storage() {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SECRET_KEY');
    if (!url || !key) {
      throw new InternalServerErrorException(
        'Tenant document storage is not configured',
      );
    }
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  private safeName(value: string) {
    const normalized = value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(-120);
    return normalized || 'document';
  }
}

const documentListSelect = {
  id: true,
  name: true,
  type: true,
  extractionStatus: true,
  extractedTerms: true,
  createdAt: true,
  uploadedBy: { select: { email: true } },
} as const;
