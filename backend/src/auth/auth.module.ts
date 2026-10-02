import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { PasswordSecurityService } from './password-security.service';
import { TenantAdminProvisioningService } from './tenant-admin-provisioning.service';
import { TenantPortalInvitationService } from './tenant-portal-invitation.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    PasswordSecurityService,
    TenantAdminProvisioningService,
    TenantPortalInvitationService,
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
