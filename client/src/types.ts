export interface Variant {
  id: number;
  product_id: number;
  color: string;
  size: string;
  quantity: number;
}

export interface ColorTotal {
  color: string;
  quantity: number;
}

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  price: number;
  image: string | null;
  created_at: string;
  updated_at: string;
  variants: Variant[];
  total_quantity: number;
  color_totals: ColorTotal[];
}

export interface ProductListResponse {
  products: Product[];
  count: number;
  totalPieces: number;
}

export interface ListParams {
  search?: string;
  color?: string;
  size?: string;
}

export interface VariantInput {
  color?: string;
  size?: string;
  quantity?: number;
}
