import { Controller, Get, Param } from '@nestjs/common';

import { InvoicesService } from './invoices.service.ts';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(':id/total')
  total(@Param('id') id: string) {
    return this.invoices.totalOf(id);
  }
}
