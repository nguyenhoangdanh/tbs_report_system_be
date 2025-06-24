import {
  IsArray,
  ValidateNested,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class UpdateReportTaskDto {
  @ApiProperty({ description: 'Task ID', required: false })
  @IsOptional()
  id?: string;

  @ApiProperty({ description: 'Monday completion', required: false })
  @IsOptional()
  @IsBoolean()
  monday?: boolean;

  @ApiProperty({ description: 'Tuesday completion', required: false })
  @IsOptional()
  @IsBoolean()
  tuesday?: boolean;

  @ApiProperty({ description: 'Wednesday completion', required: false })
  @IsOptional()
  @IsBoolean()
  wednesday?: boolean;

  @ApiProperty({ description: 'Thursday completion', required: false })
  @IsOptional()
  @IsBoolean()
  thursday?: boolean;

  @ApiProperty({ description: 'Friday completion', required: false })
  @IsOptional()
  @IsBoolean()
  friday?: boolean;

  @ApiProperty({ description: 'Saturday completion', required: false })
  @IsOptional()
  @IsBoolean()
  saturday?: boolean;

  @ApiProperty({ description: 'Sunday completion', required: false })
  @IsOptional()
  @IsBoolean()
  sunday?: boolean;

  @ApiProperty({ description: 'Task completion status', required: false })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiProperty({ description: 'Reason if not completed', required: false })
  @IsOptional()
  reasonNotDone?: string;
}

export class UpdateReportDto {
  @ApiProperty({ description: 'Report completion status', required: false })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiProperty({
    description: 'Updated tasks',
    required: false,
    type: [UpdateReportTaskDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateReportTaskDto)
  tasks?: UpdateReportTaskDto[];
}
