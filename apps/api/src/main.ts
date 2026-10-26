import { createApp } from './server.js';
import { installShutdownDeadline } from '@eventlens/pipeline';
import { CONFIG, type Config } from './config.js';
import { logger } from './logger.js';

const app = await createApp();
installShutdownDeadline();
const config = app.get<Config>(CONFIG);
await app.listen(config.PORT, '0.0.0.0');
logger.info({ port: config.PORT }, 'EventLens API listening');
