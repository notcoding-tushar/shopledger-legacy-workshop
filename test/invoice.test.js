'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const coupons = require('../lib/coupons');

// Hand-built fixtures only. Do not import the server, routers, or persistence.
// Regression expectations for invoice/billing parity, plus unchanged behaviour.
function item(overrides = {}) {
  return { id: 1, name: 'Fixture rice', sku: 'TEST-1', hsn: '1006',
    price: 100, qty: 1, ...overrides };
}

function order(items, coupon = '', recorded = {}) {
  const billed = pricing.computeTotals(items, coupon);
  // Mirrors the fields saved by the placement route, without executing it.
  return { id: 42, date: '18/11/2026', customer: 'Fixture customer',
    paymentMode: 'cash', status: 'completed', items, coupon,
    subtotal: billed.subtotal, discount: billed.discount,
    tax: billed.tax, total: billed.total, ...recorded };
}

function figures(result) {
  return { subtotal: result.subtotal, discount: result.discount,
    tax: result.tax, cgst: result.cgst, sgst: result.sgst, total: result.total };
}

test('invoice total and GST breakdown match the customer bill for a rice order', () => {
  const o = order([item({ price: 640 })]);
  assert.deepEqual([o.tax, o.total], [32, 672]);
  const actual = invoice.computeInvoiceFigures(o);
  assert.deepEqual(figures(actual), {
    subtotal: 640, discount: 0, tax: 32, cgst: 16, sgst: 16, total: 672
  });
  assert.deepEqual([actual.rows[0].gstPercent, actual.rows[0].lineTax], [5, 32]);
  assert.doesNotMatch(invoice.render(o), /Accountant Reconciliation Notice:/);
});

test('invoice uses the billed HSN slabs for a mixed-rate order', () => {
  const o = order([item(), item({ id: 2, hsn: '0405' }), item({ id: 3, hsn: '0902' })]);
  assert.deepEqual([o.subtotal, o.tax, o.total], [300, 35, 335]);
  const actual = invoice.computeInvoiceFigures(o);
  assert.deepEqual(figures(actual), {
    subtotal: 300, discount: 0, tax: 35, cgst: 17.5, sgst: 17.5, total: 335
  });
  assert.deepEqual(actual.rows.map(r => [r.gstPercent, r.lineTax]),
    [[5, 5], [12, 12], [18, 18]]);
});

test('18% item without a coupon matches the billed figures', () => {
  const o = order([item({ hsn: '0902', price: 200, qty: 2 })]);
  assert.deepEqual([o.subtotal, o.discount, o.tax, o.total], [400, 0, 72, 472]);
  assert.deepEqual(figures(invoice.computeInvoiceFigures(o)), {
    subtotal: 400, discount: 0, tax: 72, cgst: 36, sgst: 36, total: 472
  });
});

test('mixed-rate invoice allocates the coupon proportionally before taxing each row', () => {
  const o = order([item({ price: 200 }), item({ id: 2, hsn: '0405', price: 300 })], 'SAVE10');
  assert.deepEqual([o.subtotal, o.discount, o.tax, o.total], [500, 50, 41.4, 491.4]);
  const actual = invoice.computeInvoiceFigures(o);
  assert.deepEqual(figures(actual), {
    subtotal: 500, discount: 50, tax: 41.4, cgst: 20.7, sgst: 20.7, total: 491.4
  });
  assert.deepEqual(actual.rows.map(r => [r.line, r.gstPercent, r.lineTax]),
    [[200, 5, 9], [300, 12, 32.4]]);
});

test('percentage discount reduces the taxable value before GST', () => {
  const o = order([item({ hsn: '0902', price: 1000 })], 'SAVE10');
  assert.deepEqual([o.discount, o.tax, o.total], [100, 162, 1062]);
  // Assert the breakdown too: matching only the total concealed the old bug.
  assert.deepEqual(figures(invoice.computeInvoiceFigures(o)), {
    subtotal: 1000, discount: 100, tax: 162, cgst: 81, sgst: 81, total: 1062
  });
});

test('flat discount reduces invoice GST to match billing', () => {
  const o = order([item({ hsn: '0902', price: 400 })], 'FLAT50');
  assert.deepEqual([o.discount, o.tax, o.total], [50, 63, 413]);
  assert.deepEqual(figures(invoice.computeInvoiceFigures(o)), {
    subtotal: 400, discount: 50, tax: 63, cgst: 31.5, sgst: 31.5, total: 413
  });
});

test('invoice respects the billed percentage coupon cap', () => {
  const o = order([item({ hsn: '0902', price: 2000 })], 'SAVE10');
  assert.deepEqual([o.discount, o.tax, o.total], [150, 333, 2183]);
  assert.deepEqual(figures(invoice.computeInvoiceFigures(o)), {
    subtotal: 2000, discount: 150, tax: 333, cgst: 166.5, sgst: 166.5, total: 2183
  });
});

test('invoice does not apply a coupon below its minimum subtotal', () => {
  assert.equal(coupons.validate('SAVE10', 100).valid, false);
  // A historical/synthetic order; placement would reject this coupon today.
  const o = order([item({ hsn: '0902' })], 'SAVE10');
  assert.deepEqual([o.discount, o.tax, o.total], [0, 18, 118]);
  assert.deepEqual(figures(invoice.computeInvoiceFigures(o)), {
    subtotal: 100, discount: 0, tax: 18, cgst: 9, sgst: 9, total: 118
  });
});

test('invoice does not apply an inactive coupon', () => {
  assert.equal(coupons.validate('DIWALI20', 1000).valid, false);
  const o = order([item({ hsn: '0902', price: 1000 })], 'DIWALI20');
  assert.deepEqual([o.discount, o.tax, o.total], [0, 180, 1180]);
  assert.deepEqual(figures(invoice.computeInvoiceFigures(o)), {
    subtotal: 1000, discount: 0, tax: 180, cgst: 90, sgst: 90, total: 1180
  });
});

test('ineligible flat coupon does not make an invoice total negative', () => {
  const o = order([item({ hsn: '0902', price: 10 })], 'FLAT50');
  assert.deepEqual([o.discount, o.tax, o.total], [0, 1.8, 11.8]);
  assert.deepEqual(figures(invoice.computeInvoiceFigures(o)), {
    subtotal: 10, discount: 0, tax: 1.8, cgst: 0.9, sgst: 0.9, total: 11.8
  });
});

test('invoice normalizes coupon spelling like billing', () => {
  const o = order([item({ hsn: '0902', price: 1000 })], ' save10 ');
  assert.equal(o.discount, 100);
  assert.equal(invoice.computeInvoiceFigures(o).discount, 100);
  assert.equal(invoice.computeInvoiceFigures(o).total, 1062);
});

test('unknown coupon produces no invoice discount', () => {
  const actual = invoice.computeInvoiceFigures(order([item()], 'NOT-A-COUPON'));
  assert.deepEqual([actual.discount, actual.tax, actual.total], [0, 5, 105]);
});

test('invoice accepts percentage, decimal, and zero GST rates like billing', () => {
  for (const [gstRate, billedTax, invoiceTax, invoicePercent] of [
    [5, 5, 5, 5], [0.05, 5, 5, 5], [0, 0, 0, 0]
  ]) {
    const o = order([item({ gstRate })]);
    const actual = invoice.computeInvoiceFigures(o);
    assert.equal(o.tax, billedTax, `billed tax for gstRate=${gstRate}`);
    assert.equal(actual.tax, invoiceTax, `invoice tax for gstRate=${gstRate}`);
    assert.equal(actual.rows[0].gstPercent, invoicePercent);
  }
});

test('invoice sums rounded line taxes like billing and splits the odd paise', () => {
  const o = order([item({ price: 0.03, hsn: '0902' }),
    item({ id: 2, price: 0.03, hsn: '0902' })]);
  assert.deepEqual([o.tax, o.total], [0.02, 0.08]);
  const actual = invoice.computeInvoiceFigures(o);
  assert.deepEqual(actual.rows.map(r => r.lineTax), [0.01, 0.01]);
  assert.deepEqual(figures(actual), {
    subtotal: 0.06, discount: 0, tax: 0.02, cgst: 0.01, sgst: 0.01, total: 0.08
  });
  const odd = invoice.computeInvoiceFigures(order([item({ price: 0.03, hsn: '0902' })]));
  assert.deepEqual([odd.tax, odd.cgst, odd.sgst], [0.01, 0.01, 0]);
});

test('CURRENT BEHAVIOUR: invoice recalculates instead of using stored billed figures', () => {
  const o = order([item()], '', { subtotal: 999, discount: 20, tax: 1, total: 980 });
  assert.deepEqual(figures(invoice.computeInvoiceFigures(o)), {
    subtotal: 100, discount: 0, tax: 5, cgst: 2.5, sgst: 2.5, total: 105
  });
  // Calculation and rendering must not rewrite the recorded order.
  const before = structuredClone(o);
  const html = invoice.render(o);
  assert.match(html, /Invoice Total<\/td><td class="r">₹105\.00/);
  assert.match(html, /Order Ledger recorded total \(₹980\.00\)/);
  assert.match(html, /-₹875\.00/);
  assert.deepEqual(o, before);
});

test('HTML displays the billed tax and total without a notice, but still warns on inconsistent stored totals', () => {
  const totalMismatch = invoice.render(order([item()], '', { total: 92 }));
  assert.match(totalMismatch, /Accountant Reconciliation Notice:/);
  assert.match(totalMismatch, /\+₹13\.00/);
  const html = invoice.render(order([item({ hsn: '0902', price: 1000 })], 'SAVE10'));
  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹162\.00/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹1062\.00/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice:/);
});

test('missing items yield zero invoice figures and no rows', () => {
  const actual = invoice.computeInvoiceFigures({});
  assert.deepEqual(figures(actual), {
    subtotal: 0, discount: 0, tax: 0, cgst: 0, sgst: 0, total: 0
  });
  assert.deepEqual(actual.rows, []);
});
