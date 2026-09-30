import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { Role, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { getPortalUrls } from '../common/config/portal-urls';
import { EmailsService } from '../emails/emails.service';
import { PrismaService } from '../prisma/prisma.service';
import { createAuthActionUrl } from './auth-action-url';
import { TenantAdminInviteDto } from './dto/tenant-admin-invite.dto';

const STAFF_ROLES = [Role.SUPER_ADMIN, Role.SALES_ADMIN, Role.TENANT_ADMIN];

@Injectable()
export class TenantAdminProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emails: EmailsService,
  ) {}

  private adminClient() {
    const url = this.configService.get<string>('SUPABASE_URL');
    const secretKey = this.configService.get<string>('SUPABASE_SECRET_KEY');
    if (!url || !secretKey) {
      throw new InternalServerErrorException(
        'Supabase server credentials are not configured',
      );
    }
    return createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async invite(data: TenantAdminInviteDto, superAdminId: string) {
    const email = data.email.trim().toLowerCase();
    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const redirectTo = `${getPortalUrls(this.configService).rentalAdmin}/auth/reset-password`;
    const { data: invited, error } =
      await this.adminClient().auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo,
          data: { firstName, lastName },
        },
      });
    const actionUrl = createAuthActionUrl(redirectTo, invited.properties);
    if (error || !invited.user || !actionUrl) {
      throw new BadRequestException(
        error?.message || 'Unable to invite tenant administrator',
      );
    }

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            authUserId: invited.user.id,
            email,
            role: Role.TENANT_ADMIN,
            status: UserStatus.INVITED,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: superAdminId,
            action: 'TENANT_ADMIN_INVITED',
            resource: 'user',
            resourceId: user.id,
            newValue: JSON.stringify({ email, role: Role.TENANT_ADMIN }),
          },
        });
        return user;
      });
      await this.emails.sendTemplate(
        email,
        'rental_admin.invited',
        {
          name: `${firstName} ${lastName}`,
          url: actionUrl,
        },
        user.id,
      );
      return {
        success: true,
        message: 'Tenant administrator invitation sent',
        userId: user.id,
      };
    } catch (error) {
      await this.adminClient().auth.admin.deleteUser(invited.user.id);
      throw error;
    }
  }

  async resendInvitation(userId: string, superAdminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        authUserId: true,
        email: true,
        role: true,
        status: true,
      },
    });
    if (!user || user.role !== Role.TENANT_ADMIN) {
      throw new BadRequestException('Tenant administrator account not found');
    }
    if (user.status !== UserStatus.INVITED) {
      throw new BadRequestException(
        'A new invitation can only be sent while the account is pending.',
      );
    }

    const redirectTo = `${getPortalUrls(this.configService).rentalAdmin}/auth/reset-password`;
    const admin = this.adminClient().auth.admin;
    const { data: authUserData } = await admin.getUserById(user.authUserId);
    const metadata = authUserData.user?.user_metadata;
    const firstName =
      metadata && typeof metadata.firstName === 'string'
        ? metadata.firstName
        : metadata && typeof metadata.first_name === 'string'
          ? metadata.first_name
          : '';
    const lastName =
      metadata && typeof metadata.lastName === 'string'
        ? metadata.lastName
        : metadata && typeof metadata.last_name === 'string'
          ? metadata.last_name
          : '';
    const { data: link, error } = await admin.generateLink({
      type: 'recovery',
      email: user.email,
      options: { redirectTo },
    });
    const actionUrl = createAuthActionUrl(redirectTo, link.properties);
    if (error || !actionUrl) {
      throw new BadRequestException(
        error?.message || 'Unable to create a new administrator invitation',
      );
    }

    await this.emails.sendTemplate(
      user.email,
      'rental_admin.invited',
      {
        name: `${firstName} ${lastName}`.trim() || user.email,
        url: actionUrl,
      },
      `${user.id}/resend/${randomUUID()}`,
    );
    await this.prisma.auditLog.create({
      data: {
        userId: superAdminId,
        action: 'TENANT_ADMIN_INVITATION_RESENT',
        resource: 'user',
        resourceId: user.id,
        newValue: JSON.stringify({ email: user.email, role: user.role }),
      },
    });

    return {
      success: true,
      message: 'Tenant administrator invitation sent again',
    };
  }

  async listStaff() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      select: {
        id: true,
        authUserId: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 250,
    });
    const authUsers = await this.adminClient().auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authUsers.error) {
      throw new BadRequestException('Unable to load staff account details');
    }
    const authById = new Map(
      authUsers.data.users.map((user) => [user.id, user]),
    );
    return users.map((user) => {
      const authUser = authById.get(user.authUserId);
      const metadata = authUser?.user_metadata;
      const firstName =
        metadata && typeof metadata.firstName === 'string'
          ? metadata.firstName
          : metadata && typeof metadata.first_name === 'string'
            ? metadata.first_name
            : null;
      const lastName =
        metadata && typeof metadata.lastName === 'string'
          ? metadata.lastName
          : metadata && typeof metadata.last_name === 'string'
            ? metadata.last_name
            : null;
      return {
        id: user.id,
        firstName,
        lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastSignInAt: authUser?.last_sign_in_at ?? null,
      };
    });
  }
}
