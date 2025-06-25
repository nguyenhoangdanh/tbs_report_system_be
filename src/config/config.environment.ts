import { Injectable } from '@nestjs/common';

export interface CookieConfig {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  domain?: string;
  path: string;
  maxAge: number;
}

export interface CorsConfig {
  origin: string | string[] | boolean | ((origin: string, callback: (err: Error | null, allow?: boolean) => void) => void);
  credentials: boolean;
  allowedHeaders: string[];
  methods: string[];
}

@Injectable()
export class EnvironmentConfig {
  private readonly isProduction = process.env.NODE_ENV === 'production';
  private readonly isDevelopment = process.env.NODE_ENV === 'development';

  get nodeEnv(): string {
    return process.env.NODE_ENV || 'development';
  }

  get frontendUrl(): string {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  get cookieDomain(): string | undefined {
    // Make sure to clean the domain value and validate it
    const domain = process.env.COOKIE_DOMAIN?.trim();
    if (!domain) return undefined;

    // Remove any quotes if present
    const cleanDomain = domain.replace(/['"]/g, '');

    // Validate domain format (no protocol, no paths)
    if (cleanDomain.includes('://') || cleanDomain.includes('/')) {
      console.warn(
        `Invalid COOKIE_DOMAIN format: ${cleanDomain}. Should be domain only, e.g., 'example.com'`,
      );
      return undefined;
    }

    return cleanDomain;
  }

  get port(): number {
    return parseInt(process.env.PORT || '8080', 10);
  }

  getCookieConfig(maxAge: number): CookieConfig {
    const baseConfig = {
      httpOnly: true,
      maxAge,
      path: '/',
    };

    if (this.isProduction) {
      console.log('[COOKIE] Production cookie config with SameSite=None');
      return {
        ...baseConfig,
        secure: true, // HTTPS only
        sameSite: 'none' as const, // Required for cross-origin
        // Don't set domain - let browser handle it automatically
      };
    }

    console.log('[COOKIE] Development cookie config with SameSite=Lax');
    return {
      ...baseConfig,
      secure: false, // HTTP OK in dev
      sameSite: 'lax' as const, // Lax for same-origin dev
    };
  }

  getCorsConfig(): CorsConfig {
    // Strict allowlist for security
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://weeklyreport-orpin.vercel.app',
    ];

    if (this.isProduction) {
      return {
        origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
          // Allow requests with no origin (mobile apps, server-to-server)
          if (!origin) return callback(null, true);

          // Only allow specific origins in production
          if (allowedOrigins.includes(origin)) {
            console.log('[CORS CONFIG] Allowing origin:', origin);
            callback(null, true);
          } else {
            console.log('[CORS CONFIG] Blocking unauthorized origin:', origin);
            callback(new Error(`CORS policy: Origin ${origin} not allowed`));
          }
        },
        credentials: true,
        allowedHeaders: [
          'Origin',
          'X-Requested-With',
          'Content-Type',
          'Accept',
          'Authorization',
          'Cookie',
          'Set-Cookie',
          'Cache-Control',
        ],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      };
    }

    // Development - allow localhost variants only
    return {
      origin: allowedOrigins, // Use strict list even in development
      credentials: true,
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cookie',
        'Set-Cookie',
        'Cache-Control',
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    };
  }

  // Helper methods
  get isProductionEnv(): boolean {
    return this.isProduction;
  }

  get isDevelopmentEnv(): boolean {
    return this.isDevelopment;
  }

  // Database and other service configurations
  get databaseUrl(): string {
    return process.env.DATABASE_URL || '';
  }

  get redisUrl(): string {
    return process.env.REDIS_URL || 'redis://localhost:6379';
  }

  get jwtSecret(): string {
    return process.env.JWT_SECRET || 'your-default-secret';
  }

  get jwtExpiresIn(): string {
    return process.env.JWT_EXPIRES_IN || '1d';
  }

  get jwtRememberMeExpiresIn(): string {
    return process.env.JWT_REMEMBER_ME_EXPIRES_IN || '7d';
  }
}
