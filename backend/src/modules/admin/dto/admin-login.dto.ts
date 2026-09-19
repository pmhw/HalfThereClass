import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({ description: '管理员账号' })
  @IsString()
  @IsNotEmpty({ message: '账号不能为空' })
  username: string;

  @ApiProperty({ description: '管理员密码' })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  password: string;

  @ApiProperty({ description: '滑块验证票' })
  @IsString()
  @IsNotEmpty({ message: '请完成滑块验证' })
  captchaToken: string;

  @ApiProperty({ description: '滑块位置' })
  @Type(() => Number)
  @IsNumber()
  offset: number;
}

export class CaptchaCheckDto {
  @ApiProperty({ description: '滑块验证票' })
  @IsString()
  @IsNotEmpty({ message: '请完成滑块验证' })
  captchaToken: string;

  @ApiProperty({ description: '滑块位置' })
  @Type(() => Number)
  @IsNumber()
  offset: number;
}
