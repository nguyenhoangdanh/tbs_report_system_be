import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { JobPositionsController } from './job-positions.controller';
import { JobPositionsService } from './job-positions.service';

@Module({
  controllers: [JobPositionsController],
  providers: [JobPositionsService, PrismaService],
  exports: [JobPositionsService],
})
export class JobPositionsModule {}
