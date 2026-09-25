import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ListingType, Prisma } from '@prisma/client';
import { UnitsService } from './units.service';

describe('UnitsService', () => {
  function serviceWith(prisma: object) {
    return new UnitsService(prisma as never);
  }

  function firstArgument(mock: { mock: { calls: unknown[][] } }): unknown {
    return mock.mock.calls[0]?.[0];
  }

  it('bounds and deterministically orders rental units', async () => {
    const rows = [{ id: 'unit-1' }];
    const prisma = { unit: { findMany: jest.fn().mockResolvedValue(rows) } };
    await expect(serviceWith(prisma).findAll()).resolves.toEqual(rows);
    expect(prisma.unit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { property: { listingType: ListingType.RENT } },
        take: 250,
      }),
    );
  });

  it('restricts detail lookup to rental units and rejects missing rows', async () => {
    const unit = { id: 'unit-1' };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(unit)
      .mockResolvedValueOnce(null);
    const service = serviceWith({ unit: { findFirst } });
    await expect(service.findOne(unit.id)).resolves.toEqual(unit);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: unit.id,
          property: { listingType: ListingType.RENT },
        },
      }),
    );
  });

  it('rejects unit creation for a non-rental property', async () => {
    const prisma = {
      property: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    await expect(
      serviceWith(prisma).create('admin-1', {
        propertyId: 'sale-property',
        unitNumber: '1A',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records an occupied unit for a draft rental without starting a lease or publishing', async () => {
    const unit = {
      id: 'unit-1',
      propertyId: 'property-1',
      unitNumber: '1A',
      status: 'occupied',
    };
    const tx = {
      unit: { create: jest.fn().mockResolvedValue(unit) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      property: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'property-1',
          publishStatus: 'DRAFT',
        }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    await expect(
      serviceWith(prisma).create('admin-1', {
        propertyId: 'property-1',
        unitNumber: ' 1A ',
        floor: ' First ',
        status: 'occupied',
        availableDate: '2026-09-01',
        amenities: [' Washer ', 'Dryer', '', 'Washer'],
      }),
    ).resolves.toEqual(unit);
    expect(prisma.property.findFirst).toHaveBeenCalledWith({
      where: { id: 'property-1', listingType: ListingType.RENT },
      select: { id: true },
    });
    expect(firstArgument(tx.unit.create)).toMatchObject({
      data: {
        unitNumber: '1A',
        floor: 'First',
        status: 'occupied',
        availableDate: new Date('2026-09-01'),
        amenities: ['Washer', 'Dryer'],
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
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
  });

  it('maps unique unit-number failures to a safe conflict', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6.2.1',
    });
    const prisma = {
      property: {
        findFirst: jest.fn().mockResolvedValue({ id: 'property-1' }),
      },
      $transaction: jest.fn().mockRejectedValue(duplicate),
    };
    await expect(
      serviceWith(prisma).create('admin-1', {
        propertyId: 'property-1',
        unitNumber: '1A',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates a unit and records its status transition atomically', async () => {
    const current = { id: 'unit-1', status: 'vacant' };
    const updated = {
      ...current,
      status: 'under_maintenance',
      floor: 'Second',
    };
    const tx = {
      unit: { update: jest.fn().mockResolvedValue(updated) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      unit: { findFirst: jest.fn().mockResolvedValue(current) },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    await expect(
      serviceWith(prisma).update('admin-1', current.id, {
        status: 'under_maintenance',
        floor: ' Second ',
        amenities: [' Microwave ', 'Microwave', ''],
      }),
    ).resolves.toEqual(updated);
    expect(firstArgument(tx.unit.update)).toMatchObject({
      data: { floor: 'Second', amenities: ['Microwave'] },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'RENTAL_UNIT_UPDATED',
        resource: 'unit',
        resourceId: current.id,
        oldValue: JSON.stringify({ status: 'vacant' }),
        newValue: JSON.stringify({ status: 'under_maintenance' }),
      },
    });
  });

  it('keeps occupied status under lease workflow control', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'unit-1', status: 'vacant' })
      .mockResolvedValueOnce({ id: 'unit-2', status: 'occupied' });
    const prisma = {
      unit: { findFirst },
      $transaction: jest.fn(),
    };
    const service = serviceWith(prisma);

    await expect(
      service.update('admin-1', 'unit-1', { status: 'occupied' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update('admin-1', 'unit-2', { status: 'vacant' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps reserved status under the signing workflow control', async () => {
    const prisma = {
      unit: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'unit-1', status: 'reserved' }),
      },
      $transaction: jest.fn(),
    };

    await expect(
      serviceWith(prisma).update('admin-1', 'unit-1', { status: 'vacant' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('protects unit history from deletion', async () => {
    const prisma = {
      unit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'unit-1',
          propertyId: 'property-1',
          unitNumber: '1A',
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          _count: {
            tenants: 1,
            leases: 0,
            payments: 0,
            maintenanceRequests: 0,
          },
        }),
      },
      $transaction: jest.fn(),
    };
    await expect(
      serviceWith(prisma).remove('admin-1', 'unit-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('audits before deleting an unused unit in one transaction', async () => {
    const unit = {
      id: 'unit-1',
      propertyId: 'property-1',
      unitNumber: '1A',
    };
    const tx = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      unit: { delete: jest.fn().mockResolvedValue(unit) },
    };
    const prisma = {
      unit: {
        findFirst: jest.fn().mockResolvedValue(unit),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          _count: {
            tenants: 0,
            leases: 0,
            payments: 0,
            maintenanceRequests: 0,
          },
        }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    await expect(
      serviceWith(prisma).remove('admin-1', unit.id),
    ).resolves.toEqual({ deleted: true });
    expect(tx.auditLog.create.mock.invocationCallOrder[0]).toBeLessThan(
      tx.unit.delete.mock.invocationCallOrder[0],
    );
  });
});
