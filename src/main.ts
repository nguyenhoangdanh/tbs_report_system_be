import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentConfig } from './config/config.environment';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

// Global app instance for Vercel serverless optimization
let globalApp: NestExpressApplication | undefined;

async function createNestApp(): Promise<NestExpressApplication> {
  try {
    // Reuse app instance in production to avoid cold starts
    if (process.env.NODE_ENV === 'production' && globalApp) {
      return globalApp;
    }

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: process.env.NODE_ENV === 'production' 
        ? ['error', 'warn'] 
        : ['log', 'error', 'warn', 'debug'],
      abortOnError: false,
      bufferLogs: true,
    });

    // Essential middleware only
    app.use(cookieParser());
    app.set('trust proxy', 1);

    const envConfig = app.get(EnvironmentConfig);
    const corsConfig = envConfig.getCorsConfig();

    // Single CORS configuration - remove duplicate middleware
    app.enableCors(corsConfig);

    // Global prefix
    app.setGlobalPrefix('api');

    // Lightweight validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
        disableErrorMessages: process.env.NODE_ENV === 'production',
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Swagger only in development
    if (process.env.NODE_ENV === 'development') {
      const config = new DocumentBuilder()
        .setTitle('Weekly Work Report API')
        .setDescription('API documentation')
        .setVersion('1.0')
        .addBearerAuth()
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api', app, document);
    }

    await app.init();

    // Cache app instance for production
    if (process.env.NODE_ENV === 'production') {
      globalApp = app;
    }

    return app;
  } catch (error) {
    console.error('Failed to create NestJS app:', error);
    throw error;
  }
}

async function bootstrap() {
  try {
    const app = await createNestApp();
    const envConfig = app.get(EnvironmentConfig);
    const port = envConfig.port || 8080;
    
    await app.listen(port, '0.0.0.0');

    if (process.env.NODE_ENV === 'development') {
      console.log(`🚀 Application running on: http://localhost:${port}/api`);
    }
  } catch (error) {
    console.error('Bootstrap error:', error);
    process.exit(1);
  }
}

// Optimized Vercel handler with better error handling
export default async (req: any, res: any) => {
  try {
    // Handle static requests quickly
    if (req.url === '/favicon.ico') {
      res.status(204).end();
      return;
    }

    if (req.url === '/') {
      res.json({
        message: 'Weekly Work Report API',
        status: 'ok',
        docs: '/api',
        health: '/api/health'
      });
      return;
    }

    const app = await createNestApp();
    const expressApp = app.getHttpAdapter().getInstance();
    
    return expressApp(req, res);
  } catch (error) {
    console.error('Vercel handler error:', error);
    
    // Return proper error response
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Local development
if (require.main === module) {
  bootstrap();
}