import { Role, UserStatus } from '@prisma/client';
import { MessagesService } from './messages.service';

describe('MessagesService tenant routing', () => {
  const tenant = {
    id: 'tenant-1',
    firstName: 'Taylor',
    lastName: 'Resident',
    email: 'tenant@example.com',
    status: 'active',
    user: { id: 'tenant-user', email: 'tenant@example.com' },
    unit: null,
  };

  it('loads tenant chat only from the authenticated user’s linked tenant record', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      message: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const result = await new MessagesService(
      prisma as never,
      {} as never,
    ).getForTenant('tenant-user');
    expect(result.tenant.id).toBe('tenant-1');
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'tenant-user' } }),
    );
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
    );
  });

  it('does not send in-app chat to tenants without a linked portal account', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ ...tenant, user: null }),
      },
      message: { create: jest.fn() },
    };
    await expect(
      new MessagesService(prisma as never, {} as never).sendFromAdmin(
        'admin-1',
        'tenant-1',
        { body: 'Hello' },
      ),
    ).rejects.toThrow('does not have a linked portal account');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('does not audit an admin read when no message changed', async () => {
    const tx = {
      message: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    await expect(
      new MessagesService(prisma as never, {} as never).markReadForAdmin(
        'rental-admin',
        tenant.id,
      ),
    ).resolves.toEqual({ markedRead: 0 });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('routes a tenant message to an active Tenant Admin and audits it', async () => {
    const tx = {
      message: {
        create: jest.fn().mockResolvedValue({
          id: 'message-1',
          createdAt: new Date(),
          subject: 'Tenant support',
        }),
      },
      tenant: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' }),
      },
      message: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    const emails = { sendTenantMessageToAdmin: jest.fn() };
    await new MessagesService(prisma as never, emails as never).sendFromTenant(
      'tenant-user',
      { body: 'Please contact me about my lease.' },
    );

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { role: Role.TENANT_ADMIN, status: UserStatus.ACTIVE },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, email: true },
    });
    expect(tx.message.create).toHaveBeenCalledWith({
      data: {
        senderId: 'tenant-user',
        receiverId: 'admin-1',
        tenantId: 'tenant-1',
        subject: 'Tenant support',
        body: 'Please contact me about my lease.',
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'tenant-user',
        action: 'TENANT_MESSAGE_SENT',
        resource: 'tenant_message_thread',
        resourceId: 'tenant-1',
        newValue: JSON.stringify({ messageId: 'message-1' }),
      },
    });
  });
});
