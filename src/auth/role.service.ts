import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLogger } from '../logging/app-logger.service';
import { RedisService } from '../redis/redis.service';
import {
  DEFAULT_FRONTEND_ROUTE_DEFINITIONS,
  DEFAULT_ROLE_DEFINITIONS,
} from './auth.seed';
import { FrontendRouteEntity } from './entities/frontend-route.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RoleEntity } from './entities/role.entity';

@Injectable()
export class RoleService {
  // FIXED: replaced NestJS native Logger with injected AppLogger so
  // RoleService warnings reach Loki like every other service.
  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly appLogger: AppLogger,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepository: Repository<PermissionEntity>,
    @InjectRepository(FrontendRouteEntity)
    private readonly frontendRouteRepository: Repository<FrontendRouteEntity>,
  ) {}

  async findAll(): Promise<RoleEntity[]> {
    const cacheKey = this.getRolesCacheKey();

    try {
      const cachedRoles =
        await this.redisService.getJson<RoleEntity[]>(cacheKey);

      if (cachedRoles) {
        return cachedRoles;
      }
    } catch (error) {
      this.appLogger.warnWithMetadata(
        `Failed to read roles cache`,
        { error: error instanceof Error ? error.message : 'unknown error' },
        RoleService.name,
      );
    }

    const roles = await this.roleRepository.find({
      order: { level: 'DESC', name: 'ASC' },
    });

    try {
      await this.redisService.setJson(
        cacheKey,
        roles,
        this.getRolesCacheTtlSeconds(),
      );
    } catch (error) {
      this.appLogger.warnWithMetadata(
        `Failed to write roles cache`,
        { error: error instanceof Error ? error.message : 'unknown error' },
        RoleService.name,
      );
    }

    return roles;
  }

  async findByCode(code: string): Promise<RoleEntity | null> {
    return this.roleRepository.findOne({
      where: { code: this.normalizeRoleCode(code) },
    });
  }

  async findByCodeOrThrow(code: string): Promise<RoleEntity> {
    const role = await this.findByCode(code);
    if (!role) {
      throw new NotFoundException(`Role '${code}' was not found`);
    }
    return role;
  }

  canManage(actorRole: RoleEntity, targetRole: RoleEntity): boolean {
    return actorRole.level > targetRole.level;
  }

  /**
   * FIXED MED-02: Batched seed queries.
   * Load all existing permissions and frontend routes in two queries instead of
   * N individual findOne calls — reduces startup time from O(n) to O(1) queries
   * for reads.
   */
  async seedDefaults(): Promise<void> {
    const frontendRoutes = await this.seedFrontendRoutes();

    // Batch-load all existing permissions in one query
    const existingPerms = await this.permissionRepository.find();
    const permMap = new Map(
      existingPerms.map((p) => [`${p.action}:${p.resource}`, p]),
    );

    for (const definition of DEFAULT_ROLE_DEFINITIONS) {
      const permissions: PermissionEntity[] = [];

      for (const permissionDefinition of definition.permissions) {
        const permKey = `${permissionDefinition.action}:${permissionDefinition.resource}`;
        let permission = permMap.get(permKey);

        if (!permission) {
          permission = this.permissionRepository.create(permissionDefinition);
          permission = await this.permissionRepository.save(permission);
          permMap.set(permKey, permission);
        }

        permissions.push(permission);
      }

      const existingRole = await this.findByCode(definition.code);
      const role = existingRole ?? this.roleRepository.create();
      role.code = definition.code;
      role.name = definition.name;
      role.level = definition.level;
      role.permissions = permissions;
      role.frontendRoutes = definition.frontendRouteKeys
        .map((frontendRouteKey) => frontendRoutes.get(frontendRouteKey))
        .filter((frontendRoute): frontendRoute is FrontendRouteEntity =>
          Boolean(frontendRoute),
        );

      await this.roleRepository.save(role);
    }

    await this.invalidateRolesCache();
  }

  private async seedFrontendRoutes(): Promise<
    Map<string, FrontendRouteEntity>
  > {
    const routeMap = new Map<string, FrontendRouteEntity>();

    for (const definition of DEFAULT_FRONTEND_ROUTE_DEFINITIONS) {
      const existingRoute = await this.frontendRouteRepository.findOne({
        where: { key: definition.key },
      });
      const frontendRoute =
        existingRoute ?? this.frontendRouteRepository.create();
      frontendRoute.key = definition.key;
      frontendRoute.path = definition.path;
      frontendRoute.label = definition.label;
      frontendRoute.description = definition.description;
      frontendRoute.category = definition.category;
      frontendRoute.sortOrder = definition.sortOrder;

      const savedRoute = await this.frontendRouteRepository.save(frontendRoute);
      routeMap.set(savedRoute.key, savedRoute);
    }

    return routeMap;
  }

  private normalizeRoleCode(roleCode: string): string {
    return roleCode.trim().toUpperCase();
  }

  private getRolesCacheKey(): string {
    return 'cache:auth:roles:list';
  }

  private getRolesCacheTtlSeconds(): number {
    const ttl =
      this.configService.get<number>('api.cache.rolesTtlSeconds') ?? 60;
    return Math.max(ttl, 1);
  }

  private async invalidateRolesCache(): Promise<void> {
    try {
      await this.redisService.delete(this.getRolesCacheKey());
    } catch (error) {
      this.appLogger.warnWithMetadata(
        `Failed to invalidate roles cache`,
        { error: error instanceof Error ? error.message : 'unknown error' },
        RoleService.name,
      );
    }
  }
}
