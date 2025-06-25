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
  @ApiResponse({ status: 200, description: 'User logged in successfully' })
  @ApiQuery({ name: 'rememberMe', required: false, type: Boolean })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
    @Query('rememberMe') rememberMe?: boolean,
  ) {
    try {
      console.log(`[AUTH CONTROLLER] Login attempt for: ${loginDto.employeeCode}`);
      
      const result = await this.authService.login(loginDto, response, rememberMe || false);
      
      console.log(`[AUTH CONTROLLER] Login successful for: ${loginDto.employeeCode}`);
      
      // Log response headers for debugging
      console.log('[AUTH CONTROLLER] Response headers:', {
        'set-cookie': response.getHeader('set-cookie'),
        'access-control-allow-credentials': response.getHeader('access-control-allow-credentials'),
        'access-control-allow-origin': response.getHeader('access-control-allow-origin'),
      });
      
      return result;
    } catch (error) {
      console.error(`[AUTH CONTROLLER] Login error for ${loginDto.employeeCode}:`, error.message);
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'User logged out successfully' })
  logout(@Res({ passthrough: true }) response: Response) {
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
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiQuery({ name: 'rememberMe', required: false, type: Boolean })
  refreshToken(
    @GetUser() user: any,
    @Res({ passthrough: true }) response: Response,
    @Query('rememberMe') rememberMe?: boolean,
  ) {
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

  @Post('debug-cookie')
  @Public()
  @ApiOperation({ summary: 'Debug cookie setting' })
  debugCookie(@Res({ passthrough: true }) response: Response, @Req() req: any) {
    const testCookie = 'test-cookie-value-' + Date.now();
    const origin = req.headers.origin;
    
    console.log('[DEBUG] Request origin:', origin);
    
    // Set test cookie with EXACT same config as auth cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
      maxAge: 60000, // 1 minute
      path: '/',
    };
    
    response.cookie('debug-token', testCookie, cookieOptions);
    
    // Set CORS headers based on actual origin
    if (process.env.NODE_ENV === 'production') {
      const allowedOrigins = [
        'https://weeklyreport-orpin.vercel.app', // Frontend domain
      ];
      
      if (origin && allowedOrigins.includes(origin)) {
        response.header('Access-Control-Allow-Credentials', 'true');
        response.header('Access-Control-Allow-Origin', origin);
        response.header('Access-Control-Expose-Headers', 'Set-Cookie');
      } else {
        console.log('[DEBUG] Origin not allowed:', origin);
      }
    }
    
    return {
      success: true,
      message: 'Debug cookie set',
      environment: process.env.NODE_ENV,
      origin: origin,
      allowedOrigin: origin === 'https://weeklyreport-orpin.vercel.app',
      cookieValue: testCookie,
      cookieOptions,
    };
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
