import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MobileLoginDto {
  @ApiProperty({ description: '手机端设备标识' })
  @IsString()
  @IsNotEmpty({ message: 'deviceId 不能为空' })
  @MaxLength(80)
  deviceId: string;

  @ApiProperty({ description: '用户昵称', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  nickname?: string;

  @ApiProperty({ description: '用户头像', required: false })
  @IsOptional()
  @IsString()
  avatar?: string;
}
