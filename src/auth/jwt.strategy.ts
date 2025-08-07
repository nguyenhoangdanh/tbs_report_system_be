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
        // Enhanced cookie extraction with ALL possible iOS cookie strategies
        (request: Request) => {
          const cookies = request?.cookies || {};
          
          // Try all possible cookie names in order of preference
          const tokenSources = [
            cookies['access_token'],
            cookies['ios_access_token'], 
            cookies['auth_token'],
            cookies['session_token'],
          ];
          
          const finalToken = tokenSources.find(token => token && token.length > 0);
          
          // Enhanced debug logging for production iOS debugging
          if (this.envConfig.isProduction) {
            const userAgent = request?.headers?.['user-agent'] || '';
            const isIOS = /iPad|iPhone|iPod|Mac.*OS.*X/i.test(userAgent);
            
            this.logger.log('JWT Extraction Debug:', {
              hasCookies: !!cookies,
              cookieKeys: cookies ? Object.keys(cookies) : [],
              cookieCount: cookies ? Object.keys(cookies).length : 0,
              
              // Individual token checks
              hasAccessToken: !!cookies['access_token'],
              hasIOSToken: !!cookies['ios_access_token'],
              hasAuthToken: !!cookies['auth_token'],
              hasSessionToken: !!cookies['session_token'],
              
              finalToken: !!finalToken,
              tokenLength: finalToken ? finalToken.length : 0,
              tokenSource: finalToken ? tokenSources.findIndex(t => t === finalToken) + 1 : 0,
              
              isIOSDevice: isIOS,
              userAgent: userAgent?.substring(0, 50),
              origin: request?.headers?.origin,
              referer: request?.headers?.referer,
              
              // Raw cookie header inspection
              cookieHeader: request?.headers?.cookie || 'undefined',
              cookieHeaderLength: request?.headers?.cookie?.length || 0,
              
              // Additional iOS debugging
              isSafari: /Safari/i.test(userAgent) && !/Chrome|CriOS/i.test(userAgent),
              isSimulator: userAgent.includes('Simulator'),
              
              // Request method and path
              method: request?.method,
              path: request?.url,
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
