import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { deleteProduct, getProduct, updateVariant } from '../api';
import type { Product, Variant } from '../types';

function formatPrice(price: number) {
  return price.toLocaleString('en-US');
}

function withRecomputed(p: Product): Product {
  const total_quantity = p.variants.reduce((s, v) => s + v.quantity, 0);
  const map = new Map<string, number>();
  for (const v of p.variants) map.set(v.color, (map.get(v.color) || 0) + v.quantity);
  const color_totals = [...map.entries()].map(([color, quantity]) => ({ color, quantity }));
  return { ...p, total_quantity, color_totals };
}

function groupByColor(variants: Variant[]) {
  const groups: { color: string; variants: Variant[] }[] = [];
  for (const v of variants) {
    const g = groups.find((x) => x.color === v.color);
    if (g) g.variants.push(v);
    else groups.push({ color: v.color, variants: [v] });
  }
  return groups;
}

function QuantityControl({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (quantity: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  const commit = async () => {
    setEditing(false);
    const n = Number(text);
    if (!Number.isInteger(n) || n < 0) {
      setText(String(value));
      return;
    }
    if (n === value) {
      setText(String(value));
      return;
    }
    setText(String(n));
    await onCommit(n);
  };

  return (
    <div className="qty-control">
      <button
        className="qty-btn"
        disabled={value <= 0}
        onClick={() => onCommit(value - 1)}
        title="Decrease"
      >
        −
      </button>
      {editing ? (
        <input
          className="qty-input"
          autoFocus
          type="number"
          min={0}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setText(String(value));
              setEditing(false);
            }
          }}
        />
      ) : (
        <button className="qty-value" onClick={() => setEditing(true)} title="Click to edit">
          {value}
        </button>
      )}
      <button className="qty-btn" onClick={() => onCommit(value + 1)} title="Increase">
        +
      </button>
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [notice] = useState((location.state as { notice?: string } | null)?.notice || '');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    getProduct(id!)
      .then(setProduct)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const changeQuantity = async (variantId: number, quantity: number) => {
    setProduct((prev) =>
      prev
        ? withRecomputed({
            ...prev,
            variants: prev.variants.map((v) =>
              v.id === variantId ? { ...v, quantity } : v
            ),
          })
        : prev
    );
    try {
      await updateVariant(variantId, { quantity });
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  };

  const handleDelete = async () => {
    if (!product) return;
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteProduct(product.id);
      navigate('/');
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  };

  if (error && !product) {
    return (
      <div className="page">
        <Link to="/" className="btn btn-ghost">
          ← Back
        </Link>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="page">
        <Link to="/" className="btn btn-ghost">
          ← Back
        </Link>
        <div className="empty-state">Loading...</div>
      </div>
    );
  }

  const groups = groupByColor(product.variants);

  return (
    <div className="page">
      <div className="detail-header">
        <Link to="/" className="btn btn-ghost">
          ← Back
        </Link>
        <div className="detail-actions">
          <Link to={`/products/${product.id}/edit`} className="btn">
            Edit
          </Link>
          <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
            Delete
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="detail-top">
        {product.image ? (
          <img className="detail-image" src={product.image} alt={product.name} />
        ) : (
          <div className="detail-image placeholder">No image</div>
        )}
        <div className="detail-info">
          <h1 className="detail-name">{product.name}</h1>
          {product.sku && <div className="detail-sku">SKU: {product.sku}</div>}
          <div className="detail-price">{formatPrice(product.price)} EGP</div>
          <div className="detail-total">
            Total: <strong>{product.total_quantity}</strong> pc
            {product.total_quantity === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {groups.length === 0 && (
        <div className="empty-state">This product has no sizes yet.</div>
      )}

      <div className="color-groups">
        {groups.map((group) => {
          const colorTotal = group.variants.reduce((s, v) => s + v.quantity, 0);
          return (
            <div key={group.color} className="color-group">
              <div className="color-header">
                <h3 className="color-name">{group.color}</h3>
                <span className="color-total">{colorTotal} pc{colorTotal === 1 ? '' : 's'}</span>
              </div>
              <table className="variant-table">
                <tbody>
                  {group.variants.map((v) => (
                    <tr key={v.id}>
                      <td className="size-cell">{v.size}</td>
                      <td className="qty-cell">
                        <QuantityControl
                          value={v.quantity}
                          onCommit={(q) => changeQuantity(v.id, q)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
