import { TenantCommunicationsService } from './tenant-communications.service';
import { Prisma } from '@prisma/client';

describe('TenantCommunicationsService', () => {
  const payload = {
    audienceType: 'property' as const,
    propertyId: 'property-1',
    requestId: 'c9f5cae8-6353-4792-8542-98279f761a8c',
    subject: 'Water shutoff',
    message: 'Water service will be unavailable.',
    templateKey: 'tenant.custom_notice' as const,
  };

  it('resolves only active tenants attached to occupied units for a property', async () => {
    const tenant = {
      id: 'tenant-1',
      firstName: 'Taylor',
      lastName: 'Resident',
      email: 'taylor@example.com',
      status: 'active',
      unit: {
        id: 'unit-1',
        unitNumber: '2',
        status: 'occupied',
        property: { id: 'property-1', name: 'Oak' },
      },
      payments: [],
    };
    const prisma = {
      tenant: { findMany: jest.fn().mockResolvedValue([tenant]) },
    };
    const service = new TenantCommunicationsService(
      prisma as never,
      {} as never,
    );
    await expect(service.preview(payload)).resolves.toMatchObject({
      recipientCount: 1,
      recipients: [{ id: tenant.id, email: tenant.email }],
    });
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ['active', 'ACTIVE'] },
          unit: {
            status: { in: ['occupied', 'OCCUPIED'] },
            propertyId: 'property-1',
          },
        },
      }),
    );
  });

  it('sends custom notices one recipient at a time and persists the batch id', async () => {
    const tenant = {
      id: 'tenant-1',
      firstName: 'Taylor',
      lastName: 'Resident',
      email: 'taylor@example.com',
      status: 'active',
      unit: {
        id: 'unit-1',
        unitNumber: '2',
        status: 'occupied',
        property: { id: 'property-1', name: 'Oak' },
      },
      payments: [],
    };
    const prisma = {
      tenant: { findMany: jest.fn().mockResolvedValue([tenant]) },
      emailBatch: {
        create: jest.fn().mockResolvedValue({ id: 'batch-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const emails = {
      sendTemplate: jest
        .fn()
        .mockResolvedValue({ id: 'email-1', status: 'SENT' }),
    };
    const service = new TenantCommunicationsService(
      prisma as never,
      emails as never,
    );
    await expect(service.send('admin-1', payload)).resolves.toMatchObject({
      batchId: 'batch-1',
      recipientCount: 1,
      status: 'SENT',
    });
    expect(emails.sendTemplate).toHaveBeenCalledWith(
      tenant.email,
      'tenant.custom_notice',
      expect.objectContaining({
        name: 'Taylor Resident',
        subject: payload.subject,
        message: payload.message,
      }),
      'batch-1/tenant-1',
      expect.objectContaining({
        tenantId: tenant.id,
        propertyId: 'property-1',
        unitId: 'unit-1',
        sentByUserId: 'admin-1',
        batchId: 'batch-1',
      }),
    );
  });

  it('excludes tenants without an unpaid rent charge from system rent notices', async () => {
    const rows = [
      {
        id: 'tenant-1',
        firstName: 'Taylor',
        lastName: 'Resident',
        email: 'taylor@example.com',
        status: 'active',
        unit: {
          id: 'unit-1',
          unitNumber: '2',
          status: 'occupied',
          property: { id: 'property-1', name: 'Oak' },
        },
        payments: [],
      },
    ];
    const prisma = { tenant: { findMany: jest.fn().mockResolvedValue(rows) } };
    const service = new TenantCommunicationsService(
      prisma as never,
      {} as never,
    );
    await expect(
      service.preview({ ...payload, templateKey: 'rent.reminder' }),
    ).resolves.toMatchObject({ recipientCount: 0, recipients: [] });
  });

  it('returns the prior batch for a repeated idempotency request without resending', async () => {
    const prisma = {
      tenant: { findMany: jest.fn() },
      emailBatch: {
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: '6.2.1',
          }),
        ),
        findUnique: jest.fn().mockResolvedValue({
          id: 'batch-existing',
          recipientCount: 1,
          status: 'SENT',
          emailLogs: [
            {
              id: 'email-existing',
              to: 'taylor@example.com',
              status: 'SENT',
            },
          ],
        }),
      },
    };
    const emails = { sendTemplate: jest.fn() };
    const service = new TenantCommunicationsService(
      prisma as never,
      emails as never,
    );
    await expect(service.send('admin-1', payload)).resolves.toMatchObject({
      batchId: 'batch-existing',
      duplicate: true,
    });
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    expect(emails.sendTemplate).not.toHaveBeenCalled();
  });
});
