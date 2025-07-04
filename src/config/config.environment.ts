import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EnvironmentConfig {
  constructor(private configService: ConfigService) {}

  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV') || 'development';
  }

  get port(): number {
    return parseInt(this.configService.get<string>('PORT') || '8080', 10);
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get databaseUrl(): string {
    return this.configService.get<string>('DATABASE_URL') || '';
  }

  get directUrl(): string {
    return this.configService.get<string>('DIRECT_URL') || this.databaseUrl;
  }

  get jwtSecret(): string {
    return (
      this.configService.get<string>('JWT_SECRET') || 'fallback-secret-key'
    );
  }

  get jwtExpiresIn(): string {
    return this.configService.get<string>('JWT_EXPIRES_IN') || '24h';
  }

  get frontendUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    );
  }

  get cookieDomain(): string {
    return this.configService.get<string>('COOKIE_DOMAIN') || '';
  }

  get cookieSecure(): boolean {
    return this.configService.get<string>('COOKIE_SECURE') === 'true';
  }

  get allowedOrigins(): string[] {
    const corsOrigins = this.configService.get<string>('CORS_ORIGINS');
    if (corsOrigins) {
      return corsOrigins.split(',').map((origin) => origin.trim());
    }

    // Default origins based on environment
    if (this.isProduction) {
      return [
        'https://weeklyreport-orpin.vercel.app',
        'https://weeklyreportsystem-mu.vercel.app',
      ];
    } else {
      return ['http://localhost:3000', 'http://127.0.0.1:3000'];
    }
  }

  getCorsConfig() {
    const allowedOrigins = this.allowedOrigins;

    return {
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          return callback(null, true);
        }

        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // Allow any localhost origin in development
        if (
          this.isDevelopment &&
          (origin.includes('localhost') || origin.includes('127.0.0.1'))
        ) {
          return callback(null, true);
        }

        // In development, be more permissive
        if (this.isDevelopment) {
          return callback(null, true);
        }

        // Block in production
        const error = new Error(`CORS policy blocked origin: ${origin}`);
        callback(error, false);
      },
      credentials: true, // Essential for cookies
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
        'Cookie', // Add Cookie header
      ],
      exposedHeaders: ['set-cookie'],
      optionsSuccessStatus: 200,
      preflightContinue: false,
    };
  }

  getDatabaseConfig() {
    const isProduction = this.isProduction;

    return {
      datasources: {
        db: {
          url: this.databaseUrl,
        },
      },
      log: isProduction
        ? ['error', 'warn']
        : ['query', 'info', 'warn', 'error'],
      errorFormat: 'minimal' as const,

      // Connection pooling and timeouts for production
      ...(isProduction && {
        transactionOptions: {
          timeout: 30000, // 30 seconds
          maxWait: 5000, // 5 seconds
          isolationLevel: 'ReadCommitted' as const,
        },
      }),

      // Development settings
      ...(!isProduction && {
        transactionOptions: {
          timeout: 10000, // 10 seconds for dev
          maxWait: 3000, // 3 seconds for dev
        },
      }),
    };
  }

  // Database connection validation
  validateDatabaseConfig(): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!this.databaseUrl) {
      errors.push('DATABASE_URL is required');
    }

    if (this.databaseUrl && !this.databaseUrl.startsWith('postgres://')) {
      errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
    }

    if (this.isProduction) {
      if (!this.databaseUrl.includes('sslmode')) {
        errors.push('Production database should use SSL');
      }

      if (this.databaseUrl.includes('localhost')) {
        errors.push('Production should not use localhost database');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Get database connection info for debugging
  getDatabaseConnectionInfo(): {
    environment: string;
    hasUrl: boolean;
    hasDirectUrl: boolean;
    isSSL: boolean;
    host: string;
    port: string;
    database: string;
  } {
    const url = this.databaseUrl;

    try {
      const parsed = new URL(url);
      return {
        environment: this.nodeEnv,
        hasUrl: !!url,
        hasDirectUrl: !!this.directUrl,
        isSSL:
          url.includes('sslmode=require') || url.includes('sslmode=prefer'),
        host: parsed.hostname,
        port: parsed.port || '5432',
        database: parsed.pathname.substring(1),
      };
    } catch (error) {
      return {
        environment: this.nodeEnv,
        hasUrl: !!url,
        hasDirectUrl: !!this.directUrl,
        isSSL: false,
        host: 'unknown',
        port: 'unknown',
        database: 'unknown',
      };
    }
  }
}
