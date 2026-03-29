import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthBootstrapService } from './auth-bootstrap.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FrontendRouteEntity } from './entities/frontend-route.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { JwtGuard } from './guards/jwt.guard';
import { RoleService } from './role.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FrontendRouteEntity,
      PermissionEntity,
      RoleEntity,
      UserEntity,
    ]),
    /**
     * FIXED HIGH-04: JwtModule is registered WITHOUT a module-level secret.
     * All token signing and verification in AuthService and JwtGuard explicitly
     * pass { secret } via the options argument to signAsync/verifyAsync.
     * This prevents the module-level secret being silently applied to refresh
     * token verification (which uses a different secret).
     */
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthBootstrapService, AuthService, JwtGuard, RoleService],
  exports: [AuthService, RoleService],
})
export class AuthModule {}
