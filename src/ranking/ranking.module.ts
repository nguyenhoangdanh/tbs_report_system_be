import { Module } from '@nestjs/common';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [RankingController],
  providers: [RankingService, PrismaService],
  exports: [RankingService],
})
export class RankingModule {}
