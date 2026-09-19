import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProgressDto {
  @ApiProperty({ description: '观看进度（秒）' })
  @IsInt()
  @Min(0)
  progress: number;
}
