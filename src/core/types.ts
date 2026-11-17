export interface SizeStockEntry {
  total: number;
  reserved: number;
  sold: number;
}

export type SizeStockMap = Record<string, SizeStockEntry>;

export type ModelPreset = 'dress' | 'coat' | 'knitset' | 'tunic';

export type OrderStatus =
  | 'reserved'
  | 'awaiting_payment'
  | 'paid_ready'
  | 'held'
  | 'shipped'
  | 'cancelled';

export interface StoreSettingsDTO {
  storeName: string;
  iban: string;
  ibanHolder: string;
}

export interface ProductDTO {
  id: number;
  sku: string;
  name: string;
  category: string;
  wholesaleCost: number;
  salePrice: number;
  imageUrl: string;
  colorHex: string;
  modelPreset: ModelPreset;
  fabricNote: string;
  sizeStock: SizeStockMap;
  isLiveNow: boolean;
}

export interface CustomerDTO {
  id: number;
  fullName: string;
  phone: string;
  phoneLast4: string;
  rackGroup: number | null;
  tiktokHandle: string;
  address: string;
  previousOrderCount: number;
}

export interface OrderItemDTO {
  id: number;
  orderId: number;
  productId: number;
  productName: string;
  size: string;
  quantity: number;
  unitPrice: number;
  tagPrinted: boolean;
}

export interface OrderDTO {
  id: number;
  customerId: number;
  orderCode: string;
  status: OrderStatus;
  holdReason: string;
  totalAmount: number;
  shippingSlaDays: number;
  labelPrinted: boolean;
  ibanMessageSent: boolean;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDTO[];
}

export interface ReceiptDTO {
  id: number;
  orderId: number;
  referenceCode: string;
  senderName: string;
  transferDate: string;
  transferTime: string;
  amount: number;
  status: 'verified' | 'duplicate_rejected' | 'mismatch';
  note: string;
  createdAt: string;
}

export interface WhatsappMessageDTO {
  id: number;
  customerId: number | null;
  senderLabel: string;
  incomingText: string;
  screenshotUrl: string;
  detectedProductId: number | null;
  detectedSize: string;
  botReply: string;
  intent: 'reserve' | 'out_of_stock' | 'question' | 'missing_info' | 'multi_item';
  createdAt: string;
}

export interface LiveTranscriptDTO {
  id: number;
  speaker: string;
  text: string;
  detectedSku: string;
  createdAt: string;
}

export interface WorkspaceSnapshotDTO {
  settings: StoreSettingsDTO;
  products: ProductDTO[];
  customers: CustomerDTO[];
  orders: OrderDTO[];
  receipts: ReceiptDTO[];
  whatsappMessages: WhatsappMessageDTO[];
  liveTranscripts: LiveTranscriptDTO[];
}
