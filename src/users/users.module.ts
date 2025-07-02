import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaService } from '../common/prisma.service';
import { EnvironmentConfig } from '../config/config.environment';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService, EnvironmentConfig],
  exports: [UsersService],
})
export class UsersModule {}
