import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.ts';

const app = await NestFactory.create(AppModule);
await app.listen(Number(process.env.PORT ?? 3000));
