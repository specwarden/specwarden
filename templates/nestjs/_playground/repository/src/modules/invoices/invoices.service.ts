import { Injectable, NotFoundException } from '@nestjs/common';

import { invoiceTotal } from './invoice-total.ts';
import { InvoicesRepository } from './repositories/invoices.repository.ts';

@Injectable()
export class InvoicesService {
  constructor(private readonly repository: InvoicesRepository) {}

  async totalOf(id: string) {
    const invoice = await this.repository.findWithLines(id);
    if (!invoice) throw new NotFoundException(`no invoice ${id}`);
    return invoiceTotal(invoice.lines);
  }
}
