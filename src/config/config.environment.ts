import { Injectable } from '@nestjs/common';

@Injectable()
export class EnvironmentConfig {
  get nodeEnv(): string {
    return process.env.NODE_ENV || 'development';
  }

  get port(): number {
    return parseInt(process.env.PORT || '8080', 10);
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isProductionEnv(): boolean {
    return this.nodeEnv === 'production';
  }

  get databaseUrl(): string {
    return process.env.DATABASE_URL || '';
  }

  get jwtSecret(): string {
    return process.env.JWT_SECRET || 'fallback-secret';
  }

  get jwtExpiresIn(): string {
    return process.env.JWT_EXPIRES_IN || '1d';
  }

  get frontendUrl(): string {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  get cookieDomain(): string {
    return process.env.COOKIE_DOMAIN || '';
  }

  get allowedOrigins(): string[] {
    return [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://weeklyreport-orpin.vercel.app', // Đây là frontend domain từ Network tab
    ];
  }

  getCorsConfig() {
    return {
      origin: this.allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With', 
        'Content-Type',
        'Accept',
        'Authorization',
        'Cookie',
        'Set-Cookie',
        'Cache-Control'
      ],
      exposedHeaders: ['Set-Cookie'],
      optionsSuccessStatus: 200,
      maxAge: this.isProduction ? 86400 : 3600,
    };
  }
}
