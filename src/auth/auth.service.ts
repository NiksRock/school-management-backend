import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  ACCESS_TOKEN_TYPE,
  REFRESH_TOKEN_TYPE,
  STUDENT_ROLE_CODE,
  isRefreshSessionRecord,
  toSafeUser,
  type AuthSessionResult,
  type RefreshSessionRecord,
  type SafeUser,
  type SessionPayload,
} from './auth.types';
// FIXED MED-07: single source of truth for bcrypt rounds
import { BCRYPT_ROUNDS } from './auth.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { RoleService } from './role.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly roleService: RoleService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSessionResult> {
    const requestedRoleCode = dto.roleCode
      ? this.normalizeRoleCode(dto.roleCode)
      : STUDENT_ROLE_CODE;

    if (requestedRoleCode !== STUDENT_ROLE_CODE) {
      throw new ForbiddenException(
        'Public registration is limited to students. Use an authenticated admin account to create staff users.',
      );
    }

    const studentRole =
      await this.roleService.findByCodeOrThrow(requestedRoleCode);
    const user = await this.createUserRecord(
      dto.name,
      dto.email,
      dto.password,
      studentRole,
      null,
    );

    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<AuthSessionResult> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Your account is not active');
    }

    return this.issueSession(user);
  }

  async refreshSession(
    refreshToken: string | undefined,
  ): Promise<AuthSessionResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token cookie');
    }

    const payload = await this.verifySessionToken(
      refreshToken,
      REFRESH_TOKEN_TYPE,
    );
    // FIXED HIGH-03: pass validator so corrupted session records are treated as miss
    const session = await this.getRefreshSession(payload.sessionId);

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh session not found');
    }

    if (session.refreshTokenHash !== this.hashToken(refreshToken)) {
      await this.redisService.delete(this.getSessionKey(payload.sessionId));
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      await this.redisService.delete(this.getSessionKey(payload.sessionId));
      throw new UnauthorizedException('User no longer exists');
    }

    if (user.status !== 'ACTIVE') {
      await this.redisService.delete(this.getSessionKey(payload.sessionId));
      throw new ForbiddenException('Your account is not active');
    }

    return this.issueSession(user, payload.sessionId);
  }

  async logout(
    refreshToken?: string | null,
    accessToken?: string | null,
  ): Promise<void> {
    const sessionId =
      (await this.tryExtractSessionId(refreshToken, REFRESH_TOKEN_TYPE)) ??
      (await this.tryExtractSessionId(accessToken, ACCESS_TOKEN_TYPE));

    if (!sessionId) {
      return;
    }

    await this.redisService.delete(this.getSessionKey(sessionId));
  }

  async createUser(
    dto: CreateUserDto,
    requester: UserEntity,
  ): Promise<SafeUser> {
    const requesterRole = this.requireRole(requester);
    const targetRole = await this.roleService.findByCodeOrThrow(dto.roleCode);

    if (!this.roleService.canManage(requesterRole, targetRole)) {
      throw new ForbiddenException(
        `A ${requesterRole.code} cannot create a ${targetRole.code}`,
      );
    }

    const user = await this.createUserRecord(
      dto.name,
      dto.email,
      dto.password,
      targetRole,
      requester.id,
    );

    return toSafeUser(user);
  }

  async changeRole(
    targetUserId: string,
    newRoleCode: string,
    requester: UserEntity,
  ): Promise<SafeUser> {
    const requesterRole = this.requireRole(requester);
    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const targetCurrentRole = this.requireRole(targetUser);
    const newRole = await this.roleService.findByCodeOrThrow(newRoleCode);

    if (!this.roleService.canManage(requesterRole, targetCurrentRole)) {
      throw new ForbiddenException(
        `A ${requesterRole.code} cannot modify a ${targetCurrentRole.code}`,
      );
    }

    if (!this.roleService.canManage(requesterRole, newRole)) {
      throw new ForbiddenException(
        `A ${requesterRole.code} cannot assign ${newRole.code}`,
      );
    }

    targetUser.role = newRole;
    const updatedUser = await this.userRepository.save(targetUser);
    return toSafeUser(updatedUser);
  }

  private async createUserRecord(
    name: string,
    email: string,
    password: string,
    role: RoleEntity,
    createdById: string | null,
  ): Promise<UserEntity> {
    const normalizedEmail = this.normalizeEmail(email);
    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const newUser = this.userRepository.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      status: 'ACTIVE',
      role,
      createdById,
    });

    return this.userRepository.save(newUser);
  }

  private async issueSession(
    user: UserEntity,
    sessionId: string = randomUUID(),
  ): Promise<AuthSessionResult> {
    const accessTokenExpiresIn = this.getAccessTokenTtlSeconds();
    const refreshTokenExpiresIn = this.getRefreshTokenTtlSeconds();
    const accessPayload: SessionPayload = {
      sub: user.id,
      sessionId,
      roleCode: user.role.code,
      type: ACCESS_TOKEN_TYPE,
    };
    const refreshPayload: SessionPayload = {
      sub: user.id,
      sessionId,
      roleCode: user.role.code,
      type: REFRESH_TOKEN_TYPE,
    };
    // FIXED HIGH-04: explicit secrets passed here (not relying on module-level secret)
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.getAccessTokenSecret(),
      expiresIn: accessTokenExpiresIn,
    });
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.getRefreshTokenSecret(),
      expiresIn: refreshTokenExpiresIn,
    });
    const refreshSession: RefreshSessionRecord = {
      userId: user.id,
      roleCode: user.role.code,
      refreshTokenHash: this.hashToken(refreshToken),
    };

    await this.redisService.setJson(
      this.getSessionKey(sessionId),
      refreshSession,
      refreshTokenExpiresIn,
    );

    return {
      response: {
        authenticated: true,
        accessTokenExpiresIn,
        refreshTokenExpiresIn,
        user: toSafeUser(user),
      },
      tokens: {
        accessToken,
        refreshToken,
        sessionId,
        accessTokenExpiresIn,
        refreshTokenExpiresIn,
      },
    };
  }

  private async verifySessionToken(
    token: string,
    expectedType: typeof ACCESS_TOKEN_TYPE | typeof REFRESH_TOKEN_TYPE,
  ): Promise<SessionPayload> {
    let payload: SessionPayload;

    try {
      // FIXED HIGH-04: explicit secret per token type
      payload = await this.jwtService.verifyAsync<SessionPayload>(token, {
        secret:
          expectedType === ACCESS_TOKEN_TYPE
            ? this.getAccessTokenSecret()
            : this.getRefreshTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.type !== expectedType) {
      throw new UnauthorizedException('Invalid token type');
    }

    return payload;
  }

  private async tryExtractSessionId(
    token: string | null | undefined,
    tokenType: typeof ACCESS_TOKEN_TYPE | typeof REFRESH_TOKEN_TYPE,
  ): Promise<string | null> {
    if (!token) {
      return null;
    }

    try {
      const payload = await this.verifySessionToken(token, tokenType);
      return payload.sessionId;
    } catch {
      return null;
    }
  }

  private async getRefreshSession(
    sessionId: string,
  ): Promise<RefreshSessionRecord | null> {
    // FIXED HIGH-03: validator ensures corrupt cache is treated as cache miss
    return this.redisService.getJson<RefreshSessionRecord>(
      this.getSessionKey(sessionId),
      isRefreshSessionRecord,
    );
  }

  private requireRole(user: UserEntity): RoleEntity {
    if (!user.role) {
      throw new ForbiddenException('User has no role assigned');
    }
    return user.role;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeRoleCode(roleCode: string): string {
    return roleCode.trim().toUpperCase();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getAccessTokenSecret(): string {
    return (
      this.configService.get<string>('auth.accessTokenSecret') ??
      'change-me-access-token-secret'
    );
  }

  private getRefreshTokenSecret(): string {
    return (
      this.configService.get<string>('auth.refreshTokenSecret') ??
      'change-me-refresh-token-secret'
    );
  }

  private getAccessTokenTtlSeconds(): number {
    return this.configService.get<number>('auth.accessTokenTtlSeconds') ?? 900;
  }

  private getRefreshTokenTtlSeconds(): number {
    return (
      this.configService.get<number>('auth.refreshTokenTtlSeconds') ?? 604800
    );
  }

  private getSessionKey(sessionId: string): string {
    return `auth:session:${sessionId}`;
  }
}
