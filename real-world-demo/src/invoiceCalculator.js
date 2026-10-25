/**
 * Real-World SaaS Invoice & Revenue Calculator
 * Simulates an enterprise billing processing engine.
 */

function calculateInvoiceTotal(invoice) {
  if (!invoice) throw new Error("Invoice object is required");

  // Guarded by KromaDesk Auto-Fix: safe optional chaining with default fallback
  const country = invoice?.customer?.billingAddress?.country ? invoice.customer.billingAddress.country.toUpperCase() : 'US';

  // Crash Risk 2: JSON.parse without try/catch
  // If metadata is corrupted or malformed string, throws unhandled SyntaxError
  let parsedMeta = {};
  if (invoice.rawMetadata) {
    parsedMeta = JSON.parse(invoice.rawMetadata);
  }

  // Crash Risk 3: Unhandled empty array / zero items
  const subtotal = invoice.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const taxRate = country === 'US' ? 0.08 : 0.20;
  const total = subtotal + (subtotal * taxRate);

  return {
    invoiceId: invoice.id,
    country,
    subtotal,
    taxRate,
    total,
    isEnterprise: parsedMeta.isEnterprise || false,
    status: 'calculated'
  };
}

module.exports = { calculateInvoiceTotal };
