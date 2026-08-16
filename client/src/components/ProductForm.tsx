import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createProduct, updateProduct } from '../api';
import type { Product } from '../types';

interface SizeInput {
  size: string;
  quantity: string;
}

interface ColorGroupInput {
  color: string;
  sizes: SizeInput[];
}

function fromProduct(p: Product): ColorGroupInput[] {
  const groups: ColorGroupInput[] = [];
  for (const v of p.variants) {
    let g = groups.find((x) => x.color === v.color);
    if (!g) {
      g = { color: v.color, sizes: [] };
      groups.push(g);
    }
    g.sizes.push({ size: v.size, quantity: String(v.quantity) });
  }
  return groups;
}

function groupTotal(sizes: SizeInput[]) {
  return sizes.reduce((sum, s) => {
    const n = Number(s.quantity);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

export default function ProductForm({ product }: { product?: Product }) {
  const navigate = useNavigate();
  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [colors, setColors] = useState<ColorGroupInput[]>(
    product ? fromProduct(product) : [{ color: '', sizes: [{ size: '', quantity: '' }] }]
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = imageFile
    ? URL.createObjectURL(imageFile)
    : product?.image && !removeImage
      ? product.image
      : null;

  useEffect(() => {
    return () => {
      if (imageFile) URL.revokeObjectURL(previewUrl ?? '');
    };
  }, [imageFile, previewUrl]);

  const updateGroup = (index: number, patch: Partial<ColorGroupInput>) => {
    setColors((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  };

  const updateSize = (gi: number, si: number, patch: Partial<SizeInput>) => {
    setColors((prev) =>
      prev.map((g, i) =>
        i !== gi
          ? g
          : { ...g, sizes: g.sizes.map((s, j) => (j === si ? { ...s, ...patch } : s)) }
      )
    );
  };

  const removeGroup = (index: number) => {
    setColors((prev) => prev.filter((_, i) => i !== index));
  };

  const removeSize = (gi: number, si: number) => {
    setColors((prev) =>
      prev.map((g, i) =>
        i !== gi ? g : { ...g, sizes: g.sizes.filter((_, j) => j !== si) }
      )
    );
  };

  const addSize = (gi: number) => {
    setColors((prev) =>
      prev.map((g, i) => (i !== gi ? g : { ...g, sizes: [...g.sizes, { size: '', quantity: '' }] }))
    );
  };

  const addColor = () => {
    setColors((prev) => [...prev, { color: '', sizes: [{ size: '', quantity: '' }] }]);
  };

  const buildVariants = (): { color: string; size: string; quantity: number }[] | null => {
    const variants: { color: string; size: string; quantity: number }[] = [];
    const seen = new Set<string>();
    for (const g of colors) {
      const color = g.color.trim();
      for (const s of g.sizes) {
        const size = s.size.trim();
        if (!size) continue;
        if (!color) {
          setError('Color cannot be empty.');
          return null;
        }
        const n = Number(s.quantity);
        if (!Number.isInteger(n) || n < 0) {
          setError(`Quantity for size ${size} must be a non-negative integer.`);
          return null;
        }
        const key = `${color.toLowerCase()}|${size.toLowerCase()}`;
        if (seen.has(key)) {
          setError(`Size ${size} in ${color} already exists.`);
          return null;
        }
        seen.add(key);
        variants.push({ color, size, quantity: n });
      }
    }
    return variants;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Product name cannot be empty.');
      return;
    }
    const priceNum = Number(price);
    if (price === '' || !Number.isFinite(priceNum) || priceNum < 0) {
      setError('Price must be a valid non-negative number.');
      return;
    }
    const variants = buildVariants();
    if (!variants) return;

    const formData = new FormData();
    formData.append('name', trimmedName);
    formData.append('sku', sku.trim());
    formData.append('price', String(priceNum));
    formData.append('variants', JSON.stringify(variants));
    if (imageFile) formData.append('image', imageFile);
    if (removeImage && !imageFile) formData.append('remove_image', '1');

    setSaving(true);
    try {
      const saved = product
        ? await updateProduct(product.id, formData)
        : await createProduct(formData);
      navigate(`/products/${saved.id}`, {
        state: { notice: product ? 'Product updated successfully.' : 'Product created successfully.' },
      });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const selectImage = (file: File | null) => {
    setImageFile(file);
    if (file) setRemoveImage(false);
  };

  return (
    <form className="page form" onSubmit={handleSubmit}>
      <header className="topbar">
        <h1 className="topbar-title">{product ? 'Edit Product' : 'Add Product'}</h1>
        <Link to={product ? `/products/${product.id}` : '/'} className="btn btn-ghost">
          Cancel
        </Link>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-card">
        <label className="field">
          <span className="label">Product name *</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nike Air Max 270"
            autoFocus
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="label">SKU</span>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. AM270-01"
            />
          </label>
          <label className="field">
            <span className="label">Price (EGP) *</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
            />
          </label>
        </div>

        <div className="field">
          <span className="label">Image</span>
          <div className="image-picker">
            {previewUrl ? (
              <img className="preview" src={previewUrl} alt="Preview" />
            ) : (
              <div className="preview placeholder">No image</div>
            )}
            <div className="image-actions">
              <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
                {imageFile ? 'Change image' : 'Upload image'}
              </button>
              {previewUrl && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setImageFile(null);
                    setRemoveImage(true);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Remove image
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => selectImage(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="form-card">
        <div className="card-header-row">
          <h2 className="form-section-title">Sizes & Colors</h2>
          <button type="button" className="btn" onClick={addColor}>
            + Add Color
          </button>
        </div>

        {colors.length === 0 && (
          <div className="empty-state small">No colors yet. Click "+ Add Color".</div>
        )}

        {colors.map((group, gi) => (
          <div key={gi} className="color-editor">
            <div className="color-editor-header">
              <label className="field inline">
                <span className="label">Color</span>
                <input
                  type="text"
                  value={group.color}
                  onChange={(e) => updateGroup(gi, { color: e.target.value })}
                  placeholder="e.g. Black"
                />
              </label>
              <span className="group-total">
                {groupTotal(group.sizes)} pc{groupTotal(group.sizes) === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => removeGroup(gi)}
                disabled={colors.length === 1}
              >
                Remove
              </button>
            </div>

            <table className="variant-table form-table">
              <tbody>
                {group.sizes.map((row, si) => (
                  <tr key={si}>
                    <td className="size-cell">
                      <input
                        className="size-input"
                        type="text"
                        value={row.size}
                        onChange={(e) => updateSize(gi, si, { size: e.target.value })}
                        placeholder="Size e.g. 40"
                      />
                    </td>
                    <td className="qty-cell">
                      <input
                        className="qty-input wide"
                        type="number"
                        min={0}
                        step={1}
                        value={row.quantity}
                        onChange={(e) => updateSize(gi, si, { quantity: e.target.value })}
                        placeholder="Qty"
                      />
                    </td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeSize(gi, si)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => addSize(gi)}>
              + Add Size
            </button>
          </div>
        ))}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
          {saving ? 'Saving...' : product ? 'Save Changes' : 'Save Product'}
        </button>
      </div>
    </form>
  );
}
