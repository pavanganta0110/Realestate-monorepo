import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantCommunicationDto } from './dto/tenant-communication.dto';
import { EmailsService } from './emails.service';

const tenantSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  unit: {
    select: {
      id: true,
      unitNumber: true,
      status: true,
      property: { select: { id: true, name: true } },
    },
  },
  payments: {
    where: {
      purpose: 'RENT',
      balanceDue: { gt: 0 },
      status: { notIn: ['PAID', 'WAIVED'] },
    },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    take: 1,
    select: {
      rentAmount: true,
      lateFee: true,
      totalAmount: true,
      balanceDue: true,
      dueDate: true,
    },
  },
} satisfies Prisma.TenantSelect;

@Injectable()
export class TenantCommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
  ) {}

  private async resolve(dto: TenantCommunicationDto) {
    const active = { status: { in: ['active', 'ACTIVE'] } };
    const occupied = { status: { in: ['occupied', 'OCCUPIED'] } };
    const where: Prisma.TenantWhereInput =
      dto.audienceType === 'tenant'
        ? { id: dto.tenantId }
        : dto.audienceType === 'selected'
          ? { id: { in: dto.tenantIds ?? [] }, ...active, unit: occupied }
          : dto.audienceType === 'property'
            ? { ...active, unit: { ...occupied, propertyId: dto.propertyId } }
            : { ...active, unit: occupied };
    if (dto.audienceType === 'tenant' && !dto.tenantId)
      throw new BadRequestException('Select a tenant');
    if (dto.audienceType === 'selected' && !dto.tenantIds?.length)
      throw new BadRequestException('Select at least one tenant');
    if (dto.audienceType === 'property' && !dto.propertyId)
      throw new BadRequestException('Select a property');
    const tenants = await this.prisma.tenant.findMany({
      where,
      select: tenantSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
    if (dto.audienceType === 'tenant' && tenants.length === 0)
      throw new NotFoundException('Tenant not found');
    if (tenants.length > 250)
      throw new BadRequestException(
        'Notice audience exceeds the 250-recipient safety limit',
      );
    if (dto.templateKey && dto.templateKey !== 'tenant.custom_notice')
      return tenants.filter((tenant) => tenant.payments.length > 0);
    return tenants;
  }

  async preview(dto: TenantCommunicationDto) {
    const tenants = await this.resolve(dto);
    return {
      recipientCount: tenants.length,
      recipients: tenants.map(({ id, firstName, lastName, email, unit }) => ({
        id,
        name: `${firstName} ${lastName}`,
        email,
        property: unit?.property.name ?? null,
        unit: unit?.unitNumber ?? null,
      })),
    };
  }

  async send(userId: string, dto: TenantCommunicationDto) {
    const templateKey = dto.templateKey ?? 'tenant.custom_notice';
    const subject =
      templateKey === 'tenant.custom_notice'
        ? (dto.subject ?? '').trim().replace(/[\r\n]+/g, ' ')
        : templateKey === 'rent.reminder'
          ? 'Rent reminder — Coach Johnson Realty'
          : 'Important: late rent notice — Coach Johnson Realty';
    const message = (dto.message ?? '').trim();
    if (templateKey === 'tenant.custom_notice' && (!subject || !message))
      throw new BadRequestException(
        'Subject and message are required for a custom notice',
      );
    const tenants = await this.resolve(dto);
    if (tenants.length === 0)
      throw new BadRequestException('No eligible active tenants found');
    const propertyId =
      dto.audienceType === 'property' ? dto.propertyId : undefined;
    let batch;
    try {
      batch = await this.prisma.emailBatch.create({
        data: {
          createdByUserId: userId,
          templateKey,
          subject,
          audienceType: dto.audienceType,
          propertyId,
          recipientCount: tenants.length,
          idempotencyKey: dto.requestId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.emailBatch.findUnique({
          where: { idempotencyKey: dto.requestId },
          include: {
            emailLogs: { select: { id: true, to: true, status: true } },
          },
        });
        if (existing)
          return {
            batchId: existing.id,
            recipientCount: existing.recipientCount,
            status: existing.status,
            duplicate: true,
            emails: existing.emailLogs,
          };
      }
      throw error;
    }
    const sendToTenant = async (tenant: (typeof tenants)[number]) => {
      const log = await this.emails.sendTemplate(
        tenant.email,
        templateKey,
        templateKey === 'tenant.custom_notice'
          ? {
              name: `${tenant.firstName} ${tenant.lastName}`,
              subject,
              message,
              category: dto.category,
            }
          : templateKey === 'rent.reminder'
            ? {
                name: `${tenant.firstName} ${tenant.lastName}`,
                amount: tenant.payments[0]?.rentAmount,
                dueDate:
                  tenant.payments[0]?.dueDate.toLocaleDateString('en-US'),
              }
            : {
                name: `${tenant.firstName} ${tenant.lastName}`,
                amount: tenant.payments[0]?.rentAmount,
                lateFee: tenant.payments[0]?.lateFee,
                total: tenant.payments[0]?.totalAmount,
              },
        `${batch.id}/${tenant.id}`,
        {
          tenantId: tenant.id,
          propertyId: tenant.unit?.property.id,
          unitId: tenant.unit?.id,
          sentByUserId: userId,
          batchId: batch.id,
        },
      );
      return {
        tenantId: tenant.id,
        emailLogId: log?.id ?? null,
        status: log?.status ?? 'FAILED',
      };
    };
    const results: Awaited<ReturnType<typeof sendToTenant>>[] = [];
    for (let offset = 0; offset < tenants.length; offset += 10) {
      results.push(
        ...(await Promise.all(
          tenants.slice(offset, offset + 10).map(sendToTenant),
        )),
      );
    }
    const failed = results.filter((result) =>
      [
        'FAILED',
        'BOUNCED',
        'COMPLAINED',
        'SUPPRESSED',
        'NOT_CONFIGURED',
      ].includes(result.status),
    ).length;
    const pending = results.some((result) =>
      ['PENDING', 'PROCESSING', 'RETRY_PENDING'].includes(result.status),
    );
    const status =
      failed === results.length
        ? 'FAILED'
        : failed || pending
          ? 'PARTIAL'
          : 'SENT';
    await this.prisma.$transaction([
      this.prisma.emailBatch.update({
        where: { id: batch.id },
        data: { status },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action:
            dto.audienceType === 'tenant'
              ? 'TENANT_EMAIL_SENT'
              : 'TENANT_BULK_EMAIL_SENT',
          resource: 'email_batch',
          resourceId: batch.id,
          newValue: JSON.stringify({
            recipientCount: tenants.length,
            templateKey,
            propertyId: propertyId ?? null,
            status,
          }),
        },
      }),
    ]);
    return {
      batchId: batch.id,
      recipientCount: tenants.length,
      status,
      duplicate: false,
      emails: results,
    };
  }

  async tenantHistory(tenantId: string, limit = 50) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return this.prisma.emailLog.findMany({
      where: { tenantId },
      select: {
        id: true,
        to: true,
        subject: true,
        templateKey: true,
        status: true,
        sentAt: true,
        deliveredAt: true,
        openedAt: true,
        bouncedAt: true,
        failedAt: true,
        createdAt: true,
        batchId: true,
        sentBy: { select: { id: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async batches(limit = 50) {
    return this.prisma.emailBatch.findMany({
      take: Math.min(Math.max(limit, 1), 100),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        property: { select: { id: true, name: true } },
        _count: { select: { emailLogs: true } },
        createdBy: { select: { id: true, email: true } },
      },
    });
  }
}
