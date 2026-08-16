import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getProduct } from '../api';
import type { Product } from '../types';
import ProductForm from '../components/ProductForm';

export default function EditProduct() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getProduct(id!)
      .then(setProduct)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) {
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

  return <ProductForm product={product} />;
}
