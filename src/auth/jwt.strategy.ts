import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../common/prisma.service';
import { EnvironmentConfig } from '../config/config.environment';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private prisma: PrismaService,
    private envConfig: EnvironmentConfig,
  ) {

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Enhanced cookie extraction with iOS fallback
        (request: Request) => {
          const token = request?.cookies?.['access_token'];
          const iosToken = request?.cookies?.['ios_access_token'];
          
          // Try main token first, then iOS fallback
          const finalToken = token || iosToken;

          // Debug logging for iOS issues
          if (this.envConfig.isProduction) {
            const userAgent = request?.headers?.['user-agent'] || '';
            const isIOS = /iPad|iPhone|iPod|Mac.*OS.*X/i.test(userAgent);
            
            this.logger.log('JWT Extraction Debug:', {
              hasCookies: !!request?.cookies,
              cookieKeys: request?.cookies ? Object.keys(request.cookies) : [],
              hasAccessToken: !!token,
              hasIOSToken: !!iosToken,
              finalToken: !!finalToken,
              tokenLength: finalToken ? finalToken.length : 0,
              isIOSDevice: isIOS,
              userAgent: userAgent?.substring(0, 50),
              origin: request?.headers?.origin,
            });
          }

          return finalToken;
        },
        // Fallback to Authorization header
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // iOS fallback: Check custom header
        (request: Request) => {
          return request?.headers?.['x-access-token'] as string;
        }
      ]),
      ignoreExpiration: false,
      secretOrKey: envConfig.jwtSecret,
      passReqToCallback: false,
    });
  }

  async validate(payload: any) {
    try {

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          office: true,
          jobPosition: {
            include: {
              position: true,
              department: {
                select: {
                  id: true,
                  name: true,
                  officeId: true,
                },
              },
            },
          },
        },
      });

      if (!user || !user.isActive) {
        if (this.envConfig.isProduction) {
          this.logger.warn('JWT Validation Failed:', {
            userId: payload.sub,
            userExists: !!user,
            userActive: user?.isActive,
          });
        }
        throw new UnauthorizedException('User not found or inactive');
      }

      const { password, ...userWithoutPassword } = user;

      return userWithoutPassword;
    } catch (error) {
      if (this.envConfig.isProduction) {
        this.logger.error('JWT Validation Error:', {
          error: error.message,
          payloadExp: payload?.exp,
          payloadIat: payload?.iat,
          currentTime: Math.floor(Date.now() / 1000),
        });
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
