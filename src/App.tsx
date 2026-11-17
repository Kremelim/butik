import { useState } from 'react';
import { AuthGate } from './components/AuthGate.tsx';
import { BoutiqueStudio3D } from './components/BoutiqueStudio3D.tsx';
import { InventoryAndCrmView } from './components/InventoryAndCrmView.tsx';
import { LabelModal } from './components/LabelModal.tsx';
import { LiveAndBotView } from './components/LiveAndBotView.tsx';
import { RackGroupsView } from './components/RackGroupsView.tsx';
import { ShippingAndReceiptsView } from './components/ShippingAndReceiptsView.tsx';
import { formatTry, getProductStockTotals } from './core/boutiqueLogic.ts';
import type { CustomerDTO, OrderDTO } from './core/types.ts';
import { useBoutiqueWorkspace } from './hooks/useBoutiqueWorkspace.ts';

type NavTab = 'live' | 'studio3d' | 'racks' | 'shipping' | 'inventory';

export default function App() {
  const {
    mode,
    firebaseUser,
    snapshot,
    busy,
    errorMessage,
    enterPreviewMode,
    signInWithGoogle,
    logout,
    setLiveProduct,
    addProduct,
    adjustProductStock,
    saveCustomer,
    processWhatsappReservation,
    updateOrderStatus,
    submitReceiptVerification,
    appendLiveTranscript,
    generateIbanMessageForOrder,
  } = useBoutiqueWorkspace();

  const [activeTab, setActiveTab] = useState<NavTab>('live');
  const [selectedRackDigit, setSelectedRackDigit] = useState<number | 'all' | 'pending'>('all');
  const [studioRackDigit, setStudioRackDigit] = useState<number>(7);
  const [studioProductId, setStudioProductId] = useState<number | null>(null);
  const [labelModalState, setLabelModalState] = useState<{
    order: OrderDTO;
    customer: CustomerDTO;
    mode: 'shipping' | 'rack_tag';
  } | null>(null);

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-[#f7f6f3] flex items-center justify-center text-sm text-zinc-600">
        Çalışma alanı yükleniyor...
      </div>
    );
  }

  if (mode === 'gate') {
    return (
      <AuthGate
        busy={busy}
        errorMessage={errorMessage}
        onGoogleSignIn={signInWithGoogle}
        onEnterPreview={enterPreviewMode}
      />
    );
  }

  const totalAvailableStock = snapshot.products.reduce(
    (sum, p) => sum + getProductStockTotals(p.sizeStock).available,
    0
  );
  const reservedOrdersCount = snapshot.orders.filter(
    (o) => o.status === 'reserved' || o.status === 'awaiting_payment'
  ).length;
  const readyToShipCount = snapshot.orders.filter((o) => o.status === 'paid_ready').length;
  const heldCount = snapshot.orders.filter((o) => o.status === 'held').length;
  const totalRevenue = snapshot.orders
    .filter((o) => o.status === 'paid_ready' || o.status === 'shipped')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const liveProduct = snapshot.products.find((p) => p.isLiveNow) ?? snapshot.products[0];
  const activeStudioProduct =
    snapshot.products.find((p) => p.id === studioProductId) ?? liveProduct;

  const navItems: Array<{ id: NavTab; label: string }> = [
    { id: 'live', label: 'Canlı & Bot' },
    { id: 'studio3d', label: '3D Stüdyo' },
    { id: 'racks', label: '0-9 Raflar' },
    { id: 'shipping', label: 'Dekont & Kargo' },
    { id: 'inventory', label: 'Stok & CRM' },
  ];

  return (
    <div className="min-h-screen bg-[#f7f6f3] text-zinc-900 flex flex-col">
      {/* 3-Zone Top Bar Contract (responsive scrollable nav row on mobile) */}
      <header className="bg-white border-b border-zinc-200 px-4 sm:px-6 py-3">
        <div className="max-w-[1400px] mx-auto flex flex-wrap md:flex-nowrap items-center justify-between gap-x-6 gap-y-2.5">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('live');
            }}
            className="order-1 font-display text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
          >
            Kremelim Atölye
          </a>

          <nav
            aria-label="Ana gezinme"
            className="order-3 md:order-2 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-zinc-100 flex items-center gap-5 sm:gap-6 overflow-x-auto"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                    isActive
                      ? 'border-[#0f5132] text-zinc-900'
                      : 'border-transparent text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="order-2 md:order-3 shrink-0">
            {mode === 'preview' ? (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="px-3.5 sm:px-4 py-2 rounded-lg bg-[#0f5132] text-white text-xs font-medium hover:bg-[#0c4128] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Google ile Bağlan
              </button>
            ) : (
              <button
                type="button"
                onClick={logout}
                className="px-3.5 sm:px-4 py-2 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-800 text-xs font-medium hover:bg-zinc-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {firebaseUser?.displayName?.split(' ')[0] || 'Yönetici'} · Çıkış
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-6">
        {errorMessage && (
          <div
            role="alert"
            className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800"
          >
            {errorMessage}
          </div>
        )}

        {/* Operational KPI Strip */}
        <section
          aria-label="Günlük operasyon özeti"
          className="bg-white border border-zinc-200 rounded-xl px-5 py-3.5 grid grid-cols-2 md:grid-cols-5 gap-4 md:divide-x divide-zinc-200"
        >
          <div className="md:pr-4">
            <div className="text-xs text-zinc-500">Kalan Toplam Stok</div>
            <div className="text-lg font-mono font-semibold text-zinc-900 mt-0.5">
              {totalAvailableStock} adet
            </div>
          </div>
          <div className="md:px-4">
            <div className="text-xs text-zinc-500">Ödeme / Bilgi Bekleyen</div>
            <div className="text-lg font-mono font-semibold text-amber-700 mt-0.5">
              {reservedOrdersCount} sepet
            </div>
          </div>
          <div className="md:px-4">
            <div className="text-xs text-zinc-500">Kargoya Hazır (Ödendi)</div>
            <div className="text-lg font-mono font-semibold text-emerald-800 mt-0.5">
              {readyToShipCount} paket
            </div>
          </div>
          <div className="md:px-4">
            <div className="text-xs text-zinc-500">Bekletilen Sipariş</div>
            <div className="text-lg font-mono font-semibold text-zinc-900 mt-0.5">
              {heldCount} paket
            </div>
          </div>
          <div className="md:pl-4">
            <div className="text-xs text-zinc-500">Onaylanan Tahsilat</div>
            <div className="text-lg font-mono font-semibold text-zinc-900 mt-0.5">
              {formatTry(totalRevenue)}
            </div>
          </div>
        </section>

        {activeTab === 'live' && (
          <LiveAndBotView
            products={snapshot.products}
            customers={snapshot.customers}
            whatsappMessages={snapshot.whatsappMessages}
            liveTranscripts={snapshot.liveTranscripts}
            onSetLiveProduct={setLiveProduct}
            onReserveFromWhatsapp={processWhatsappReservation}
            onAppendTranscript={appendLiveTranscript}
          />
        )}

        {activeTab === 'studio3d' && activeStudioProduct && (
          <div className="space-y-4">
            <BoutiqueStudio3D
              products={snapshot.products}
              activeProduct={activeStudioProduct}
              selectedRackDigit={studioRackDigit}
              onSelectProduct={(id) => setStudioProductId(id)}
              onSelectRackDigit={(digit) => setStudioRackDigit(digit)}
            />
          </div>
        )}

        {activeTab === 'racks' && (
          <RackGroupsView
            customers={snapshot.customers}
            orders={snapshot.orders}
            products={snapshot.products}
            selectedRackDigit={selectedRackDigit}
            onSelectRackDigit={setSelectedRackDigit}
            onUpdateCustomer={saveCustomer}
            onAddProductToCustomer={processWhatsappReservation}
            onGenerateIbanMessage={generateIbanMessageForOrder}
            onUpdateOrderStatus={updateOrderStatus}
            onOpenLabel={(order, customer, labelMode) =>
              setLabelModalState({ order, customer, mode: labelMode })
            }
          />
        )}

        {activeTab === 'shipping' && (
          <ShippingAndReceiptsView
            customers={snapshot.customers}
            orders={snapshot.orders}
            receipts={snapshot.receipts}
            onVerifyReceipt={submitReceiptVerification}
            onUpdateOrderStatus={updateOrderStatus}
            onOpenLabel={(order, customer, labelMode) =>
              setLabelModalState({ order, customer, mode: labelMode })
            }
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryAndCrmView
            products={snapshot.products}
            customers={snapshot.customers}
            onAddProduct={addProduct}
            onAdjustStock={adjustProductStock}
            onSetLiveProduct={setLiveProduct}
            onSaveCustomer={saveCustomer}
          />
        )}
      </main>

      <LabelModal
        order={labelModalState?.order ?? null}
        customer={labelModalState?.customer ?? null}
        mode={labelModalState?.mode ?? 'shipping'}
        onClose={() => setLabelModalState(null)}
        onMarkPrinted={(orderId) => updateOrderStatus(orderId, { labelPrinted: true })}
      />
    </div>
  );
}
