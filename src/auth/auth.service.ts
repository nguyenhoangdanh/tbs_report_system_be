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
import { AuthResponseDto } from './dto/auth-response.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { EnvironmentConfig } from 'src/config/config.environment';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private readonly envConfig: EnvironmentConfig,
  ) {}

  async register(registerDto: RegisterDto) {
    const {
      employeeCode,
      email,
      password,
      firstName,
      lastName,
      phone,
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

    // Check if phone is already used (if provided)
    if (phone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone },
      });

      if (existingPhone) {
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
        phone,
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

  async login(loginDto: LoginDto, response?: Response, rememberMe = false): Promise<AuthResponseDto> {
    const { employeeCode, password } = loginDto;

    try {
      // Validate input
      if (!employeeCode || !password) {
        this.logger.warn(`Login failed: Missing employeeCode or password`);
        throw new BadRequestException('Employee code and password are required');
      }

      // Only log in development
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`Login attempt for employee: ${employeeCode}`);
      }

      // Ensure database connection before query
      await this.prisma.ensureConnection();

      // Optimized query with selective includes
      const user = await this.prisma.user.findUnique({
        where: { employeeCode },
        include: {
          office: {
            select: { id: true, name: true, type: true }
          },
          jobPosition: {
            include: {
              position: {
                select: { id: true, name: true, description: true }
              },
              department: {
                select: { id: true, name: true }
              },
            },
          },
        },
      });

      if (!user) {
        if (process.env.NODE_ENV !== 'production') {
          this.logger.warn(`Login failed for ${employeeCode}: User not found`);
        }
        throw new UnauthorizedException('Invalid credentials');
      }

      if (!user.isActive) {
        if (process.env.NODE_ENV !== 'production') {
          this.logger.warn(`Login failed for ${employeeCode}: User is inactive`);
        }
        throw new UnauthorizedException('Account is inactive');
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        if (process.env.NODE_ENV !== 'production') {
          this.logger.warn(`Login failed for ${employeeCode}: Invalid password`);
        }
        throw new UnauthorizedException('Invalid credentials');
      }

      // Generate JWT token
      const payload = { sub: user.id, employeeCode: user.employeeCode, role: user.role };
      const access_token = this.jwtService.sign(payload, {
        expiresIn: rememberMe ? '7d' : '1d'
      });

      // Set cookie if response object is provided
      if (response) {
        this.setAuthCookie(response, access_token, rememberMe);
      }

      // Return user data without password and convert dates to strings
      const { password: _, ...userWithoutPassword } = user;
      const userResponse = {
        ...userWithoutPassword,
        createdAt: userWithoutPassword.createdAt.toISOString(),
        updatedAt: userWithoutPassword.updatedAt.toISOString(),
      };

      return {
        access_token,
        user: userResponse,
        message: 'Đăng nhập thành công'
      };

    } catch (error) {
      // Log the actual error for debugging
      this.logger.error(`Login error for ${employeeCode}:`, error.message);
      
      // Re-throw the error if it's already a proper HTTP exception
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }
      
      // For any other error, throw a generic bad request
      throw new BadRequestException('Login failed. Please check your credentials.');
    }
  }

  async logout(response: Response) {
    this.logger.log('Logout request received');

    // Clear auth cookie
    this.clearAuthCookie(response);

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

  async refreshToken(userId: string, response: Response, rememberMe = false): Promise<AuthResponseDto> {
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

    // Generate new token
    const payload = { sub: user.id, employeeCode: user.employeeCode, role: user.role };
    const access_token = this.jwtService.sign(payload, {
      expiresIn: rememberMe ? '7d' : '1d'
    });

    // Update cookie with new token
    this.setAuthCookie(response, access_token, rememberMe);

    // Convert dates to strings
    const { password: _, ...userWithoutPassword } = user;
    const userResponse = {
      ...userWithoutPassword,
      createdAt: userWithoutPassword.createdAt.toISOString(),
      updatedAt: userWithoutPassword.updatedAt.toISOString(),
    };

    return {
      access_token,
      user: userResponse,
      message: 'Token refreshed successfully',
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { employeeCode, phone } = forgotPasswordDto;

    // Find user by employeeCode and phone
    const user = await this.prisma.user.findFirst({
      where: {
        employeeCode,
        phone,
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
        'Thông tin mã nhân viên và Sdt không khớp hoặc tài khoản không tồn tại',
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
        phone: user.phone,
      },
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { employeeCode, phone, newPassword } = resetPasswordDto;

    // Verify user again with employeeCode and phone
    const user = await this.prisma.user.findFirst({
      where: {
        employeeCode,
        phone,
        isActive: true,
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Thông tin mã nhân viên và Sdt không khớp hoặc tài khoản không tồn tại',
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

  private setAuthCookie(response: Response, token: string, rememberMe = false) {
    const maxAge = rememberMe
      ? 7 * 24 * 60 * 60 * 1000  // 7 days
      : 24 * 60 * 60 * 1000;     // 1 day

    const isProduction = this.envConfig.isProduction;

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      maxAge,
      path: '/',
      domain: isProduction ? this.envConfig.cookieDomain || undefined : undefined,
    };

    this.logger.log('Setting auth cookie:', {
      tokenLength: token.length,
      maxAge,
      isProduction,
      domain: cookieOptions.domain,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
    });

    response.cookie('access_token', token, cookieOptions);
  }

  private clearAuthCookie(response: Response) {
    const isProduction = this.envConfig.isProduction;
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      path: '/',
      domain: isProduction ? this.envConfig.cookieDomain || undefined : undefined,
    };

    this.logger.log('Clearing auth cookie with options:', cookieOptions);

    response.clearCookie('access_token', cookieOptions);
  }
}
