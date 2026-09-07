import { PipeTransform, Injectable, BadRequestException } from "@nestjs/common";
import { PaginationParams } from "@mpc/shared";

@Injectable()
export class PaginationPipe implements PipeTransform {
  transform(value: Record<string, string>): PaginationParams {
    const page = parseInt(value.page ?? "1", 10);
    const limit = parseInt(value.limit ?? "20", 10);

    if (isNaN(page) || page < 1) {
      throw new BadRequestException("page must be a positive integer");
    }

    // Cap at 100 to prevent abuse — no one needs 10,000 rows per request
    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException("limit must be between 1 and 100");
    }

    return {
      page,
      limit,
      search: value.search?.trim(),
      sortBy: value.sortBy,
      sortOrder: (value.sortOrder as "asc" | "desc") ?? "desc",
    };
  }
}
