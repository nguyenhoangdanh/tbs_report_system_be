import {
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsString,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({
    example: 'Complete weekly safety training',
    description: 'Name of the task',
  })
  @IsString()
  @IsNotEmpty()
  taskName: string;

  @ApiProperty({
    example: true,
    description: 'Task completed on Monday',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  monday?: boolean;

  @ApiProperty({
    example: false,
    description: 'Task completed on Tuesday',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  tuesday?: boolean;

  @ApiProperty({
    example: true,
    description: 'Task completed on Wednesday',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  wednesday?: boolean;

  @ApiProperty({
    example: true,
    description: 'Task completed on Thursday',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  thursday?: boolean;

  @ApiProperty({
    example: false,
    description: 'Task completed on Friday',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  friday?: boolean;

  @ApiProperty({
    example: false,
    description: 'Task completed on Saturday',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  saturday?: boolean;

  @ApiProperty({
    example: false,
    description: 'Task completed on Sunday',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  sunday?: boolean;

  @ApiProperty({
    example: false,
    description: 'Overall task completion status',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isCompleted?: boolean;

  @ApiProperty({
    example: 'Equipment was under maintenance',
    description: 'Reason why task was not completed',
    required: false,
  })
  @IsString()
  @IsOptional()
  reasonNotDone?: string;
}

export class CreateReportDto {
  @ApiProperty({
    example: 25,
    description: 'Week number (1-53)',
  })
  @IsNotEmpty()
  weekNumber: number;

  @ApiProperty({
    example: 2024,
    description: 'Year of the report',
  })
  @IsNotEmpty()
  year: number;

  @ApiProperty({
    description: 'Array of 11 tasks for the weekly report',
    type: [CreateTaskDto],
    example: [
      {
        taskName: 'Complete safety training',
        monday: true,
        tuesday: true,
        wednesday: false,
        thursday: true,
        friday: true,
        isCompleted: false,
        reasonNotDone: 'Training was rescheduled',
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  tasks: CreateTaskDto[];
}
