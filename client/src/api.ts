import type { ListParams, Product, ProductListResponse, Variant, VariantInput } from './types';

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Something went wrong.');
  }
  return data as T;
}

export function listProducts(params: ListParams): Promise<ProductListResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.color) qs.set('color', params.color);
  if (params.size) qs.set('size', params.size);
  const query = qs.toString();
  return fetch(`/api/products${query ? `?${query}` : ''}`).then((r) => handle<ProductListResponse>(r));
}

export function getProduct(id: number | string): Promise<Product> {
  return fetch(`/api/products/${id}`).then((r) => handle<Product>(r));
}

export function createProduct(data: FormData): Promise<Product> {
  return fetch('/api/products', { method: 'POST', body: data }).then((r) => handle<Product>(r));
}

export function updateProduct(id: number | string, data: FormData): Promise<Product> {
  return fetch(`/api/products/${id}`, { method: 'PUT', body: data }).then((r) => handle<Product>(r));
}

export function deleteProduct(id: number | string): Promise<{ message: string }> {
  return fetch(`/api/products/${id}`, { method: 'DELETE' }).then((r) => handle<{ message: string }>(r));
}

export function updateVariant(id: number | string, input: VariantInput): Promise<Variant> {
  return fetch(`/api/variants/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((r) => handle<Variant>(r));
}

export function deleteVariant(id: number | string): Promise<{ message: string }> {
  return fetch(`/api/variants/${id}`, { method: 'DELETE' }).then((r) => handle<{ message: string }>(r));
}
