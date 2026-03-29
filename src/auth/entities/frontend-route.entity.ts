import {
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { RoleEntity } from './role.entity';

@Entity({ name: 'frontend_routes' })
@Unique(['key'])
@Unique(['path'])
export class FrontendRouteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 128 })
  key!: string;

  @Column({ length: 255 })
  path!: string;

  @Column({ length: 128 })
  label!: string;

  @Column({ length: 255 })
  description!: string;

  @Column({ length: 64 })
  category!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @ManyToMany('RoleEntity', 'frontendRoutes')
  roles!: RoleEntity[];
}
