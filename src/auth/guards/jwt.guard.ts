import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import {
  ACCESS_TOKEN_TYPE,
  type RefreshSessionRecord,
  type SessionPayload,
} from '../auth.types';
import { UserEntity } from '../entities/user.entity';
import { RedisService } from '../../redis/redis.service';

export interface AuthenticatedRequest extends Request {
  user: UserEntity;
  sessionId: string;
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = this.getCookieValue(req, this.getAccessCookieName());

    if (!accessToken) {
      throw new UnauthorizedException('Missing access token cookie');
    }

    let payload: SessionPayload;

    try {
      payload = await this.jwtService.verifyAsync<SessionPayload>(accessToken, {
        secret: this.getAccessTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (payload.type !== ACCESS_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid access token type');
    }

    const session = await this.redisService.getJson<RefreshSessionRecord>(
      this.getSessionKey(payload.sessionId),
    );

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session expired or not found');
    }

    const user = await this.userRepository.findOne({
      where: {
        id: payload.sub,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    req.user = user;
    req.sessionId = payload.sessionId;
    return true;
  }

  private getAccessCookieName(): string {
    return (
      this.configService.get<string>('auth.accessCookieName') ??
      'sms_access_token'
    );
  }

  private getAccessTokenSecret(): string {
    return (
      this.configService.get<string>('auth.accessTokenSecret') ??
      'change-me-access-token-secret'
    );
  }

  private getSessionKey(sessionId: string): string {
    return `auth:session:${sessionId}`;
  }

  private getCookieValue(
    req: AuthenticatedRequest,
    cookieName: string,
  ): string | undefined {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const cookieValue = cookies?.[cookieName];

    return typeof cookieValue === 'string' ? cookieValue : undefined;
  }
}
