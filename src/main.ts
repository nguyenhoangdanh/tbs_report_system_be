import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentConfig } from './config/config.environment';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  try {
    const nodeEnv = process.env.NODE_ENV || 'development';

    console.log('🚀 Starting Weekly Report Backend...');
    console.log(`📍 Environment: ${nodeEnv}`);
    console.log(`🔗 Database URL configured: ${!!process.env.DATABASE_URL}`);

    // Enhanced environment debugging
    console.log('🔍 Environment configuration:');
    console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`   PORT: ${process.env.PORT || '8080'}`);
    console.log(`   Expected env file: .env.${nodeEnv}`);

    // Log database URL (masked) for debugging
    if (process.env.DATABASE_URL) {
      const maskedUrl = process.env.DATABASE_URL.replace(
        /\/\/([^:]+):([^@]+)@/,
        '//***:***@',
      );
      console.log(`📡 Database URL: ${maskedUrl}`);

      // Check database type
      if (maskedUrl.includes('localhost') || maskedUrl.includes('127.0.0.1')) {
        console.log('✅ Using local database (development)');
      } else if (
        maskedUrl.includes('flycast') ||
        maskedUrl.includes('fly.dev')
      ) {
        console.log('🌐 Using production database (Fly.io)');
      } else {
        console.log('🔍 Using external database');
      }
    } else {
      console.log('❌ DATABASE_URL not configured');
    }

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger:
        process.env.NODE_ENV === 'production'
          ? ['error', 'warn', 'log']
          : ['log', 'error', 'warn', 'debug'],
      bufferLogs: true,
    });

    // Essential middleware
    app.use(cookieParser());
    app.set('trust proxy', 1);
    app.enableShutdownHooks();

    const envConfig = app.get(EnvironmentConfig);
    const corsConfig = envConfig.getCorsConfig();

    // Apply CORS configuration
    app.enableCors(corsConfig);
    console.log('✅ CORS configuration applied');
    console.log(`🌐 Allowed origins: ${envConfig.allowedOrigins.join(', ')}`);

    // Global prefix for API routes
    app.setGlobalPrefix('api');

    // More lenient validation pipe to prevent 400 errors
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: false,
        forbidNonWhitelisted: false,
        disableErrorMessages: false,
        skipMissingProperties: false,
        skipNullProperties: false,
        skipUndefinedProperties: false,
        transformOptions: {
          enableImplicitConversion: true,
        },
        exceptionFactory: (errors) => {
          console.log('Validation errors:', errors);
          return new BadRequestException(
            errors.map((error) => ({
              property: error.property,
              value: error.value,
              constraints: error.constraints,
            })),
          );
        },
      }),
    );

    // Swagger only in development
    if (process.env.NODE_ENV !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('Weekly Work Report API')
        .setDescription('API documentation for Weekly Work Report System')
        .setVersion('1.0')
        .addBearerAuth()
        .addTag('auth', 'Authentication endpoints')
        .addTag('users', 'User management')
        .addTag('reports', 'Weekly reports')
        .addTag('health', 'Health check endpoints')
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api', app, document, {
        customSiteTitle: 'Weekly Report API Documentation',
        customfavIcon: '/favicon.ico',
        customJs: [
          'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
          'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.min.js',
        ],
        customCssUrl: [
          'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
        ],
      });
      console.log('📚 Swagger documentation available at /api');
    }

    const port = envConfig.port || 8080;

    await app.listen(port, '0.0.0.0');

    console.log(`🎉 Application is running on: http://0.0.0.0:${port}`);
    console.log(`🏥 Health check: http://0.0.0.0:${port}/health`);
    console.log(`🔗 API health: http://0.0.0.0:${port}/api/health`);
    console.log(`📊 Database health: http://0.0.0.0:${port}/api/health/db`);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`📚 API documentation: http://0.0.0.0:${port}/api`);
    }
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Enhanced Vercel handler for serverless deployment
export default async (req: any, res: any) => {
  try {
    // Set CORS headers for all requests
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://weeklyreportsystem-mu.vercel.app',
      'https://weeklyreport-orpin.vercel.app',
    ];

    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control',
    );

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Quick responses for common requests
    if (req.url === '/health') {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: '1.0.0',
      });
      return;
    }

    if (req.url === '/' || req.url === '/api') {
      res.json({
        message: 'Weekly Work Report API',
        status: 'ok',
        timestamp: new Date().toISOString(),
        docs: '/api',
        health: '/health',
      });
      return;
    }

    // For serverless platforms, create app instance
    const { AppModule } = await import('./app.module');
    const { NestFactory } = await import('@nestjs/core');

    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn'],
    });

    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
    });

    app.setGlobalPrefix('api');

    const expressApp = app.getHttpAdapter().getInstance();
    return expressApp(req, res);
  } catch (error) {
    console.error('🚨 Handler error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Something went wrong',
      timestamp: new Date().toISOString(),
    });
  }
};

// Start application if running directly
if (require.main === module) {
  bootstrap();
}
