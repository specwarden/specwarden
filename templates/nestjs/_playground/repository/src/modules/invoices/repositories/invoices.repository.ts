import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Invoice } from '../entities/invoice.entity.ts';

@Injectable()
export class InvoicesRepository {
  constructor(@InjectRepository(Invoice) private readonly rows: Repository<Invoice>) {}

  findWithLines(id: string) {
    return this.rows.findOne({ where: { id } });
  }
}
