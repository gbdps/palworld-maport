import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export class ListQueryDto {
  limit = 50;
  offset = 0;
  search?: string;
}

@Injectable()
export class ListQueryPipe implements PipeTransform<Record<string, unknown>, ListQueryDto> {
  transform(value: Record<string, unknown>) {
    const query = new ListQueryDto();
    query.limit = this.parseInteger(value.limit, 'limit', 50, 1, 500);
    query.offset = this.parseInteger(value.offset, 'offset', 0, 0, Number.MAX_SAFE_INTEGER);

    if (value.search !== undefined) {
      if (typeof value.search !== 'string') {
        throw new BadRequestException('search must be a string');
      }

      const search = value.search.trim();
      if (search.length > 120) {
        throw new BadRequestException('search must be 120 characters or fewer');
      }

      if (search.length > 0) query.search = search;
    }

    return query;
  }

  private parseInteger(value: unknown, field: string, fallback: number, min: number, max: number) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      throw new BadRequestException(`${field} must be an integer`);
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(`${field} must be between ${min} and ${max}`);
    }

    return parsed;
  }
}
