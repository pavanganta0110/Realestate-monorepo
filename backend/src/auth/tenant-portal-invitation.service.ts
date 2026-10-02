import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { EmailsService } from '../emails/emails.service';
import { PrismaService } from '../prisma/prisma.service';
import { createAuthActionUrl } from './auth-action-url';
import { getPortalUrls } from '../common/config/portal-urls';

@Injectable()
export class TenantPortalInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emails: EmailsService,
  ) {}

  private adminClient() {
    const url = this.config.get<string>('SUPABASE_URL');
    const secretKey = this.config.get<string>('SUPABASE_SECRET_KEY');
    if (!url || !secretKey) {
      throw new InternalServerErrorException(
        'Supabase server credentials are not configured',
      );
    }
    return createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async invite(tenantId: string, adminId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { user: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.user?.status === UserStatus.ACTIVE) {
      throw new BadRequestException(
        'This tenant already has an active portal account. Send the dashboard sign-in email instead.',
      );
    }

    const email = tenant.email.trim().toLowerCase();
    const redirectTo = `${getPortalUrls(this.config).tenant}/auth/reset-password`;
    const type = tenant.user ? 'recovery' : 'invite';
    const { data, error } = await this.adminClient().auth.admin.generateLink({
      type,
      email,
      options: {
        redirectTo,
        ...(type === 'invite'
          ? { data: { firstName: tenant.firstName, lastName: tenant.lastName } }
          : {}),
      },
    });
    const actionUrl = createAuthActionUrl(redirectTo, data.properties);
    if (error || !data.user || !actionUrl) {
      throw new BadRequestException(
        error?.message || 'Unable to create the tenant portal setup link',
      );
    }

    try {
      if (!tenant.user) {
        await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              authUserId: data.user.id,
              email,
              role: Role.TENANT,
              status: UserStatus.INVITED,
            },
          });
          await tx.tenant.update({
            where: { id: tenant.id },
            data: { userId: user.id },
          });
          await tx.auditLog.create({
            data: {
              userId: adminId,
              action: 'TENANT_PORTAL_INVITED',
              resource: 'tenant',
              resourceId: tenant.id,
              newValue: JSON.stringify({ email }),
            },
          });
        });
      } else {
        await this.prisma.auditLog.create({
          data: {
            userId: adminId,
            action: 'TENANT_PORTAL_INVITE_RESENT',
            resource: 'tenant',
            resourceId: tenant.id,
            newValue: JSON.stringify({ email }),
          },
        });
      }

      const emailLog = await this.emails.sendTemplate(
        email,
        'tenant.invited',
        { name: `${tenant.firstName} ${tenant.lastName}`, url: actionUrl },
        `${tenant.id}/portal-setup/${randomUUID()}`,
        { tenantId: tenant.id },
      );
      return {
        success: true,
        message: tenant.user
          ? 'Portal account setup email sent again'
          : 'Portal account setup email sent',
        tenantId: tenant.id,
        emailStatus: emailLog?.status ?? 'NOT_CONFIGURED',
      };
    } catch (error) {
      if (!tenant.user) await this.adminClient().auth.admin.deleteUser(data.user.id);
      throw error;
    }
  }
}
