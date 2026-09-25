import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitCertDto {
  @ApiPropertyOptional({ description: '真实姓名' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  realName?: string;

  @ApiPropertyOptional({ description: '身份证号码' })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  idNumber?: string;

  @ApiPropertyOptional({ description: '身份证住址' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ description: '电子邮箱' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  email?: string;

  @ApiPropertyOptional({ description: '收款开户行' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankName?: string;

  @ApiPropertyOptional({ description: '收款账户名' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankAccountName?: string;

  @ApiPropertyOptional({ description: '银行账号' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankAccount?: string;

  @ApiPropertyOptional({ description: '身份证正面' })
  @IsOptional()
  @IsString()
  idCard?: string;

  @ApiPropertyOptional({ description: '身份证反面' })
  @IsOptional()
  @IsString()
  idCardBack?: string;

  @ApiPropertyOptional({ description: '学历证明' })
  @IsOptional()
  @IsString()
  diploma?: string;

  @ApiPropertyOptional({ description: '无犯罪证明，每学期更新' })
  @IsOptional()
  @IsString()
  clearance?: string;

  @ApiPropertyOptional({ description: '教师资格证，可不填' })
  @IsOptional()
  @IsString()
  certificate?: string;
}
