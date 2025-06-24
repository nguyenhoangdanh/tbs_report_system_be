import {
  Injectable,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EnvironmentConfig } from '../config/config.environment';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private envConfig: EnvironmentConfig,
  ) {}

  async register(registerDto: RegisterDto) {
    const {
      employeeCode,
      email,
      password,
      firstName,
      lastName,
      cardId,
      jobPositionId,
      officeId,
      role,
    } = registerDto;

    // Check if user already exists by employeeCode
    const existingUser = await this.prisma.user.findUnique({
      where: { employeeCode },
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this employee code already exists',
      );
    }

    // Check if email is already used (if provided)
    if (email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingEmail) {
        throw new ConflictException('User with this email already exists');
      }
    }

    // Check if cardId is already used (if provided)
    if (cardId) {
      const existingCardId = await this.prisma.user.findUnique({
        where: { cardId },
      });

      if (existingCardId) {
        throw new ConflictException('User with this card ID already exists');
      }
    }

    // Validate job position and office
    const [jobPosition, office] = await Promise.all([
      this.prisma.jobPosition.findUnique({
        where: { id: jobPositionId },
        include: { department: true, position: true },
      }),
      this.prisma.office.findUnique({
        where: { id: officeId },
      }),
    ]);

    if (!jobPosition) {
      throw new BadRequestException('Job position not found');
    }
    if (!office) {
      throw new BadRequestException('Office not found');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        employeeCode,
        email,
        password: hashedPassword,
        firstName,
        lastName,
        cardId,
        jobPositionId,
        officeId,
        role,
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    return {
      user: userWithoutPassword,
      message: 'Registration successful',
    };
  }

  async login(loginDto: LoginDto, response: Response, rememberMe = false) {
    const { employeeCode, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { employeeCode },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.employeeCode,
      user.role,
      rememberMe,
    );

    // Set HTTP-only cookie
    this.setAuthCookie(response, tokens.accessToken, rememberMe);

    const { password: _, ...userWithoutPassword } = user;
    return {
      user: userWithoutPassword,
      message: 'Login successful',
    };
  }

  async logout(response: Response) {
    // Clear the auth cookie
    this.clearAuthCookie(response);
    return { message: 'Logout successful' };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return { message: 'Password changed successfully' };
  }

  async refreshToken(userId: string, response: Response, rememberMe = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.employeeCode, // Fixed: use employeeCode instead of email
      user.role,
      rememberMe,
    );

    // Update cookie with new token
    this.setAuthCookie(response, tokens.accessToken, rememberMe);

    const { password: _, ...userWithoutPassword } = user;
    return {
      user: userWithoutPassword,
      message: 'Token refreshed successfully',
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { employeeCode, cardId } = forgotPasswordDto;

    // Find user by employeeCode and cardId
    const user = await this.prisma.user.findFirst({
      where: {
        employeeCode,
        cardId,
        isActive: true,
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Thông tin mã nhân viên và CCCD không khớp hoặc tài khoản không tồn tại',
      );
    }

    // Return user info (without password) for verification
    const { password: _, ...userInfo } = user;
    return {
      message: 'Xác thực thành công. Bạn có thể đặt lại mật khẩu.',
      user: {
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { employeeCode, cardId, newPassword } = resetPasswordDto;

    // Verify user again with employeeCode and cardId
    const user = await this.prisma.user.findFirst({
      where: {
        employeeCode,
        cardId,
        isActive: true,
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Thông tin mã nhân viên và CCCD không khớp hoặc tài khoản không tồn tại',
      );
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    });

    return {
      message:
        'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.',
    };
  }

  private async generateTokens(
    userId: string,
    employeeCode: string,
    role: Role,
    rememberMe = false,
  ) {
    const payload = { sub: userId, employeeCode, role };
    const expiresIn = rememberMe
      ? this.envConfig.jwtRememberMeExpiresIn
      : this.envConfig.jwtExpiresIn;

    const accessToken = this.jwtService.sign(payload, { expiresIn });
    return { accessToken };
  }

  private setAuthCookie(response: Response, token: string, rememberMe = false) {
    const maxAge = rememberMe
      ? 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
      : 24 * 60 * 60 * 1000; // 1 day in milliseconds

    const cookieConfig = this.envConfig.getCookieConfig(maxAge);

    response.cookie('auth-token', token, cookieConfig);
  }

  private clearAuthCookie(response: Response) {
    const cookieConfig = this.envConfig.getCookieConfig(0);
    response.clearCookie('auth-token', {
      ...cookieConfig,
      maxAge: 0,
    });
  }
}
