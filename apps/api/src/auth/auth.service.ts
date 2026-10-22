import { Inject, Injectable } from '@nestjs/common';
import { betterAuth } from 'better-auth/minimal';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { CONFIG, type Config } from '../config.js';
import { DatabaseService } from '../database.service.js';

@Injectable()
export class AuthService {
  readonly auth;
  constructor(
    @Inject(CONFIG) config: Config,
    @Inject(DatabaseService) db: DatabaseService,
  ) {
    this.auth = betterAuth({
      appName: 'EventLens',
      baseURL: config.APP_URL,
      basePath: '/api/auth',
      secret: config.BETTER_AUTH_SECRET,
      database: prismaAdapter(db.client, { provider: 'postgresql' }),
      trustedOrigins: [config.APP_URL],
      emailAndPassword: {
        enabled: true,
        disableSignUp: true,
        minPasswordLength: 12,
        maxPasswordLength: 128,
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
        cookieCache: { enabled: false },
      },
      advanced: {
        useSecureCookies: config.APP_URL.startsWith('https:'),
        ipAddress: { disableIpTracking: true },
      },
      databaseHooks: {
        session: {
          create: {
            before: async (session) => ({
              data: { ...session, ipAddress: null, userAgent: null },
            }),
          },
        },
      },
      rateLimit: { enabled: true, window: 60, max: 30 },
      logger: { disabled: true },
    });
  }
}
