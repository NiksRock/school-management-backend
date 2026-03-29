import type { FrontendRouteEntity } from './entities/frontend-route.entity';
import type { RoleEntity } from './entities/role.entity';
import type { UserEntity } from './entities/user.entity';

export const STUDENT_ROLE_CODE = 'STUDENT';
export const SYSTEM_ADMIN_ROLE_CODE = 'SYSTEM_ADMIN';
export const ACCESS_TOKEN_TYPE = 'access';
export const REFRESH_TOKEN_TYPE = 'refresh';

export interface PermissionView {
  action: string;
  resource: string;
}

export interface FrontendRouteView {
  id: string;
  key: string;
  path: string;
  label: string;
  description: string;
  category: string;
  sortOrder: number;
}

export interface RoleView {
  id: string;
  code: string;
  name: string;
  level: number;
  permissions: PermissionView[];
  frontendRoutes: FrontendRouteView[];
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  status: string;
  role: RoleView;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResponse {
  authenticated: true;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  user: SafeUser;
}

export interface AuthAccessResponse {
  role: RoleView;
  frontendRoutes: FrontendRouteView[];
  user: SafeUser;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

export interface AuthSessionResult {
  response: AuthResponse;
  tokens: AuthTokens;
}

export interface SessionPayload {
  sub: string;
  sessionId: string;
  roleCode: string;
  type: typeof ACCESS_TOKEN_TYPE | typeof REFRESH_TOKEN_TYPE;
}

export interface RefreshSessionRecord {
  userId: string;
  roleCode: string;
  refreshTokenHash: string;
}

export function toFrontendRouteView(
  frontendRoute: FrontendRouteEntity,
): FrontendRouteView {
  return {
    id: frontendRoute.id,
    key: frontendRoute.key,
    path: frontendRoute.path,
    label: frontendRoute.label,
    description: frontendRoute.description,
    category: frontendRoute.category,
    sortOrder: frontendRoute.sortOrder,
  };
}

export function toRoleView(role: RoleEntity): RoleView {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    level: role.level,
    permissions: role.permissions.map((permission) => ({
      action: permission.action,
      resource: permission.resource,
    })),
    frontendRoutes: [...role.frontendRoutes]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(toFrontendRouteView),
  };
}

export function toSafeUser(user: UserEntity): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    role: toRoleView(user.role),
    createdById: user.createdById,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
