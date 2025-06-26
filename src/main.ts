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

    // Enhanced CORS configuration with better logging
    app.enableCors({
      ...corsConfig,
      origin: (origin, callback) => {
        console.log(`CORS request from origin: ${origin || 'no-origin'}`);
        
        if (!origin) {
          console.log('Allowing request with no origin');
          return callback(null, true);
        }

        // List of allowed origins
        const allowedOrigins = [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'https://localhost:3000',
          'https://127.0.0.1:3000',
          'https://weeklyreport-orpin.vercel.app',
        ];

        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
          console.log(`Allowing origin: ${origin}`);
          return callback(null, true);
        }

        console.warn(`CORS blocked origin: ${origin}`);
        console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
        callback(null, true); // Temporarily allow all for debugging
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
      ],
      exposedHeaders: ['set-cookie'],
      optionsSuccessStatus: 200,
      preflightContinue: false,
    });

    // Add health check endpoint
    app.use('/api/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: '1.0.0'
      });
    });

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

// Enhanced Vercel handler with better error handling and CORS
export default async (req: any, res: any) => {
  try {
    // Set CORS headers immediately for all requests
    const origin = req.headers.origin;
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://localhost:3000',
      'https://127.0.0.1:3000',
      'https://weeklyreportsystem-mu.vercel.app',
    ];

    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,X-HTTP-Method-Override');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Handle static requests quickly
    if (req.url === '/favicon.ico') {
      res.status(204).end();
      return;
    }

    if (req.url === '/' || req.url === '/api') {
      res.json({
        message: 'Weekly Work Report API',
        status: 'ok',
        timestamp: new Date().toISOString(),
        docs: '/api',
        health: '/api/health'
      });
      return;
    }

    // Handle health check
    if (req.url === '/api/health') {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: '1.0.0'
      });
      return;
    }

    const app = await createNestApp();
    const expressApp = app.getHttpAdapter().getInstance();
    
    return expressApp(req, res);
  } catch (error) {
    console.error('Vercel handler error:', error);
    
    // Set CORS headers even on error
    const origin = req.headers?.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
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