import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EnvironmentConfig {
  constructor(private configService: ConfigService) {}

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
      'https://weeklyreport-orpin.vercel.app',
      'https://weeklyreportsystem-mu.vercel.app',
    ];
  }

  getCorsConfig() {
    // Get allowed origins from environment or use defaults
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://weeklyreport-orpin.vercel.app',
      'https://weeklyreportsystem-mu.vercel.app',
    ];

    // Add environment-specific origins if configured
    const envOrigins = this.configService.get<string>('CORS_ORIGINS');
    if (envOrigins) {
      allowedOrigins.push(...envOrigins.split(',').map(origin => origin.trim()));
    }

    return {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        console.log(`CORS request from origin: ${origin || 'no-origin'}`);
        
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          console.log('Allowing request with no origin');
          return callback(null, true);
        }

        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
          console.log(`✅ Allowing origin: ${origin}`);
          return callback(null, true);
        }

        // Allow any localhost origin in development
        if (this.isDevelopment && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
          console.log(`🔧 Development mode: allowing localhost origin: ${origin}`);
          return callback(null, true);
        }

        // Log blocked origin for debugging
        console.warn(`❌ CORS blocked origin: ${origin}`);
        console.log(`📋 Allowed origins: ${allowedOrigins.join(', ')}`);
        
        // In development, be more permissive
        if (this.isDevelopment) {
          console.log('🔧 Development mode: allowing all origins');
          return callback(null, true);
        }

        // Block in production
        const error = new Error(`CORS policy blocked origin: ${origin}`);
        callback(error, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
        'X-HTTP-Method-Override',
        'Access-Control-Allow-Credentials',
      ],
      exposedHeaders: [
        'set-cookie',
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Credentials',
      ],
      optionsSuccessStatus: 200,
      preflightContinue: false,
    };
  }
}
