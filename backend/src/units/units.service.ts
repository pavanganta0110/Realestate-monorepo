import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListingType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto';

const unitInclude = {
  property: {
    select: { id: true, name: true, publishStatus: true, status: true },
  },
  tenants: {
    where: { status: { in: ['invited', 'active'] } },
    select: { id: true, firstName: true, lastName: true, status: true },
  },
} satisfies Prisma.UnitInclude;

function normalizeAmenities(amenities?: string[]) {
  return [
    ...new Set(amenities?.map((item) => item.trim()).filter(Boolean) ?? []),
  ];
}

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  private async rentalProperty(propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, listingType: ListingType.RENT },
      select: { id: true },
    });
    if (!property) throw new BadRequestException('Rental property not found');
  }

  async findAll() {
    return this.prisma.unit.findMany({
      where: { property: { listingType: ListingType.RENT } },
      include: unitInclude,
      orderBy: [
        { property: { name: 'asc' } },
        { unitNumber: 'asc' },
        { id: 'asc' },
      ],
      take: 250,
    });
  }

  async findOne(id: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, property: { listingType: ListingType.RENT } },
      include: unitInclude,
    });
    if (!unit) throw new NotFoundException('Rental unit not found');
    return unit;
  }

  async create(userId: string, data: CreateUnitDto) {
    await this.rentalProperty(data.propertyId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.create({
          data: {
            ...data,
            amenities: normalizeAmenities(data.amenities),
            unitNumber: data.unitNumber.trim(),
            floor: data.floor?.trim(),
            availableDate: data.availableDate
              ? new Date(data.availableDate)
              : undefined,
          },
          include: unitInclude,
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: 'RENTAL_UNIT_CREATED',
            resource: 'unit',
            resourceId: unit.id,
            newValue: JSON.stringify({
              propertyId: unit.propertyId,
              unitNumber: unit.unitNumber,
              status: unit.status,
            }),
          },
        });
        return unit;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'That unit number already exists at this property',
        );
      }
      throw error;
    }
  }

  async update(userId: string, id: string, data: UpdateUnitDto) {
    const current = await this.findOne(id);
    if (data.propertyId) await this.rentalProperty(data.propertyId);
    if (
      data.status !== undefined &&
      (['occupied', 'reserved'].includes(current.status) ||
        ['occupied', 'reserved'].includes(data.status))
    ) {
      throw new ConflictException(
        'Occupied and reserved statuses are controlled automatically by the lease workflow',
      );
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.update({
          where: { id },
          data: {
            ...data,
            ...(data.amenities !== undefined
              ? { amenities: normalizeAmenities(data.amenities) }
              : {}),
            unitNumber: data.unitNumber?.trim(),
            floor: data.floor?.trim(),
            availableDate: data.availableDate
              ? new Date(data.availableDate)
              : undefined,
          },
          include: unitInclude,
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: 'RENTAL_UNIT_UPDATED',
            resource: 'unit',
            resourceId: id,
            oldValue: JSON.stringify({ status: current.status }),
            newValue: JSON.stringify({ status: unit.status }),
          },
        });
        return unit;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'That unit number already exists at this property',
        );
      }
      throw error;
    }
  }

  async remove(userId: string, id: string) {
    const unit = await this.findOne(id);
    const dependencies = await this.prisma.unit.findUniqueOrThrow({
      where: { id },
      select: {
        _count: {
          select: {
            tenants: true,
            leases: true,
            payments: true,
            maintenanceRequests: true,
          },
        },
      },
    });
    if (Object.values(dependencies._count).some((count) => count > 0)) {
      throw new ConflictException(
        'This unit has tenant or lease history and cannot be deleted',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId,
          action: 'RENTAL_UNIT_DELETED',
          resource: 'unit',
          resourceId: id,
          oldValue: JSON.stringify({
            propertyId: unit.propertyId,
            unitNumber: unit.unitNumber,
          }),
        },
      });
      await tx.unit.delete({ where: { id } });
    });
    return { deleted: true };
  }
}
