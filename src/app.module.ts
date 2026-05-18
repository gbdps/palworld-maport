import { Module } from '@nestjs/common';
import { PalworldModule } from './palworld/palworld.module';

@Module({
  imports: [PalworldModule],
})
export class AppModule {}
