import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { FrontendRouteEntity } from './frontend-route.entity';
import { PermissionEntity } from './permission.entity';
import type { UserEntity } from './user.entity';

@Entity({ name: 'roles' })
@Unique(['code'])
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 64 })
  code!: string;

  @Column({ length: 128 })
  name!: string;

  @Column({ type: 'int' })
  level!: number;

  @ManyToMany(() => PermissionEntity, (permission) => permission.roles, {
    eager: true,
  })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: {
      name: 'role_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'permission_id',
      referencedColumnName: 'id',
    },
  })
  permissions!: PermissionEntity[];

  @ManyToMany(
    () => FrontendRouteEntity,
    (frontendRoute) => frontendRoute.roles,
    {
      eager: true,
    },
  )
  @JoinTable({
    name: 'role_frontend_routes',
    joinColumn: {
      name: 'role_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'frontend_route_id',
      referencedColumnName: 'id',
    },
  })
  frontendRoutes!: FrontendRouteEntity[];

  @OneToMany('UserEntity', 'role')
  users!: UserEntity[];
}
