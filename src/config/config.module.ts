import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { EnvironmentConfig } from './config.environment';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env'
      ],
      expandVariables: true,
    }),
  ],
  providers: [EnvironmentConfig],
  exports: [EnvironmentConfig],
})
export class ConfigModule {}
