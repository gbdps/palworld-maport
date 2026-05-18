import { PalworldRepository } from './palworld/palworld.repository';

const repository = new PalworldRepository();

console.log(JSON.stringify(repository.getStats(), null, 2));
console.log(
  JSON.stringify(
    {
      pals: repository.listPals({ limit: 3 }),
      items: repository.listItems({ limit: 3 }),
    },
    null,
    2,
  ),
);
