import assert from 'node:assert/strict';
import { test } from 'node:test';

import { invoiceTotal } from '../src/modules/invoices/invoice-total.ts';

test('adds tax per line and rounds each line half-up, in minor units', () => {
  assert.equal(invoiceTotal([{ quantity: 3, unitPrice: 333, taxRate: 20 }]), 1199);
});

test('an invoice with no lines totals zero', () => {
  assert.equal(invoiceTotal([]), 0);
});
