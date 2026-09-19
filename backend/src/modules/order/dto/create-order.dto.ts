import { IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({ description: '课程 ID' })
  @IsInt()
  courseId: number;
}
