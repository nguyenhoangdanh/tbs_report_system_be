import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentConfig } from './config/config.environment';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

let app: any;

async function createNestApp() {
  if (!app) {
    app = await NestFactory.create<NestExpressApplication>(AppModule);

    // IMPORTANT: Cookie parser MUST be first
    app.use(cookieParser());

    // Trust proxy for Vercel/production
    app.set('trust proxy', 1);

    const envConfig = app.get(EnvironmentConfig);
    
    // Enable CORS with proper config
    const corsConfig = envConfig.getCorsConfig();
    app.enableCors(corsConfig);

    // Manual CORS middleware for edge cases
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      console.log('[CORS] Request from origin:', origin);
      console.log('[CORS] Cookies received:', req.headers.cookie);
      
      const allowedOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000', 
        'https://weeklyreport-orpin.vercel.app',
      ];

      if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        console.log('[CORS] Allowing origin:', origin);
      }

      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie, Set-Cookie, Cache-Control');

      if (req.method === 'OPTIONS') {
        console.log('[CORS] Handling preflight request');
        res.status(200).end();
        return;
      }

      next();
    });

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
        transformOptions: {
          enableImplicitConversion: true,
          exposeDefaultValues: true,
        },
      }),
    );

    app.setGlobalPrefix('api');

    // Setup Swagger
    const config = new DocumentBuilder()
      .setTitle('Weekly Work Report API')
      .setDescription(
        'API documentation for Weekly Work Report Management System',
      )
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
    SwaggerModule.setup('api', app, document, {
      customSiteTitle: 'Weekly Report API Docs',
      customfavIcon: 'https://nestjs.com/img/logo_text.svg',
      customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.min.js',
      ],
      customCssUrl: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
      ],
    });

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

    console.log(`🚀 Application is running on: http://localhost:${port}/api`);
    console.log(`📚 Swagger API documentation: http://localhost:${port}/api`);
    console.log(`📊 API endpoints available at: http://localhost:${port}/api/*`);
    console.log(`🌍 Environment: ${envConfig.nodeEnv}`);
    console.log(`🍪 Cookie domain: ${envConfig.cookieDomain || 'default'}`);
  } catch (error) {
    console.error('Error starting the application:', error);
    process.exit(1);
  }
}

// Export for Vercel
export default async (req: any, res: any) => {
  const app = await createNestApp();
  const expressApp = app.getHttpAdapter().getInstance();
  return expressApp(req, res);
};

// Run locally
if (require.main === module) {
  bootstrap();
}
