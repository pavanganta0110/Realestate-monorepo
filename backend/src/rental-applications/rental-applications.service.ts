import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ListingType,
  Prisma,
  PublishStatus,
  RentalApplicationDocumentType,
  RentalApplicationFeeStatus,
  RentalApplicationStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { getPortalUrls } from '../common/config/portal-urls';
import { EmailsService } from '../emails/emails.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRentalApplicationDto,
  SubmitRentalApplicationDto,
  UpdateRentalApplicationDto,
} from './dto/rental-application.dto';
import {
  hashRentalApplicationToken,
  issueRentalApplicationToken,
  rentalApplicationTokenMatches,
} from './rental-application-access';

const applicantInclude = {
  property: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      photos: true,
    },
  },
  unit: {
    select: {
      id: true,
      unitNumber: true,
      rentAmount: true,
      depositAmount: true,
    },
  },
  documents: {
    select: {
      id: true,
      type: true,
      status: true,
      originalFileName: true,
      contentType: true,
      sizeBytes: true,
      rejectionReason: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
  },
} satisfies Prisma.RentalApplicationInclude;

export const applicantPublicSelect = {
  id: true,
  propertyId: true,
  unitId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
  currentAddress: true,
  currentCity: true,
  currentState: true,
  currentZip: true,
  moveInDate: true,
  householdSize: true,
  occupantsDescription: true,
  petsDescription: true,
  employmentStatus: true,
  employerName: true,
  monthlyGrossIncome: true,
  additionalIncome: true,
  rentalHistory: true,
  priorLandlordName: true,
  priorLandlordEmail: true,
  priorLandlordPhone: true,
  status: true,
  feeStatus: true,
  feeAmount: true,
  feePaidAt: true,
  decisionReason: true,
  submittedAt: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
  ...applicantInclude,
} satisfies Prisma.RentalApplicationSelect;

@Injectable()
export class RentalApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly config: ConfigService,
  ) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private assertApplicantDates(dateOfBirth: string, moveInDate: string) {
    const birth = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00.000Z`);
    const moveIn = new Date(`${moveInDate.slice(0, 10)}T00:00:00.000Z`);
    const adultCutoff = new Date();
    adultCutoff.setUTCFullYear(adultCutoff.getUTCFullYear() - 18);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (!Number.isFinite(birth.valueOf()) || birth > adultCutoff) {
      throw new BadRequestException(
        'The primary applicant must be at least 18',
      );
    }
    if (!Number.isFinite(moveIn.valueOf()) || moveIn < today) {
      throw new BadRequestException('Move-in date cannot be in the past');
    }
  }

  async create(data: CreateRentalApplicationDto) {
    this.assertApplicantDates(data.dateOfBirth, data.moveInDate);
    const property = await this.prisma.property.findFirst({
      where: {
        id: data.propertyId,
        listingType: ListingType.RENT,
        publishStatus: PublishStatus.PUBLISHED,
        status: 'active',
      },
      include: {
        units: {
          where: {
            id: data.unitId,
            status: 'vacant',
            rentAmount: { not: null },
            depositAmount: { not: null },
          },
        },
      },
    });
    if (!property) throw new NotFoundException('Rental property not found');
    if (data.unitId && property.units.length !== 1) {
      throw new BadRequestException('Selected rental unit is not available');
    }
    const email = this.normalizeEmail(data.email);
    const existing = await this.prisma.rentalApplication.findFirst({
      where: {
        propertyId: property.id,
        email,
        status: {
          in: [
            RentalApplicationStatus.DRAFT,
            RentalApplicationStatus.FEE_PENDING,
            RentalApplicationStatus.SUBMITTED,
            RentalApplicationStatus.UNDER_REVIEW,
            RentalApplicationStatus.NEEDS_INFORMATION,
            RentalApplicationStatus.APPROVED,
          ],
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'An active application already exists for this email and property',
      );
    }

    const access = issueRentalApplicationToken();
    const feeAmount = property.applicationFeeAmount;
    const websiteLead = await this.prisma.websiteLead.findFirst({
      where: { propertyId: property.id, email, rentalApplication: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    const applicationId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rentalApplication.create({
        data: {
          propertyId: property.id,
          unitId: data.unitId,
          websiteLeadId: websiteLead?.id,
          applicantAccessTokenHash: access.hash,
          applicantAccessExpiresAt: access.expiresAt,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          email,
          phone: data.phone.trim(),
          dateOfBirth: new Date(
            `${data.dateOfBirth.slice(0, 10)}T00:00:00.000Z`,
          ),
          currentAddress: data.currentAddress.trim(),
          currentCity: data.currentCity.trim(),
          currentState: data.currentState.trim(),
          currentZip: data.currentZip.trim(),
          moveInDate: new Date(`${data.moveInDate.slice(0, 10)}T00:00:00.000Z`),
          householdSize: data.householdSize,
          occupantsDescription: data.occupantsDescription?.trim() || null,
          petsDescription: data.petsDescription?.trim() || null,
          employmentStatus: data.employmentStatus.trim(),
          employerName: data.employerName?.trim() || null,
          monthlyGrossIncome: data.monthlyGrossIncome,
          additionalIncome: data.additionalIncome ?? 0,
          rentalHistory: data.rentalHistory?.trim() || null,
          priorLandlordName: data.priorLandlordName?.trim() || null,
          priorLandlordEmail: data.priorLandlordEmail
            ? this.normalizeEmail(data.priorLandlordEmail)
            : null,
          priorLandlordPhone: data.priorLandlordPhone?.trim() || null,
          feeAmount,
          feeStatus:
            Number(feeAmount) > 0
              ? RentalApplicationFeeStatus.PENDING
              : RentalApplicationFeeStatus.NOT_REQUIRED,
          consentVersion: 'rental-application-v1',
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          action: 'RENTAL_APPLICATION_DRAFT_CREATED',
          resource: 'rental_application',
          resourceId: created.id,
          newValue: JSON.stringify({
            propertyId: property.id,
            unitId: data.unitId,
          }),
        },
      });
      return created.id;
    });
    const application = await this.publicView(applicationId);
    return {
      application,
      accessToken: access.token,
      expiresAt: access.expiresAt,
    };
  }

  async authenticate(id: string, token: string) {
    const application = await this.prisma.rentalApplication.findUnique({
      where: { id },
      include: applicantInclude,
    });
    if (
      !application ||
      application.applicantAccessExpiresAt <= new Date() ||
      !rentalApplicationTokenMatches(
        token,
        application.applicantAccessTokenHash,
      )
    ) {
      throw new ForbiddenException('Application access is invalid or expired');
    }
    return application;
  }

  async exchangeAccessLink(id: string, token: string) {
    const primary = await this.prisma.rentalApplication.findUnique({
      where: { id },
      select: {
        id: true,
        applicantAccessTokenHash: true,
        applicantAccessExpiresAt: true,
      },
    });
    if (
      primary &&
      primary.applicantAccessExpiresAt > new Date() &&
      rentalApplicationTokenMatches(token, primary.applicantAccessTokenHash)
    ) {
      return { token, expiresAt: primary.applicantAccessExpiresAt };
    }
    const suppliedHash = hashRentalApplicationToken(token);
    const accessLink = await this.prisma.rentalApplicationAccessLink.findFirst({
      where: {
        applicationId: id,
        tokenHash: suppliedHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!accessLink) {
      throw new ForbiddenException('Application access is invalid or expired');
    }
    const fresh = issueRentalApplicationToken();
    await this.prisma.$transaction([
      this.prisma.rentalApplication.update({
        where: { id },
        data: {
          applicantAccessTokenHash: fresh.hash,
          applicantAccessExpiresAt: fresh.expiresAt,
        },
      }),
      this.prisma.rentalApplicationAccessLink.update({
        where: { id: accessLink.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { token: fresh.token, expiresAt: fresh.expiresAt };
  }

  async findApplicantApplication(id: string, token: string) {
    await this.authenticate(id, token);
    return this.publicView(id);
  }

  private publicView(id: string) {
    return this.prisma.rentalApplication.findUniqueOrThrow({
      where: { id },
      select: applicantPublicSelect,
    });
  }

  async update(id: string, token: string, data: UpdateRentalApplicationDto) {
    const application = await this.authenticate(id, token);
    if (
      application.status !== RentalApplicationStatus.DRAFT &&
      application.status !== RentalApplicationStatus.NEEDS_INFORMATION
    ) {
      throw new ConflictException('This application can no longer be edited');
    }
    if (data.dateOfBirth || data.moveInDate) {
      this.assertApplicantDates(
        data.dateOfBirth ?? application.dateOfBirth.toISOString(),
        data.moveInDate ?? application.moveInDate.toISOString(),
      );
    }
    const expectedUpdatedAt = new Date(data.expectedUpdatedAt);
    const { expectedUpdatedAt: expectedVersion, ...changes } = data;
    void expectedVersion;
    const changed = await this.prisma.rentalApplication.updateMany({
      where: { id, updatedAt: expectedUpdatedAt },
      data: {
        ...changes,
        email: changes.email ? this.normalizeEmail(changes.email) : undefined,
        dateOfBirth: changes.dateOfBirth
          ? new Date(`${changes.dateOfBirth.slice(0, 10)}T00:00:00.000Z`)
          : undefined,
        moveInDate: changes.moveInDate
          ? new Date(`${changes.moveInDate.slice(0, 10)}T00:00:00.000Z`)
          : undefined,
      },
    });
    if (changed.count !== 1) {
      throw new ConflictException('Application changed; refresh and retry');
    }
    return this.findApplicantApplication(id, token);
  }

  async submit(id: string, token: string, data: SubmitRentalApplicationDto) {
    const application = await this.authenticate(id, token);
    if (!data.certified) {
      throw new BadRequestException('Certification is required');
    }
    if (
      application.status !== RentalApplicationStatus.DRAFT &&
      application.status !== RentalApplicationStatus.NEEDS_INFORMATION
    ) {
      throw new ConflictException('Application has already been submitted');
    }
    const types = new Set(
      application.documents.map((document) => document.type),
    );
    if (
      !types.has(RentalApplicationDocumentType.GOVERNMENT_ID) ||
      !types.has(RentalApplicationDocumentType.INCOME_PROOF)
    ) {
      throw new BadRequestException(
        'Upload one government ID and one proof-of-income document before submitting',
      );
    }
    const now = new Date();
    const status =
      application.feeStatus === RentalApplicationFeeStatus.NOT_REQUIRED ||
      application.feeStatus === RentalApplicationFeeStatus.PAID
        ? RentalApplicationStatus.SUBMITTED
        : RentalApplicationStatus.FEE_PENDING;
    const access = issueRentalApplicationToken();
    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.rentalApplication.updateMany({
        where: { id, updatedAt: new Date(data.expectedUpdatedAt) },
        data: {
          status,
          certifiedAt: now,
          submittedAt: application.submittedAt ?? now,
          applicantAccessTokenHash: access.hash,
          applicantAccessExpiresAt: access.expiresAt,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Application changed; refresh and retry');
      }
      await tx.auditLog.create({
        data: {
          action: 'RENTAL_APPLICATION_SUBMITTED',
          resource: 'rental_application',
          resourceId: id,
          newValue: JSON.stringify({
            status,
            feeStatus: application.feeStatus,
          }),
        },
      });
      return id;
    });
    const reviewUrl = `${getPortalUrls(this.config).rentalAdmin}/admin/rental-applications/${id}`;
    const adminEmail = this.config
      .get<string>('RENTAL_APPLICATION_ALERT_EMAIL')
      ?.trim();
    if (adminEmail) {
      await this.emails.sendRentalApplicationSubmitted(
        adminEmail,
        {
          applicantName: `${application.firstName} ${application.lastName}`,
          propertyName: application.property.name,
          url: reviewUrl,
        },
        id,
      );
    }
    return {
      application: await this.publicView(result),
      accessToken: access.token,
      expiresAt: access.expiresAt,
    };
  }

  async withdraw(id: string, token: string) {
    const application = await this.authenticate(id, token);
    if (
      application.status === RentalApplicationStatus.APPROVED ||
      application.status === RentalApplicationStatus.DENIED
    ) {
      throw new ConflictException(
        'A decided application cannot be withdrawn online',
      );
    }
    await this.prisma.$transaction([
      this.prisma.rentalApplication.update({
        where: { id },
        data: {
          status: RentalApplicationStatus.WITHDRAWN,
          decidedAt: new Date(),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          action: 'RENTAL_APPLICATION_WITHDRAWN',
          resource: 'rental_application',
          resourceId: id,
        },
      }),
    ]);
    return { id, status: RentalApplicationStatus.WITHDRAWN };
  }
}
