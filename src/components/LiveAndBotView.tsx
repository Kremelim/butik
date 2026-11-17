import { useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Radio,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  formatTry,
  getAvailableStock,
  getMissingCustomerFields,
  getProductStockTotals,
} from '../core/boutiqueLogic.ts';
import type {
  CustomerDTO,
  LiveTranscriptDTO,
  ProductDTO,
  WhatsappMessageDTO,
} from '../core/types.ts';
import { LiveTranscriber } from './LiveTranscriber.tsx';

interface LiveAndBotViewProps {
  products: ProductDTO[];
  customers: CustomerDTO[];
  whatsappMessages: WhatsappMessageDTO[];
  liveTranscripts: LiveTranscriptDTO[];
  onSetLiveProduct: (productId: number) => Promise<void>;
  onReserveFromWhatsapp: (params: {
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
    intent: WhatsappMessageDTO['intent'];
  }) => Promise<unknown>;
  onAppendTranscript: (speaker: string, text: string, detectedSku?: string) => Promise<void>;
}

export function LiveAndBotView({
  products,
  customers,
  whatsappMessages,
  liveTranscripts,
  onSetLiveProduct,
  onReserveFromWhatsapp,
  onAppendTranscript,
}: LiveAndBotViewProps) {
  const liveProduct = products.find((p) => p.isLiveNow) ?? products[0];

  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderHandle, setSenderHandle] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [incomingText, setIncomingText] = useState(
    'Ekran görüntüsündeki üründen M beden ayırabilir misiniz?'
  );
  const [selectedScreenshotUrl, setSelectedScreenshotUrl] = useState(
    liveProduct?.imageUrl ?? ''
  );
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string>('');
  const [uploadedMimeType, setUploadedMimeType] = useState<string>('');
  const [cartDraft, setCartDraft] = useState<
    Array<{ productId: number; size: string; quantity: number }>
  >(() =>
    liveProduct ? [{ productId: liveProduct.id, size: 'M', quantity: 1 }] : []
  );

  const [aiBusy, setAiBusy] = useState(false);
  const [botFeedback, setBotFeedback] = useState<string | null>(null);
  const [botError, setBotError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);

  const copyText = (id: number | string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  if (!liveProduct) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-sm text-zinc-600">
        Henüz ürün eklenmemiş. Stok & CRM sekmesinden ilk toptan ürününüzü ekleyin.
      </div>
    );
  }

  const liveTotals = getProductStockTotals(liveProduct.sizeStock);
  const depletedSizes = Object.entries(liveProduct.sizeStock).filter(
    ([, s]) => Math.max(0, s.total - s.reserved - s.sold) === 0
  );

  const broadcastAnnouncement =
    depletedSizes.length > 0
      ? `Duyuru (${liveProduct.sku} ${liveProduct.name}): ${depletedSizes
          .map(([sz, s]) =>
            s.reserved > 0
              ? `${sz} beden tükendi (${s.reserved} adet ödeme bekliyor, iptal olursa sıradakine ayrılabilir)`
              : `${sz} beden tamamen tükendi`
          )
          .join(' · ')}. Kalan bedenler için WhatsApp'tan ekran görüntüsü atabilirsiniz!`
      : `Yayında: ${liveProduct.sku} ${liveProduct.name} (${formatTry(
          liveProduct.salePrice
        )}). Tüm bedenlerden toplam ${liveTotals.available} adet stokta!`;

  const findMatchedCustomer = () => {
    const cleanDigits = senderPhone.replace(/\D/g, '');
    const last4 = cleanDigits.length >= 4 ? cleanDigits.slice(-4) : '';
    const cleanHandle = senderHandle.trim().toLowerCase();
    return customers.find((c) => {
      if (last4 && c.phoneLast4 === last4) return true;
      if (cleanHandle && c.tiktokHandle.toLowerCase() === cleanHandle) return true;
      return false;
    });
  };

  const handleScreenshotUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setUploadedImageDataUrl(dataUrl);
      setUploadedMimeType(file.type || 'image/jpeg');
      setSelectedScreenshotUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleDeterministicReserve = async (e: React.FormEvent) => {
    e.preventDefault();
    setBotError(null);
    setBotFeedback(null);

    if (!senderName.trim() && !senderHandle.trim() && !senderPhone.trim()) {
      setBotError('Lütfen müşteri adı, telefon numarası veya @kullanıcı adı girin.');
      return;
    }

    const existingCustomer = findMatchedCustomer();
    const effectiveCustomer = {
      fullName: senderName.trim() || existingCustomer?.fullName || senderHandle.trim(),
      phone: senderPhone.trim() || existingCustomer?.phone || '',
      tiktokHandle: senderHandle.trim() || existingCustomer?.tiktokHandle || '',
      address: senderAddress.trim() || existingCustomer?.address || '',
    };

    const missingFields = getMissingCustomerFields(effectiveCustomer);
    const reservedParts: string[] = [];
    const outOfStockParts: string[] = [];

    for (const reqItem of cartDraft) {
      const prod = products.find((p) => p.id === reqItem.productId);
      if (!prod) continue;
      const avail = getAvailableStock(prod.sizeStock, reqItem.size);
      const entry = prod.sizeStock[reqItem.size];
      if (avail >= reqItem.quantity) {
        reservedParts.push(`${prod.name} (${reqItem.size} Beden x${reqItem.quantity})`);
      } else {
        const unpaidCount = entry?.reserved ?? 0;
        outOfStockParts.push(
          unpaidCount > 0
            ? `${prod.name} (${reqItem.size}) stoğu bitti ancak ${unpaidCount} adet ödeme bekliyor; ödenmezse iptal edip size ayırabiliriz.`
            : `${prod.name} (${reqItem.size}) stoğu tamamen tükenmiştir.`
        );
      }
    }

    const greeting = existingCustomer
      ? `Merhaba ${effectiveCustomer.fullName} (Kayıtlı müşterimiz, ${existingCustomer.previousOrderCount} önceki işleminiz mevcut).`
      : `Merhaba ${effectiveCustomer.fullName}!`;

    const missingNote =
      missingFields.length > 0
        ? ` Kaydınızı tamamlayabilmemiz için eksik bilgilerinizi paylaşır mısınız: ${missingFields.join(
            ', '
          )}.`
        : '';

    const replyParts = [greeting];
    if (reservedParts.length > 0) {
      replyParts.push(
        `İlk yazan önceliğiyle şu ürün(ler) adınıza etiketlenip ayrıldı: ${reservedParts.join(
          ', '
        )}.`
      );
    }
    if (outOfStockParts.length > 0) {
      replyParts.push(outOfStockParts.join(' '));
    }
    if (missingNote) replyParts.push(missingNote);

    const intent: WhatsappMessageDTO['intent'] =
      reservedParts.length === 0 && outOfStockParts.length > 0
        ? 'out_of_stock'
        : missingFields.length > 0
          ? 'missing_info'
          : reservedParts.length > 1
            ? 'multi_item'
            : 'reserve';

    await onReserveFromWhatsapp({
      customer: effectiveCustomer,
      items: cartDraft,
      incomingText: incomingText.trim() || 'Ekran görüntüsü gönderildi.',
      screenshotUrl: selectedScreenshotUrl || liveProduct.imageUrl,
      botReply: replyParts.join(' '),
      intent,
    });

    setBotFeedback(
      reservedParts.length > 0
        ? `Başarılı: ${reservedParts.join(', ')} ayrıldı ve WhatsApp yanıtı kaydedildi.`
        : 'Stok yetersizliği yanıtı müşteriye hazırlandı ve kaydedildi.'
    );
  };

  const handleGeminiAnalyze = async () => {
    setAiBusy(true);
    setBotError(null);
    setBotFeedback(null);
    try {
      const existingCustomer = findMatchedCustomer();
      const res = await fetch('/api/ai/whatsapp-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incomingText,
          senderLabel:
            senderName.trim() || senderHandle.trim() || senderPhone.trim() || 'Yeni İzleyici',
          customer: {
            existing: Boolean(existingCustomer),
            previousOrderCount: existingCustomer?.previousOrderCount ?? 0,
            fullName: senderName.trim() || existingCustomer?.fullName || senderHandle.trim(),
            phone: senderPhone.trim() || existingCustomer?.phone || '',
            address: senderAddress.trim() || existingCustomer?.address || '',
          },
          products,
          screenshotBase64: uploadedImageDataUrl || undefined,
          screenshotMimeType: uploadedMimeType || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gemini yanıt üretemedi.');
      }

      const matchedOrderItems: Array<{
        productId: number;
        size: string;
        quantity: number;
      }> = [];
      for (const m of data.matchedItems ?? []) {
        const prod = products.find(
          (p) => p.sku.toUpperCase() === String(m.sku).toUpperCase()
        );
        if (prod) {
          matchedOrderItems.push({
            productId: prod.id,
            size: String(m.size || 'M').toUpperCase(),
            quantity: Number(m.quantity) || 1,
          });
        }
      }

      const finalItems = matchedOrderItems.length > 0 ? matchedOrderItems : cartDraft;
      if (matchedOrderItems.length > 0) {
        setCartDraft(matchedOrderItems);
      }

      await onReserveFromWhatsapp({
        customer: {
          fullName:
            senderName.trim() ||
            existingCustomer?.fullName ||
            senderHandle.trim() ||
            'WhatsApp Müşterisi',
          phone: senderPhone.trim() || existingCustomer?.phone || '',
          tiktokHandle: senderHandle.trim() || existingCustomer?.tiktokHandle || '',
          address: senderAddress.trim() || existingCustomer?.address || '',
        },
        items: finalItems,
        incomingText,
        screenshotUrl: selectedScreenshotUrl || liveProduct.imageUrl,
        botReply: data.replyDraft,
        intent: data.intent,
      });

      setBotFeedback(
        `Gemini Analizi Tamamlandı${data.confidenceNote ? ` (${data.confidenceNote})` : ''}.`
      );
    } catch (err: unknown) {
      setBotError(
        err instanceof Error ? err.message : 'Yapay zeka bot analizi sırasında hata oluştu.'
      );
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: TikTok Live Product Showcase + Stock Matrix + Broadcast Notice */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-200">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <Radio className="w-4 h-4 text-emerald-800" />
                <span>TikTok Canlı Yayın Aktif Ürün</span>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="switch-live-product" className="text-xs text-zinc-500">
                  Ürün Değiştir:
                </label>
                <select
                  id="switch-live-product"
                  value={liveProduct.id}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    onSetLiveProduct(id);
                    const nextProd = products.find((p) => p.id === id);
                    if (nextProd) {
                      setSelectedScreenshotUrl(nextProd.imageUrl);
                      setCartDraft([{ productId: nextProd.id, size: 'M', quantity: 1 }]);
                    }
                  }}
                  className="text-xs font-medium bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-zinc-900"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-12 gap-5 items-stretch">
              <div className="sm:col-span-5 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100 min-h-[220px]">
                <img
                  src={liveProduct.imageUrl}
                  alt={liveProduct.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="sm:col-span-7 flex flex-col justify-between">
                <div>
                  <div className="text-xs text-zinc-500">
                    <span className="font-mono font-semibold text-emerald-800">
                      {liveProduct.sku}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span>{liveProduct.category}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{liveTotals.available} adet kalan</span>
                  </div>
                  <h2 className="text-xl font-semibold text-zinc-900 mt-1">
                    {liveProduct.name}
                  </h2>
                  <p className="text-xs text-zinc-600 mt-1">{liveProduct.fabricNote}</p>
                  <div className="mt-2 text-2xl font-bold font-mono text-zinc-900">
                    {formatTry(liveProduct.salePrice)}
                  </div>
                </div>

                {/* Size Stock Table */}
                <div className="mt-4 border border-zinc-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-50 text-zinc-600 border-b border-zinc-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Beden</th>
                        <th className="text-right px-3 py-2 font-medium">Kalan</th>
                        <th className="text-right px-3 py-2 font-medium">Ayrılan</th>
                        <th className="text-right px-3 py-2 font-medium">Satılan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(liveProduct.sizeStock).map(([size, s]) => {
                        const avail = Math.max(0, s.total - s.reserved - s.sold);
                        return (
                          <tr
                            key={size}
                            className="border-b border-zinc-100 last:border-b-0"
                          >
                            <td className="px-3 py-2 font-mono font-semibold text-zinc-900">
                              {size}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-mono font-semibold ${
                                avail === 0 ? 'text-red-700' : 'text-emerald-800'
                              }`}
                            >
                              {avail}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-amber-700">
                              {s.reserved}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-zinc-600">
                              {s.sold}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Automatic Live Broadcast Stock-Out / Reservation Notice */}
            <div className="mt-5 p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-zinc-700 leading-relaxed">
                <span className="font-semibold text-zinc-900">
                  Canlı Yayın Stok Duyurusu:{' '}
                </span>
                {broadcastAnnouncement}
              </div>
              <button
                type="button"
                onClick={() => copyText('broadcast', broadcastAnnouncement)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-100 cursor-pointer whitespace-nowrap"
              >
                {copiedId === 'broadcast' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    Kopyalandı
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Duyuruyu Kopyala
                  </>
                )}
              </button>
            </div>
          </div>

          <LiveTranscriber
            products={products}
            transcripts={liveTranscripts}
            onAppendTranscript={onAppendTranscript}
            onSelectLiveProduct={onSetLiveProduct}
          />
        </div>

        {/* Right Column: WhatsApp Screenshot + Multi-Item Bot Processor & Log */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleDeterministicReserve}
            className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-emerald-800" />
                  WhatsApp Sipariş & Ekran Görüntüsü Botu
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  İlk yazan müşteriye ürünü ayırır, eksik bilgileri ister veya çoklu sepet
                  oluşturur
                </p>
              </div>
            </div>

            {botError && (
              <div
                role="alert"
                className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
              >
                {botError}
              </div>
            )}
            {botFeedback && (
              <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                {botFeedback}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="wa-name"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  Ad Soyad
                </label>
                <input
                  id="wa-name"
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Örn: Elif Korkmaz"
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                />
              </div>
              <div>
                <label
                  htmlFor="wa-phone"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  Telefon (Son 4 Hane Raf İçin)
                </label>
                <input
                  id="wa-phone"
                  type="text"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  placeholder="0532 ... (boşsa @ istenir)"
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50 font-mono"
                />
              </div>
              <div>
                <label
                  htmlFor="wa-handle"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  TikTok Kullanıcı Adı (@)
                </label>
                <input
                  id="wa-handle"
                  type="text"
                  value={senderHandle}
                  onChange={(e) => setSenderHandle(e.target.value)}
                  placeholder="@kullanici_adi"
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                />
              </div>
              <div>
                <label
                  htmlFor="wa-address"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  Açık Adres (Varsa)
                </label>
                <input
                  id="wa-address"
                  type="text"
                  value={senderAddress}
                  onChange={(e) => setSenderAddress(e.target.value)}
                  placeholder="Mahalle, Cadde, İlçe / İl"
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                />
              </div>
            </div>

            {/* Screenshot Attachment Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-zinc-700">
                  Müşteriden Gelen Ekran Görüntüsü
                </span>
                <label className="text-xs font-medium text-emerald-800 hover:underline cursor-pointer flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Görsel Yükle
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleScreenshotUpload(f);
                    }}
                  />
                </label>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {products.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedScreenshotUrl(p.imageUrl);
                      setUploadedImageDataUrl('');
                      setCartDraft([{ productId: p.id, size: 'M', quantity: 1 }]);
                    }}
                    className={`rounded-lg overflow-hidden border p-0.5 cursor-pointer ${
                      selectedScreenshotUrl === p.imageUrl
                        ? 'border-emerald-700 ring-2 ring-emerald-700/20'
                        : 'border-zinc-200'
                    }`}
                  >
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-14 object-cover rounded"
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-item Sepet Builder */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-700">
                  İstenen Ürün & Beden Sepeti
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCartDraft((prev) => [
                      ...prev,
                      { productId: products[0].id, size: 'M', quantity: 1 },
                    ])
                  }
                  className="flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Çoklu Ürün Ekle
                </button>
              </div>

              {cartDraft.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    aria-label={`Sepet ürünü ${idx + 1}`}
                    value={item.productId}
                    onChange={(e) => {
                      const pid = Number(e.target.value);
                      setCartDraft((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, productId: pid } : row))
                      );
                    }}
                    className="flex-1 text-xs border border-zinc-200 rounded-lg px-2.5 py-2 bg-zinc-50"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} · {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Beden ${idx + 1}`}
                    value={item.size}
                    onChange={(e) => {
                      const sz = e.target.value;
                      setCartDraft((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, size: sz } : row))
                      );
                    }}
                    className="w-20 text-xs font-mono border border-zinc-200 rounded-lg px-2 py-2 bg-zinc-50"
                  >
                    {['S', 'M', 'L', 'XL'].map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}
                      </option>
                    ))}
                  </select>
                  {cartDraft.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Satır ${idx + 1} kaldır`}
                      onClick={() =>
                        setCartDraft((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-2 text-zinc-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div>
              <label
                htmlFor="wa-text"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Müşterinin WhatsApp Mesajı
              </label>
              <textarea
                id="wa-text"
                rows={2}
                value={incomingText}
                onChange={(e) => setIncomingText(e.target.value)}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="submit"
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0f5132] text-white text-xs font-medium hover:bg-[#0c4128] cursor-pointer whitespace-nowrap"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Stok Kontrolü & Ayır
              </button>
              <button
                type="button"
                disabled={aiBusy}
                onClick={handleGeminiAnalyze}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-300 bg-white text-zinc-900 text-xs font-medium hover:bg-zinc-50 cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-800" />
                {aiBusy ? 'Analiz Ediliyor...' : 'Gemini AI ile Yanıtla'}
              </button>
            </div>
          </form>

          {/* WhatsApp Bot Log */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-900 pb-3 border-b border-zinc-200">
              Son WhatsApp Mesajları ve Otomatik Bot Yanıtları
            </h3>
            <div className="mt-3 space-y-4 max-h-[380px] overflow-y-auto">
              {whatsappMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="pb-4 border-b border-zinc-100 last:border-b-0 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-semibold text-zinc-900">{msg.senderLabel}</span>
                    <span>
                      {msg.intent === 'out_of_stock'
                        ? 'Stok Yok / Bekleme'
                        : msg.intent === 'missing_info'
                          ? 'Bilgi Eksik'
                          : msg.intent === 'multi_item'
                            ? 'Çoklu Sepet'
                            : 'Ayrıldı'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    {msg.screenshotUrl && (
                      <img
                        src={msg.screenshotUrl}
                        alt="Ekran görüntüsü"
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-lg object-cover border border-zinc-200 shrink-0"
                      />
                    )}
                    <p className="text-xs text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 flex-1">
                      {msg.incomingText}
                    </p>
                  </div>
                  <div className="text-xs text-emerald-950 bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5 flex items-start justify-between gap-2">
                    <p className="leading-relaxed">{msg.botReply}</p>
                    <button
                      type="button"
                      aria-label={`Yanıtı kopyala ${msg.id}`}
                      onClick={() => copyText(msg.id, msg.botReply)}
                      className="shrink-0 p-1 text-emerald-800 hover:text-emerald-950 cursor-pointer"
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
