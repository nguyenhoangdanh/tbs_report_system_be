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
      return {
        ...baseConfig,
        secure: true,
        sameSite: 'none' as const,
        // Không set domain để browser tự động handle cross-origin
        // Hoặc nếu cần, chỉ set domain chính xác
      };
    }

    return {
      ...baseConfig,
      secure: false,
      sameSite: 'lax' as const,
    };
  }

  getCorsConfig(): CorsConfig {
    const frontendUrls = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://weeklyreport-orpin.vercel.app',
    ];

    if (this.isProduction) {
      return {
        origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
          // Allow requests with no origin (mobile apps, Postman, etc.)
          if (!origin) return callback(null, true);

          if (frontendUrls.includes(origin)) {
            callback(null, true);
          } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
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

    return {
      origin: true,
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
