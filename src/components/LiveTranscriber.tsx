import { useRef, useState } from 'react';
import { Mic, Square, Upload, Radio } from 'lucide-react';
import { matchTranscriptToProducts } from '../core/boutiqueLogic.ts';
import type { LiveTranscriptDTO, ProductDTO } from '../core/types.ts';

interface LiveTranscriberProps {
  products: ProductDTO[];
  transcripts: LiveTranscriptDTO[];
  onAppendTranscript: (speaker: string, text: string, detectedSku?: string) => Promise<void>;
  onSelectLiveProduct: (productId: number) => Promise<void>;
}

function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function LiveTranscriber({
  products,
  transcripts,
  onAppendTranscript,
  onSelectLiveProduct,
}: LiveTranscriberProps) {
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [manualFeedText, setManualFeedText] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const stopLiveMic = () => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setListening(false);
    setInterimText('');
  };

  const startLiveMic = async () => {
    setStatusError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/transcribe`);
      wsRef.current = ws;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const b64 = float32ToPcm16Base64(e.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: b64 }));
        }
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data) as {
          interimTranscript?: string;
          transcript?: string;
          error?: string;
        };
        if (msg.error) {
          setStatusError(msg.error);
          stopLiveMic();
          return;
        }
        if (msg.interimTranscript) {
          setInterimText(msg.interimTranscript);
        }
        if (msg.transcript && msg.transcript.trim()) {
          setInterimText('');
          const match = matchTranscriptToProducts(msg.transcript, products);
          await onAppendTranscript(
            'Yayıncı (Canlı Mikrofon)',
            msg.transcript.trim(),
            match?.sku ?? ''
          );
        }
      };

      ws.onerror = () => {
        setStatusError('Canlı ses bağlantısı kurulamadı.');
        stopLiveMic();
      };

      setListening(true);
    } catch (err: unknown) {
      setStatusError(
        err instanceof Error
          ? err.message
          : 'Mikrofon erişimi başlatılamadı. Ses dosyası yükleyebilirsiniz.'
      );
      stopLiveMic();
    }
  };

  const handleAudioFileUpload = async (file: File) => {
    setUploadingAudio(true);
    setStatusError(null);
    try {
      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/ai/transcribe-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Data,
          mimeType: file.type || 'audio/mp3',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ses dosyası çözümlenemedi.');
      if (data.text) {
        const match = matchTranscriptToProducts(data.text, products);
        await onAppendTranscript('Ses Kaydı', data.text, match?.sku ?? '');
      }
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : 'Ses çözümleme hatası.');
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleManualTranscriptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFeedText.trim()) return;
    const match = matchTranscriptToProducts(manualFeedText, products);
    await onAppendTranscript('Yayın Akışı', manualFeedText.trim(), match?.sku ?? '');
    setManualFeedText('');
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-200">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">
            Canlı Yayın Gerçek Zamanlı Ses Deşifresi
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Yayıncının mikrofonunu veya ses kaydını anlık yazıya döker, bahsedilen ürün kodunu ve
            bedenleri otomatik yakalar
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!listening ? (
            <button
              type="button"
              onClick={startLiveMic}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0f5132] text-white text-xs font-medium hover:bg-[#0c4128] cursor-pointer whitespace-nowrap"
            >
              <Mic className="w-3.5 h-3.5" />
              Canlı Mikrofonu Başlat
            </button>
          ) : (
            <button
              type="button"
              onClick={stopLiveMic}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 cursor-pointer whitespace-nowrap"
            >
              <Square className="w-3.5 h-3.5" />
              Dinlemeyi Durdur
            </button>
          )}

          <label className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 text-xs font-medium hover:bg-zinc-100 cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            {uploadingAudio ? 'Çözümleniyor...' : 'Ses Dosyası Yükle'}
            <input
              type="file"
              accept="audio/*,video/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAudioFileUpload(f);
              }}
            />
          </label>
        </div>
      </div>

      {statusError && (
        <div
          role="alert"
          className="mt-3 px-3.5 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900"
        >
          {statusError}
        </div>
      )}

      {listening && (
        <div className="mt-3 px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
          <Radio className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>
            Canlı ses akışı aktif:{' '}
            <strong>{interimText || 'Konuşma bekleniyor...'}</strong>
          </span>
        </div>
      )}

      <form onSubmit={handleManualTranscriptSubmit} className="mt-4 flex gap-2">
        <input
          type="text"
          value={manualFeedText}
          onChange={(e) => setManualFeedText(e.target.value)}
          placeholder="Örn: Kızlar KBN-204 Camel Kemerli Kaşe Kaban M ve L bedenler yayında!"
          aria-label="Canlı yayın konuşma metni ekle"
          className="flex-1 text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50 focus:outline-none focus:border-emerald-700"
        />
        <button
          type="submit"
          className="px-3.5 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
        >
          Deşifreye İşle
        </button>
      </form>

      <div className="mt-4 space-y-2.5 max-h-56 overflow-y-auto">
        {transcripts.length === 0 ? (
          <p className="text-xs text-zinc-500 py-4 text-center">
            Henüz ses deşifre kaydı yok. Canlı mikrofonu başlatın veya ses kaydı yükleyin.
          </p>
        ) : (
          transcripts.map((t) => {
            const matchedProduct = products.find((p) => p.sku === t.detectedSku);
            return (
              <div
                key={t.id}
                className="flex items-start justify-between gap-3 py-2.5 border-b border-zinc-100 last:border-b-0"
              >
                <div className="text-sm text-zinc-800">
                  <div className="text-xs text-zinc-500">
                    <span>{t.speaker}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="font-mono">
                      {new Date(t.createdAt).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {t.detectedSku && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono text-emerald-800 font-semibold">
                          Algılanan Kod: {t.detectedSku}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 leading-relaxed">{t.text}</p>
                </div>
                {matchedProduct && !matchedProduct.isLiveNow && (
                  <button
                    type="button"
                    onClick={() => onSelectLiveProduct(matchedProduct.id)}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-medium hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
                  >
                    Yayına Al
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
