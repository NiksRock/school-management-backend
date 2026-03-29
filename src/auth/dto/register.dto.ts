import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'Jane Student',
    description: 'Full name of the user being registered.',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    example: 'jane.student@example.com',
    description: 'Unique email address used for login.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'StrongPass123',
    minLength: 8,
    description: 'Password for the new account.',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    example: 'STUDENT',
    description:
      'Optional role code. Public registration is limited to STUDENT.',
  })
  @IsOptional()
  @IsString()
  roleCode?: string;
}
