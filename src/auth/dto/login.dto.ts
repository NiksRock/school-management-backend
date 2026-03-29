import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@school.local',
    description: 'User email for authentication.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Admin@12345',
    minLength: 8,
    description: 'Account password.',
  })
  @IsString()
  @MinLength(8)
  password!: string;
}
