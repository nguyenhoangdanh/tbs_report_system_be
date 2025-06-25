import {
  Injectable,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
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

    // Only log in development
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Login attempt for employee: ${employeeCode}`);
    }

    // Optimized query with selective includes
    const user = await this.prisma.user.findUnique({
      where: { employeeCode },
      include: {
        office: {
          select: { id: true, name: true }
        },
        jobPosition: {
          include: {
            position: {
              select: { id: true, name: true }
            },
            department: {
              select: { id: true, name: true }
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(`Login failed for ${employeeCode}: User not found or inactive`);
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // Parallel password check and token generation for better performance
    const [isPasswordValid, tokens] = await Promise.all([
      bcrypt.compare(password, user.password),
      this.generateTokens(user.id, user.employeeCode, user.role, rememberMe)
    ]);

    if (!isPasswordValid) {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(`Login failed for ${employeeCode}: Invalid password`);
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // Optimized cookie setting
    const maxAge = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const isProduction = process.env.NODE_ENV === 'production';
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      maxAge,
      path: '/',
    };

    response.cookie('auth-token', tokens.accessToken, cookieOptions);

    // Set CORS headers only in production
    if (isProduction) {
      response.header('Access-Control-Allow-Credentials', 'true');
      response.header('Access-Control-Allow-Origin', 'https://weeklyreport-orpin.vercel.app');
      response.header('Access-Control-Expose-Headers', 'Set-Cookie');
      response.header('Vary', 'Origin');
    }

    const { password: _, ...userWithoutPassword } = user;

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Login successful for ${employeeCode}`);
    }

    return {
      success: true,
      user: userWithoutPassword,
      message: 'Login successful',
    };
  }

  async logout(response: Response) {
    this.logger.log('Logout request received');

    // Simple cookie clearing - same config as setting
    const isProduction = process.env.NODE_ENV === 'production';
    
    response.clearCookie('auth-token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      path: '/',
      // NO DOMAIN
    });

    this.logger.log('Auth cookie cleared');
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
      user.employeeCode,
      user.role,
      rememberMe,
    );

    // Update cookie with new token - use same simple config
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
    const payload = {
      sub: userId,
      employeeCode,
      role,
      iat: Math.floor(Date.now() / 1000),
    };

    const expiresIn = rememberMe ? '7d' : '1d';

    // Async token generation for better performance
    const accessToken = await this.jwtService.signAsync(payload, { expiresIn });

    return { accessToken };
  }

  private setAuthCookie(response: Response, token: string, rememberMe = false) {
    const maxAge = rememberMe
      ? 7 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

    const isProduction = process.env.NODE_ENV === 'production';

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      maxAge,
      path: '/',
      // NO DOMAIN
    };

    this.logger.log('Setting auth cookie:', {
      tokenLength: token.length,
      maxAge,
      config: cookieOptions,
    });

    response.cookie('auth-token', token, cookieOptions);
  }

  private clearAuthCookie(response: Response) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      path: '/',
      maxAge: 0,
      expires: new Date(0),
      // NO DOMAIN
    };

    this.logger.log('Clearing auth cookie:', cookieOptions);

    response.clearCookie('auth-token', cookieOptions);
  }
}
