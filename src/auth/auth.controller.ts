import {
  Controller,
  Post,
  Body,
  UseGuards,
  Res,
  Query,
  Patch,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({
    status: 200,
    description: 'User logged in successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid credentials',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    try {
      console.log('Login request received:', {
        employeeCode: loginDto.employeeCode,
        hasPassword: !!loginDto.password,
        rememberMe: loginDto.rememberMe || false,
      });

      return await this.authService.login(loginDto, response, loginDto.rememberMe || false);
    } catch (error) {
      console.error('Login controller error:', error);
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'User logged out successfully' })
  async logout(@Res({ passthrough: true }) response: Response) {
    return this.authService.logout(response);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() req: any,
  ) {
    return this.authService.changePassword(req.user.id, changePasswordDto);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: AuthResponseDto,
  })
  refreshToken(
    @GetUser() user: any,
    @Res({ passthrough: true }) response: Response,
    @Body('rememberMe') rememberMe?: boolean,
  ): Promise<AuthResponseDto> {
    return this.authService.refreshToken(
      user.id,
      response,
      rememberMe || false,
    );
  }

  @Post('forgot-password')
  @Public()
  @ApiOperation({ summary: 'Verify employee info for password reset' })
  @ApiResponse({ status: 200, description: 'Employee verification successful' })
  @ApiResponse({ status: 400, description: 'Invalid employee info' })
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @Public()
  @ApiOperation({ summary: 'Reset password with verified employee info' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid employee info' })
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  // Test endpoint to check if debug cookie persists
  @Post('check-cookie')
  @Public()
  @ApiOperation({ summary: 'Check if cookie persists' })
  checkCookie(@Req() req: any) {
    const debugToken = req.cookies['debug-token'];
    const authToken = req.cookies['auth-token'];

    console.log('[CHECK] Debug token:', debugToken);
    console.log('[CHECK] Auth token exists:', !!authToken);
    console.log('[CHECK] All cookies:', req.cookies);

    return {
      success: true,
      hasDebugToken: !!debugToken,
      hasAuthToken: !!authToken,
      debugTokenValue: debugToken,
      allCookies: Object.keys(req.cookies),
    };
  }
}
