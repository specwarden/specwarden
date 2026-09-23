import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Invoice } from './entities/invoice.entity.ts';
import { InvoicesController } from './invoices.controller.ts';
import { InvoicesService } from './invoices.service.ts';
import { InvoicesRepository } from './repositories/invoices.repository.ts';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice])],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository],
})
export class InvoicesModule {}
