export interface PaginationDto {
  page?: number;
  pageSize?: number;
}

export function getPaginationParams(pagination: PaginationDto) {
  const page = Math.max(1, pagination.page || 1);
  const pageSize = Math.min(100, pagination.pageSize || 10);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

export function buildPaginationResult<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return {
    list,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
