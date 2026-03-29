import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('auth.accessTokenSecret') ??
          'change-me-access-token-secret',
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthBootstrapService, AuthService, JwtGuard, RoleService],
  exports: [AuthService, RoleService],
})
export class AuthModule {}
