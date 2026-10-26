import 'reflect-metadata';
import {
  Controller,
  Get,
  Inject,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerRuntime } from './runtime.js';
import { installShutdownDeadline } from '@eventlens/pipeline';

@Controller('health')
class HealthController {
  constructor(@Inject(WorkerRuntime) private readonly runtime: WorkerRuntime) {}
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    try {
      return await this.runtime.ready();
    } catch {
      throw new ServiceUnavailableException('Worker dependencies unavailable');
    }
  }
}
@Module({ controllers: [HealthController], providers: [WorkerRuntime] })
class WorkerModule {}
const app = await NestFactory.create(WorkerModule, {
  logger: ['error', 'warn'],
});
const port = Number(process.env.WORKER_PORT ?? 3002);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid WORKER_PORT');
app.enableShutdownHooks();
installShutdownDeadline();
await app.listen(port, '127.0.0.1');
