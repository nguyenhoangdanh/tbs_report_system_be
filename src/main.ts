import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentConfig } from './config/config.environment';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

// Global app cache for Vercel
let app: NestExpressApplication;

async function createNestApp() {
  if (!app) {
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      // Minimal logging for performance
      logger: process.env.NODE_ENV === 'production' 
        ? false 
        : ['error', 'warn'],
      
      // Disable unnecessary features for API
      cors: false, // Handle manually for better control
      bodyParser: true,
      abortOnError: false, // Don't crash on startup errors
    });

    // Essential middleware only
    app.use(cookieParser());
    app.set('trust proxy', 1);
    app.disable('x-powered-by');

    // Simplified CORS for performance
    const allowedOrigins = [
      'http://localhost:3000',
      'https://weeklyreport-orpin.vercel.app',
    ];

    app.use((req, res, next) => {
      const origin = req.headers.origin;
      
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Origin,Content-Type,Accept,Authorization,Cookie');
        res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');
      }

      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }
      next();
    });

    // Optimized validation
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
        disableErrorMessages: process.env.NODE_ENV === 'production',
        validateCustomDecorators: false, // Disable for performance
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    app.setGlobalPrefix('api');

    // Skip Swagger in production
    if (process.env.NODE_ENV === 'development') {
      const config = new DocumentBuilder()
        .setTitle('Weekly Work Report API')
        .setVersion('1.0')
        .addBearerAuth()
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
    
    await app.listen(port, '0.0.0.0');
    console.log(`🚀 Application running on port ${port}`);
  } catch (error) {
    console.error('Bootstrap error:', error);
    process.exit(1);
  }
}

// Optimized Vercel handler
export default async (req: any, res: any) => {
  try {
    const app = await createNestApp();
    const expressApp = app.getHttpAdapter().getInstance();
    return expressApp(req, res);
  } catch (error) {
    console.error('Vercel handler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

if (require.main === module) {
  bootstrap();
}
