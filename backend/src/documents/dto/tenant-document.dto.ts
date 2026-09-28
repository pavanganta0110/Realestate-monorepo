import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimText } from '../../auth/dto/auth-input.transforms';

export const TENANT_DOCUMENT_TYPES = [
  'LEASE',
  'NOTICE',
  'INSPECTION',
  'PAYMENT_RECEIPT',
  'IDENTIFICATION',
  'INSURANCE',
  'OTHER',
] as const;

export const TENANT_UPLOADABLE_DOCUMENT_TYPES = [
  'IDENTIFICATION',
  'INSURANCE',
  'OTHER',
] as const;

export const TENANT_DOCUMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export class CreateTenantDocumentUploadDto {
  @Transform(trimText)
  @IsString()
  @Length(1, 180)
  fileName!: string;

  @IsIn(TENANT_DOCUMENT_TYPES)
  type!: (typeof TENANT_DOCUMENT_TYPES)[number];

  @IsIn(TENANT_DOCUMENT_CONTENT_TYPES)
  contentType!: (typeof TENANT_DOCUMENT_CONTENT_TYPES)[number];
}

export class AttachTenantDocumentDto extends CreateTenantDocumentUploadDto {
  @Transform(trimText)
  @IsString()
  @MaxLength(500)
  path!: string;
}

export class ApplyLeaseTermsDto {
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) monthlyRent?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  securityDeposit?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  rentDueDay?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  gracePeriodDays?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lateFeeAmount?: number;
}
