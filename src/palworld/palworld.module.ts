import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { PalworldController } from './palworld.controller';
import { PalworldRepository } from './palworld.repository';

@Module({
  controllers: [AssetsController, PalworldController],
  providers: [PalworldRepository],
  exports: [PalworldRepository],
})
export class PalworldModule {}
