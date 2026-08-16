# Shoe Shop Inventory

A small, local inventory management application for a shoe/clothing retail shop.

The employee can quickly check what products are available, in which size/color
combinations, how many pieces exist, and their price — without checking the
physical stock.

> This is **not** a POS system. No checkout, payments, invoices, customers,
> analytics, or user accounts.

## Features

- Create / edit / delete products (name, SKU, price, image)
- Add colors, sizes, and quantities per product
- The inventory unit is **Product + Color + Size**
- Automatic totals: per color and per product
- Fast search by product name or SKU (partial, case-insensitive)
- Filter by color and size (combined with search)
- Quick stock editing: `+1`, `-1`, or direct quantity edit
- Runs completely locally with a single SQLite file — no database server needed

## Tech Stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express
- **Database:** SQLite (via `better-sqlite3`)

## Requirements

- Node.js **20 or newer**
- npm

## Install & Run (development)

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

The SQLite database (`server/inventory.db`) is created automatically on first
run. Uploaded product images are stored in `server/uploads`.

## Production build

```bash
npm install
npm run build
npm start
```

This serves the built frontend and the API together on http://localhost:5000.

## How it works

- `server/db.js` — opens/creates the SQLite database and its tables
- `server/index.js` — Express API + image uploads + static file serving
- `client/src/pages/Home.tsx` — search, filters, product list
- `client/src/pages/ProductDetail.tsx` — stock view and quick quantity editing
- `client/src/components/ProductForm.tsx` — add / edit product with variants

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/products` | List products. Supports `?search=&size=&color=` |
| GET | `/api/products/:id` | Single product with variants and totals |
| POST | `/api/products` | Create product (multipart form) |
| PUT | `/api/products/:id` | Update product (multipart form) |
| DELETE | `/api/products/:id` | Delete product |
| POST | `/api/products/:id/variants` | Add a variant |
| PUT | `/api/variants/:id` | Update a variant |
| DELETE | `/api/variants/:id` | Delete a variant |

Search matches product name or SKU (partial, case-insensitive). Variant totals
are always calculated automatically.
