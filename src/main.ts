import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentConfig } from './config/config.environment';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  try {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable cookie parser
  app.use(cookieParser());

  // Enable validation
  // Đăng ký global pipes
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

 // Get environment configuration for CORS setup
    const envConfig = app.get(EnvironmentConfig);
    const corsConfig = envConfig.getCorsConfig();

  // Enable CORS with environment-specific configuration
  app.enableCors(corsConfig);

   // Thêm middleware CORS manual để handle các edge cases
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      const allowedOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://weeklyreport-orpin.vercel.app',
      ];

      if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
      }

      res.header('Access-Control-Allow-Credentials', 'true');
      res.header(
        'Access-Control-Allow-Methods',
        'GET,PUT,POST,DELETE,PATCH,OPTIONS',
      );
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie, Set-Cookie, mode, credentials, access-control-allow-origin, access-control-allow-headers, access-control-allow-methods, X-File-Name, Cache-Control',
      );

      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }

      next();
    });
  
   // Đảm bảo ứng dụng trust proxy
    app.set('trust proxy', 1);

  // Set global prefix
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

  const port = envConfig.port;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on: http://localhost:${port}/api`);
  console.log(`📚 Swagger API documentation: http://localhost:${port}/api`);
  console.log(`📊 API endpoints available at: http://localhost:${port}/api/*`);
  console.log(`🌍 Environment: ${envConfig.nodeEnv}`);
    console.log(`🍪 Cookie domain: ${envConfig.cookieDomain || 'default'}`)
      
      } catch (error) {
    console.error('Error starting the application:', error);
    process.exit(1);
  };
}
bootstrap();
