import type {
  CustomerDTO,
  OrderDTO,
  OrderItemDTO,
  ProductDTO,
  ReceiptDTO,
  SizeStockMap,
} from './types.ts';

export interface PhoneRackInfo {
  normalizedPhone: string;
  last4: string;
  rackGroup: number | null;
}

export function extractPhoneAndRackGroup(rawPhone?: string | null): PhoneRackInfo {
  const digits = (rawPhone ?? '').replace(/\D/g, '');
  if (digits.length < 4) {
    return {
      normalizedPhone: rawPhone?.trim() ?? '',
      last4: '',
      rackGroup: null,
    };
  }
  const last4 = digits.slice(-4);
  const lastDigit = Number(last4.slice(-1));
  return {
    normalizedPhone: rawPhone?.trim() ?? digits,
    last4,
    rackGroup: Number.isNaN(lastDigit) ? null : lastDigit,
  };
}

export function getMissingCustomerFields(
  customer: Pick<CustomerDTO, 'fullName' | 'phone' | 'address'>
): string[] {
  const missing: string[] = [];
  if (!customer.fullName || customer.fullName.trim().length < 2 || customer.fullName.startsWith('@')) {
    missing.push('Ad Soyad');
  }
  const { last4 } = extractPhoneAndRackGroup(customer.phone);
  if (!last4) {
    missing.push('Telefon Numarası');
  }
  if (!customer.address || customer.address.trim().length < 12) {
    missing.push('Açık Adres');
  }
  return missing;
}

export function getAvailableStock(sizeStock: SizeStockMap, size: string): number {
  const normalizedSize = size.trim().toUpperCase();
  const entry =
    sizeStock[normalizedSize] ??
    Object.entries(sizeStock).find(([k]) => k.toUpperCase() === normalizedSize)?.[1];
  if (!entry) return 0;
  return Math.max(0, entry.total - entry.reserved - entry.sold);
}

export function getProductStockTotals(sizeStock: SizeStockMap) {
  let total = 0;
  let reserved = 0;
  let sold = 0;
  for (const entry of Object.values(sizeStock)) {
    total += entry.total;
    reserved += entry.reserved;
    sold += entry.sold;
  }
  return {
    total,
    reserved,
    sold,
    available: Math.max(0, total - reserved - sold),
  };
}

export interface ReserveResult {
  ok: boolean;
  sizeStock: SizeStockMap;
  remainingAfter: number;
  hasUnpaidReserved: boolean;
}

export function reserveSizeStock(
  sizeStock: SizeStockMap,
  size: string,
  quantity = 1
): ReserveResult {
  const key =
    Object.keys(sizeStock).find((k) => k.toUpperCase() === size.trim().toUpperCase()) ??
    size.trim().toUpperCase();
  const entry = sizeStock[key];
  if (!entry || quantity <= 0) {
    return {
      ok: false,
      sizeStock,
      remainingAfter: 0,
      hasUnpaidReserved: Boolean(entry && entry.reserved > 0),
    };
  }

  const available = Math.max(0, entry.total - entry.reserved - entry.sold);
  if (available < quantity) {
    return {
      ok: false,
      sizeStock,
      remainingAfter: available,
      hasUnpaidReserved: entry.reserved > 0,
    };
  }

  const updated: SizeStockMap = {
    ...sizeStock,
    [key]: {
      ...entry,
      reserved: entry.reserved + quantity,
    },
  };
  return {
    ok: true,
    sizeStock: updated,
    remainingAfter: available - quantity,
    hasUnpaidReserved: updated[key].reserved > 0,
  };
}

export function releaseSizeStock(
  sizeStock: SizeStockMap,
  size: string,
  quantity = 1
): SizeStockMap {
  const key =
    Object.keys(sizeStock).find((k) => k.toUpperCase() === size.trim().toUpperCase()) ??
    size.trim().toUpperCase();
  const entry = sizeStock[key];
  if (!entry || quantity <= 0) return sizeStock;
  return {
    ...sizeStock,
    [key]: {
      ...entry,
      reserved: Math.max(0, entry.reserved - quantity),
    },
  };
}

export function confirmPaidSizeStock(
  sizeStock: SizeStockMap,
  size: string,
  quantity = 1
): SizeStockMap {
  const key =
    Object.keys(sizeStock).find((k) => k.toUpperCase() === size.trim().toUpperCase()) ??
    size.trim().toUpperCase();
  const entry = sizeStock[key];
  if (!entry || quantity <= 0) return sizeStock;
  const fromReserved = Math.min(entry.reserved, quantity);
  return {
    ...sizeStock,
    [key]: {
      ...entry,
      reserved: entry.reserved - fromReserved,
      sold: entry.sold + quantity,
    },
  };
}

export function formatTry(amount: number): string {
  return `${new Intl.NumberFormat('tr-TR').format(Math.round(amount))} TL`;
}

export function buildIbanPaymentMessage(params: {
  storeName: string;
  iban: string;
  ibanHolder: string;
  customer: Pick<CustomerDTO, 'fullName' | 'phoneLast4' | 'rackGroup'>;
  items: Pick<OrderItemDTO, 'productName' | 'size' | 'quantity' | 'unitPrice'>[];
  totalAmount: number;
  orderCode: string;
}): string {
  const itemLines = params.items
    .map(
      (item, idx) =>
        `${idx + 1}. ${item.productName} (${item.size} Beden x${item.quantity}) — ${formatTry(
          item.unitPrice * item.quantity
        )}`
    )
    .join('\n');

  const rackNote =
    params.customer.rackGroup !== null && params.customer.phoneLast4
      ? `Raf Grubu: ${params.customer.rackGroup} (Son 4 Hane: ${params.customer.phoneLast4})`
      : 'Raf Grubu: Telefon bilgisi bekleniyor';

  return [
    `Merhaba ${params.customer.fullName}, ${params.storeName} canlı yayın siparişiniz ayrılmıştır.`,
    `Sipariş Kodu: ${params.orderCode} | ${rackNote}`,
    '',
    'Ayrılan Ürünler:',
    itemLines,
    '',
    `Toplam Tutar: ${formatTry(params.totalAmount)}`,
    `IBAN: ${params.iban}`,
    `Alıcı Ad Soyad: ${params.ibanHolder}`,
    '',
    'Onaylıyorsanız ödemeyi yaptıktan sonra saat ve tarih bilgisinin net göründüğü dekontu bu sohbetten paylaşmanızı rica ederiz. Ürünleriniz aksi belirtilmedikçe en geç 2-3 iş günü içerisinde kargoya hazırlanacaktır.',
  ].join('\n');
}

export interface ReceiptCheckInput {
  referenceCode: string;
  senderName: string;
  transferDate: string;
  transferTime: string;
  amount: number;
}

export interface ReceiptVerificationResult {
  status: 'verified' | 'duplicate_rejected' | 'mismatch';
  reason: string;
}

export function verifyReceiptDuplicateAndAmount(
  incoming: ReceiptCheckInput,
  existingReceipts: Pick<
    ReceiptDTO,
    'referenceCode' | 'senderName' | 'transferDate' | 'transferTime' | 'amount' | 'status'
  >[],
  expectedOrderAmount: number
): ReceiptVerificationResult {
  const cleanRef = incoming.referenceCode.trim().toUpperCase();
  const cleanSender = incoming.senderName.trim().toLowerCase();
  const cleanDate = incoming.transferDate.trim();
  const cleanTime = incoming.transferTime.trim();

  if (!cleanRef || !cleanDate || !cleanTime || incoming.amount <= 0) {
    return {
      status: 'mismatch',
      reason: 'Dekont üzerinde tarih, saat, referans kodu ve tutar bilgisi eksiksiz olmalıdır.',
    };
  }

  const duplicate = existingReceipts.find((r) => {
    if (r.status === 'duplicate_rejected') return false;
    const sameRef = r.referenceCode.trim().toUpperCase() === cleanRef;
    const sameFingerprint =
      r.transferDate.trim() === cleanDate &&
      r.transferTime.trim() === cleanTime &&
      r.amount === incoming.amount &&
      r.senderName.trim().toLowerCase() === cleanSender;
    return sameRef || sameFingerprint;
  });

  if (duplicate) {
    return {
      status: 'duplicate_rejected',
      reason: `Tekrar eden dekont tespit edildi (Ref: ${cleanRef}, ${cleanDate} ${cleanTime}).`,
    };
  }

  if (incoming.amount !== expectedOrderAmount) {
    return {
      status: 'mismatch',
      reason: `Dekont tutarı (${formatTry(incoming.amount)}) sipariş toplamıyla (${formatTry(
        expectedOrderAmount
      )}) uyuşmuyor.`,
    };
  }

  return {
    status: 'verified',
    reason: `Dekont doğrulandı (${cleanDate} ${cleanTime} · ${formatTry(incoming.amount)}).`,
  };
}

export interface SlaStatusResult {
  daysElapsed: number;
  state: 'normal' | 'due_soon' | 'overdue';
  label: string;
}

export function calculateSlaStatus(
  createdAtIso: string,
  slaDays = 3,
  nowMs = Date.now()
): SlaStatusResult {
  const createdMs = new Date(createdAtIso).getTime();
  if (Number.isNaN(createdMs)) {
    return { daysElapsed: 0, state: 'normal', label: '0 gün (Yeni)' };
  }
  const diffDays = Math.max(0, Math.floor((nowMs - createdMs) / (1000 * 60 * 60 * 24)));
  if (diffDays > slaDays) {
    return {
      daysElapsed: diffDays,
      state: 'overdue',
      label: `${diffDays} gün geçti (${slaDays} iş günü aşıldı)`,
    };
  }
  if (diffDays >= Math.max(1, slaDays - 1)) {
    return {
      daysElapsed: diffDays,
      state: 'due_soon',
      label: `${diffDays}. gün (Kargo çıkışı yaklaşıyor)`,
    };
  }
  return {
    daysElapsed: diffDays,
    state: 'normal',
    label: `${diffDays} / ${slaDays} iş günü içinde`,
  };
}

export interface ShippingLabelPayload {
  orderCode: string;
  rackCode: string;
  fullName: string;
  phone: string;
  address: string;
  itemsSummary: string[];
  totalAmountFormatted: string;
  holdReason: string;
  slaText: string;
}

export function buildShippingLabelPayload(
  order: Pick<OrderDTO, 'orderCode' | 'totalAmount' | 'holdReason' | 'shippingSlaDays'>,
  customer: Pick<CustomerDTO, 'fullName' | 'phone' | 'phoneLast4' | 'rackGroup' | 'address' | 'tiktokHandle'>,
  items: Pick<OrderItemDTO, 'productName' | 'size' | 'quantity'>[]
): ShippingLabelPayload {
  const rackCode =
    customer.rackGroup !== null && customer.phoneLast4
      ? `RAF-${customer.rackGroup} · ...${customer.phoneLast4}`
      : customer.tiktokHandle || 'RAF-BEKLEMEDE';

  return {
    orderCode: order.orderCode,
    rackCode,
    fullName: customer.fullName,
    phone: customer.phone || `${customer.tiktokHandle} (Telefon Eksik)`,
    address: customer.address || 'Adres bilgisi bekleniyor',
    itemsSummary: items.map((i) => `${i.productName} — ${i.size} Beden x${i.quantity}`),
    totalAmountFormatted: formatTry(order.totalAmount),
    holdReason: order.holdReason ? `BEKLETME: ${order.holdReason}` : '',
    slaText: `En geç ${order.shippingSlaDays} iş günü içinde kargo`,
  };
}

export function matchTranscriptToProducts(
  transcriptText: string,
  products: Pick<ProductDTO, 'id' | 'sku' | 'name' | 'sizeStock'>[]
): { productId: number; sku: string; name: string; mentionedSizes: string[] } | null {
  const lower = transcriptText.toLocaleLowerCase('tr-TR');
  for (const product of products) {
    const skuMatch = lower.includes(product.sku.toLowerCase());
    const nameTokens = product.name
      .toLocaleLowerCase('tr-TR')
      .split(/\s+/)
      .filter((t) => t.length >= 4);
    const matchedTokens = nameTokens.filter((t) => lower.includes(t));
    if (skuMatch || matchedTokens.length >= 2) {
      const availableSizes = Object.keys(product.sizeStock);
      const mentionedSizes = availableSizes.filter((sz) => {
        const regex = new RegExp(`\\b${sz.toLowerCase()}\\b`, 'i');
        return regex.test(transcriptText);
      });
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        mentionedSizes,
      };
    }
  }
  return null;
}
