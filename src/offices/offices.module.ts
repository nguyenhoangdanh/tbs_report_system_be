import { Module } from '@nestjs/common';
import { OfficesController } from './offices.controller';
import { OfficesService } from './offices.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [OfficesController],
  providers: [OfficesService, PrismaService],
  exports: [OfficesService],
})
export class OfficesModule {}
