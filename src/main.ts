import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentConfig } from './config/config.environment';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';

let app: any;

async function createNestApp() {
  if (!app) {
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      // Performance optimizations
      logger: process.env.NODE_ENV === 'production' 
        ? ['error', 'warn'] 
        : ['log', 'error', 'warn', 'debug', 'verbose']
    });

    // CRITICAL: Compression middleware for faster responses
    app.use(compression({
      level: 6, // Good balance between compression and CPU
      threshold: 1024, // Only compress responses > 1KB
      filter: (req, res) => {
        // Don't compress responses that are already compressed
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      }
    }));

    // IMPORTANT: Cookie parser MUST be first
    app.use(cookieParser());

    // Trust proxy for Vercel/production with better config
    app.set('trust proxy', true);
    app.set('x-powered-by', false); // Security: Hide X-Powered-By header

    const envConfig = app.get(EnvironmentConfig);
    
    // Optimized CORS with minimal overhead
    const corsConfig = envConfig.getCorsConfig();
    app.enableCors({
      ...corsConfig,
      optionsSuccessStatus: 200, // For legacy browser support
      preflightContinue: false,   // Don't pass control to next handler
      maxAge: 86400 // Cache preflight for 24 hours
    });

    // Simplified CORS middleware - remove duplicate processing
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000', 
      'https://weeklyreport-orpin.vercel.app',
    ];

    app.use((req, res, next) => {
      const origin = req.headers.origin;
      
      // Only log in development
      if (process.env.NODE_ENV !== 'production') {
        console.log('[CORS] Request from origin:', origin);
      }
      
      if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie, Set-Cookie, Cache-Control');
        res.header('Access-Control-Expose-Headers', 'Set-Cookie');
      }

      // Quick OPTIONS handling
      if (req.method === 'OPTIONS') {
        if (origin && allowedOrigins.includes(origin)) {
          res.status(200).end();
        } else {
          res.status(403).end();
        }
        return;
      }

      next();
    });

    // Optimized validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
        transformOptions: {
          enableImplicitConversion: true,
          exposeDefaultValues: true,
        },
        // Performance: Disable detailed error messages in production
        disableErrorMessages: process.env.NODE_ENV === 'production',
        validateCustomDecorators: true,
      }),
    );

    app.setGlobalPrefix('api');

    // Only setup Swagger in development for performance
    if (process.env.NODE_ENV !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('Weekly Work Report API')
        .setDescription('API documentation for Weekly Work Report Management System')
        .setVersion('1.0')
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            name: 'JWT',
            description: 'Enter JWT token',
            in: 'header',
          },
          'JWT-auth',
        )
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api', app, document);
    }

    await app.init();
  }
  return app;
}

async function bootstrap() {
  try {
    const app = await createNestApp();
    const envConfig = app.get(EnvironmentConfig);
    const port = envConfig.port;
    
    // Performance: Listen on all interfaces for Vercel
    await app.listen(port, '0.0.0.0');

    if (process.env.NODE_ENV !== 'production') {
      console.log(`🚀 Application is running on: http://localhost:${port}/api`);
      console.log(`📚 Swagger API documentation: http://localhost:${port}/api`);
      console.log(`🌍 Environment: ${envConfig.nodeEnv}`);
    }
  } catch (error) {
    console.error('Error starting the application:', error);
    process.exit(1);
  }
}

// Export for Vercel with performance optimization
export default async (req: any, res: any) => {
  const app = await createNestApp();
  const expressApp = app.getHttpAdapter().getInstance();
  return expressApp(req, res);
};

// Run locally
if (require.main === module) {
  bootstrap();
}
