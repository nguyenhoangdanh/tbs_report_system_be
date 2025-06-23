import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'EMP001',
    description: 'Employee code',
  })
  @IsString()
  @IsNotEmpty()
  employeeCode: string;

  @ApiProperty({
    example: '012345678901',
    description: 'Citizen ID card number (CCCD)',
  })
  @IsString()
  @IsNotEmpty()
  @Length(12, 12, { message: 'Card ID must be exactly 12 digits' })
  cardId: string;
}
