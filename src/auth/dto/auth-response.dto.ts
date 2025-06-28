import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  employeeCode: string;

  @ApiProperty({ required: false })
  email?: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ required: false })
  phone?: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  officeId: string;

  @ApiProperty()
  jobPositionId: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({ required: false })
  office?: any;

  @ApiProperty({ required: false })
  jobPosition?: any;
}

export class AuthResponseDto {
  @ApiProperty()
  access_token: string;

  @ApiProperty({ type: UserResponseDto })
  user: any;

  @ApiProperty()
  message: string;
}
