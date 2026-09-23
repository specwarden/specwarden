import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import type { IInvoiceLine } from '../invoice-total.ts';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('jsonb')
  lines!: IInvoiceLine[];
}
