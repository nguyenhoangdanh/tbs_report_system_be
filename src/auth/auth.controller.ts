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
    @Req() request: any,
  ): Promise<AuthResponseDto> {
    try {
      return await this.authService.login(loginDto, response, loginDto.rememberMe || false, request);
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
    @Req() request: any,
    @Body('rememberMe') rememberMe?: boolean,
  ): Promise<AuthResponseDto> {
    return this.authService.refreshToken(
      user.id,
      response,
      rememberMe || false,
      request,
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

  // Enhanced iOS debugging endpoint
  @Post('check-cookie')
  @Public()
  @ApiOperation({ summary: 'Check iOS detection and cookie compatibility' })
  checkCookie(@Req() req: any, @Res({ passthrough: true }) response: Response) {
    const userAgent = req.headers['user-agent'] || '';
    
    // Enhanced iOS detection
    const iosPattern = /iPad|iPhone|iPod/i;
    const macPattern = /Mac.*OS.*X/i;
    const safariPattern = /Safari/i;
    const chromePattern = /Chrome|CriOS|EdgiOS/i;
    
    const isIOS = iosPattern.test(userAgent);
    const isMac = macPattern.test(userAgent);
    const isSafari = safariPattern.test(userAgent);
    const isChrome = chromePattern.test(userAgent);
    const isSimulator = userAgent.includes('Simulator');
    
    const isIOSDevice = isIOS || isMac;
    const isIOSSafari = isIOSDevice && isSafari && !isChrome;
    const isRealDevice = isIOS && !isSimulator;
    
    // Check all possible cookies
    const allCookies = req.cookies || {};
    const cookieHeader = req.headers.cookie;
    
    // Set multiple test cookies for iOS
    const testToken = `test-${Date.now()}`;
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isIOSSafari) {
      // Set multiple test cookies with different strategies
      const strategies = [
        { name: 'test-strict', sameSite: 'strict' as const },
        { name: 'test-lax', sameSite: 'lax' as const },
        { name: 'test-session' }, // No maxAge
        { name: 'test-js', httpOnly: false },
      ];
      
      strategies.forEach(strategy => {
        response.cookie(strategy.name, testToken, {
          httpOnly: strategy.httpOnly !== false,
          secure: isProduction,
          sameSite: strategy.sameSite || 'lax',
          ...(strategy.name !== 'test-session' && { maxAge: 300000 }),
          path: '/',
        });
      });
    }

    return {
      success: true,
      deviceDetection: {
        userAgent: userAgent.substring(0, 150) + (userAgent.length > 150 ? '...' : ''),
        isIOS,
        isMac,
        isSafari,
        isChrome,
        isIOSDevice,
        isIOSSafari,
        isRealDevice,
        isSimulator,
        platform: req.headers['sec-ch-ua-platform'] || 'unknown'
      },
      cookies: {
        hasCookieHeader: !!cookieHeader,
        cookieHeaderLength: cookieHeader ? cookieHeader.length : 0,
        cookieHeaderRaw: cookieHeader || 'undefined',
        
        hasAccessToken: !!allCookies['access_token'],
        hasIOSToken: !!allCookies['ios_access_token'],
        hasAuthToken: !!allCookies['auth_token'],
        hasSessionToken: !!allCookies['session_token'],
        
        allCookieKeys: Object.keys(allCookies),
        cookieCount: Object.keys(allCookies).length,
        
        // Cookie values (first 10 chars for security)
        accessTokenPreview: allCookies['access_token'] ? allCookies['access_token'].substring(0, 10) + '...' : null,
        iosTokenPreview: allCookies['ios_access_token'] ? allCookies['ios_access_token'].substring(0, 10) + '...' : null,
      },
      headers: {
        origin: req.headers.origin,
        referer: req.headers.referer,
        host: req.headers.host,
        'sec-fetch-site': req.headers['sec-fetch-site'],
        'sec-fetch-mode': req.headers['sec-fetch-mode'],
        'sec-ch-ua': req.headers['sec-ch-ua'],
        'sec-ch-ua-platform': req.headers['sec-ch-ua-platform']
      },
      recommendations: {
        shouldUseFallback: isIOSSafari,
        cookieStrategy: isIOSSafari ? 'multi-strategy-ios' : 'standard',
        requiresSpecialHandling: isIOSSafari,
        isRealDeviceTest: isRealDevice,
        testAdvice: isRealDevice 
          ? 'Test on real iOS device detected - results are reliable'
          : 'Simulation detected - test on real iOS device for accurate results'
      },
      timestamp: new Date().toISOString(),
    };
  }
}
