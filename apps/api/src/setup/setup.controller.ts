import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { setupSchema } from '@eventlens/contracts';
import { OriginGuard } from '../auth/origin.guard.js';
import { parse } from '../http.js';
import { SetupService } from './setup.service.js';

@Controller('v1/setup')
@UseGuards(OriginGuard)
export class SetupController {
  constructor(@Inject(SetupService) private readonly setup: SetupService) {}
  @Get() status() {
    return this.setup.status();
  }
  @Post() initialize(@Body() body: unknown) {
    return this.setup.initialize(parse(setupSchema, body));
  }
}
