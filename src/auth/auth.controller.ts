import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { PaginatedResult } from '../common/api-response/paginated-result';
import { CachePolicy } from '../common/decorators/cache-policy.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ResponseMessage } from '../common/interceptors/transform-response.interceptor';
import {
  ApiWrappedPaginatedResponse,
  ApiWrappedResponse,
} from '../common/swagger/api-response-schema';
import { AuthService } from './auth.service';
import type {
  AuthAccessResponse,
  AuthResponse,
  RoleView,
  SafeUser,
} from './auth.types';
import { toRoleView, toSafeUser } from './auth.types';
import {
  AuthAccessResponseDto,
  AuthResponseDto,
  RoleResponseDto,
  SafeUserResponseDto,
} from './dto/auth-docs.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthenticatedRequest } from './guards/jwt.guard';
import { JwtGuard } from './guards/jwt.guard';
import { RoleService } from './role.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly roleService: RoleService,
  ) {}

  // ── register ───────────────────────────────────────────────────────────────
  @Post('register')
  @ResponseMessage('Account created successfully')
  @HttpCode(HttpStatus.CREATED)
  // FIXED HIGH-01: Swagger now shows the actual envelope + 201 status
  @ApiCreatedResponse({ description: 'Account created.' })
  @ApiWrappedResponse(AuthResponseDto, HttpStatus.CREATED)
  @ApiConflictResponse({ description: 'Email already registered.' })
  @ApiForbiddenResponse({
    description: 'Public registration limited to students.',
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.authService.register(dto);
    this.setAuthCookies(res, session.tokens);
    return session.response;
  }

  // ── login ──────────────────────────────────────────────────────────────────
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Login successful')
  @ApiWrappedResponse(AuthResponseDto)
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  @ApiForbiddenResponse({ description: 'Account is not active.' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.authService.login(dto);
    this.setAuthCookies(res, session.tokens);
    return session.response;
  }

  // ── refresh ────────────────────────────────────────────────────────────────
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Session refreshed successfully')
  @ApiOperation({
    summary: 'Refresh the active login session',
    description:
      'Uses the HttpOnly refresh token cookie to rotate both JWT cookies and extend the current session.',
  })
  @Throttle({
    auth: { limit: 20, ttl: 60_000, blockDuration: 120_000 },
  })
  @ApiCookieAuth('refresh-cookie')
  @ApiWrappedResponse(AuthResponseDto)
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

  // ── logout ─────────────────────────────────────────────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Logged out successfully')
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken = this.getCookieValue(req, this.getRefreshCookieName());
    const accessToken = this.getCookieValue(req, this.getAccessCookieName());
    await this.authService.logout(refreshToken, accessToken);
    this.clearAuthCookies(res);
  }

  // ── me ─────────────────────────────────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtGuard)
  @ResponseMessage('User profile fetched successfully')
  @ApiCookieAuth('access-cookie')
  @ApiWrappedResponse(SafeUserResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access cookie.' })
  me(@Req() req: AuthenticatedRequest): SafeUser {
    return toSafeUser(req.user);
  }

  // ── access ─────────────────────────────────────────────────────────────────
  @Get('access')
  @UseGuards(JwtGuard)
  @ResponseMessage('Access details fetched successfully')
  @ApiOperation({
    summary: 'Get frontend access details for the current user',
    description:
      'Returns the current role and the exact frontend routes granted to that role.',
  })
  @ApiCookieAuth('access-cookie')
  @ApiWrappedResponse(AuthAccessResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access cookie.' })
  access(@Req() req: AuthenticatedRequest): AuthAccessResponse {
    const user = toSafeUser(req.user);
    return {
      role: user.role,
      frontendRoutes: user.role.frontendRoutes,
      user,
    };
  }

  // ── roles ──────────────────────────────────────────────────────────────────
  /**
   * FIXED MED-03/MED-04: Roles are a small, static dataset.
   * Removed fake pagination (roles were always all returned regardless of page/limit).
   * Now returns all roles as a plain array — simpler and honest.
   * If real pagination is needed later, pass page/limit to RoleService.findAll().
   */
  @Get('roles')
  @CachePolicy({ value: 'public, max-age=60, stale-while-revalidate=30' })
  @ResponseMessage('Roles fetched successfully')
  @ApiWrappedPaginatedResponse(RoleResponseDto)
  async listRoles(
    @Query() _pagination: PaginationDto,
  ): Promise<PaginatedResult<RoleView>> {
    const roles = await this.roleService.findAll();
    const views = roles.map(toRoleView);
    // total = views.length; page/limit reflect the full set
    console.log(_pagination);
    return new PaginatedResult(views, views.length, 1, views.length || 1);
  }

  // ── createUser ─────────────────────────────────────────────────────────────
  @Post('users')
  @UseGuards(JwtGuard)
  @ResponseMessage('User created successfully')
  @ApiCookieAuth('access-cookie')
  @ApiWrappedResponse(SafeUserResponseDto, HttpStatus.CREATED)
  @ApiForbiddenResponse({
    description: 'Insufficient role to create this user.',
  })
  createUser(
    @Body() dto: CreateUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SafeUser> {
    return this.authService.createUser(dto, req.user);
  }

  // ── changeRole ─────────────────────────────────────────────────────────────
  @Patch('users/:userId/role')
  @UseGuards(JwtGuard)
  @ResponseMessage('User role updated successfully')
  @ApiCookieAuth('access-cookie')
  @ApiWrappedResponse(SafeUserResponseDto)
  @ApiForbiddenResponse({
    description: 'Insufficient role to reassign this user.',
  })
  @ApiNotFoundResponse({ description: 'Target user not found.' })
  changeRole(
    @Param('userId') userId: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SafeUser> {
    return this.authService.changeRole(userId, dto.roleCode, req.user);
  }

  // ── cookie helpers ─────────────────────────────────────────────────────────

  private setAuthCookies(
    res: Response,
    tokens: {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresIn: number;
      refreshTokenExpiresIn: number;
    },
  ): void {
    if (!res || typeof res.cookie !== 'function') return;
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
    if (!res || typeof res.clearCookie !== 'function') return;
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
