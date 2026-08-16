import express from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = join(__dirname, 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir);

await db.init();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) =>
    cb(null, `img-${Date.now()}${extname(file.originalname).toLowerCase()}`),
});
const upload = multer({ storage });

const app = express();
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

function sizeOrNull(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function parsePrice(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseQuantity(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function validateVariants(variants) {
  if (!Array.isArray(variants)) return { error: 'variants must be an array.' };
  const seen = new Set();
  for (const v of variants) {
    const color = sizeOrNull(v.color);
    const size = sizeOrNull(v.size);
    if (!color) return { error: 'Color cannot be empty.' };
    if (!size) return { error: 'Size cannot be empty.' };
    const quantity = parseQuantity(v.quantity);
    if (quantity === null) return { error: 'Quantity must be a non-negative integer.' };
    const key = `${color.toLowerCase()}|${size.toLowerCase()}`;
    if (seen.has(key))
      return { error: `Size ${size} in ${color} already exists.` };
    seen.add(key);
  }
  return { variants: variants.map((v) => ({ ...v, color: String(v.color).trim(), size: String(v.size).trim(), quantity: parseQuantity(v.quantity) })) };
}

async function skuExists(sku, excludeId) {
  const stmt = db.prepare('SELECT id FROM products WHERE LOWER(sku) = LOWER(?) AND id != ?');
  const row = await stmt.get(sku, excludeId || -1);
  return !!row;
}

async function validateProductBody(body) {
  const name = sizeOrNull(body.name);
  if (!name) return { error: 'Product name cannot be empty.' };
  const price = parsePrice(body.price);
  if (price === null) return { error: 'Price must be a valid non-negative number.' };
  const sku = sizeOrNull(body.sku);
  if (sku && await skuExists(sku, body.id)) return { error: `SKU "${sku}" already exists.` };
  return { name, sku, price };
}

function variantsFromBody(body) {
  if (body.variants === undefined) return [];
  if (typeof body.variants === 'string') {
    try {
      return JSON.parse(body.variants);
    } catch {
      return null;
    }
  }
  return body.variants;
}

function attachTotals(product, variants) {
  const total_quantity = variants.reduce((sum, v) => sum + v.quantity, 0);
  const byColor = new Map();
  for (const v of variants) {
    byColor.set(v.color, (byColor.get(v.color) || 0) + v.quantity);
  }
  const color_totals = [...byColor.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { sensitivity: 'base' }))
    .map(([color, quantity]) => ({ color, quantity }));
  return { ...product, variants, total_quantity, color_totals };
}

async function getProductById(id, filters = {}) {
  const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) return null;
  let query = 'SELECT * FROM variants WHERE product_id = ?';
  const params = [id];
  if (filters.color) {
    query += ' AND LOWER(color) = LOWER(?)';
    params.push(filters.color);
  }
  if (filters.size) {
    query += ' AND size = ?';
    params.push(String(filters.size));
  }
  query += ' ORDER BY color COLLATE NOCASE ASC, size COLLATE NOCASE ASC';
  const variants = await db.prepare(query).all(...params);
  return attachTotals(product, variants);
}

function deleteUploadedImage(path) {
  if (!path || !path.startsWith('/uploads/')) return;
  const file = join(uploadsDir, path.replace('/uploads/', ''));
  try {
    unlinkSync(file);
  } catch {
    /* ignore missing files */
  }
}

// ---------- Products ----------

app.get('/api/products', async (req, res) => {
  try {
    const search = sizeOrNull(req.query.search);
    const color = sizeOrNull(req.query.color);
    const size = sizeOrNull(req.query.size);

    const products = await db.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE ASC').all();

    const filtered = products.filter((p) => {
      if (!search) return true;
      const term = search.toLowerCase();
      return (
        (p.name || '').toLowerCase().includes(term) ||
        (p.sku || '').toLowerCase().includes(term)
      );
    });

    const items = filtered
      .map((p) => getProductById(p.id, { color, size }))
      .filter((p) => !color && !size ? true : p.variants.length > 0);

    const resolvedItems = await Promise.all(items);
    const totalPieces = resolvedItems.reduce((sum, p) => sum + p.total_quantity, 0);

    res.json({ products: resolvedItems, count: resolvedItems.length, totalPieces });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product.' });
  }
});

app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const validation = await validateProductBody(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });

    const rawVariants = variantsFromBody(req.body);
    const variantsCheck = validateVariants(rawVariants === null ? null : rawVariants);
    if (variantsCheck.error) {
      if (req.file) deleteUploadedImage(`/uploads/${req.file.filename}`);
      return res.status(400).json({ error: variantsCheck.error });
    }

    const result = await db
      .prepare('INSERT INTO products (name, sku, price, image) VALUES (?, ?, ?, ?)')
      .run(validation.name, validation.sku, validation.price, req.file ? `/uploads/${req.file.filename}` : null);
    const productId = result.lastInsertRowid;

    const insertVariant = db.prepare(
      'INSERT INTO variants (product_id, color, size, quantity) VALUES (?, ?, ?, ?)'
    );
    const tx = db.transaction(async (variants) => {
      for (const v of variants) {
        await insertVariant.run(productId, v.color, v.size, v.quantity);
      }
    });
    await tx(variantsCheck.variants);

    const product = await getProductById(productId);
    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    deleteUploadedImage(req.file && `/uploads/${req.file.filename}`);
    res.status(500).json({ error: 'Something went wrong while saving the product.' });
  }
});

app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const existing = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found.' });

    const validation = await validateProductBody({ ...req.body, id: existing.id });
    if (validation.error) return res.status(400).json({ error: validation.error });

    const rawVariants = variantsFromBody(req.body);
    const variantsCheck = validateVariants(rawVariants === null ? null : rawVariants);
    if (variantsCheck.error) {
      deleteUploadedImage(req.file && `/uploads/${req.file.filename}`);
      return res.status(400).json({ error: variantsCheck.error });
    }

    let image = existing.image;
    if (req.file) image = `/uploads/${req.file.filename}`;
    else if (sizeOrNull(req.body.image)) image = sizeOrNull(req.body.image);
    else if (req.body.remove_image === '1') image = null;

    await db.prepare(
      "UPDATE products SET name = ?, sku = ?, price = ?, image = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(validation.name, validation.sku, validation.price, image, existing.id);

    await db.prepare('DELETE FROM variants WHERE product_id = ?').run(existing.id);
    const insertVariant = db.prepare(
      'INSERT INTO variants (product_id, color, size, quantity) VALUES (?, ?, ?, ?)'
    );
    const tx = db.transaction(async (variants) => {
      for (const v of variants) {
        await insertVariant.run(existing.id, v.color, v.size, v.quantity);
      }
    });
    await tx(variantsCheck.variants);

    if (req.file) deleteUploadedImage(existing.image);
    res.json(await getProductById(existing.id));
  } catch (err) {
    console.error(err);
    deleteUploadedImage(req.file && `/uploads/${req.file.filename}`);
    res.status(500).json({ error: 'Something went wrong while updating the product.' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const existing = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found.' });
    await db.prepare('DELETE FROM products WHERE id = ?').run(existing.id);
    deleteUploadedImage(existing.image);
    res.json({ message: 'Product deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

// ---------- Variants ----------

app.post('/api/products/:id/variants', async (req, res) => {
  try {
    const existing = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found.' });

    const check = validateVariants([req.body]);
    if (check.error) return res.status(400).json({ error: check.error });

    const v = check.variants[0];
    const dup = await db
      .prepare('SELECT * FROM variants WHERE product_id = ? AND LOWER(color) = LOWER(?) AND LOWER(size) = LOWER(?)')
      .get(existing.id, v.color, v.size);
    if (dup) return res.status(409).json({ error: `Size ${v.size} in ${v.color} already exists.` });

    const result = await db
      .prepare('INSERT INTO variants (product_id, color, size, quantity) VALUES (?, ?, ?, ?)')
      .run(existing.id, v.color, v.size, v.quantity);
    const variant = await db.prepare('SELECT * FROM variants WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(variant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create variant.' });
  }
});

app.put('/api/variants/:id', async (req, res) => {
  try {
    const variant = await db.prepare('SELECT * FROM variants WHERE id = ?').get(req.params.id);
    if (!variant) return res.status(404).json({ error: 'Variant not found.' });

    const color = sizeOrNull(req.body.color) ?? variant.color;
    const size = sizeOrNull(req.body.size) ?? variant.size;
    const quantity = req.body.quantity === undefined
      ? variant.quantity
      : parseQuantity(req.body.quantity);

    if (!color) return res.status(400).json({ error: 'Color cannot be empty.' });
    if (!size) return res.status(400).json({ error: 'Size cannot be empty.' });
    if (quantity === null) return res.status(400).json({ error: 'Quantity must be a non-negative integer.' });

    const dup = await db
      .prepare('SELECT * FROM variants WHERE product_id = ? AND LOWER(color) = LOWER(?) AND LOWER(size) = LOWER(?) AND id != ?')
      .get(variant.product_id, color, size, variant.id);
    if (dup) return res.status(409).json({ error: `Size ${size} in ${color} already exists.` });

    await db.prepare("UPDATE variants SET color = ?, size = ?, quantity = ?, updated_at = datetime('now') WHERE id = ?")
      .run(color, size, quantity, variant.id);
    res.json(await db.prepare('SELECT * FROM variants WHERE id = ?').get(variant.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update variant.' });
  }
});

app.delete('/api/variants/:id', async (req, res) => {
  try {
    const variant = await db.prepare('SELECT * FROM variants WHERE id = ?').get(req.params.id);
    if (!variant) return res.status(404).json({ error: 'Variant not found.' });
    await db.prepare('DELETE FROM variants WHERE id = ?').run(variant.id);
    res.json({ message: 'Variant deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete variant.' });
  }
});

// ---------- Serve built client in production ----------
const clientDist = join(__dirname, '../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});