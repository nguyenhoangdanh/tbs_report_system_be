import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskReportDto {
  @ApiProperty()
  @IsString()
  taskName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  monday?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  tuesday?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  wednesday?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  thursday?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  friday?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  saturday?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sunday?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonNotDone?: string;
}

export class CreateWeeklyReportDto {
  @ApiProperty({ minimum: 1, maximum: 53 })
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'weekNumber must be an integer number' })
  @Min(1, { message: 'weekNumber must not be less than 1' })
  @Max(53, { message: 'weekNumber must not be greater than 53' })
  weekNumber: number;

  @ApiProperty({ minimum: 2020, maximum: 2030 })
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'year must be an integer number' })
  @Min(2020, { message: 'year must not be less than 2020' })
  @Max(2030, { message: 'year must not be greater than 2030' })
  year: number;

  @ApiProperty({ type: [CreateTaskReportDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskReportDto)
  tasks: CreateTaskReportDto[];
}

export class UpdateReportDto {
  @ApiProperty({ required: false, description: 'Report completion status' })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiProperty({ type: [CreateTaskReportDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskReportDto)
  tasks?: CreateTaskReportDto[];
}
