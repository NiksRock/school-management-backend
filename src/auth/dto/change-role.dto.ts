import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ChangeRoleDto {
  @ApiProperty({
    example: 'PRINCIPAL',
    description: 'New role code to assign to the user.',
  })
  @IsString()
  @IsNotEmpty()
  roleCode!: string;
}
