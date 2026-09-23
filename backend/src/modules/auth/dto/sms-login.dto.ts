import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class SendSmsDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入正确的手机号' })
  phone: string;
}

export class SmsLoginDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入正确的手机号' })
  phone: string;

  @IsString()
  @MinLength(4, { message: '请输入验证码' })
  code: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}
