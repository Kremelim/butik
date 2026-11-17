import { Printer, X } from 'lucide-react';
import { buildShippingLabelPayload } from '../core/boutiqueLogic.ts';
import type { CustomerDTO, OrderDTO } from '../core/types.ts';

interface LabelModalProps {
  order: OrderDTO | null;
  customer: CustomerDTO | null;
  mode: 'shipping' | 'rack_tag';
  onClose: () => void;
  onMarkPrinted: (orderId: number) => void;
}

export function LabelModal({
  order,
  customer,
  mode,
  onClose,
  onMarkPrinted,
}: LabelModalProps) {
  if (!order || !customer) return null;

  const payload = buildShippingLabelPayload(order, customer, order.items);
  const barcodeSeed = `${order.orderCode}-${customer.phoneLast4 || '0000'}`;
  const bars = Array.from(barcodeSeed).map((ch, i) => ({
    width: (ch.charCodeAt(0) % 3) + 1,
    gap: ((ch.charCodeAt(0) + i) % 2) + 1,
  }));

  const handlePrint = () => {
    onMarkPrinted(order.id);
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Barkod ve Kargo Etiketi Önizleme"
    >
      <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              {mode === 'rack_tag'
                ? 'Ayırma & Raf Etiketi (Ürün Üzeri)'
                : 'Termal Kargo Barkod Etiketi (100×100mm)'}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Etiket cihazına yazdırmadan önce müşteri, raf ve bekletme bilgilerini kontrol edin
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Etiket penceresini kapat"
            className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          id="thermal-print-sheet"
          className="mt-5 border-2 border-zinc-900 rounded-xl p-5 bg-white text-zinc-900"
        >
          <div className="flex items-start justify-between border-b-2 border-zinc-900 pb-3">
            <div>
              <div className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-600">
                KREMELİM BUTİK · CANLI YAYIN
              </div>
              <div className="text-xl font-bold tracking-tight mt-0.5">
                {payload.fullName}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg font-bold bg-zinc-900 text-white px-2.5 py-1 rounded">
                {payload.rackCode}
              </div>
              <div className="font-mono text-xs text-zinc-600 mt-1">
                {payload.orderCode}
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 text-sm">
            <div>
              <span className="font-semibold">Telefon:</span>{' '}
              <span className="font-mono">{payload.phone}</span>
            </div>
            {mode === 'shipping' && (
              <div>
                <span className="font-semibold">Adres:</span> {payload.address}
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-zinc-300">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
              Ayrılan Ürünler
            </div>
            <ul className="space-y-1 text-sm font-medium">
              {payload.itemsSummary.map((line, i) => (
                <li key={i}>· {line}</li>
              ))}
            </ul>
          </div>

          {payload.holdReason && (
            <div className="mt-3 p-2.5 border-2 border-dashed border-zinc-900 rounded-lg text-xs font-bold">
              {payload.holdReason}
            </div>
          )}

          <div className="mt-4 pt-3 border-t-2 border-zinc-900 flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-600">Toplam Tutar</div>
              <div className="text-xl font-bold font-mono">
                {payload.totalAmountFormatted}
              </div>
              <div className="text-[11px] text-zinc-600 mt-0.5">{payload.slaText}</div>
            </div>
            <div className="flex flex-col items-end">
              <svg
                width="136"
                height="40"
                viewBox="0 0 136 40"
                aria-label={`Barkod ${payload.orderCode}`}
              >
                {bars.reduce<{ x: number; nodes: Array<{ x: number; w: number }> }>(
                  (acc, bar) => {
                    const nextNode = { x: acc.x, w: bar.width * 2 };
                    return {
                      x: acc.x + bar.width * 2 + bar.gap * 2,
                      nodes: [...acc.nodes, nextNode],
                    };
                  },
                  { x: 4, nodes: [] }
                ).nodes.map((n, idx) => (
                  <rect key={idx} x={n.x} y={2} width={n.w} height={36} fill="#111111" />
                ))}
              </svg>
              <span className="font-mono text-[10px] tracking-widest mt-0.5">
                {barcodeSeed}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer"
          >
            Kapat
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0f5132] text-white text-sm font-medium hover:bg-[#0c4128] cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Etiketi Yazdır
          </button>
        </div>
      </div>
    </div>
  );
}
