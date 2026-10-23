import { AnalyticsController } from './analytics/analytics.controller.js';
import { AnalyticsService } from './analytics/analytics.service.js';
import { EventsController } from './events/events.controller.js';
import { EventsService } from './events/events.service.js';
import { IngestionController } from './events/ingestion.controller.js';
import { IngestionService } from './events/ingestion.service.js';
import { Module } from '@nestjs/common';
import { CONFIG, readConfig } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { AuthService } from './auth/auth.service.js';
import { SessionGuard } from './auth/session.guard.js';
import { OriginGuard } from './auth/origin.guard.js';
import { SetupService } from './setup/setup.service.js';
import { SetupController } from './setup/setup.controller.js';
import { AccessService } from './workspaces/access.service.js';
import { WorkspacesService } from './workspaces/workspaces.service.js';
import { WorkspacesController } from './workspaces/workspaces.controller.js';
import { ProjectsService } from './projects/projects.service.js';
import { ProjectsController } from './projects/projects.controller.js';
import { MembersService } from './workspaces/members.service.js';
import { MembersController } from './workspaces/members.controller.js';
import { InvitationsService } from './workspaces/invitations.service.js';
import {
  AcceptInvitationController,
  InvitationsController,
} from './workspaces/invitations.controller.js';

@Module({
  controllers: [
    HealthController,
    IngestionController,
    EventsController,
    AnalyticsController,
    SetupController,
    WorkspacesController,
    ProjectsController,
    MembersController,
    InvitationsController,
    AcceptInvitationController,
  ],
  providers: [
    { provide: CONFIG, useFactory: () => readConfig() },
    DatabaseService,
    IngestionService,
    EventsService,
    AnalyticsService,
    AuthService,
    SessionGuard,
    OriginGuard,
    SetupService,
    AccessService,
    WorkspacesService,
    ProjectsService,
    MembersService,
    InvitationsService,
  ],
})
export class AppModule {}
