import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProducts } from '../api';
import type { Product, ProductListResponse } from '../types';

function compareSize(a: string, b: string) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function formatPrice(price: number) {
  return price.toLocaleString('en-US');
}

function VariantBreakdown({ product, color, size }: { product: Product; color: string; size: string }) {
  const hasColor = !!color;
  const hasSize = !!size;

  let items: { key: string; label: string; quantity: number }[] = [];

  if (hasColor && hasSize) {
    items = product.variants.map((v) => ({
      key: String(v.id),
      label: `${v.color} / ${v.size}`,
      quantity: v.quantity,
    }));
  } else if (hasSize) {
    const map = new Map<string, number>();
    for (const v of product.variants) map.set(v.color, (map.get(v.color) || 0) + v.quantity);
    items = [...map.entries()].map(([label, quantity]) => ({ key: label, label, quantity }));
  } else if (hasColor) {
    items = product.variants.map((v) => ({
      key: String(v.id),
      label: v.size,
      quantity: v.quantity,
    }));
  } else {
    items = product.color_totals.map((c) => ({ key: c.color, label: c.color, quantity: c.quantity }));
  }

  return (
    <ul className="breakdown">
      {items.map((item) => (
        <li key={item.key}>
          <span className="breakdown-label">{item.label}</span>
          <span className="breakdown-qty">{item.quantity} pc{item.quantity === 1 ? '' : 's'}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  const [search, setSearch] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [data, setData] = useState<ProductListResponse>({ products: [], count: 0, totalPieces: 0 });
  const [allColors, setAllColors] = useState<string[]>([]);
  const [allSizes, setAllSizes] = useState<string[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listProducts({})
      .then((res) => {
        const colors = new Set<string>();
        const sizes = new Set<string>();
        for (const p of res.products) {
          for (const v of p.variants) {
            colors.add(v.color);
            sizes.add(v.size);
          }
        }
        setAllColors([...colors].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
        setAllSizes([...sizes].sort(compareSize));
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProducts({ search: debouncedSearch, color, size })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError('');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, color, size]);

  const filteredColors = allColors;
  const filteredSizes = allSizes;

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="topbar-title">Inventory</h1>
        <Link to="/products/new" className="btn btn-primary">
          + Add Product
        </Link>
      </header>

      <div className="search-row">
        <input
          type="search"
          className="search-input"
          placeholder="Search products by name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      <div className="filter-row">
        <select className="select" value={color} onChange={(e) => setColor(e.target.value)}>
          <option value="">Color: All</option>
          {filteredColors.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="select" value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="">Size: All</option>
          {filteredSizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {(color || size || search) && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setColor('');
              setSize('');
              setSearch('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="stats-row">
        <span className="stat">
          Products: <strong>{data.count}</strong>
        </span>
        <span className="stat">
          Total Pieces: <strong>{data.totalPieces}</strong>
        </span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {ready && !loading && data.products.length === 0 && (
        <div className="empty-state">
          {search || color || size ? (
            <>
              <p>No products match your search.</p>
              <button
                className="btn"
                onClick={() => {
                  setColor('');
                  setSize('');
                  setSearch('');
                }}
              >
                Clear filters
              </button>
            </>
          ) : (
            <p>No products yet. Click "+ Add Product" to create the first one.</p>
          )}
        </div>
      )}

      <div className="product-grid">
        {data.products.map((p) => (
          <Link key={p.id} to={`/products/${p.id}`} className="product-card">
            <div className="card-top">
              {p.image ? (
                <img className="card-image" src={p.image} alt={p.name} />
              ) : (
                <div className="card-image placeholder">No image</div>
              )}
              <div className="card-info">
                <h3 className="card-name">{p.name}</h3>
                {p.sku && <div className="card-sku">{p.sku}</div>}
                <div className="card-price">{formatPrice(p.price)} EGP</div>
              </div>
            </div>
            <div className="card-total">
              <strong>{p.total_quantity}</strong> pc{p.total_quantity === 1 ? '' : 's'}
            </div>
            {p.variants.length > 0 && (
              <VariantBreakdown product={p} color={color} size={size} />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
