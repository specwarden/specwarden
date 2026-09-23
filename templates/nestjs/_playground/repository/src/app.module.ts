import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InvoicesModule } from './modules/invoices/invoices.module.ts';

@Module({
  imports: [TypeOrmModule.forRoot({ type: 'postgres', url: process.env.DATABASE_URL, autoLoadEntities: true }), InvoicesModule],
})
export class AppModule {}
