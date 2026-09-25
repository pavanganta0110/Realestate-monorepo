import { Module, Global } from '@nestjs/common';
import { EmailsService } from './emails.service';
import { TenantCommunicationsService } from './tenant-communications.service';
import { ConfigModule } from '@nestjs/config';
import {
  AdminEmailsController,
  EmailRetryController,
  ResendWebhookController,
} from './emails.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [
    ResendWebhookController,
    EmailRetryController,
    AdminEmailsController,
  ],
  providers: [EmailsService, TenantCommunicationsService],
  exports: [EmailsService],
})
export class EmailsModule {}
