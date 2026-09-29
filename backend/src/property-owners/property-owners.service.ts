import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EmailsService } from '../emails/emails.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeClient } from '../stripe/stripe-client.service';
import {
  CreatePropertyOwnerDto,
  UpdatePropertyOwnerDto,
} from './dto/property-owner.dto';

const ownerSelect = {
  id: true,
  ownerName: true,
  companyName: true,
  contactEmail: true,
  contactPhone: true,
  commissionRate: true,
  stripeConnectedAccountId: true,
  payoutStatus: true,
  stripeAccountLastSyncedAt: true,
  onboardedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { properties: true, payments: true } },
} satisfies Prisma.PropertyOwnerSelect;

@Injectable()
export class PropertyOwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeClient,
    private readonly emails: EmailsService,
    private readonly config: ConfigService,
  ) {}

  async findAll() {
    return this.prisma.propertyOwner.findMany({
      select: ownerSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
  }

  async findOne(id: string) {
    const owner = await this.prisma.propertyOwner.findUnique({
      where: { id },
      select: ownerSelect,
    });
    if (!owner) throw new NotFoundException('Property owner not found');
    return owner;
  }

  async create(userId: string, data: CreatePropertyOwnerDto) {
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.propertyOwner.create({
        data: {
          ...data,
          contactEmail: data.contactEmail.trim().toLowerCase(),
        },
        select: ownerSelect,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PROPERTY_OWNER_CREATED',
          resource: 'property_owner',
          resourceId: owner.id,
          newValue: JSON.stringify({ commissionRate: owner.commissionRate }),
        },
      });
      return owner;
    });
  }

  async update(userId: string, id: string, data: UpdatePropertyOwnerDto) {
    const current = await this.findOne(id);
    const changed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.propertyOwner.updateMany({
        where: { id, updatedAt: current.updatedAt },
        data: {
          ...data,
          contactEmail: data.contactEmail?.trim().toLowerCase(),
        },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          'Property owner changed; refresh and retry',
        );
      }
      const owner = await tx.propertyOwner.findUniqueOrThrow({
        where: { id },
        select: ownerSelect,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PROPERTY_OWNER_UPDATED',
          resource: 'property_owner',
          resourceId: id,
          oldValue: JSON.stringify({
            commissionRate: current.commissionRate,
            contactEmail: current.contactEmail,
          }),
          newValue: JSON.stringify({
            commissionRate: owner.commissionRate,
            contactEmail: owner.contactEmail,
          }),
        },
      });
      return owner;
    });
    return changed;
  }

  async remove(userId: string, id: string) {
    const owner = await this.prisma.propertyOwner.findUnique({
      where: { id },
      select: {
        id: true,
        ownerName: true,
        companyName: true,
        stripeConnectedAccountId: true,
        _count: {
          select: {
            properties: true,
            payments: true,
            moveInCharges: true,
            moveInInspections: true,
            moveInAcknowledgements: true,
            expenseLedgerEntries: true,
          },
        },
      },
    });
    if (!owner) throw new NotFoundException('Property owner not found');
    if (owner.stripeConnectedAccountId) {
      throw new ConflictException(
        'This owner has a connected payout account. Disable or disconnect payouts before deleting the owner.',
      );
    }
    const linkedRecords = Object.entries(owner._count).filter(
      ([, count]) => count > 0,
    );
    if (linkedRecords.length > 0) {
      throw new ConflictException(
        'This owner has linked properties or financial history and cannot be deleted. Remove those links first.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PROPERTY_OWNER_DELETED',
          resource: 'property_owner',
          resourceId: id,
          oldValue: JSON.stringify({
            ownerName: owner.ownerName,
            companyName: owner.companyName,
          }),
        },
      });
      await tx.propertyOwner.delete({ where: { id } });
    });
    return { deleted: true };
  }

  private onboardingUrls(ownerId: string) {
    const base =
      this.config.get<string>('RENTAL_ADMIN_URL') ||
      this.config.get<string>('FRONTEND_URL') ||
      'http://localhost:3000';
    const url = new URL('/admin/owners', base);
    const ownerQuery = encodeURIComponent(ownerId);
    return {
      refreshUrl: `${url.toString()}?onboarding=retry&owner=${ownerQuery}`,
      returnUrl: `${url.toString()}?onboarding=complete&owner=${ownerQuery}`,
    };
  }

  async inviteToStripeOnboarding(userId: string, id: string) {
    const owner = await this.findOne(id);
    let accountId = owner.stripeConnectedAccountId;
    if (!accountId) {
      const account = await this.stripe.createMerchantAccount({
        ownerId: owner.id,
        email: owner.contactEmail,
        businessName: owner.companyName ?? owner.ownerName,
        idempotencyKey: `property-owner-account-${owner.id}`,
      });
      accountId = account.id;
      await this.prisma.$transaction(async (tx) => {
        await tx.propertyOwner.update({
          where: { id },
          data: { stripeConnectedAccountId: accountId },
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: 'PROPERTY_OWNER_STRIPE_ACCOUNT_CREATED',
            resource: 'property_owner',
            resourceId: id,
            newValue: JSON.stringify({ stripeConnectedAccountId: accountId }),
          },
        });
      });
    }
    const urls = this.onboardingUrls(owner.id);
    const link = await this.stripe.createAccountOnboardingLink({
      accountId,
      ...urls,
      idempotencyKey: `property-owner-onboarding-${owner.id}-${randomUUID()}`,
    });
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'PROPERTY_OWNER_STRIPE_ONBOARDING_INVITED',
        resource: 'property_owner',
        resourceId: id,
        newValue: JSON.stringify({ stripeConnectedAccountId: accountId }),
      },
    });
    await this.emails.sendOwnerStripeOnboardingInvitation(
      owner.contactEmail,
      {
        name: owner.ownerName ?? owner.companyName ?? 'Property owner',
        url: link.url,
      },
      `${owner.id}-${accountId}`,
    );
    return { ...(await this.findOne(id)), invitationSent: true };
  }
}
