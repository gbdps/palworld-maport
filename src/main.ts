import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: 1024 * 1024,
    }),
  );

  app.enableCors();
  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 3333);
  await app.listen(port, '0.0.0.0');
  console.log(`Palworld API running on http://localhost:${port}/api`);
}

void bootstrap();
