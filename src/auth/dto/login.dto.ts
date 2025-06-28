import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({
    example: 'CEO001',
    description: 'Employee code',
    minLength: 1,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'Employee code is required' })
  @MinLength(1, { message: 'Employee code cannot be empty' })
  @MaxLength(50, { message: 'Employee code is too long' })
  @Transform(({ value }) => value?.toString().trim())
  employeeCode: string;

  @ApiProperty({
    example: '123456',
    description: 'Password',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(1, { message: 'Password cannot be empty' })
  password: string;
}
