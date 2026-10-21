import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createDatabase } from '@eventlens/database';
import { CONFIG, type Config } from './config.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client;
  constructor(@Inject(CONFIG) config: Config) { this.client = createDatabase(config.DATABASE_URL); }
  async onModuleDestroy() { await this.client.$disconnect(); }
}
