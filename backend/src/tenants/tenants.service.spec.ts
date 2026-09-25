import { NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  function serviceWith(prisma: object) {
    return new TenantsService(prisma as never);
  }

  function firstArgument(mock: { mock: { calls: unknown[][] } }): unknown {
    return mock.mock.calls[0]?.[0];
  }

  it('bounds and deterministically orders the admin tenant list', async () => {
    const rows = [{ id: 'tenant-1' }];
    const prisma = {
      tenant: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    await expect(serviceWith(prisma).findAll()).resolves.toEqual(rows);
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take: 250,
      }),
    );
  });

  it('returns the bounded admin detail view and rejects missing tenants', async () => {
    const tenant = {
      id: 'tenant-1',
      payments: [],
      leases: [],
      documents: [],
      maintenanceRequests: [],
    };
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(tenant)
      .mockResolvedValueOnce(null);
    const auditLog = { findMany: jest.fn().mockResolvedValue([]) };
    const service = serviceWith({ tenant: { findUnique }, auditLog });
    await expect(service.findOne(tenant.id)).resolves.toEqual({
      ...tenant,
      activity: [],
    });
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(firstArgument(findUnique)).toMatchObject({
      where: { id: tenant.id },
      include: {
        payments: { orderBy: [{ dueDate: 'desc' }, { id: 'desc' }], take: 50 },
        leases: { orderBy: [{ startDate: 'desc' }, { id: 'desc' }] },
        documents: { select: { id: true } },
        maintenanceRequests: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        },
      },
    });
  });

  it('trims and audits tenant profile updates in one transaction', async () => {
    const current = {
      id: 'tenant-1',
      status: 'invited',
      payments: [],
      leases: [],
      documents: [],
      maintenanceRequests: [],
    };
    const updated = { ...current, status: 'active', firstName: 'Taylor' };
    const tx = {
      tenant: { update: jest.fn().mockResolvedValue(updated) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(current) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    await expect(
      serviceWith(prisma).update('admin-1', current.id, {
        firstName: ' Taylor ',
        lastName: ' Resident ',
        dateOfBirth: '1990-01-02',
        status: 'active',
      }),
    ).resolves.toEqual(updated);
    expect(firstArgument(tx.tenant.update)).toMatchObject({
      where: { id: current.id },
      data: {
        firstName: 'Taylor',
        lastName: 'Resident',
        dateOfBirth: new Date('1990-01-02'),
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'TENANT_PROFILE_UPDATED',
        resource: 'tenant',
        resourceId: current.id,
        oldValue: JSON.stringify({ status: 'invited' }),
        newValue: JSON.stringify({ status: 'active' }),
      },
    });
  });

  it('preserves omitted optional profile fields during an admin update', async () => {
    const current = {
      id: 'tenant-1',
      status: 'invited',
      payments: [],
      leases: [],
      documents: [],
      maintenanceRequests: [],
    };
    const updated = { ...current, status: 'active' };
    const tx = {
      tenant: { update: jest.fn().mockResolvedValue(updated) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(current) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    await expect(
      serviceWith(prisma).update('admin-1', current.id, { status: 'active' }),
    ).resolves.toEqual(updated);
    expect(firstArgument(tx.tenant.update)).toMatchObject({
      where: { id: current.id },
      data: {
        status: 'active',
        firstName: undefined,
        lastName: undefined,
        dateOfBirth: undefined,
      },
    });
  });

  it('returns bounded tenant dashboard data and rejects a missing profile', async () => {
    const tenant = { id: 'tenant-1' };
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(tenant)
      .mockResolvedValueOnce(null);
    const service = serviceWith({ tenant: { findUnique } });
    await expect(service.getDashboardData('user-1')).resolves.toEqual(tenant);
    await expect(service.getDashboardData('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(firstArgument(findUnique)).toMatchObject({
      where: { userId: 'user-1' },
      include: {
        maintenanceRequests: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 5,
        },
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
  });

  it('looks up only the signed-in tenant active lease', async () => {
    const lease = { id: 'lease-1' };
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      },
      lease: { findFirst: jest.fn().mockResolvedValue(lease) },
    };
    await expect(serviceWith(prisma).getActiveLease('user-1')).resolves.toEqual(
      lease,
    );
    expect(prisma.lease.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          status: { in: ['active', 'expiring', 'renewed'] },
        },
      }),
    );
  });

  it('limits self-service profile updates to the signed-in tenant', async () => {
    const service = serviceWith({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      },
    });
    const update = jest
      .spyOn(service, 'update')
      .mockResolvedValue({ id: 'tenant-1' } as never);

    await expect(
      service.updateOwnProfile('user-1', {
        phone: '816-555-0100',
        vehicleInfo: 'Silver sedan',
      }),
    ).resolves.toEqual({ id: 'tenant-1' });
    expect(update).toHaveBeenCalledWith('user-1', 'tenant-1', {
      phone: '816-555-0100',
      vehicleInfo: 'Silver sedan',
    });
  });

  it('rejects a self-service update when the tenant profile is absent', async () => {
    const service = serviceWith({
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const update = jest.spyOn(service, 'update');

    await expect(
      service.updateOwnProfile('missing', { phone: '816-555-0100' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('does not expose lease data when the signed-in tenant profile is absent', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
      lease: { findFirst: jest.fn() },
    };
    await expect(
      serviceWith(prisma).getActiveLease('missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.lease.findFirst).not.toHaveBeenCalled();
  });
});
