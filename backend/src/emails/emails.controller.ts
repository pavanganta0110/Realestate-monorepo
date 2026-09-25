import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Request,
  RawBody,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EmailsService } from './emails.service';
import { TenantCommunicationsService } from './tenant-communications.service';
import { TenantCommunicationDto } from './dto/tenant-communication.dto';
import type { RequiredAuthenticatedRequest } from '../auth/authenticated-request';

@Controller('webhooks/resend')
@SkipThrottle()
export class ResendWebhookController {
  constructor(private readonly emails: EmailsService) {}

  @Post()
  receive(
    @RawBody() body: Buffer | undefined,
    @Headers('svix-id') id?: string,
    @Headers('svix-timestamp') timestamp?: string,
    @Headers('svix-signature') signature?: string,
  ) {
    if (!body || !id || !timestamp || !signature) {
      throw new BadRequestException('Missing signed webhook payload');
    }
    return this.emails.handleWebhook(body.toString('utf8'), {
      id,
      timestamp,
      signature,
    });
  }
}

@Controller('internal/emails')
@SkipThrottle()
export class EmailRetryController {
  constructor(
    private readonly emails: EmailsService,
    private readonly config: ConfigService,
  ) {}

  private authorized(header?: string) {
    const secret = this.config.get<string>('CRON_SECRET')?.trim();
    if (!secret || !header) return false;
    const expected = Buffer.from(`Bearer ${secret}`);
    const received = Buffer.from(header);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  @Get('retry')
  retry(@Headers('authorization') authorization?: string) {
    if (!this.authorized(authorization)) {
      throw new UnauthorizedException('Invalid cron authorization');
    }
    return this.emails.retryDue();
  }
}

@Controller('admin/emails')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
export class AdminEmailsController {
  constructor(
    private readonly emails: EmailsService,
    private readonly communications: TenantCommunicationsService,
  ) {}

  @Post('preview')
  preview(@Body() body: TenantCommunicationDto) {
    return this.communications.preview(body);
  }

  @Post('send')
  send(
    @Request() request: RequiredAuthenticatedRequest,
    @Body() body: TenantCommunicationDto,
  ) {
    return this.communications.send(request.user.sub, body);
  }

  @Get('batches')
  batches(@Query('limit') rawLimit?: string) {
    return this.communications.batches(rawLimit ? Number(rawLimit) : undefined);
  }

  @Get('tenant/:tenantId')
  tenantHistory(
    @Param('tenantId') tenantId: string,
    @Query('limit') rawLimit?: string,
  ) {
    return this.communications.tenantHistory(
      tenantId,
      rawLimit ? Number(rawLimit) : undefined,
    );
  }

  @Get()
  list(
    @Request() request: RequiredAuthenticatedRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') rawLimit?: string,
    @Query('status') status?: string,
  ) {
    const limit = rawLimit ? Number(rawLimit) : undefined;
    if (limit !== undefined && !Number.isInteger(limit)) {
      throw new BadRequestException('limit must be an integer');
    }
    return this.emails.list({
      cursor,
      limit,
      status,
      tenantOnly: request.user.role === Role.TENANT_ADMIN,
    });
  }

  @Post(':id/retry')
  retry(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.emails.retryOne(id, request.user.role === Role.TENANT_ADMIN);
  }
}
