import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  RawBody,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ESignatureTargetType, Role } from '@prisma/client';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { RequiredAuthenticatedRequest } from '../auth/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateESignatureDto,
  ESignatureEventListQueryDto,
  ESignatureListQueryDto,
} from './dto/e-signature.dto';
import { ESignaturesService } from './e-signatures.service';

@Controller('admin/e-signatures')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.SALES_ADMIN, Role.TENANT_ADMIN)
export class AdminESignaturesController {
  constructor(private readonly signatures: ESignaturesService) {}

  private user(request: RequiredAuthenticatedRequest) {
    const user = request.user;
    return { id: user.sub, role: user.role, email: user.email };
  }

  @Get('configuration')
  configuration() {
    return this.signatures.configuration();
  }

  @Get('templates')
  templates() {
    return this.signatures.templates();
  }

  @Get()
  list(
    @Request() request: RequiredAuthenticatedRequest,
    @Query() query: ESignatureListQueryDto,
  ) {
    return this.signatures.listAdmin(this.user(request), query);
  }

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  create(
    @Request() request: RequiredAuthenticatedRequest,
    @Body() body: CreateESignatureDto,
  ) {
    return this.signatures.create(this.user(request), body);
  }

  @Get(':id')
  get(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.signatures.getAdmin(this.user(request), id);
  }

  @Get(':id/events')
  events(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: ESignatureEventListQueryDto,
  ) {
    return this.signatures.eventsAdmin(this.user(request), id, query);
  }

  @Post(':id/synchronize')
  synchronize(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.signatures.synchronizeAdmin(this.user(request), id);
  }

  @Post(':id/remind')
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  remind(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.signatures.remind(this.user(request), id);
  }

  @Post(':id/cancel')
  cancel(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.signatures.cancel(this.user(request), id);
  }

  @Get(':id/documents/:documentId/url')
  documentUrl(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.signatures.documentUrlAdmin(this.user(request), id, documentId);
  }
}

abstract class PortalESignaturesController {
  protected abstract readonly targetType: ESignatureTargetType;

  constructor(protected readonly signatures: ESignaturesService) {}

  list(request: RequiredAuthenticatedRequest, query: ESignatureListQueryDto) {
    return this.signatures.listMine(request.user.sub, this.targetType, query);
  }

  get(request: RequiredAuthenticatedRequest, id: string) {
    return this.signatures.getMine(request.user.sub, this.targetType, id);
  }

  events(
    request: RequiredAuthenticatedRequest,
    id: string,
    query: ESignatureEventListQueryDto,
  ) {
    return this.signatures.eventsMine(
      request.user.sub,
      this.targetType,
      id,
      query,
    );
  }

  signingSession(request: RequiredAuthenticatedRequest, id: string) {
    return this.signatures.signingSession(
      request.user.sub,
      this.targetType,
      id,
      request.user.email,
    );
  }

  documentUrl(
    request: RequiredAuthenticatedRequest,
    id: string,
    documentId: string,
  ) {
    return this.signatures.documentUrlMine(
      request.user.sub,
      this.targetType,
      id,
      documentId,
    );
  }
}

@Controller('tenant/e-signatures')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TENANT)
export class TenantESignaturesController extends PortalESignaturesController {
  constructor(signatures: ESignaturesService) {
    super(signatures);
  }

  protected readonly targetType: ESignatureTargetType =
    ESignatureTargetType.TENANT;

  @Get()
  listRoute(
    @Request() request: RequiredAuthenticatedRequest,
    @Query() query: ESignatureListQueryDto,
  ) {
    return this.list(request, query);
  }

  @Get(':id')
  getRoute(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.get(request, id);
  }

  @Get(':id/events')
  eventsRoute(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: ESignatureEventListQueryDto,
  ) {
    return this.events(request, id, query);
  }

  @Post(':id/signing-session')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  signingSessionRoute(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.signingSession(request, id);
  }

  @Get(':id/documents/:documentId/url')
  documentUrlRoute(
    @Request() request: RequiredAuthenticatedRequest,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documentUrl(request, id, documentId);
  }
}

@Controller('agent/e-signatures')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.AGENT)
export class AgentESignaturesController extends TenantESignaturesController {
  constructor(signatures: ESignaturesService) {
    super(signatures);
  }

  protected readonly targetType: ESignatureTargetType =
    ESignatureTargetType.AGENT;
}

@Controller('webhooks/verdocs')
@SkipThrottle()
export class VerdocsWebhookController {
  constructor(private readonly signatures: ESignaturesService) {}

  @Post()
  receive(
    @RawBody() body: Buffer | undefined,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    return this.signatures.handleWebhook(body ?? Buffer.alloc(0), signature);
  }
}
