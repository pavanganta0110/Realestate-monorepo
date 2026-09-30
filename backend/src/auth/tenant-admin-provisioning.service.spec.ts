import { Role } from '@prisma/client';
import { TenantAdminProvisioningService } from './tenant-admin-provisioning.service';

const mockGenerateLink = jest.fn();
const mockDeleteUser = jest.fn();
const mockGetUserById = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      admin: {
        deleteUser: mockDeleteUser,
        generateLink: mockGenerateLink,
        getUserById: mockGetUserById,
      },
    },
  })),
}));

describe('TenantAdminProvisioningService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function serviceWith(prisma: object, emails: object) {
    return new TenantAdminProvisioningService(
      prisma as never,
      {
        get: jest.fn((key: string) => {
          if (key === 'SUPABASE_URL') return 'https://project.supabase.co';
          if (key === 'RENTAL_ADMIN_URL') return 'https://rentals.example.com';
          return 'sb_secret_test';
        }),
      } as never,
      emails as never,
    );
  }

  it('creates an invited tenant administrator and sends a rental portal invite', async () => {
    const tx = {
      user: {
        create: jest.fn().mockResolvedValue({ id: 'rental-admin-1' }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<{ id: string }>) =>
          callback(tx),
      ),
    };
    const emails = { sendTemplate: jest.fn() };
    mockGenerateLink.mockResolvedValue({
      data: {
        user: { id: '11111111-1111-4111-8111-111111111111' },
        properties: {
          hashed_token: 'one-time-token',
          verification_type: 'invite',
        },
      },
      error: null,
    });

    await expect(
      serviceWith(prisma, emails).invite(
        {
          email: 'manager@example.com',
          firstName: 'Taylor',
          lastName: 'Manager',
        },
        'super-admin-1',
      ),
    ).resolves.toMatchObject({
      success: true,
      userId: 'rental-admin-1',
    });

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'invite',
      email: 'manager@example.com',
      options: {
        redirectTo: 'https://rentals.example.com/auth/reset-password',
        data: { firstName: 'Taylor', lastName: 'Manager' },
      },
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        authUserId: '11111111-1111-4111-8111-111111111111',
        email: 'manager@example.com',
        role: Role.TENANT_ADMIN,
        status: 'INVITED',
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'super-admin-1',
        action: 'TENANT_ADMIN_INVITED',
        resource: 'user',
        resourceId: 'rental-admin-1',
        newValue: JSON.stringify({
          email: 'manager@example.com',
          role: Role.TENANT_ADMIN,
        }),
      },
    });
    expect(emails.sendTemplate).toHaveBeenCalledWith(
      'manager@example.com',
      'rental_admin.invited',
      {
        name: 'Taylor Manager',
        url: 'https://rentals.example.com/auth/reset-password?token_hash=one-time-token&type=invite',
      },
      'rental-admin-1',
    );
  });

  it('resends a recovery invitation only for a pending tenant administrator', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rental-admin-2',
          authUserId: '22222222-2222-4222-8222-222222222222',
          email: 'pending@example.com',
          role: Role.TENANT_ADMIN,
          status: 'INVITED',
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const emails = { sendTemplate: jest.fn() };
    mockGetUserById.mockResolvedValue({
      data: {
        user: { user_metadata: { firstName: 'Pending', lastName: 'Admin' } },
      },
      error: null,
    });
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: {
          hashed_token: 'recovery-token',
          verification_type: 'recovery',
        },
      },
      error: null,
    });

    await expect(
      serviceWith(prisma, emails).resendInvitation(
        'rental-admin-2',
        'super-admin-1',
      ),
    ).resolves.toMatchObject({ success: true });

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'pending@example.com',
      options: {
        redirectTo: 'https://rentals.example.com/auth/reset-password',
      },
    });
    expect(emails.sendTemplate).toHaveBeenCalledWith(
      'pending@example.com',
      'rental_admin.invited',
      {
        name: 'Pending Admin',
        url: 'https://rentals.example.com/auth/reset-password?token_hash=recovery-token&type=recovery',
      },
      'rental-admin-2',
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'super-admin-1',
        action: 'TENANT_ADMIN_INVITATION_RESENT',
        resource: 'user',
        resourceId: 'rental-admin-2',
        newValue: JSON.stringify({
          email: 'pending@example.com',
          role: Role.TENANT_ADMIN,
        }),
      },
    });
  });
});
