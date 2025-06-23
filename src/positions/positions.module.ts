import { Module } from '@nestjs/common';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [PositionsController],
  providers: [PositionsService, PrismaService],
  exports: [PositionsService],
})
export class PositionsModule {}
