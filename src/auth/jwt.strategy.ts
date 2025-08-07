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
        // ✅ SIMPLE: Only check access_token cookie
        (request: Request) => {
          const cookies = request?.cookies || {};
          const token = cookies['access_token'];

          // Enhanced debug logging for production debugging
          if (this.envConfig.isProduction) {
            const userAgent = request?.headers?.['user-agent'] || '';
            const isIOS = /iPad|iPhone|iPod|Mac.*OS.*X/i.test(userAgent);
            
            this.logger.log('JWT Extraction Debug:', {
              hasCookies: !!cookies,
              cookieKeys: cookies ? Object.keys(cookies) : [],
              cookieCount: cookies ? Object.keys(cookies).length : 0,
              
              hasAccessToken: !!token,
              tokenLength: token ? token.length : 0,
              
              isIOSDevice: isIOS,
              userAgent: userAgent?.substring(0, 50),
              origin: request?.headers?.origin,
              referer: request?.headers?.referer,
              
              // Raw cookie header inspection
              cookieHeader: request?.headers?.cookie || 'undefined',
              cookieHeaderLength: request?.headers?.cookie?.length || 0,
              
              // Additional debugging
              isSafari: /Safari/i.test(userAgent) && !/Chrome|CriOS/i.test(userAgent),
              isSimulator: userAgent.includes('Simulator'),
              
              // Request info
              method: request?.method,
              path: request?.url,
            });
          }

          return token;
        },
        
        // ✅ Fallback to Authorization header
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        
        // ✅ iOS fallback: Check custom header
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
