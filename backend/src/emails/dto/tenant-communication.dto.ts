import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';

export class TenantCommunicationDto {
  @IsIn(['tenant', 'selected', 'property', 'all_active'])
  audienceType: 'tenant' | 'selected' | 'property' | 'all_active';

  @IsOptional()
  @IsIn([
    'tenant.custom_notice',
    'tenant.dashboard_sign_in',
    'rent.reminder',
    'rent.late_notice',
  ])
  templateKey?:
    | 'tenant.custom_notice'
    | 'tenant.dashboard_sign_in'
    | 'rent.reminder'
    | 'rent.late_notice';

  @IsUUID()
  requestId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenantId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @ArrayUnique()
  @IsString({ each: true })
  tenantIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  propertyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}
