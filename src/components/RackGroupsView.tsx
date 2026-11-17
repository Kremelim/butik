import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  PauseCircle,
  Plus,
  Search,
  Send,
  Tag,
  XCircle,
} from 'lucide-react';
import { formatTry, getMissingCustomerFields } from '../core/boutiqueLogic.ts';
import type { CustomerDTO, OrderDTO, OrderStatus, ProductDTO } from '../core/types.ts';

interface RackGroupsViewProps {
  customers: CustomerDTO[];
  orders: OrderDTO[];
  products: ProductDTO[];
  selectedRackDigit: number | 'all' | 'pending';
  onSelectRackDigit: (val: number | 'all' | 'pending') => void;
  onUpdateCustomer: (input: {
    id?: number;
    fullName: string;
    phone: string;
    tiktokHandle: string;
    address: string;
  }) => Promise<void>;
  onAddProductToCustomer: (params: {
    customer: {
      fullName: string;
      phone: string;
      tiktokHandle: string;
      address: string;
    };
    items: Array<{ productId: number; size: string; quantity: number }>;
    incomingText: string;
    screenshotUrl: string;
    botReply: string;
    intent: 'reserve' | 'multi_item';
  }) => Promise<unknown>;
  onGenerateIbanMessage: (order: OrderDTO) => string;
  onUpdateOrderStatus: (
    orderId: number,
    updates: {
      status?: OrderStatus;
      holdReason?: string;
      ibanMessageSent?: boolean;
    }
  ) => Promise<void>;
  onOpenLabel: (order: OrderDTO, customer: CustomerDTO, mode: 'rack_tag' | 'shipping') => void;
}

export function RackGroupsView({
  customers,
  orders,
  products,
  selectedRackDigit,
  onSelectRackDigit,
  onUpdateCustomer,
  onAddProductToCustomer,
  onGenerateIbanMessage,
  onUpdateOrderStatus,
  onOpenLabel,
}: RackGroupsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [ibanModalOrder, setIbanModalOrder] = useState<OrderDTO | null>(null);
  const [copiedIban, setCopiedIban] = useState(false);

  const [addingOrderId, setAddingOrderId] = useState<number | null>(null);
  const [addProductId, setAddProductId] = useState<number>(products[0]?.id ?? 1);
  const [addSize, setAddSize] = useState<string>('M');

  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');

  const [holdOrderId, setHoldOrderId] = useState<number | null>(null);
  const [holdReasonText, setHoldReasonText] = useState('Müşteri yeni ürün ekleyecek');

  const activeOrders = orders.filter((o) => o.status !== 'cancelled');

  const filteredEntries = activeOrders
    .map((order) => ({
      order,
      customer: customers.find((c) => c.id === order.customerId),
    }))
    .filter((entry): entry is { order: OrderDTO; customer: CustomerDTO } =>
      Boolean(entry.customer)
    )
    .filter(({ customer }) => {
      if (selectedRackDigit === 'pending') {
        if (customer.rackGroup !== null) return false;
      } else if (typeof selectedRackDigit === 'number') {
        if (customer.rackGroup !== selectedRackDigit) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          customer.fullName.toLowerCase().includes(q) ||
          customer.phoneLast4.includes(q) ||
          customer.tiktokHandle.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

  const ibanText = ibanModalOrder ? onGenerateIbanMessage(ibanModalOrder) : '';

  return (
    <div className="space-y-5">
      {/* 0-9 Rack Digit Segmented Selector + Last 4 Search */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 bg-zinc-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => onSelectRackDigit('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
              selectedRackDigit === 'all'
                ? 'bg-white text-zinc-900 border border-zinc-200'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Tümü ({activeOrders.length})
          </button>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => {
            const count = activeOrders.filter((o) => {
              const c = customers.find((cust) => cust.id === o.customerId);
              return c?.rackGroup === digit;
            }).length;
            return (
              <button
                key={digit}
                type="button"
                onClick={() => onSelectRackDigit(digit)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-mono font-semibold cursor-pointer whitespace-nowrap ${
                  selectedRackDigit === digit
                    ? 'bg-[#0f5132] text-white'
                    : 'text-zinc-700 hover:bg-zinc-200/70'
                }`}
              >
                Raf {digit} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onSelectRackDigit('pending')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
              selectedRackDigit === 'pending'
                ? 'bg-amber-700 text-white'
                : 'text-amber-900 hover:bg-amber-100'
            }`}
          >
            Telefon Bekleyen (@)
          </button>
        </div>

        <div className="relative w-full lg:w-64">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Son 4 hane veya müşteri ara..."
            aria-label="Son 4 hane veya müşteri ara"
            className="w-full pl-9 pr-3 py-2 text-xs border border-zinc-200 rounded-lg bg-zinc-50"
          />
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center text-sm text-zinc-500">
          Bu raf grubunda aktif ayrılan ürün bulunmuyor.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredEntries.map(({ order, customer }) => {
            const missing = getMissingCustomerFields(customer);
            const isEditing = editingCustomerId === customer.id;
            const isAdding = addingOrderId === order.id;
            const isHolding = holdOrderId === order.id;

            return (
              <article
                key={order.id}
                className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-100">
                    <div>
                      <div className="text-xs font-mono text-emerald-800 font-semibold">
                        {customer.rackGroup !== null
                          ? `RAF ${customer.rackGroup} · SON 4 HANE: ${customer.phoneLast4}`
                          : 'TELEFON BEKLENİYOR (@)'}
                      </div>
                      <h3 className="text-base font-semibold text-zinc-900 mt-0.5">
                        {customer.fullName}
                      </h3>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        <span className="font-mono">{order.orderCode}</span>
                        <span aria-hidden="true"> · </span>
                        <span>
                          {customer.previousOrderCount > 0
                            ? `${customer.previousOrderCount} önceki işlem`
                            : 'Yeni müşteri'}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>
                          {order.status === 'paid_ready'
                            ? 'Ödendi (Kargoya Hazır)'
                            : order.status === 'held'
                              ? 'Bekletiliyor'
                              : order.status === 'awaiting_payment'
                                ? 'IBAN Gönderildi'
                                : order.status === 'shipped'
                                  ? 'Kargolandı'
                                  : 'Ayrıldı'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-mono font-bold text-base text-zinc-900">
                      {formatTry(order.totalAmount)}
                    </div>
                  </div>

                  {missing.length > 0 && (
                    <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        Eksik: {missing.join(', ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCustomerId(customer.id);
                          setEditName(customer.fullName);
                          setEditPhone(customer.phone);
                          setEditAddress(customer.address);
                        }}
                        className="font-semibold underline cursor-pointer whitespace-nowrap"
                      >
                        Bilgileri Gir
                      </button>
                    </div>
                  )}

                  {isEditing && (
                    <div className="mt-3 p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Ad Soyad"
                        className="w-full text-xs border border-zinc-200 rounded-md px-2.5 py-1.5 bg-white"
                      />
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="Telefon (05XX XXX XX XX)"
                        className="w-full text-xs border border-zinc-200 rounded-md px-2.5 py-1.5 bg-white font-mono"
                      />
                      <input
                        type="text"
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder="Açık Adres"
                        className="w-full text-xs border border-zinc-200 rounded-md px-2.5 py-1.5 bg-white"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingCustomerId(null)}
                          className="text-xs px-2.5 py-1 rounded border border-zinc-200 bg-white cursor-pointer"
                        >
                          Vazgeç
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onUpdateCustomer({
                              id: customer.id,
                              fullName: editName,
                              phone: editPhone,
                              tiktokHandle: customer.tiktokHandle,
                              address: editAddress,
                            });
                            setEditingCustomerId(null);
                          }}
                          className="text-xs px-2.5 py-1 rounded bg-[#0f5132] text-white cursor-pointer"
                        >
                          Kaydet & Rafa Ata
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Items inside this customer's bag */}
                  <ul className="mt-3 divide-y divide-zinc-100">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="py-2 flex items-center justify-between text-xs"
                      >
                        <span className="text-zinc-800 font-medium">
                          {item.productName}{' '}
                          <span className="font-mono text-zinc-500">
                            ({item.size} × {item.quantity})
                          </span>
                        </span>
                        <span className="font-mono text-zinc-700">
                          {formatTry(item.unitPrice * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {order.holdReason && (
                    <div className="mt-2 text-xs text-amber-800">
                      Bekletme Notu: <strong>{order.holdReason}</strong>
                    </div>
                  )}

                  {isAdding && (
                    <div className="mt-3 p-3 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-wrap items-center gap-2">
                      <select
                        value={addProductId}
                        onChange={(e) => setAddProductId(Number(e.target.value))}
                        className="flex-1 text-xs border border-zinc-200 rounded-md px-2 py-1.5 bg-white"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={addSize}
                        onChange={(e) => setAddSize(e.target.value)}
                        className="w-16 text-xs font-mono border border-zinc-200 rounded-md px-2 py-1.5 bg-white"
                      >
                        {['S', 'M', 'L', 'XL'].map((sz) => (
                          <option key={sz} value={sz}>
                            {sz}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={async () => {
                          await onAddProductToCustomer({
                            customer: {
                              fullName: customer.fullName,
                              phone: customer.phone,
                              tiktokHandle: customer.tiktokHandle,
                              address: customer.address,
                            },
                            items: [{ productId: addProductId, size: addSize, quantity: 1 }],
                            incomingText: 'Yayın sırasında sepete ek ürün eklendi.',
                            screenshotUrl:
                              products.find((p) => p.id === addProductId)?.imageUrl || '',
                            botReply: `${customer.fullName} sepetinize ek ürün eklendi.`,
                            intent: 'multi_item',
                          });
                          setAddingOrderId(null);
                        }}
                        className="px-3 py-1.5 rounded-md bg-[#0f5132] text-white text-xs font-medium cursor-pointer"
                      >
                        Ekle
                      </button>
                    </div>
                  )}

                  {isHolding && (
                    <div className="mt-3 p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2">
                      <select
                        value={holdReasonText}
                        onChange={(e) => setHoldReasonText(e.target.value)}
                        className="w-full text-xs border border-zinc-200 rounded-md px-2.5 py-1.5 bg-white"
                      >
                        <option value="Müşteri yeni ürün ekleyecek">
                          Müşteri yeni ürün ekleyecek
                        </option>
                        <option value="Evde olmadığı için kargo bekletiliyor">
                          Evde olmadığı için kargo bekletiliyor
                        </option>
                        <option value="Henüz ödeme yapılmadı">Henüz ödeme yapılmadı</option>
                      </select>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setHoldOrderId(null)}
                          className="text-xs px-2.5 py-1 rounded border border-zinc-200 bg-white cursor-pointer"
                        >
                          İptal
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onUpdateOrderStatus(order.id, {
                              status: 'held',
                              holdReason: holdReasonText,
                            });
                            setHoldOrderId(null);
                          }}
                          className="text-xs px-2.5 py-1 rounded bg-amber-700 text-white cursor-pointer"
                        >
                          Bekletmeye Al
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Strip */}
                <div className="pt-3 border-t border-zinc-100 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenLabel(order, customer, 'rack_tag')}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-[11px] font-medium text-zinc-800 hover:bg-zinc-100 cursor-pointer whitespace-nowrap"
                  >
                    <Tag className="w-3 h-3" />
                    Ayırma Etiketi
                  </button>

                  <button
                    type="button"
                    onClick={() => setAddingOrderId(isAdding ? null : order.id)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-[11px] font-medium text-zinc-800 hover:bg-zinc-100 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3 h-3" />
                    Ek Ürün Ekle
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setIbanModalOrder(order);
                      if (order.status === 'reserved') {
                        await onUpdateOrderStatus(order.id, {
                          status: 'awaiting_payment',
                          ibanMessageSent: true,
                        });
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0f5132] text-white text-[11px] font-medium hover:bg-[#0c4128] cursor-pointer whitespace-nowrap"
                  >
                    <Send className="w-3 h-3" />
                    IBAN Mesajı
                  </button>

                  <button
                    type="button"
                    onClick={() => setHoldOrderId(isHolding ? null : order.id)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-zinc-200 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                  >
                    <PauseCircle className="w-3 h-3" />
                    Beklet
                  </button>

                  {order.status !== 'paid_ready' && order.status !== 'shipped' && (
                    <button
                      type="button"
                      onClick={() => onUpdateOrderStatus(order.id, { status: 'cancelled' })}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-red-200 text-[11px] font-medium text-red-700 hover:bg-red-50 cursor-pointer whitespace-nowrap"
                    >
                      <XCircle className="w-3 h-3" />
                      Ödenmedi / İptal
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* IBAN Payment Message Preview Modal */}
      {ibanModalOrder && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="IBAN Ödeme Mesajı"
        >
          <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-zinc-900">
              WhatsApp IBAN & Onay Mesajı ({ibanModalOrder.orderCode})
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Alıcı adı, IBAN, beden/tutar dökümü ve dekont talebi hazırlandı
            </p>
            <textarea
              readOnly
              rows={10}
              value={ibanText}
              className="mt-4 w-full text-xs font-mono border border-zinc-200 rounded-xl p-3 bg-zinc-50 text-zinc-800"
            />
            <div className="mt-4 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIbanModalOrder(null)}
                className="px-4 py-2 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 cursor-pointer"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(ibanText).catch(() => undefined);
                  setCopiedIban(true);
                  window.setTimeout(() => setCopiedIban(false), 1800);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0f5132] text-white text-xs font-medium cursor-pointer"
              >
                {copiedIban ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Mesaj Kopyalandı
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    WhatsApp İçin Kopyala
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
