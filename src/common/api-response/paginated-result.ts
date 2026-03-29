/**
 * Wrap list query results in this shape.
 * The TransformResponseInterceptor detects this shape and hoists
 * page/limit/total into meta.pagination, keeping the data array clean.
 *
 * Usage in a service:
 *   return new PaginatedResult(items, total, page, limit);
 *
 * Usage in a controller (no extra decoration needed):
 *   return this.service.findAll(page, limit);
 */
export class PaginatedResult<T> {
  readonly data: T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.total = total;
    this.page = page;
    this.limit = limit;
  }
}

/**
 * Standard query parameters for list endpoints.
 * Import and use as a type in your service/controller.
 */
export type PaginationQuery = {
  page: number;
  limit: number;
};
