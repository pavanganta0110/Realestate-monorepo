import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailsService } from '../emails/emails.service';
import {
  SendTenantMessageDto,
  TenantMessagePageDto,
} from './dto/tenant-message.dto';

const DEFAULT_THREAD_LIMIT = 50;
const DEFAULT_INBOX_LIMIT = 25;
const messageInclude = {
  sender: { select: { id: true, email: true, role: true } },
  receiver: { select: { id: true, email: true, role: true } },
} satisfies Prisma.MessageInclude;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
  ) {}

  private pageSize(requested: number | undefined, fallback: number) {
    return Math.min(Math.max(requested ?? fallback, 1), 100);
  }

  private async tenantForUser(userId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true } },
        unit: {
          include: { property: { select: { id: true, name: true } } },
        },
      },
    });
    if (!tenant?.user) throw new NotFoundException('Tenant profile not found');
    return { ...tenant, user: tenant.user };
  }

  private async tenantThread(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        user: { select: { id: true, email: true } },
        unit: {
          include: { property: { select: { id: true, name: true } } },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant thread not found');
    return tenant;
  }

  private async messagesPage(
    tenantId: string,
    page: TenantMessagePageDto = {},
  ) {
    const limit = this.pageSize(page.limit, DEFAULT_THREAD_LIMIT);
    const rows = await this.prisma.message.findMany({
      where: { tenantId },
      include: messageInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? (pageItems[pageItems.length - 1]?.id ?? null)
      : null;
    return { items: pageItems.reverse(), nextCursor };
  }

  async getForTenant(userId: string, page: TenantMessagePageDto = {}) {
    const tenant = await this.tenantForUser(userId);
    return {
      tenant: {
        id: tenant.id,
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        unit: tenant.unit,
      },
      ...(await this.messagesPage(tenant.id, page)),
    };
  }

  async sendFromTenant(userId: string, data: SendTenantMessageDto) {
    const tenant = await this.tenantForUser(userId);
    const manager = await this.prisma.user.findFirst({
      where: { role: Role.TENANT_ADMIN, status: UserStatus.ACTIVE },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, email: true },
    });
    if (!manager) {
      throw new ServiceUnavailableException(
        'No active rental administrator is available',
      );
    }
    const message = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          senderId: tenant.user.id,
          receiverId: manager.id,
          tenantId: tenant.id,
          subject: data.subject?.trim() || 'Tenant support',
          body: data.body.trim(),
        },
      });
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { lastMessageAt: message.createdAt },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'TENANT_MESSAGE_SENT',
          resource: 'tenant_message_thread',
          resourceId: tenant.id,
          newValue: JSON.stringify({ messageId: message.id }),
        },
      });
      return message;
    });
    await this.emails.sendTenantMessageToAdmin(
      manager.email,
      {
        tenantName: `${tenant.firstName} ${tenant.lastName}`,
        subject: message.subject,
        propertyName: tenant.unit?.property.name,
      },
      message.id,
    );
    return this.getForTenant(userId);
  }

  async markReadForTenant(userId: string) {
    const tenant = await this.tenantForUser(userId);
    const now = new Date();
    const count = await this.prisma.$transaction(async (tx) => {
      const marked = await tx.message.updateMany({
        where: {
          tenantId: tenant.id,
          receiverId: tenant.user.id,
          readAt: null,
        },
        data: { isRead: true, readAt: now },
      });
      if (marked.count > 0) {
        await tx.auditLog.create({
          data: {
            userId,
            action: 'TENANT_MESSAGES_READ',
            resource: 'tenant_message_thread',
            resourceId: tenant.id,
            newValue: JSON.stringify({ count: marked.count }),
          },
        });
      }
      return marked.count;
    });
    return { markedRead: count };
  }

  async listForAdmin(page: TenantMessagePageDto = {}) {
    const limit = this.pageSize(page.limit, DEFAULT_INBOX_LIMIT);
    const rows = await this.prisma.tenant.findMany({
      where: { lastMessageAt: { not: null } },
      include: {
        user: { select: { id: true, email: true } },
        unit: {
          include: { property: { select: { id: true, name: true } } },
        },
        messages: {
          include: messageInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        _count: {
          select: {
            messages: {
              where: { readAt: null, sender: { role: Role.TENANT } },
            },
          },
        },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map((tenant) => ({
        id: tenant.id,
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        email: tenant.email,
        status: tenant.status,
        unit: tenant.unit,
        lastMessageAt: tenant.lastMessageAt,
        lastMessage: tenant.messages[0] ?? null,
        unreadCount: tenant._count.messages,
      })),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async getForAdmin(tenantId: string, page: TenantMessagePageDto = {}) {
    const tenant = await this.tenantThread(tenantId);
    return {
      tenant: {
        id: tenant.id,
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        email: tenant.email,
        status: tenant.status,
        unit: tenant.unit,
      },
      ...(await this.messagesPage(tenant.id, page)),
    };
  }

  async sendFromAdmin(
    userId: string,
    tenantId: string,
    data: SendTenantMessageDto,
  ) {
    const tenant = await this.tenantThread(tenantId);
    const tenantUser = tenant.user;
    if (!tenantUser) {
      throw new ServiceUnavailableException(
        'This tenant does not have a linked portal account yet',
      );
    }
    const message = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          senderId: userId,
          receiverId: tenantUser.id,
          tenantId: tenant.id,
          subject: data.subject?.trim() || 'Coach Johnson Realty',
          body: data.body.trim(),
        },
      });
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { lastMessageAt: message.createdAt },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'TENANT_CHAT_SENT',
          resource: 'tenant_message_thread',
          resourceId: tenant.id,
          newValue: JSON.stringify({ messageId: message.id }),
        },
      });
      return message;
    });
    await this.emails.sendAdminReplyToTenant(
      tenant.email,
      {
        name: `${tenant.firstName} ${tenant.lastName}`,
        subject: message.subject,
      },
      message.id,
    );
    return this.getForAdmin(tenantId);
  }

  async markReadForAdmin(userId: string, tenantId: string) {
    const tenant = await this.tenantThread(tenantId);
    const tenantUser = tenant.user;
    if (!tenantUser) return { markedRead: 0 };
    const now = new Date();
    const count = await this.prisma.$transaction(async (tx) => {
      const marked = await tx.message.updateMany({
        where: { tenantId, senderId: tenantUser.id, readAt: null },
        data: { isRead: true, readAt: now },
      });
      if (marked.count > 0) {
        await tx.auditLog.create({
          data: {
            userId,
            action: 'TENANT_ADMIN_MESSAGES_READ',
            resource: 'tenant_message_thread',
            resourceId: tenantId,
            newValue: JSON.stringify({ count: marked.count }),
          },
        });
      }
      return marked.count;
    });
    return { markedRead: count };
  }
}
