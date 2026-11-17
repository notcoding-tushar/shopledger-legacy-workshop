# ShopLedger

## Stack

- ShopLedger 0.8.4: internal billing, inventory, and customer khata (credit ledger) app.
- Node.js with CommonJS modules, Express 4, and body-parser 1. No Node.js version is declared in package.json.
- Plain HTML, CSS, and browser JavaScript using XMLHttpRequest; no frontend build step.
- Persistence is synchronous whole-file JSON reads/writes to data/db.json, not a database service.

## Module map

- server.js: Express setup, static public/ files, /api routers, and printable HTML invoice route.
- config.js: port, shop details, tax slabs, coupons, inventory settings, and admin key.
- public/index.html, public/css/style.css, public/js/app.js: POS cart, order history, khata, and audit UI.
- routes/products.js: product catalog and coupons.
- routes/orders.js: order listing, lookup, placement, and cancellation.
- routes/customers.js: customer balances and settlements.
- routes/reports.js: dashboard, GST reconciliation, pricing preview, and admin export.
- lib/store.js: JSON persistence, default structure, and audit entries.
- lib/inventory.js: sellable stock, stock checks, deduction, release, and summaries.
- lib/pricing.js: order subtotal, discount allocation, and GST totals.
- lib/coupons.js: coupon normalization, validation, and discount calculation.
- lib/tax.js: GST rate lookup and CGST/SGST split.
- lib/orders.js: order records, IDs, cancellation, filtering, and sorting.
- lib/ledger.js: customer balances, credit limits, khata charges/reversals, and settlements.
- lib/dates.js: date formatting, filter normalization, and fiscal-year helper.
- lib/invoice.js: separate invoice calculation and printable HTML rendering.
- lib/reports.js: dashboard aggregation and invoice-versus-order reconciliation.
- data/db.json: products, orders, customers, settlements, audit log, and ID counters.
- docs/architecture.png: architecture and order-placement diagram.

## Commands

- npm start: runs node server.js; port defaults to 3000 and can be set with PORT.
- node server.js: starts the same application directly.
- npm test: currently a placeholder that prints "Error: no test specified" and exits with status 1. No test suite is currently present.
- No build or lint commands are defined in package.json.

## Rules

- Write characterization tests before changing behaviour. Capture the existing behaviour before making the intended change.
- Change only the module the ticket is about. Keep production changes within that module and scope characterization tests to it; do not refactor unrelated modules.
- Tests never touch data/db.json: do not read, write, reset, or otherwise access it. Use isolated fixtures or in-memory data, and stub persistence where necessary.
- Add no dependencies.
