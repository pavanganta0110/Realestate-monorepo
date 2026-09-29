import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequiredAuthenticatedRequest } from '../auth/authenticated-request';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreatePropertyOwnerDto,
  UpdatePropertyOwnerDto,
} from './dto/property-owner.dto';
import { PropertyOwnersService } from './property-owners.service';

@Controller('property-owners')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
export class PropertyOwnersController {
  constructor(private readonly owners: PropertyOwnersService) {}

  @Get()
  findAll() {
    return this.owners.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.owners.findOne(id);
  }

  @Post()
  create(
    @Body() data: CreatePropertyOwnerDto,
    @Request() request: RequiredAuthenticatedRequest,
  ) {
    return this.owners.create(request.user.sub, data);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() data: UpdatePropertyOwnerDto,
    @Request() request: RequiredAuthenticatedRequest,
  ) {
    return this.owners.update(request.user.sub, id, data);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Request() request: RequiredAuthenticatedRequest,
  ) {
    return this.owners.remove(request.user.sub, id);
  }

  @Post(':id/stripe-onboarding')
  inviteToStripeOnboarding(
    @Param('id') id: string,
    @Request() request: RequiredAuthenticatedRequest,
  ) {
    return this.owners.inviteToStripeOnboarding(request.user.sub, id);
  }
}
