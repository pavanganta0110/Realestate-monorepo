import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { AgentSignupDto } from './dto/agent-signup.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { LoginDto } from './dto/login.dto';
import { TenantAdminInviteDto } from './dto/tenant-admin-invite.dto';
import { TenantInviteDto } from './dto/tenant-invite.dto';
import { TenantAdminProvisioningService } from './tenant-admin-provisioning.service';
import { TenantPortalInvitationService } from './tenant-portal-invitation.service';
import { UpdatePasswordDto } from './dto/update-password.dto';
import type { RequiredAuthenticatedRequest } from './authenticated-request';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantAdminProvisioning: TenantAdminProvisioningService,
    private readonly tenantPortalInvitation: TenantPortalInvitationService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({
    default: { limit: 10, ttl: 60000, blockDuration: 60000 },
  })
  login(@Body() body: LoginDto, @Ip() clientIp: string) {
    return this.authService.login(body, clientIp);
  }

  @Post('agent-signup')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  agentSignup(@Body() body: AgentSignupDto) {
    return this.authService.registerAgent(body);
  }

  @Post('password-reset-request')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(body.email);
  }

  @Post('password-reset-complete')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  updatePassword(
    @Body() body: UpdatePasswordDto,
    @Request() request: RequiredAuthenticatedRequest,
  ) {
    return this.authService.updatePassword(request.user.sub, body.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Request() request: RequiredAuthenticatedRequest) {
    return this.authService.getCurrentUser(request.user.sub);
  }

  @Post('invite')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  async invite(
    @Body() body: TenantInviteDto,
    @Request() request: RequiredAuthenticatedRequest,
  ) {
    return this.authService.inviteTenant(body, request.user.sub);
  }

  @Post('tenant-portal-invite/:tenantId')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  inviteExistingTenantPortal(
    @Param('tenantId') tenantId: string,
    @Request() request: RequiredAuthenticatedRequest,
  ) {
    return this.tenantPortalInvitation.invite(tenantId, request.user.sub);
  }

  @Post('tenant-admin-invite')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  inviteTenantAdmin(
    @Body() body: TenantAdminInviteDto,
    @Request() request: RequiredAuthenticatedRequest,
  ) {
    return this.tenantAdminProvisioning.invite(body, request.user.sub);
  }

  @Post('tenant-admin-invite/:id/resend')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  resendTenantAdminInvite(
    @Param('id') id: string,
    @Request() request: RequiredAuthenticatedRequest,
  ) {
    return this.tenantAdminProvisioning.resendInvitation(id, request.user.sub);
  }

  @Get('tenant-administrators')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  listTenantAdministrators() {
    return this.tenantAdminProvisioning.listStaff();
  }
}
