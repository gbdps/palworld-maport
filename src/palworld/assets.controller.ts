import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const GAME_ROOT = resolve(__dirname, '..', '..', 'Game');

@Controller('assets')
export class AssetsController {
  @Get('*')
  serve(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    const relativePath = decodeURIComponent(request.url.replace(/^\/api\/assets\/?/, ''));
    const filePath = resolve(GAME_ROOT, normalize(relativePath));
    const isInsideGameRoot = filePath === GAME_ROOT || filePath.startsWith(`${GAME_ROOT}${sep}`);

    if (!isInsideGameRoot || !existsSync(filePath)) {
      throw new NotFoundException('Asset not found');
    }

    reply.header('Content-Type', this.contentType(filePath));
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(createReadStream(filePath));
  }

  private contentType(filePath: string) {
    const ext = extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
  }
}
