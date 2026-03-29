import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PermissionResponseDto {
  @ApiProperty({ example: 'READ' })
  action!: string;

  @ApiProperty({ example: 'self' })
  resource!: string;
}

export class FrontendRouteResponseDto {
  @ApiProperty({ example: 'a3ee54a3-39bc-4bd4-818c-9fa0dcab4f13' })
  id!: string;

  @ApiProperty({ example: 'dashboard' })
  key!: string;

  @ApiProperty({ example: '/dashboard' })
  path!: string;

  @ApiProperty({ example: 'Dashboard' })
  label!: string;

  @ApiProperty({ example: 'Main dashboard landing page' })
  description!: string;

  @ApiProperty({ example: 'core' })
  category!: string;

  @ApiProperty({ example: 10 })
  sortOrder!: number;
}

export class RoleResponseDto {
  @ApiProperty({ example: '7b97d91f-82ea-42af-8a4f-d698d7f7e7a1' })
  id!: string;

  @ApiProperty({ example: 'STUDENT' })
  code!: string;

  @ApiProperty({ example: 'Student' })
  name!: string;

  @ApiProperty({ example: 20 })
  level!: number;

  @ApiProperty({ type: PermissionResponseDto, isArray: true })
  permissions!: PermissionResponseDto[];

  @ApiProperty({ type: FrontendRouteResponseDto, isArray: true })
  frontendRoutes!: FrontendRouteResponseDto[];
}

export class SafeUserResponseDto {
  @ApiProperty({ example: '2c4a7fd1-ef49-43a6-917c-4df8460563b1' })
  id!: string;

  @ApiProperty({ example: 'Jane Student' })
  name!: string;

  @ApiProperty({ example: 'jane.student@example.com' })
  email!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ type: RoleResponseDto })
  role!: RoleResponseDto;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'User ID of the creator when applicable.',
  })
  createdById!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-03-28T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-03-28T12:00:00.000Z',
  })
  updatedAt!: Date;
}

export class AuthResponseDto {
  @ApiProperty({ example: true })
  authenticated!: boolean;

  @ApiProperty({
    example: 900,
    description: 'Access token lifetime in seconds.',
  })
  accessTokenExpiresIn!: number;

  @ApiProperty({
    example: 604800,
    description: 'Refresh token lifetime in seconds.',
  })
  refreshTokenExpiresIn!: number;

  @ApiProperty({ type: SafeUserResponseDto })
  user!: SafeUserResponseDto;
}

export class AuthAccessResponseDto {
  @ApiProperty({ type: RoleResponseDto })
  role!: RoleResponseDto;

  @ApiProperty({ type: FrontendRouteResponseDto, isArray: true })
  frontendRoutes!: FrontendRouteResponseDto[];

  @ApiProperty({ type: SafeUserResponseDto })
  user!: SafeUserResponseDto;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Logged out successfully' })
  message!: string;
}
