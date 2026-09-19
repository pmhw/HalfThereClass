import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  async getCategoryList() {
    return this.prisma.category.findMany({
      where: { status: 1 },
      orderBy: { sort: 'asc' },
      select: {
        id: true,
        name: true,
        icon: true,
      },
    });
  }
}
