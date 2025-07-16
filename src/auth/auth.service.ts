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
        this.logger.log(`Login attempt for employee: ${employeeCode}, rememberMe: ${rememberMe}`);
      }

      // Ensure database connection before query
      await this.prisma.ensureConnection();

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
                  select: { id: true, name: true, description: true }
                },
                department: {
                  select: { id: true, name: true }
                },
              },
            },
          },
        });

        if (process.env.NODE_ENV !== 'production' && user) {
          this.logger.log(`Found user by MSNV: ${employeeCode} -> ${user.email}`);
        }
      }

      // If not found by MSNV and input looks like email prefix, try email search
      if (!user && isEmailPrefix) {
        // Find user by email prefix - construct full email pattern
        const expectedEmail = `${employeeCode}@tbsgroup.vn`;
        
        if (process.env.NODE_ENV !== 'production') {
          this.logger.log(`Searching for email: ${expectedEmail}`);
        }
        
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
                  select: { id: true, name: true, description: true }
                },
                department: {
                  select: { id: true, name: true }
                },
              },
            },
          },
        });

        if (process.env.NODE_ENV !== 'production' && user) {
          this.logger.log(`Found user by email prefix: ${employeeCode} -> ${user.email}`);
        }
      }

      if (!user) {
        if (process.env.NODE_ENV !== 'production') {
          this.logger.warn(`Login failed for ${employeeCode}: User not found`, {
            searchedAsMSNV: isNumericMSNV,
            searchedAsEmailPrefix: isEmailPrefix,
            expectedEmail: isEmailPrefix ? `${employeeCode}@tbsgroup.vn` : null,
            inputType: isNumericMSNV ? 'NUMERIC_MSNV' : isEmailPrefix ? 'EMAIL_PREFIX' : 'INVALID_FORMAT'
          });
        }
        throw new UnauthorizedException('Invalid credentials');
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
        throw new UnauthorizedException('Invalid credentials');
      }

      // Generate JWT token with explicit secret logging for debugging
      const payload = { sub: user.id, employeeCode: user.employeeCode, role: user.role };
      
      // Debug JWT secret in production to verify consistency
      if (this.envConfig.isProduction) {
        this.logger.log('JWT Generation Debug:', {
          secretLength: this.envConfig.jwtSecret.length,
          secretPrefix: this.envConfig.jwtSecret.substring(0, 10),
          payloadSub: payload.sub,
          expiresIn: rememberMe ? '30d' : '7d',
          loginMethod: isNumericMSNV ? 'MSNV' : 'EMAIL_PREFIX',
          originalInput: employeeCode,
          foundUser: user.employeeCode,
          matchedEmail: user.email
        });
      }
      
      const access_token = this.jwtService.sign(payload, {
        expiresIn: rememberMe ? '30d' : '7d',
        secret: this.envConfig.jwtSecret, // Explicitly pass secret
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

    // Generate new token with updated expiration
    const payload = { sub: user.id, employeeCode: user.employeeCode, role: user.role };
    const access_token = this.jwtService.sign(payload, {
      expiresIn: rememberMe ? '30d' : '7d'  // Updated: true = 30 days, false = 7 days
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

  private setAuthCookie(response: Response, token: string, rememberMe = false) {
    // Updated cookie duration: false = 7 days, true = 30 days
    const maxAge = rememberMe
      ? 30 * 24 * 60 * 60 * 1000  // 30 days
      : 7 * 24 * 60 * 60 * 1000;  // 7 days

    const isProduction = this.envConfig.isProduction;

    // Enhanced cookie options for cross-origin
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      maxAge,
      path: '/',
      // Remove domain completely for cross-origin
    };

    this.logger.log('Setting auth cookie:', {
      tokenLength: token.length,
      maxAge,
      rememberMe,
      durationDays: rememberMe ? 30 : 7,
      isProduction,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      hasResponse: !!response,
    });

    response.cookie('access_token', token, cookieOptions);
    
    // Debug: Also set a test cookie to verify cross-origin works
    if (isProduction) {
      response.cookie('debug-token', 'test-value', {
        httpOnly: false, // Make it accessible via JS for debugging
        secure: true,
        sameSite: 'none',
        maxAge: 300000, // 5 minutes
        path: '/',
      });
    }
  }

  private clearAuthCookie(response: Response) {
    const isProduction = this.envConfig.isProduction;
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      path: '/',
    };

    this.logger.log('Clearing auth cookie with options:', cookieOptions);

    response.clearCookie('access_token', cookieOptions);
    
    // Also clear debug cookie
    if (isProduction) {
      response.clearCookie('debug-token', {
        secure: true,
        sameSite: 'none',
        path: '/',
      });
    }
  }
}
