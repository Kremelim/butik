import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Printer,
  Sparkles,
  Truck,
} from 'lucide-react';
import { calculateSlaStatus, formatTry } from '../core/boutiqueLogic.ts';
import type { CustomerDTO, OrderDTO, OrderStatus, ReceiptDTO } from '../core/types.ts';

interface ShippingAndReceiptsViewProps {
  customers: CustomerDTO[];
  orders: OrderDTO[];
  receipts: ReceiptDTO[];
  onVerifyReceipt: (input: {
    orderId: number;
    referenceCode: string;
    senderName: string;
    transferDate: string;
    transferTime: string;
    amount: number;
  }) => Promise<{ status: 'verified' | 'duplicate_rejected' | 'mismatch'; reason: string }>;
  onUpdateOrderStatus: (
    orderId: number,
    updates: { status?: OrderStatus; holdReason?: string; labelPrinted?: boolean }
  ) => Promise<void>;
  onOpenLabel: (order: OrderDTO, customer: CustomerDTO, mode: 'shipping' | 'rack_tag') => void;
}

export function ShippingAndReceiptsView({
  customers,
  orders,
  receipts,
  onVerifyReceipt,
  onUpdateOrderStatus,
  onOpenLabel,
}: ShippingAndReceiptsViewProps) {
  const awaitingOrders = orders.filter(
    (o) =>
      o.status === 'reserved' ||
      o.status === 'awaiting_payment' ||
      o.status === 'held'
  );

  const initialOrder = awaitingOrders[0] ?? orders[0];
  const initialCustomer = customers.find((c) => c.id === initialOrder?.customerId);

  const [selectedOrderId, setSelectedOrderId] = useState<number>(initialOrder?.id ?? 0);
  const [referenceCode, setReferenceCode] = useState('EFT-84219');
  const [senderName, setSenderName] = useState(initialCustomer?.fullName ?? 'Deniz Aksoy');
  const [transferDate, setTransferDate] = useState('2026-11-17');
  const [transferTime, setTransferTime] = useState('14:35');
  const [amount, setAmount] = useState<number>(initialOrder?.totalAmount ?? 2140);

  const [ocrBusy, setOcrBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    status: string;
    reason: string;
  } | null>(null);

  const [queueFilter, setQueueFilter] = useState<
    'paid_ready' | 'held' | 'awaiting_payment' | 'shipped'
  >('paid_ready');

  const handleSelectOrder = (orderId: number) => {
    setSelectedOrderId(orderId);
    const ord = orders.find((o) => o.id === orderId);
    const cust = customers.find((c) => c.id === ord?.customerId);
    if (ord) setAmount(ord.totalAmount);
    if (cust) setSenderName(cust.fullName);
  };

  const handleReceiptImageUpload = async (file: File) => {
    setOcrBusy(true);
    setVerifyResult(null);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/ai/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: file.type || 'image/jpeg',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Dekont görseli okunamadı.');
      setReferenceCode(data.referenceCode);
      setSenderName(data.senderName);
      setTransferDate(data.transferDate);
      setTransferTime(data.transferTime);
      setAmount(Number(data.amount));
    } catch (err: unknown) {
      setVerifyResult({
        status: 'mismatch',
        reason: err instanceof Error ? err.message : 'Dekont okunamadı.',
      });
    } finally {
      setOcrBusy(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId) return;
    const result = await onVerifyReceipt({
      orderId: selectedOrderId,
      referenceCode,
      senderName,
      transferDate,
      transferTime,
      amount: Number(amount),
    });
    setVerifyResult(result);
  };

  const queueOrders = orders.filter((o) => {
    if (queueFilter === 'awaiting_payment') {
      return o.status === 'awaiting_payment' || o.status === 'reserved';
    }
    return o.status === queueFilter;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Receipt Verification & Duplicate Protection */}
      <div className="lg:col-span-5 space-y-5">
        <form
          onSubmit={handleVerifySubmit}
          className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-800" />
                Dekont Saat / Tarih & Tekrar Kontrolü
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Müşterinin attığı dekontun daha önce kullanılıp kullanılmadığını kontrol eder
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 hover:underline cursor-pointer whitespace-nowrap">
              <Sparkles className="w-3.5 h-3.5" />
              {ocrBusy ? 'Okunuyor...' : 'Dekont Görseli Oku'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleReceiptImageUpload(f);
                }}
              />
            </label>
          </div>

          <div>
            <label
              htmlFor="receipt-order-select"
              className="block text-xs font-medium text-zinc-700 mb-1"
            >
              Eşleştirilecek Sipariş
            </label>
            <select
              id="receipt-order-select"
              value={selectedOrderId}
              onChange={(e) => handleSelectOrder(Number(e.target.value))}
              className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
            >
              {orders
                .filter((o) => o.status !== 'cancelled')
                .map((o) => {
                  const c = customers.find((cust) => cust.id === o.customerId);
                  return (
                    <option key={o.id} value={o.id}>
                      {o.orderCode} — {c?.fullName ?? 'Müşteri'} ({formatTry(o.totalAmount)})
                    </option>
                  );
                })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="receipt-ref"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Dekont Referans No
              </label>
              <input
                id="receipt-ref"
                type="text"
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                required
                className="w-full text-xs font-mono border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
              />
            </div>
            <div>
              <label
                htmlFor="receipt-amount"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Gelen Tutar (TL)
              </label>
              <input
                id="receipt-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
                className="w-full text-xs font-mono border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
              />
            </div>
            <div>
              <label
                htmlFor="receipt-date"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Transfer Tarihi
              </label>
              <input
                id="receipt-date"
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                required
                className="w-full text-xs font-mono border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
              />
            </div>
            <div>
              <label
                htmlFor="receipt-time"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Transfer Saati
              </label>
              <input
                id="receipt-time"
                type="time"
                value={transferTime}
                onChange={(e) => setTransferTime(e.target.value)}
                required
                className="w-full text-xs font-mono border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="receipt-sender"
              className="block text-xs font-medium text-zinc-700 mb-1"
            >
              Gönderen Ad Soyad
            </label>
            <input
              id="receipt-sender"
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              required
              className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
            />
          </div>

          {verifyResult && (
            <div
              role="alert"
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                verifyResult.status === 'verified'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {verifyResult.status === 'verified' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
              )}
              <span>{verifyResult.reason}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-lg bg-[#0f5132] text-white text-xs font-medium hover:bg-[#0c4128] cursor-pointer"
          >
            Dekontu Doğrula & Kargoya Hazırla
          </button>
        </form>

        {/* Recent Receipt History */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-zinc-900 pb-3 border-b border-zinc-200">
            Dekont Kayıt Geçmişi
          </h3>
          <div className="mt-3 space-y-2.5 max-h-64 overflow-y-auto">
            {receipts.map((r) => (
              <div
                key={r.id}
                className="py-2 border-b border-zinc-100 last:border-b-0 flex items-start justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-mono font-semibold text-zinc-900">
                    {r.referenceCode} · {formatTry(r.amount)}
                  </div>
                  <div className="text-zinc-500 mt-0.5">
                    {r.senderName} · {r.transferDate} {r.transferTime}
                  </div>
                  <div
                    className={`mt-0.5 font-medium ${
                      r.status === 'verified' ? 'text-emerald-800' : 'text-red-700'
                    }`}
                  >
                    {r.note}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Post-Live End-of-Stream Prep, Hold Reasons, 2-3 Day SLA & Thermal Labels */}
      <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-200">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Yayın Sonu Hazırlık, Bekletme & Kargo Etiket Kuyruğu
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Aksi belirtilmedikçe ürünler 2–3 iş günü içinde kargolanır. Bekletme sebepleri
              barkod etiketine yazdırılır.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1 p-1 bg-zinc-100 rounded-lg">
          {(
            [
              { id: 'paid_ready', label: 'Ödendi / Kargoya Hazır' },
              { id: 'held', label: 'Bekletilenler' },
              { id: 'awaiting_payment', label: 'Ödeme Bekleyenler' },
              { id: 'shipped', label: 'Kargolandı' },
            ] as const
          ).map((tab) => {
            const count = orders.filter((o) =>
              tab.id === 'awaiting_payment'
                ? o.status === 'awaiting_payment' || o.status === 'reserved'
                : o.status === tab.id
            ).length;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setQueueFilter(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                  queueFilter === tab.id
                    ? 'bg-white text-zinc-900 border border-zinc-200'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-3">
          {queueOrders.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              Bu durumda sipariş bulunmuyor.
            </div>
          ) : (
            queueOrders.map((order) => {
              const customer = customers.find((c) => c.id === order.customerId);
              if (!customer) return null;
              const sla = calculateSlaStatus(order.createdAt, order.shippingSlaDays);

              return (
                <div
                  key={order.id}
                  className="border border-zinc-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-zinc-900">
                        {order.orderCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-emerald-800 font-semibold">
                        {customer.rackGroup !== null
                          ? `RAF ${customer.rackGroup} (...${customer.phoneLast4})`
                          : customer.tiktokHandle}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-medium ${
                          sla.state === 'overdue'
                            ? 'text-red-700'
                            : sla.state === 'due_soon'
                              ? 'text-amber-700'
                              : 'text-zinc-600'
                        }`}
                      >
                        {sla.label}
                      </span>
                    </div>

                    <div className="text-sm font-semibold text-zinc-900">
                      {customer.fullName}{' '}
                      <span className="font-mono font-normal text-xs text-zinc-500">
                        {customer.phone || 'Telefon Eksik'}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-600">
                      {customer.address || 'Adres bilgisi henüz girilmedi'}
                    </div>

                    <div className="text-xs text-zinc-700 pt-1">
                      {order.items
                        .map((i) => `${i.productName} (${i.size}×${i.quantity})`)
                        .join(', ')}{' '}
                      — <strong className="font-mono">{formatTry(order.totalAmount)}</strong>
                    </div>

                    {order.holdReason && (
                      <div className="text-xs font-medium text-amber-800">
                        Bekletme Sebebi: {order.holdReason}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap sm:flex-col items-stretch sm:items-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenLabel(order, customer, 'shipping')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {order.labelPrinted ? 'Etiketi Yeniden Yazdır' : 'Kargo Etiketi Yazdır'}
                    </button>

                    {order.status === 'paid_ready' && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateOrderStatus(order.id, { status: 'shipped' })
                        }
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-medium hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        Kargoya Verildi
                      </button>
                    )}

                    {order.status === 'held' && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateOrderStatus(order.id, {
                            status: 'paid_ready',
                            holdReason: '',
                          })
                        }
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer whitespace-nowrap"
                      >
                        Bekletmeyi Kaldır
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
