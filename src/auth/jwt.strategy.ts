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
        // Enhanced cookie extraction with debugging
        (request: Request) => {
          const token = request?.cookies?.['access_token'];

          // Debug logging only in production for this issue
          if (this.envConfig.isProduction) {
            this.logger.log('JWT Extraction Debug:', {
              hasCookies: !!request?.cookies,
              cookieKeys: request?.cookies ? Object.keys(request.cookies) : [],
              hasAccessToken: !!token,
              tokenLength: token ? token.length : 0,
              userAgent: request?.headers?.['user-agent']?.substring(0, 50),
              origin: request?.headers?.origin,
            });
          }

          return token;
        },
        // Fallback to Authorization header
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: envConfig.jwtSecret,
      passReqToCallback: false,
    });
  }

  async validate(payload: any) {
    try {
      // Enhanced logging for production debugging
      if (this.envConfig.isProduction) {
        this.logger.log('JWT Validation Debug:', {
          userId: payload.sub,
          employeeCode: payload.employeeCode,
          role: payload.role,
          exp: payload.exp,
          iat: payload.iat,
          isExpired: payload.exp < Math.floor(Date.now() / 1000),
        });
      }

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

      if (this.envConfig.isProduction) {
        this.logger.log('JWT Validation Success:', {
          userId: user.id,
          employeeCode: user.employeeCode,
        });
      }

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
