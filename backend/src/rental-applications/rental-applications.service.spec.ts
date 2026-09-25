import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RentalApplicationDocumentType,
  RentalApplicationFeeStatus,
  RentalApplicationStatus,
} from '@prisma/client';
import { issueRentalApplicationToken } from './rental-application-access';
import { RentalApplicationsService } from './rental-applications.service';

const access = issueRentalApplicationToken();
const application = {
  id: 'application-1',
  status: RentalApplicationStatus.DRAFT,
  feeStatus: RentalApplicationFeeStatus.PENDING,
  applicantAccessTokenHash: access.hash,
  applicantAccessExpiresAt: new Date(Date.now() + 60_000),
  dateOfBirth: new Date('1990-01-01'),
  moveInDate: new Date('2026-09-01'),
  updatedAt: new Date('2026-08-24T12:00:00.000Z'),
  submittedAt: null,
  firstName: 'Alex',
  lastName: 'Applicant',
  email: 'alex@example.com',
  property: { id: 'property-1', name: 'Oakwood' },
  documents: [],
};

function serviceWith(prisma: object) {
  return new RentalApplicationsService(
    prisma as never,
    { sendRentalApplicationSubmitted: jest.fn() } as never,
    { get: jest.fn() } as never,
  );
}

describe('RentalApplicationsService', () => {
  it('never creates an application for an unpublished rental', async () => {
    const prisma = {
      property: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await expect(
      serviceWith(prisma).create({
        propertyId: 'property-1',
        firstName: 'Alex',
        lastName: 'Applicant',
        email: 'alex@example.com',
        phone: '8165550100',
        dateOfBirth: '1990-01-01',
        currentAddress: '1 Main St',
        currentCity: 'Kansas City',
        currentState: 'MO',
        currentZip: '64101',
        moveInDate: '2099-09-01',
        householdSize: 1,
        employmentStatus: 'Full-time employment',
        monthlyGrossIncome: 5000,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a requested move-in date in the past before querying inventory', async () => {
    const prisma = {
      property: { findFirst: jest.fn() },
    };

    await expect(
      serviceWith(prisma).create({
        propertyId: 'property-1',
        firstName: 'Alex',
        lastName: 'Applicant',
        email: 'alex@example.com',
        phone: '8165550100',
        dateOfBirth: '1990-01-01',
        currentAddress: '1 Main St',
        currentCity: 'Kansas City',
        currentState: 'MO',
        currentZip: '64101',
        moveInDate: '2020-01-01',
        householdSize: 1,
        employmentStatus: 'Full-time employment',
        monthlyGrossIncome: 5000,
      }),
    ).rejects.toThrow('Move-in date cannot be in the past');
    expect(prisma.property.findFirst).not.toHaveBeenCalled();
  });

  it('requires the selected unit to be vacant in the authoritative inventory query', async () => {
    const prisma = {
      property: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'property-1',
          units: [],
        }),
      },
    };

    await expect(
      serviceWith(prisma).create({
        propertyId: 'property-1',
        unitId: 'unit-1',
        firstName: 'Alex',
        lastName: 'Applicant',
        email: 'alex@example.com',
        phone: '8165550100',
        dateOfBirth: '1990-01-01',
        currentAddress: '1 Main St',
        currentCity: 'Kansas City',
        currentState: 'MO',
        currentZip: '64101',
        moveInDate: '2099-09-01',
        householdSize: 1,
        employmentStatus: 'Full-time employment',
        monthlyGrossIncome: 5000,
      }),
    ).rejects.toThrow('Selected rental unit is not available');
    expect(prisma.property.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          units: {
            where: {
              id: 'unit-1',
              status: 'vacant',
              rentAmount: { not: null },
              depositAmount: { not: null },
            },
          },
        },
      }),
    );
  });

  it('creates a no-fee application draft and links the latest matching CRM lead', async () => {
    const property = {
      id: 'property-1',
      applicationFeeAmount: new Prisma.Decimal(0),
      units: [{ id: 'unit-1', status: 'vacant' }],
    };
    const publicApplication = { id: 'application-1' };
    const tx = {
      rentalApplication: {
        create: jest.fn().mockResolvedValue({ id: 'application-1' }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      property: { findFirst: jest.fn().mockResolvedValue(property) },
      rentalApplication: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(publicApplication),
      },
      websiteLead: {
        findFirst: jest.fn().mockResolvedValue({ id: 'lead-1' }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<string>) =>
          callback(tx),
      ),
    };

    const result = await serviceWith(prisma).create({
      propertyId: 'property-1',
      unitId: 'unit-1',
      firstName: ' Alex ',
      lastName: ' Applicant ',
      email: 'ALEX@EXAMPLE.COM',
      phone: ' 8165550100 ',
      dateOfBirth: '1990-01-01',
      currentAddress: ' 1 Main St ',
      currentCity: ' Kansas City ',
      currentState: ' MO ',
      currentZip: ' 64101 ',
      moveInDate: '2099-09-01',
      householdSize: 1,
      employmentStatus: ' Full-time employment ',
      monthlyGrossIncome: 5000,
    });

    expect(result.application).toBe(publicApplication);
    expect(result.accessToken).toBeTruthy();
    const createApplication = (
      tx.rentalApplication.create.mock.calls as unknown as Array<
        [
          {
            data: {
              websiteLeadId: string;
              email: string;
              firstName: string;
              feeStatus: RentalApplicationFeeStatus;
            };
          },
        ]
      >
    )[0][0];
    expect(createApplication.data).toMatchObject({
      websiteLeadId: 'lead-1',
      email: 'alex@example.com',
      firstName: 'Alex',
      feeStatus: RentalApplicationFeeStatus.NOT_REQUIRED,
    });
    const audit = (
      tx.auditLog.create.mock.calls as unknown as Array<
        [{ data: { action: string } }]
      >
    )[0][0];
    expect(audit.data.action).toBe('RENTAL_APPLICATION_DRAFT_CREATED');
  });

  it('rejects an expired or incorrect applicant token', async () => {
    const prisma = {
      rentalApplication: {
        findUnique: jest.fn().mockResolvedValue(application),
      },
    };

    await expect(
      serviceWith(prisma).authenticate(application.id, 'incorrect-token-value'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires both ID and income documents before submission', async () => {
    const prisma = {
      rentalApplication: {
        findUnique: jest.fn().mockResolvedValue({
          ...application,
          documents: [{ type: RentalApplicationDocumentType.GOVERNMENT_ID }],
        }),
      },
    };

    await expect(
      serviceWith(prisma).submit(application.id, access.token, {
        certified: true,
        expectedUpdatedAt: application.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not accept the same application twice', async () => {
    const prisma = {
      rentalApplication: {
        findUnique: jest.fn().mockResolvedValue({
          ...application,
          status: RentalApplicationStatus.SUBMITTED,
        }),
      },
    };

    await expect(
      serviceWith(prisma).submit(application.id, access.token, {
        certified: true,
        expectedUpdatedAt: application.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
