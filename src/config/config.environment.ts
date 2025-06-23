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
  origin: string | string[] | boolean;
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
        // DON'T set domain for cross-origin cookies - let browser handle automatically
        // This allows cookies to work across different Vercel subdomains
      };
    }

    // Development configuration
    return {
      ...baseConfig,
      secure: false,
      sameSite: 'lax' as const,
    };
  }

  getCorsConfig(): CorsConfig {
    if (this.isProduction) {
      return {
        origin: this.frontendUrl,
        credentials: true,
        allowedHeaders: [
          'Origin',
          'X-Requested-With',
          'Content-Type',
          'Accept',
          'Authorization',
          'Cookie',
          'Set-Cookie',
          'mode', // Thêm header mode
          'credentials',
          'access-control-allow-origin',
          'access-control-allow-headers',
          'access-control-allow-methods',
          'X-File-Name',
          'Cache-Control',
        ],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      };
    }

    // Development configuration - more permissive
    return {
      origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001', // Cho phép port khác nếu cần
      ],
      credentials: true,
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cookie',
        'Set-Cookie',
        'mode', // Thêm header mode
        'credentials',
        'access-control-allow-origin',
        'access-control-allow-headers',
        'access-control-allow-methods',
        'X-File-Name',
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
