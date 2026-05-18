import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ListQueryDto, ListQueryPipe } from './dto/list-query.dto';
import { PalworldRepository } from './palworld.repository';

@Controller()
export class PalworldController {
  constructor(private readonly repository: PalworldRepository) {}

  @Get()
  index() {
    return {
      name: 'palworld-port',
      endpoints: ['/api/pals', '/api/pals/:palId', '/api/items', '/api/items/:itemId', '/api/stats'],
    };
  }

  @Get('stats')
  stats() {
    return this.repository.getStats();
  }

  @Post('reload')
  reload() {
    this.repository.reload();
    return this.repository.getStats();
  }

  @Get('pals')
  pals(@Query(new ListQueryPipe()) query: ListQueryDto) {
    return this.repository.listPals(query);
  }

  @Get('pals/:palId')
  pal(@Param('palId') palId: string) {
    return this.repository.getPal(palId);
  }

  @Get('items')
  items(@Query(new ListQueryPipe()) query: ListQueryDto) {
    return this.repository.listItems(query);
  }

  @Get('items/:itemId')
  item(@Param('itemId') itemId: string) {
    return this.repository.getItem(itemId);
  }
}
