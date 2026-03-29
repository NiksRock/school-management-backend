import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { SYSTEM_ADMIN_ROLE_CODE } from './auth.types';
// FIXED MED-07: single source of truth
import { BCRYPT_ROUNDS } from './auth.constants';
import { UserEntity } from './entities/user.entity';
import { RoleService } from './role.service';

@Injectable()
export class AuthBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AuthBootstrapService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly roleService: RoleService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.roleService.seedDefaults();
    await this.seedDefaultAdmin();
  }

  private async seedDefaultAdmin(): Promise<void> {
    const adminEmail = this.normalizeEmail(
      this.configService.get<string>('bootstrapAdmin.email') ??
        'admin@school.local',
    );
    const existingAdmin = await this.userRepository.findOne({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      return;
    }

    const adminRole = await this.roleService.findByCodeOrThrow(
      SYSTEM_ADMIN_ROLE_CODE,
    );
    const passwordHash = await bcrypt.hash(
      this.configService.get<string>('bootstrapAdmin.password') ??
        'Admin@12345',
      BCRYPT_ROUNDS,
    );
    const admin = this.userRepository.create({
      name:
        this.configService.get<string>('bootstrapAdmin.name') ?? 'System Admin',
      email: adminEmail,
      passwordHash,
      status: 'ACTIVE',
      role: adminRole,
      createdById: null,
    });

    await this.userRepository.save(admin);
    this.logger.log(`Seeded default system admin account: ${admin.email}`);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
