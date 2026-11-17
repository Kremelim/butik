import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { ProductDTO } from '../core/types.ts';

let _aiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY ortam değişkeni yapılandırılmamış.');
  }
  if (!_aiClient) {
    _aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return _aiClient;
}

export interface BotAnalysisInput {
  incomingText: string;
  senderLabel: string;
  customerExists: boolean;
  previousOrderCount: number;
  missingFields: string[];
  products: ProductDTO[];
  screenshotBase64?: string;
  screenshotMimeType?: string;
}

export interface BotAnalysisOutput {
  intent: 'reserve' | 'out_of_stock' | 'question' | 'missing_info' | 'multi_item';
  matchedItems: Array<{
    sku: string;
    size: string;
    quantity: number;
  }>;
  replyDraft: string;
  confidenceNote: string;
}

export async function analyzeWhatsappWithGemini(
  input: BotAnalysisInput
): Promise<BotAnalysisOutput> {
  const ai = getGeminiClient();

  const catalogSummary = input.products.map((p) => {
    const sizes = Object.entries(p.sizeStock)
      .map(([sz, s]) => `${sz}: kalan ${Math.max(0, s.total - s.reserved - s.sold)} (ayrılan ${s.reserved})`)
      .join(', ');
    return `SKU: ${p.sku} | Ad: ${p.name} | Fiyat: ${p.salePrice} TL | Yayında mı: ${
      p.isLiveNow ? 'EVET' : 'Hayır'
    } | Bilgi: ${p.fabricNote} | Beden Stokları: [${sizes}]`;
  });

  const promptText = [
    'Sen bir Türk TikTok canlı yayın kadın giyim butiğinin akıllı WhatsApp sipariş ve müşteri temsilcisi botusun.',
    'Görevlerin:',
    '1. Müşteri mesajını ve varsa gönderdiği ekran görüntüsünü katalogla eşleştir. Birden fazla ürün istiyorsa hepsini matchedItems dizisine ekle.',
    '2. Beden belirtilmemişse mesajdan çıkar veya yayındaki ürünün mevcut bedenini öner.',
    '3. Stok varsa: ürünü ilk yazan önceliğiyle müşteriye ayırdığımızı söyle. Yeni müşteriyse veya telefon/adres eksikse missingFields listesindeki eksik bilgileri nazikçe iste, ama ürünü ayırdığımızı mutlaka belirt.',
    '4. Stok 0 ise: stoğun tükendiğini söyle; eğer ayrılan (ödenmemiş) adet > 0 ise "Ayıran müşterilerden ödemeyen olursa iptal edip size ayırabiliriz" bilgisini ver.',
    '5. Kargo veya ürün sorusuysa: standart kargo süresi "aksi belirtilmedikçe en geç 2-3 iş günü"dür, kumaş/kalıp bilgisini yanıtla.',
    '',
    `Gönderen: ${input.senderLabel}`,
    `Kayıtlı Müşteri mi: ${input.customerExists ? `Evet (Önceki işlem: ${input.previousOrderCount})` : 'Hayır (Yeni Müşteri)'}`,
    `Eksik Bilgiler: ${input.missingFields.length ? input.missingFields.join(', ') : 'Yok'}`,
    `Müşteri Mesajı: "${input.incomingText}"`,
    '',
    'Güncel Katalog & Beden Stokları:',
    ...catalogSummary,
  ].join('\n');

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (input.screenshotBase64 && input.screenshotMimeType) {
    const cleanBase64 = input.screenshotBase64.replace(/^data:[^;]+;base64,/, '');
    parts.push({
      inlineData: {
        mimeType: input.screenshotMimeType,
        data: cleanBase64,
      },
    });
  }
  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intent: {
            type: Type.STRING,
            description: 'One of: reserve, out_of_stock, question, missing_info, multi_item',
          },
          matchedItems: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sku: { type: Type.STRING },
                size: { type: Type.STRING },
                quantity: { type: Type.INTEGER },
              },
            },
          },
          replyDraft: {
            type: Type.STRING,
            description: 'Doğal, kibar ve net Türkçe WhatsApp yanıtı.',
          },
          confidenceNote: {
            type: Type.STRING,
            description: 'Kısa eşleştirme açıklaması.',
          },
        },
        required: ['intent', 'matchedItems', 'replyDraft', 'confidenceNote'],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as Partial<BotAnalysisOutput>;
  const validIntents = new Set(['reserve', 'out_of_stock', 'question', 'missing_info', 'multi_item']);
  return {
    intent: validIntents.has(parsed.intent ?? '')
      ? (parsed.intent as BotAnalysisOutput['intent'])
      : 'question',
    matchedItems: Array.isArray(parsed.matchedItems) ? parsed.matchedItems : [],
    replyDraft: parsed.replyDraft || 'Mesajınız alındı, stok kontrolü yapılıyor.',
    confidenceNote: parsed.confidenceNote || '',
  };
}

export interface ParsedReceiptOutput {
  referenceCode: string;
  senderName: string;
  transferDate: string;
  transferTime: string;
  amount: number;
}

export async function parseReceiptImageWithGemini(
  imageBase64: string,
  mimeType: string
): Promise<ParsedReceiptOutput> {
  const ai = getGeminiClient();
  const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        {
          text: 'Bu banka dekontu görselinden referans/işlem kodunu, gönderen ad soyadını, transfer tarihini (YYYY-MM-DD), transfer saatini (HH:MM) ve tutarı (tam sayı TL) çıkar.',
        },
      ],
    },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          referenceCode: { type: Type.STRING },
          senderName: { type: Type.STRING },
          transferDate: { type: Type.STRING },
          transferTime: { type: Type.STRING },
          amount: { type: Type.INTEGER },
        },
        required: ['referenceCode', 'senderName', 'transferDate', 'transferTime', 'amount'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<ParsedReceiptOutput>;
  return {
    referenceCode: parsed.referenceCode || `DKT-${Date.now().toString().slice(-5)}`,
    senderName: parsed.senderName || 'Bilinmeyen Gönderen',
    transferDate: parsed.transferDate || new Date().toISOString().slice(0, 10),
    transferTime: parsed.transferTime || new Date().toTimeString().slice(0, 5),
    amount: Number(parsed.amount) || 0,
  };
}

export async function transcribeAudioClipWithGemini(
  audioBase64: string,
  mimeType: string
): Promise<string> {
  const ai = getGeminiClient();
  const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        {
          text: 'Bu Türkçe/İngilizce canlı yayın ses kaydını noktalama işaretleriyle birebir yazıya dök.',
        },
      ],
    },
  });

  return (response.text ?? '').trim();
}
