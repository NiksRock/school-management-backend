import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { CookieOptions, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CachePolicy } from '../common/decorators/cache-policy.decorator';
import type {
  AuthAccessResponse,
  AuthResponse,
  RoleView,
  SafeUser,
} from './auth.types';
import { toRoleView, toSafeUser } from './auth.types';
import { AuthService } from './auth.service';
import {
  AuthAccessResponseDto,
  AuthResponseDto,
  MessageResponseDto,
  RoleResponseDto,
  SafeUserResponseDto,
} from './dto/auth-docs.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtGuard } from './guards/jwt.guard';
import type { AuthenticatedRequest } from './guards/jwt.guard';
import { RoleService } from './role.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly roleService: RoleService,
  ) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a public user account',
    description:
      'Creates a student account, sets HttpOnly access and refresh cookies, and returns the authenticated user payload.',
  })
  @Throttle({
    auth: {
      limit: 5,
      ttl: 60_000,
      blockDuration: 300_000,
    },
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiTooManyRequestsResponse({
    description: 'Too many registration attempts. Please try again later.',
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.authService.register(dto);
    this.setAuthCookies(res, session.tokens);
    return session.response;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'Validates credentials, sets HttpOnly access and refresh cookies, and returns the authenticated user payload.',
  })
  @Throttle({
    auth: {
      limit: 10,
      ttl: 60_000,
      blockDuration: 300_000,
    },
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiTooManyRequestsResponse({
    description: 'Too many login attempts. Please try again later.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.authService.login(dto);
    this.setAuthCookies(res, session.tokens);
    return session.response;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh the active login session',
    description:
      'Uses the HttpOnly refresh token cookie to rotate both JWT cookies and extend the current session.',
  })
  @Throttle({
    auth: {
      limit: 20,
      ttl: 60_000,
      blockDuration: 120_000,
    },
  })
  @ApiCookieAuth('refresh-cookie')
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiTooManyRequestsResponse({
    description: 'Too many refresh requests. Please try again later.',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, or expired refresh cookie.',
  })
  async refresh(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const refreshToken = this.getCookieValue(req, this.getRefreshCookieName());
    const session = await this.authService.refreshSession(refreshToken);
    this.setAuthCookies(res, session.tokens);
    return session.response;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out the current session',
    description:
      'Invalidates the Redis-backed session and clears both HttpOnly auth cookies.',
  })
  @ApiCookieAuth('access-cookie')
  @ApiCookieAuth('refresh-cookie')
  @ApiOkResponse({ type: MessageResponseDto })
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const refreshToken = this.getCookieValue(req, this.getRefreshCookieName());
    const accessToken = this.getCookieValue(req, this.getAccessCookieName());

    await this.authService.logout(refreshToken, accessToken);
    this.clearAuthCookies(res);

    return {
      message: 'Logged out successfully',
    };
  }

  @Get('me')
  @UseGuards(JwtGuard)
  @ApiOperation({
    summary: 'Get the current authenticated user',
    description:
      'Reads the HttpOnly access token cookie and returns the current user, role, and granted frontend routes.',
  })
  @ApiCookieAuth('access-cookie')
  @ApiOkResponse({ type: SafeUserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access cookie.' })
  me(@Req() req: AuthenticatedRequest): SafeUser {
    return toSafeUser(req.user);
  }

  @Get('access')
  @UseGuards(JwtGuard)
  @ApiOperation({
    summary: 'Get frontend access details for the current user',
    description:
      'Returns the current role and the exact frontend routes granted to that role.',
  })
  @ApiCookieAuth('access-cookie')
  @ApiOkResponse({ type: AuthAccessResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access cookie.' })
  access(@Req() req: AuthenticatedRequest): AuthAccessResponse {
    const user = toSafeUser(req.user);

    return {
      role: user.role,
      frontendRoutes: user.role.frontendRoutes,
      user,
    };
  }

  @Get('roles')
  @CachePolicy({
    value: 'public, max-age=60, stale-while-revalidate=30',
  })
  @ApiOperation({
    summary: 'List available roles and their frontend route grants',
  })
  @ApiOkResponse({ type: RoleResponseDto, isArray: true })
  async listRoles(): Promise<RoleView[]> {
    const roles = await this.roleService.findAll();
    return roles.map(toRoleView);
  }

  @Post('users')
  @UseGuards(JwtGuard)
  @ApiOperation({
    summary: 'Create a managed user account',
    description:
      'Creates a principal, teacher, student, or other managed user according to the current role hierarchy.',
  })
  @ApiCookieAuth('access-cookie')
  @ApiCreatedResponse({ type: SafeUserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access cookie.' })
  createUser(
    @Body() dto: CreateUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SafeUser> {
    return this.authService.createUser(dto, req.user);
  }

  @Patch('users/:userId/role')
  @UseGuards(JwtGuard)
  @ApiOperation({
    summary: 'Change a user role',
    description:
      'Reassigns a user to a new role when the current user has sufficient role level.',
  })
  @ApiCookieAuth('access-cookie')
  @ApiParam({
    name: 'userId',
    description: 'Target user ID whose role should be changed.',
    example: '2c4a7fd1-ef49-43a6-917c-4df8460563b1',
  })
  @ApiOkResponse({ type: SafeUserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access cookie.' })
  changeRole(
    @Param('userId') userId: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SafeUser> {
    return this.authService.changeRole(userId, dto.roleCode, req.user);
  }

  private setAuthCookies(
    res: Response,
    tokens: {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresIn: number;
      refreshTokenExpiresIn: number;
    },
  ): void {
    res.cookie(
      this.getAccessCookieName(),
      tokens.accessToken,
      this.getCookieOptions(tokens.accessTokenExpiresIn),
    );
    res.cookie(
      this.getRefreshCookieName(),
      tokens.refreshToken,
      this.getCookieOptions(tokens.refreshTokenExpiresIn),
    );
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(this.getAccessCookieName(), this.getCookieOptions(0));
    res.clearCookie(this.getRefreshCookieName(), this.getCookieOptions(0));
  }

  private getCookieOptions(ttlSeconds: number): CookieOptions {
    const cookieDomain = this.configService.get<string>('auth.cookieDomain');

    return {
      httpOnly: true,
      secure: this.configService.get<boolean>('auth.cookieSecure') ?? false,
      sameSite: this.getSameSitePolicy(),
      domain: cookieDomain || undefined,
      path: '/',
      maxAge: Math.max(ttlSeconds, 0) * 1000,
    };
  }

  private getAccessCookieName(): string {
    return (
      this.configService.get<string>('auth.accessCookieName') ??
      'sms_access_token'
    );
  }

  private getRefreshCookieName(): string {
    return (
      this.configService.get<string>('auth.refreshCookieName') ??
      'sms_refresh_token'
    );
  }

  private getSameSitePolicy(): CookieOptions['sameSite'] {
    const sameSite =
      this.configService.get<string>('auth.cookieSameSite')?.toLowerCase() ??
      'lax';

    if (sameSite === 'strict' || sameSite === 'none' || sameSite === 'lax') {
      return sameSite;
    }

    return 'lax';
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
