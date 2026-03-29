import {
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { RoleEntity } from './role.entity';

@Entity({ name: 'permissions' })
@Unique(['action', 'resource'])
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 32 })
  action!: string;

  @Column({ length: 64 })
  resource!: string;

  @ManyToMany('RoleEntity', 'permissions')
  roles!: RoleEntity[];
}
