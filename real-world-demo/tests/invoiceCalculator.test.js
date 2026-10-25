const { test } = require('node:test');
const assert = require('node:assert');
const { calculateInvoiceTotal } = require('../src/invoiceCalculator');

test('Valid invoice with full address calculates correctly', () => {
  const invoice = {
    id: 'inv_101',
    customer: {
      name: 'Acme Corp',
      billingAddress: { country: 'US' }
    },
    rawMetadata: '{"isEnterprise": true}',
    items: [{ price: 100, quantity: 2 }]
  };

  const result = calculateInvoiceTotal(invoice);
  assert.strictEqual(result.subtotal, 200);
  assert.strictEqual(result.country, 'US');
  assert.strictEqual(result.isEnterprise, true);
});

test('BUG REPRODUCTION: Invoice without billingAddress should safely calculate with default country instead of throwing TypeError', () => {
  const brokenInvoice = {
    id: 'inv_102',
    customer: {
      name: 'Digital Nomad User'
      // Notice: billingAddress is undefined!
    },
    items: [{ price: 50, quantity: 1 }]
  };

  // This will fail currently because invoiceCalculator.js crashes on line 11!
  const result = calculateInvoiceTotal(brokenInvoice);
  assert.ok(result);
  assert.strictEqual(result.subtotal, 50);
});
