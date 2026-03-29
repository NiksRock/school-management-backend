import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    example: 'Mr. Sharma',
    description: 'Full name of the user to create.',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'teacher@example.com',
    description: 'Unique email address for the managed user.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'StrongPass123',
    minLength: 8,
    description: 'Initial password for the created user.',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    example: 'CLASS_TEACHER',
    description: 'Target role code to assign to the new user.',
  })
  @IsString()
  @IsNotEmpty()
  roleCode!: string;
}
