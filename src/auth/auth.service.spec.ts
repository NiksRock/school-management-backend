import * as bcrypt from 'bcrypt';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { RedisService } from '../redis/redis.service';
import { RoleService } from './role.service';

describe('AuthService', () => {
  let service: AuthService;

  const studentRole: RoleEntity = {
    id: 'role-student',
    code: 'STUDENT',
    name: 'Student',
    level: 20,
    permissions: [
      {
        id: 'perm-self',
        action: 'READ',
        resource: 'self',
        roles: [],
      },
    ],
    frontendRoutes: [
      {
        id: 'route-dashboard',
        key: 'dashboard',
        path: '/dashboard',
        label: 'Dashboard',
        description: 'Main dashboard landing page',
        category: 'core',
        sortOrder: 10,
        roles: [],
      },
    ],
    users: [],
  };

  let configService: ConfigService;
  let jwtService: JwtService;
  let redisService: RedisService;
  let roleService: RoleService;
  let userRepository: Repository<UserEntity>;
  let configGetMock: jest.Mock;
  let signAsyncMock: jest.Mock;
  let verifyAsyncMock: jest.Mock;
  let deleteMock: jest.Mock;
  let getJsonMock: jest.Mock;
  let setJsonMock: jest.Mock;
  let canManageMock: jest.Mock;
  let findByCodeOrThrowMock: jest.Mock;
  let createMock: jest.Mock;
  let findOneMock: jest.Mock;
  let saveMock: jest.Mock;

  beforeEach(() => {
    configGetMock = jest.fn(
      (key: string) =>
        (
          ({
            'auth.accessTokenSecret': 'access-secret',
            'auth.refreshTokenSecret': 'refresh-secret',
            'auth.accessTokenTtlSeconds': 900,
            'auth.refreshTokenTtlSeconds': 3600,
          }) as Record<string, number | string>
        )[key],
    );
    signAsyncMock = jest
      .fn()
      .mockImplementation((payload: { type: string }) =>
        Promise.resolve(
          payload.type === 'refresh' ? 'refresh-token' : 'signed-token',
        ),
      );
    verifyAsyncMock = jest.fn();
    deleteMock = jest.fn();
    getJsonMock = jest.fn();
    setJsonMock = jest.fn().mockResolvedValue(undefined);
    canManageMock = jest.fn();
    findByCodeOrThrowMock = jest.fn().mockResolvedValue(studentRole);
    createMock = jest.fn((payload: Partial<UserEntity>) => ({
      id: 'user-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...payload,
    }));
    findOneMock = jest.fn();
    saveMock = jest.fn((payload: UserEntity) => Promise.resolve(payload));

    configService = {
      get: configGetMock,
    } as unknown as ConfigService;
    jwtService = {
      signAsync: signAsyncMock,
      verifyAsync: verifyAsyncMock,
    } as unknown as JwtService;
    redisService = {
      delete: deleteMock,
      getJson: getJsonMock,
      setJson: setJsonMock,
    } as unknown as RedisService;
    roleService = {
      canManage: canManageMock,
      findByCodeOrThrow: findByCodeOrThrowMock,
    } as unknown as RoleService;
    userRepository = {
      create: createMock,
      findOne: findOneMock,
      save: saveMock,
    } as unknown as Repository<UserEntity>;

    service = new AuthService(
      configService,
      jwtService,
      redisService,
      roleService,
      userRepository,
    );
  });

  it('registers a student and creates cookie session tokens', async () => {
    findOneMock.mockResolvedValue(null);

    const result = await service.register({
      name: 'Jane Student',
      email: 'Jane.Student@example.com',
      password: 'StrongPass123',
    });

    expect(findByCodeOrThrowMock).toHaveBeenCalledWith('STUDENT');
    expect(result.tokens.accessToken).toBe('signed-token');
    expect(result.tokens.refreshToken).toBe('refresh-token');
    expect(result.response.user.email).toBe('jane.student@example.com');
    expect(result.response.user.role.code).toBe('STUDENT');
    const [registerSessionKey, registerSessionRecord, registerTtl] = setJsonMock
      .mock.calls[0] as [
      string,
      { roleCode: string; refreshTokenHash: string; userId: string },
      number,
    ];

    expect(registerSessionKey).toContain('auth:session:');
    expect(registerSessionRecord.roleCode).toBe('STUDENT');
    expect(registerSessionRecord.userId).toBe('user-1');
    expect(typeof registerSessionRecord.refreshTokenHash).toBe('string');
    expect(registerTtl).toBe(3600);
  });

  it('rejects public registration for non-student roles', async () => {
    await expect(
      service.register({
        name: 'Principal User',
        email: 'principal@example.com',
        password: 'StrongPass123',
        roleCode: 'PRINCIPAL',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('logs in an active user with a valid password', async () => {
    const passwordHash = await bcrypt.hash('StrongPass123', 10);

    findOneMock.mockResolvedValue({
      id: 'user-2',
      name: 'John Student',
      email: 'john.student@example.com',
      passwordHash,
      status: 'ACTIVE',
      role: studentRole,
      createdById: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    } as UserEntity);

    const result = await service.login({
      email: 'john.student@example.com',
      password: 'StrongPass123',
    });

    expect(result.tokens.accessToken).toBe('signed-token');
    expect(result.response.user.id).toBe('user-2');
  });

  it('rejects invalid credentials during login', async () => {
    const passwordHash = await bcrypt.hash('DifferentPass123', 10);

    findOneMock.mockResolvedValue({
      id: 'user-3',
      name: 'Wrong Password',
      email: 'wrong.password@example.com',
      passwordHash,
      status: 'ACTIVE',
      role: studentRole,
      createdById: null,
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    } as UserEntity);

    await expect(
      service.login({
        email: 'wrong.password@example.com',
        password: 'StrongPass123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates a valid refresh token', async () => {
    const activeUser = {
      id: 'user-4',
      name: 'Refresh User',
      email: 'refresh.user@example.com',
      passwordHash: 'hashed-password',
      status: 'ACTIVE',
      role: studentRole,
      createdById: null,
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
      updatedAt: new Date('2026-01-04T00:00:00.000Z'),
    } as UserEntity;

    verifyAsyncMock.mockResolvedValue({
      sub: 'user-4',
      sessionId: 'session-1',
      roleCode: 'STUDENT',
      type: 'refresh',
    });
    getJsonMock.mockResolvedValue({
      userId: 'user-4',
      roleCode: 'STUDENT',
      refreshTokenHash: createHash('sha256')
        .update('refresh-token')
        .digest('hex'),
    });
    signAsyncMock.mockImplementation((payload: { type: string }) =>
      Promise.resolve(
        payload.type === 'refresh' ? 'refresh-token-2' : 'signed-token-2',
      ),
    );
    findOneMock.mockResolvedValue(activeUser);

    const result = await service.refreshSession('refresh-token');

    expect(result.tokens.accessToken).toBe('signed-token-2');
    expect(result.tokens.refreshToken).toBe('refresh-token-2');
    const [refreshSessionKey, refreshSessionRecord, refreshTtl] = setJsonMock
      .mock.calls[0] as [
      string,
      { roleCode: string; refreshTokenHash: string; userId: string },
      number,
    ];

    expect(refreshSessionKey).toBe('auth:session:session-1');
    expect(refreshSessionRecord.roleCode).toBe('STUDENT');
    expect(refreshSessionRecord.userId).toBe('user-4');
    expect(typeof refreshSessionRecord.refreshTokenHash).toBe('string');
    expect(refreshTtl).toBe(3600);
  });
});
