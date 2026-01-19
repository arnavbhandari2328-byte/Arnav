
export interface Product {
  sku: string;
  name: string;
  grade: string;
  size: string;
  stock: number;
  initialStock: number;
  price: number;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  contact: string;
  orderHistory: Order[];
}

export interface Order {
  id: string;
  date: string;
  type: 'SALE' | 'PURCHASE';
  items: OrderItem[];
  totalAmount: number;
}

export interface OrderItem {
  sku: string;
  qty: number;
  price: number;
}

export interface ProcessingResult {
  transactionType: 'INITIAL_SETUP' | 'SALE' | 'PURCHASE' | 'UNKNOWN';
  summary: string;
  affectedItems: { sku: string; previousStock: number; newStock: number }[];
  customerInfo?: {
    name: string;
    email: string;
    contact: string;
  };
  extractedItems: { sku: string; name: string; grade: string; size: string; qty: number; price: number }[];
  alerts: string[];
}

// Fixed: Corrected the interface to include totalInventoryValue and totalSales which were missing.
export interface Analytics {
  topProduct: Product | null;
  totalInventoryValue: number;
  totalSales: number;
  lowStockCount: number;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  INVENTORY = 'INVENTORY',
  CRM = 'CRM',
  UPLOADS = 'UPLOADS'
}
