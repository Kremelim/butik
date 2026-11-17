import { useState } from 'react';
import { Plus, Radio, Users, Package } from 'lucide-react';
import {
  formatTry,
  getMissingCustomerFields,
  getProductStockTotals,
} from '../core/boutiqueLogic.ts';
import type { CustomerDTO, ModelPreset, ProductDTO, SizeStockMap } from '../core/types.ts';

interface InventoryAndCrmViewProps {
  products: ProductDTO[];
  customers: CustomerDTO[];
  onAddProduct: (input: {
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
  }) => Promise<void>;
  onAdjustStock: (productId: number, size: string, deltaTotal: number) => Promise<void>;
  onSetLiveProduct: (productId: number) => Promise<void>;
  onSaveCustomer: (input: {
    id?: number;
    fullName: string;
    phone: string;
    tiktokHandle: string;
    address: string;
  }) => Promise<void>;
}

export function InventoryAndCrmView({
  products,
  customers,
  onAddProduct,
  onAdjustStock,
  onSetLiveProduct,
  onSaveCustomer,
}: InventoryAndCrmViewProps) {
  const [subTab, setSubTab] = useState<'inventory' | 'crm'>('inventory');
  const [showNewProductForm, setShowNewProductForm] = useState(false);

  const [sku, setSku] = useState('ELB-502');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Elbise');
  const [wholesaleCost, setWholesaleCost] = useState(650);
  const [salePrice, setSalePrice] = useState(1290);
  const [modelPreset, setModelPreset] = useState<ModelPreset>('dress');
  const [colorHex, setColorHex] = useState('#0F5132');
  const [fabricNote, setFabricNote] = useState('Toptan yeni sezon, 2-3 iş günü kargo');
  const [qtyS, setQtyS] = useState(5);
  const [qtyM, setQtyM] = useState(6);
  const [qtyL, setQtyL] = useState(4);
  const [qtyXL, setQtyXL] = useState(2);

  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custHandle, setCustHandle] = useState('');
  const [custAddress, setCustAddress] = useState('');

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) return;
    const defaultImages: Record<ModelPreset, string> = {
      dress: '/src/assets/images/saten_elbise_product_1794951548756.jpg',
      coat: '/src/assets/images/kase_kaban_product_1794951550377.jpg',
      knitset: '/src/assets/images/triko_takim_product_1794951550007.jpg',
      tunic: '/src/assets/images/sifon_tunik_product_1794951549396.jpg',
    };

    await onAddProduct({
      sku,
      name,
      category,
      wholesaleCost: Number(wholesaleCost),
      salePrice: Number(salePrice),
      imageUrl: defaultImages[modelPreset],
      colorHex,
      modelPreset,
      fabricNote,
      sizeStock: {
        S: { total: qtyS, reserved: 0, sold: 0 },
        M: { total: qtyM, reserved: 0, sold: 0 },
        L: { total: qtyL, reserved: 0, sold: 0 },
        XL: { total: qtyXL, reserved: 0, sold: 0 },
      },
    });
    setName('');
    setShowNewProductForm(false);
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) return;
    await onSaveCustomer({
      fullName: custName,
      phone: custPhone,
      tiktokHandle: custHandle,
      address: custAddress,
    });
    setCustName('');
    setCustPhone('');
    setCustHandle('');
    setCustAddress('');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-zinc-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('inventory')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
              subTab === 'inventory'
                ? 'bg-white text-zinc-900'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Toptan Ürün & Beden Stok ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('crm')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
              subTab === 'crm'
                ? 'bg-white text-zinc-900'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Müşteri Veritabanı ({customers.length})
          </button>
        </div>

        {subTab === 'inventory' && (
          <button
            type="button"
            onClick={() => setShowNewProductForm((prev) => !prev)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0f5132] text-white text-xs font-medium hover:bg-[#0c4128] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Yeni Toptan Ürün Ekle
          </button>
        )}
      </div>

      {subTab === 'inventory' && (
        <div className="space-y-5">
          {showNewProductForm && (
            <form
              onSubmit={handleCreateProduct}
              className="bg-white border border-zinc-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-4 gap-3"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Ürün Kodu (SKU)
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  required
                  className="w-full text-xs font-mono border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Ürün Adı
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: Bordo Kadife Midi Elbise"
                  required
                  className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  3D Silüet Tipi
                </label>
                <select
                  value={modelPreset}
                  onChange={(e) => setModelPreset(e.target.value as ModelPreset)}
                  className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                >
                  <option value="dress">Elbise</option>
                  <option value="coat">Kaban / Trenç</option>
                  <option value="knitset">İkili Triko Takım</option>
                  <option value="tunic">Tunik / Bluz</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Toptan Alış (TL)
                </label>
                <input
                  type="number"
                  value={wholesaleCost}
                  onChange={(e) => setWholesaleCost(Number(e.target.value))}
                  className="w-full text-xs font-mono border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Canlı Satış Fiyatı (TL)
                </label>
                <input
                  type="number"
                  value={salePrice}
                  onChange={(e) => setSalePrice(Number(e.target.value))}
                  className="w-full text-xs font-mono border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Kategori
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Renk Tonu
                </label>
                <input
                  type="color"
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                  className="w-full h-9 border border-zinc-200 rounded-lg p-1 bg-zinc-50 cursor-pointer"
                />
              </div>

              <div className="md:col-span-4 grid grid-cols-4 gap-3 pt-1">
                {[
                  { label: 'S Beden Adet', val: qtyS, set: setQtyS },
                  { label: 'M Beden Adet', val: qtyM, set: setQtyM },
                  { label: 'L Beden Adet', val: qtyL, set: setQtyL },
                  { label: 'XL Beden Adet', val: qtyXL, set: setQtyXL },
                ].map((sz) => (
                  <div key={sz.label}>
                    <label className="block text-xs text-zinc-600 mb-1">{sz.label}</label>
                    <input
                      type="number"
                      min={0}
                      value={sz.val}
                      onChange={(e) => sz.set(Number(e.target.value))}
                      className="w-full text-xs font-mono border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                    />
                  </div>
                ))}
              </div>

              <div className="md:col-span-3">
                <input
                  type="text"
                  value={fabricNote}
                  onChange={(e) => setFabricNote(e.target.value)}
                  placeholder="Kumaş, kalıp ve kargo notu"
                  className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewProductForm(false)}
                  className="px-3 py-2 rounded-lg border border-zinc-200 text-xs font-medium cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#0f5132] text-white text-xs font-medium cursor-pointer"
                >
                  Stoka Kaydet
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-zinc-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Ürün</th>
                  <th className="text-right px-4 py-3 font-medium">Toptan / Satış</th>
                  <th className="text-left px-4 py-3 font-medium">Beden Stok (Kalan)</th>
                  <th className="text-right px-4 py-3 font-medium">Toplam Kalan</th>
                  <th className="text-right px-4 py-3 font-medium">Yayın Durumu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {products.map((p) => {
                  const totals = getProductStockTotals(p.sizeStock);
                  return (
                    <tr key={p.id} className="hover:bg-zinc-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 rounded-lg object-cover border border-zinc-200 shrink-0"
                          />
                          <div>
                            <div className="font-semibold text-zinc-900">{p.name}</div>
                            <div className="text-zinc-500 font-mono">
                              {p.sku} · {p.category}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <div className="text-zinc-500">{formatTry(p.wholesaleCost)}</div>
                        <div className="font-semibold text-zinc-900">
                          {formatTry(p.salePrice)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(p.sizeStock).map(([size, s]) => {
                            const avail = Math.max(0, s.total - s.reserved - s.sold);
                            return (
                              <div
                                key={size}
                                className="flex items-center gap-1 border border-zinc-200 rounded-md px-2 py-1 bg-zinc-50 font-mono"
                              >
                                <span className="font-semibold">{size}:</span>
                                <span
                                  className={
                                    avail === 0 ? 'text-red-700 font-bold' : 'text-emerald-800 font-bold'
                                  }
                                >
                                  {avail}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`${p.sku} ${size} stok artır`}
                                  onClick={() => onAdjustStock(p.id, size, 1)}
                                  className="ml-1 text-zinc-500 hover:text-zinc-900 cursor-pointer"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  aria-label={`${p.sku} ${size} stok azalt`}
                                  onClick={() => onAdjustStock(p.id, size, -1)}
                                  className="text-zinc-500 hover:text-zinc-900 cursor-pointer"
                                >
                                  -
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-900">
                        {totals.available} / {totals.total}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.isLiveNow ? (
                          <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                            <Radio className="w-3.5 h-3.5" />
                            Şu An Yayında
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSetLiveProduct(p.id)}
                            className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-800 hover:bg-zinc-100 cursor-pointer whitespace-nowrap"
                          >
                            Yayına Al
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'crm' && (
        <div className="space-y-5">
          <form
            onSubmit={handleCreateCustomer}
            className="bg-white border border-zinc-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
          >
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Ad Soyad
              </label>
              <input
                type="text"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                required
                placeholder="Müşteri Ad Soyad"
                className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Telefon
              </label>
              <input
                type="text"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="05XX XXX XX XX"
                className="w-full text-xs font-mono border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                TikTok @Kullanıcı
              </label>
              <input
                type="text"
                value={custHandle}
                onChange={(e) => setCustHandle(e.target.value)}
                placeholder="@kullanici"
                className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Açık Adres
              </label>
              <input
                type="text"
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                placeholder="Mahalle, Cadde, İlçe / İl"
                className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
              />
            </div>
            <button
              type="submit"
              className="py-2 px-4 rounded-lg bg-[#0f5132] text-white text-xs font-medium hover:bg-[#0c4128] cursor-pointer whitespace-nowrap"
            >
              Müşteriyi Kaydet
            </button>
          </form>

          <div className="bg-white border border-zinc-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Müşteri</th>
                  <th className="text-left px-4 py-3 font-medium">Telefon / Son 4</th>
                  <th className="text-left px-4 py-3 font-medium">Raf Grubu</th>
                  <th className="text-left px-4 py-3 font-medium">Açık Adres</th>
                  <th className="text-right px-4 py-3 font-medium">Önceki İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {customers.map((c) => {
                  const missing = getMissingCustomerFields(c);
                  return (
                    <tr key={c.id} className="hover:bg-zinc-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-zinc-900">{c.fullName}</div>
                        {c.tiktokHandle && (
                          <div className="text-zinc-500">{c.tiktokHandle}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {c.phone || <span className="text-amber-700">Telefon Eksik</span>}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-emerald-800">
                        {c.rackGroup !== null
                          ? `Raf ${c.rackGroup} (...${c.phoneLast4})`
                          : 'Beklemede'}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {c.address || (
                          <span className="text-amber-700">
                            Eksik: {missing.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-900">
                        {c.previousOrderCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
