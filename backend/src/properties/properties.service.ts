import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListingType, Prisma, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailsService } from '../emails/emails.service';
import {
  RentalPropertyDto,
  UpdateRentalPropertyDto,
} from './dto/rental-property.dto';
import { RentalPhotoService } from './rental-photo.service';

const rentalInclude = {
  owner: {
    select: {
      id: true,
      ownerName: true,
      companyName: true,
      contactEmail: true,
    },
  },
  units: { orderBy: [{ unitNumber: 'asc' as const }] },
} satisfies Prisma.PropertyInclude;

const publicRentalSelect = {
  id: true,
  name: true,
  address: true,
  city: true,
  state: true,
  zip: true,
  propertyType: true,
  description: true,
  rentAmount: true,
  applicationFeeAmount: true,
  bedrooms: true,
  bathrooms: true,
  squareFeet: true,
  availabilityDate: true,
  amenities: true,
  utilityInfo: true,
  photos: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  units: {
    where: {
      status: 'vacant',
      rentAmount: { not: null },
      depositAmount: { not: null },
    },
    select: {
      id: true,
      unitNumber: true,
      bedrooms: true,
      bathrooms: true,
      squareFeet: true,
      rentAmount: true,
      depositAmount: true,
      availableDate: true,
      amenities: true,
    },
    orderBy: [{ rentAmount: 'asc' as const }, { unitNumber: 'asc' as const }],
  },
} satisfies Prisma.PropertySelect;

const leaseDashboardInclude = {
  tenant: { select: { firstName: true, lastName: true } },
  unit: {
    include: { property: { select: { name: true } } },
  },
} satisfies Prisma.LeaseInclude;

type RentalWithUnits = Prisma.PropertyGetPayload<{
  include: typeof rentalInclude;
}>;

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly rentalPhotos: RentalPhotoService,
  ) {}

  private async rental(id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, listingType: ListingType.RENT },
      include: rentalInclude,
    });
    if (!property) throw new NotFoundException('Rental property not found');
    return property;
  }

  private async assertOwner(ownerId: string | undefined) {
    if (!ownerId) return;
    const owner = await this.prisma.propertyOwner.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!owner) throw new BadRequestException('Property owner not found');
  }

  private assertPublishable(property: RentalWithUnits) {
    if (!property.description?.trim()) {
      throw new BadRequestException(
        'Add a property description before publishing',
      );
    }
    if (property.photos.length === 0) {
      throw new BadRequestException(
        'Add at least one listing photo before publishing',
      );
    }
    const availableUnits = property.units.filter(
      (unit) => unit.status === 'vacant' && unit.rentAmount != null,
    );
    if (
      property.status === 'active' &&
      property.rentAmount == null &&
      availableUnits.length === 0
    ) {
      throw new BadRequestException(
        'Add a property rent amount or at least one vacant unit with rent before publishing',
      );
    }
  }

  async findAll() {
    return this.prisma.property.findMany({
      where: { listingType: ListingType.RENT },
      include: rentalInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }

  async getRentalDashboard() {
    const now = new Date();
    const renewalWindow = new Date(now);
    renewalWindow.setDate(renewalWindow.getDate() + 60);
    const [
      properties,
      published,
      units,
      occupiedUnits,
      activeTenants,
      openMaintenance,
      recentMaintenance,
      upcomingLeases,
    ] = await Promise.all([
      this.prisma.property.count({ where: { listingType: ListingType.RENT } }),
      this.prisma.property.count({
        where: {
          listingType: ListingType.RENT,
          publishStatus: PublishStatus.PUBLISHED,
        },
      }),
      this.prisma.unit.count({
        where: { property: { listingType: ListingType.RENT } },
      }),
      this.prisma.unit.count({
        where: {
          status: 'occupied',
          property: { listingType: ListingType.RENT },
        },
      }),
      this.prisma.tenant.count({ where: { status: 'active' } }),
      this.prisma.maintenanceRequest.count({
        where: { status: { notIn: ['completed', 'tenant_confirmed'] } },
      }),
      this.prisma.maintenanceRequest.findMany({
        include: {
          tenant: { select: { firstName: true, lastName: true } },
          unit: { select: { unitNumber: true } },
          property: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
      this.prisma.lease.findMany({
        where: {
          status: { in: ['active', 'expiring', 'renewed'] },
          endDate: { gte: now, lte: renewalWindow },
        },
        include: leaseDashboardInclude,
        orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
        take: 8,
      }),
    ]);
    return {
      metrics: {
        properties,
        published,
        units,
        occupiedUnits,
        activeTenants,
        openMaintenance,
      },
      recentMaintenance,
      upcomingLeases,
    };
  }

  async findOne(id: string) {
    return this.rental(id);
  }

  async findPublicRentals() {
    return this.prisma.property.findMany({
      where: {
        listingType: ListingType.RENT,
        publishStatus: PublishStatus.PUBLISHED,
        status: { in: ['active', 'rented'] },
      },
      select: publicRentalSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }

  async findPublicRental(id: string) {
    const property = await this.prisma.property.findFirst({
      where: {
        id,
        listingType: ListingType.RENT,
        publishStatus: PublishStatus.PUBLISHED,
        status: { in: ['active', 'rented'] },
      },
      select: publicRentalSelect,
    });
    if (!property) throw new NotFoundException('Rental property not found');
    return property;
  }

  async create(userId: string, data: RentalPropertyDto) {
    await this.assertOwner(data.ownerId);
    return this.prisma.$transaction(async (tx) => {
      const property = await tx.property.create({
        data: {
          ...data,
          availabilityDate: data.availabilityDate
            ? new Date(data.availabilityDate)
            : undefined,
          listingType: ListingType.RENT,
          listingStatus: null,
          publishStatus: PublishStatus.DRAFT,
          agentId: null,
          submittedAt: null,
          reviewedAt: null,
          reviewedByUserId: null,
          rejectionReason: null,
        },
        include: rentalInclude,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'RENTAL_PROPERTY_CREATED',
          resource: 'property',
          resourceId: property.id,
          newValue: JSON.stringify({ publishStatus: property.publishStatus }),
        },
      });
      return property;
    });
  }

  async update(userId: string, id: string, data: UpdateRentalPropertyDto) {
    const current = await this.rental(id);
    await this.assertOwner(data.ownerId);
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.property.updateMany({
        where: {
          id,
          listingType: ListingType.RENT,
          updatedAt: current.updatedAt,
        },
        data: {
          ...data,
          availabilityDate: data.availabilityDate
            ? new Date(data.availabilityDate)
            : undefined,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Property changed; refresh and retry');
      }
      const property = await tx.property.findUniqueOrThrow({
        where: { id },
        include: rentalInclude,
      });
      if (property.publishStatus === PublishStatus.PUBLISHED) {
        this.assertPublishable(property);
      }
      await tx.auditLog.create({
        data: {
          userId,
          action: 'RENTAL_PROPERTY_UPDATED',
          resource: 'property',
          resourceId: id,
          oldValue: JSON.stringify({ updatedAt: current.updatedAt }),
          newValue: JSON.stringify({ updatedAt: property.updatedAt }),
        },
      });
      return property;
    });
  }

  async publish(userId: string, id: string) {
    const current = await this.rental(id);
    if (current.publishStatus === PublishStatus.PUBLISHED) return current;
    this.assertPublishable(current);
    const property = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.property.updateMany({
        where: {
          id,
          listingType: ListingType.RENT,
          publishStatus: current.publishStatus,
        },
        data: {
          publishStatus: PublishStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Publish state changed; refresh and retry');
      }
      const property = await tx.property.findUniqueOrThrow({
        where: { id },
        include: rentalInclude,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'RENTAL_PROPERTY_PUBLISHED',
          resource: 'property',
          resourceId: id,
          oldValue: JSON.stringify({ publishStatus: current.publishStatus }),
          newValue: JSON.stringify({ publishStatus: property.publishStatus }),
        },
      });
      return property;
    });
    if (property.owner) {
      await this.emails.sendRentalPublished(
        property.owner.contactEmail,
        property.owner.ownerName ??
          property.owner.companyName ??
          'Property owner',
        property.name,
        property.address,
        property.id,
        true,
      );
    }
    return property;
  }

  async unpublish(userId: string, id: string) {
    const current = await this.rental(id);
    if (current.publishStatus === PublishStatus.UNPUBLISHED) return current;
    const property = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.property.updateMany({
        where: {
          id,
          listingType: ListingType.RENT,
          publishStatus: current.publishStatus,
        },
        data: { publishStatus: PublishStatus.UNPUBLISHED },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Publish state changed; refresh and retry');
      }
      const property = await tx.property.findUniqueOrThrow({
        where: { id },
        include: rentalInclude,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'RENTAL_PROPERTY_UNPUBLISHED',
          resource: 'property',
          resourceId: id,
          oldValue: JSON.stringify({ publishStatus: current.publishStatus }),
          newValue: JSON.stringify({ publishStatus: property.publishStatus }),
        },
      });
      return property;
    });
    if (property.owner) {
      await this.emails.sendRentalPublished(
        property.owner.contactEmail,
        property.owner.ownerName ??
          property.owner.companyName ??
          'Property owner',
        property.name,
        property.address,
        property.id,
        false,
      );
    }
    return property;
  }

  async remove(userId: string, id: string) {
    const property = await this.rental(id);
    if (property.publishStatus === PublishStatus.PUBLISHED) {
      throw new ConflictException('Unpublish the rental before deleting it');
    }
    if (property.units.length > 0) {
      throw new ConflictException(
        'Remove all units before deleting the rental',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId,
          action: 'RENTAL_PROPERTY_DELETED',
          resource: 'property',
          resourceId: id,
          oldValue: JSON.stringify({ name: property.name }),
        },
      });
      await tx.property.delete({ where: { id } });
    });
    await this.rentalPhotos.removePropertyPhotos(id, property.photos);
    return { deleted: true };
  }
}
