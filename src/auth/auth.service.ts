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

  // iOS Detection utility
  private detectiOSDevice(userAgent: string): boolean {
    const iosPattern = /iPad|iPhone|iPod|Mac.*Mobile|Mac.*Touch/i;
    const safariPattern = /Safari/i;
    const chromePattern = /Chrome|CriOS/i;
    
    const isIOS = iosPattern.test(userAgent);
    const isSafari = safariPattern.test(userAgent) && !chromePattern.test(userAgent);
    
    return isIOS && isSafari;
  }

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
    // if (phone) {
    //   const existingPhone = await this.prisma.user.findUnique({
    //     where: { phone },
    //   });

    //   if (existingPhone) {
    //     throw new ConflictException('User with this card ID already exists');
    //   }
    // }

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

  async login(loginDto: LoginDto, response?: Response, rememberMe = false, request?: any): Promise<AuthResponseDto> {
    const { employeeCode, password } = loginDto;

    try {
      // Detect iOS Safari
      const userAgent = request?.headers['user-agent'] || '';
      const isIOSSafari = this.detectiOSDevice(userAgent);
      
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`Device Detection: iOS Safari = ${isIOSSafari}, UA: ${userAgent.substring(0, 100)}`);
      }

      // Validate input
      if (!employeeCode || !password) {
        this.logger.warn(`Login failed: Missing employeeCode or password`);
        throw new BadRequestException('Employee code and password are required');
      }

      // Only log in development
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`Login attempt for employee: ${employeeCode}, rememberMe: ${rememberMe}`);
      }

      // Ensure database connection before query
      // await this.prisma.ensureConnection();

      // Enhanced user lookup - support both MSNV and email prefix
      let user = null;
      
      // Determine if input is MSNV (all digits) or email prefix (contains letters)
      const isNumericMSNV = /^\d+$/.test(employeeCode);
      const isEmailPrefix = /^[a-zA-Z][a-zA-Z0-9]*$/.test(employeeCode) && employeeCode.length >= 2 && employeeCode.length <= 20;
      
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`Login type detection for "${employeeCode}":`, {
          isNumericMSNV,
          isEmailPrefix,
          length: employeeCode.length
        });
      }

      // First, try direct lookup by employeeCode (MSNV)
      if (isNumericMSNV) {
        user = await this.prisma.user.findUnique({
          where: { employeeCode },
          include: {
            office: {
              select: { id: true, name: true, type: true }
            },
            jobPosition: {
              include: {
                position: {
                  select: { id: true, name: true, description: true, level: true}
                },
                department: {
                  select: { id: true, name: true }
                },
              },
            },
          },
        });
      
      }

      // If not found by MSNV and input looks like email prefix, try email search
      if (!user && isEmailPrefix) {
        // Find user by email prefix - construct full email pattern
        const expectedEmail = `${employeeCode}@tbsgroup.vn`;
        
        user = await this.prisma.user.findFirst({
          where: {
            email: expectedEmail,  // Search for exact email match
            // isActive: true
          },
          include: {
            office: {
              select: { id: true, name: true, type: true }
            },
            jobPosition: {
              include: {
                position: {
                  select: { id: true, name: true, description: true, level: true }
                },
                department: {
                  select: { id: true, name: true }
                },
              },
            },
          },
        });

      }

      if (!user) {
        // throw new UnauthorizedException('Invalid credentials');
        throw new BadRequestException('Thông tin đăng nhập không chính xác');
      }

      // if (!user.isActive) {
      //   if (process.env.NODE_ENV !== 'production') {
      //     this.logger.warn(`Login failed for ${employeeCode}: User is inactive`);
      //   }
      //   throw new UnauthorizedException('Account is inactive');
      // }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        if (process.env.NODE_ENV !== 'production') {
          this.logger.warn(`Login failed for ${employeeCode}: Invalid password`);
        }
        // throw new UnauthorizedException('Invalid credentials');
        throw new BadRequestException('Mật khẩu không chính xác');
      }

      // Generate JWT token
      const payload = { sub: user.id, employeeCode: user.employeeCode, role: user.role };
      
      const access_token = this.jwtService.sign(payload, {
        expiresIn: rememberMe ? '30d' : '7d',
        secret: this.envConfig.jwtSecret,
      });

      // Set cookie with iOS-specific handling
      if (response) {
        this.setAuthCookie(response, access_token, rememberMe, isIOSSafari);
      }

      // Return user data with iOS-specific headers
      const { password: _, ...userWithoutPassword } = user;
      const userResponse = {
        ...userWithoutPassword,
        isManager: user.jobPosition.position.name === "NV" && user.jobPosition.position.level === 7 ? false : true,
        createdAt: userWithoutPassword.createdAt.toISOString(),
        updatedAt: userWithoutPassword.updatedAt.toISOString(),
      };

      // For iOS Safari, also set token in response header as fallback
      if (isIOSSafari && response) {
        response.setHeader('X-Access-Token', access_token);
        response.setHeader('X-iOS-Fallback', 'true');
      }

      return {
        access_token,
        user: userResponse,
        message: 'Đăng nhập thành công',
        ...(isIOSSafari && { iosDetected: true, fallbackToken: access_token })
      };

    } catch (error) {
      this.logger.error(`Login error for ${employeeCode}:`, error.message);
      
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }
      
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
      // throw new UnauthorizedException('Current password is incorrect');
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return { message: 'Password changed successfully' };
  }

  async refreshToken(userId: string, response: Response, rememberMe = false, request?: any): Promise<AuthResponseDto> {
    // Detect iOS Safari
    const userAgent = request?.headers['user-agent'] || '';
    const isIOSSafari = this.detectiOSDevice(userAgent);

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
      expiresIn: rememberMe ? '30d' : '7d'
    });

    // Update cookie with iOS handling
    this.setAuthCookie(response, access_token, rememberMe, isIOSSafari);

    // For iOS Safari, also set token in response header
    if (isIOSSafari) {
      response.setHeader('X-Access-Token', access_token);
      response.setHeader('X-iOS-Fallback', 'true');
    }

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
      ...(isIOSSafari && { iosDetected: true, fallbackToken: access_token })
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
        // isActive: true,
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
      data: { password: hashedNewPassword, isActive: true }, // Ensure account is active after reset
    });

    return {
      message:
        'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.',
    };
  }

  private setAuthCookie(response: Response, token: string, rememberMe = false, isIOSSafari = false) {
    const maxAge = rememberMe
      ? 30 * 24 * 60 * 60 * 1000  // 30 days
      : 7 * 24 * 60 * 60 * 1000;  // 7 days

    const isProduction = this.envConfig.isProduction;

    // iOS-specific cookie strategy
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      // iOS Safari: Always use 'lax' instead of 'none' for better compatibility
      sameSite: (isProduction && !isIOSSafari) ? 'none' as const : 'lax' as const,
      maxAge,
      path: '/',
    };

    this.logger.log('Setting auth cookie:', {
      tokenLength: token.length,
      maxAge,
      rememberMe,
      durationDays: rememberMe ? 30 : 7,
      isProduction,
      isIOSSafari,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
    });

    response.cookie('access_token', token, cookieOptions);
    
  }

  private clearAuthCookie(response: Response, isIOSSafari = false) {
    const isProduction = this.envConfig.isProduction;
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: (isProduction && !isIOSSafari) ? 'none' as const : 'lax' as const,
      path: '/',
    };

    this.logger.log('Clearing auth cookie with options:', cookieOptions);

    response.clearCookie('access_token', cookieOptions);
    
    // Clear iOS fallback cookie
    if (isIOSSafari && isProduction) {
      response.clearCookie('ios_auth_token', {
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    }
  }
}
