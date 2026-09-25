import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateTenantDto,
  UpdateTenantProfileDto,
} from './dto/update-tenant.dto';

const tenantInclude = {
  user: { select: { id: true, email: true, status: true } },
  unit: {
    include: { property: { select: { id: true, name: true } } },
  },
  leases: { orderBy: { endDate: 'desc' as const }, take: 5 },
} satisfies Prisma.TenantInclude;

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.tenant.findMany({
      include: tenantInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      take: 250,
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        ...tenantInclude,
        leases: { orderBy: [{ startDate: 'desc' }, { id: 'desc' }] },
        payments: { orderBy: [{ dueDate: 'desc' }, { id: 'desc' }], take: 50 },
        maintenanceRequests: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        },
        documents: { select: { id: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const activity = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          {
            resourceId: id,
            resource: { in: ['tenant', 'tenant_message_thread'] },
          },
          {
            resource: 'payment',
            resourceId: { in: tenant.payments.map((payment) => payment.id) },
          },
          {
            resource: 'lease',
            resourceId: { in: tenant.leases.map((lease) => lease.id) },
          },
          {
            resource: 'tenant_document',
            resourceId: { in: tenant.documents.map((document) => document.id) },
          },
          {
            resource: 'maintenance_request',
            resourceId: {
              in: tenant.maintenanceRequests.map((request) => request.id),
            },
          },
        ],
      },
      include: { user: { select: { id: true, email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return { ...tenant, activity };
  }

  async update(userId: string, id: string, data: UpdateTenantDto) {
    const current = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id },
        data: {
          ...data,
          firstName: data.firstName?.trim(),
          lastName: data.lastName?.trim(),
          dateOfBirth: data.dateOfBirth
            ? new Date(data.dateOfBirth)
            : undefined,
        },
        include: tenantInclude,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'TENANT_PROFILE_UPDATED',
          resource: 'tenant',
          resourceId: id,
          oldValue: JSON.stringify({ status: current.status }),
          newValue: JSON.stringify({ status: tenant.status }),
        },
      });
      return tenant;
    });
  }

  async updateOwnProfile(userId: string, data: UpdateTenantProfileDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Tenant profile not found');
    return this.update(userId, tenant.id, data);
  }

  async getDashboardData(userId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { userId },
      include: {
        unit: { include: { property: true } },
        leases: {
          where: { status: { in: ['active', 'expiring', 'renewed'] } },
          orderBy: { endDate: 'desc' },
          take: 1,
        },
        maintenanceRequests: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 5,
        },
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant profile not found');
    return tenant;
  }

  async getActiveLease(userId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Tenant profile not found');
    return this.prisma.lease.findFirst({
      where: {
        tenantId: tenant.id,
        status: { in: ['active', 'expiring', 'renewed'] },
      },
      include: { unit: { include: { property: true } } },
      orderBy: { endDate: 'desc' },
    });
  }
}
