import {
  IsString,
  IsOptional,
  IsUUID,
  Length,
  IsEmail,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UpdateProfileDto {
  @ApiProperty({ description: 'Employee code', required: false })
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @ApiProperty({ description: 'First name', required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ description: 'Last name', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({
    description: 'Email address',
    required: false,
    example: 'user@company.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Citizen ID card number (CCCD)',
    required: false,
    example: '012345678901',
  })
  @IsOptional()
  @IsString()
  @Length(12, 12, { message: 'Card ID must be exactly 12 digits' })
  cardId?: string;

  @ApiProperty({ description: 'Job position ID', required: false })
  @IsOptional()
  @IsUUID()
  jobPositionId?: string;

  @ApiProperty({ description: 'Office ID', required: false })
  @IsOptional()
  @IsUUID()
  officeId?: string;

  @ApiProperty({
    description: 'User role',
    required: false,
    enum: Role,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiProperty({ description: 'Phone number', required: false })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ description: 'Address', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'Date of birth', required: false })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;
}
