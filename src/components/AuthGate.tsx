import { ArrowRight, Database, ShieldCheck, Sparkles } from 'lucide-react';

interface AuthGateProps {
  busy: boolean;
  errorMessage: string | null;
  onGoogleSignIn: () => void;
  onEnterPreview: () => void;
}

export function AuthGate({
  busy,
  errorMessage,
  onGoogleSignIn,
  onEnterPreview,
}: AuthGateProps) {
  return (
    <div className="min-h-screen bg-[#f7f6f3] text-zinc-900 flex flex-col justify-center items-center px-6 py-12">
      <div className="w-full max-w-2xl bg-white border border-zinc-200 rounded-2xl p-8 md:p-10">
        <div className="text-xs font-medium text-emerald-800 tracking-wide">
          Kremelim Atölye · Canlı Yayın & Sipariş Sistemi
        </div>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900 text-balance">
          TikTok canlı yayın stoklarını, WhatsApp botunu ve kargo etiketlerini tek panelde yönetin
        </h1>
        <p className="mt-4 text-sm md:text-base text-zinc-600 leading-relaxed">
          Toptan beden stokları, ekran görüntüsünden ürün eşleştirme, 0–9 telefon son 4 hane raf
          gruplaması, IBAN dekont doğrulama, 3D ürün inceleme ve canlı yayın ses deşifresi tek
          çalışma alanında birleşir.
        </p>

        {errorMessage && (
          <div
            role="alert"
            className="mt-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            disabled={busy}
            onClick={onGoogleSignIn}
            className="flex items-center justify-between px-5 py-4 rounded-xl bg-[#0f5132] text-white font-medium text-sm hover:bg-[#0c4128] transition-colors disabled:opacity-60 cursor-pointer"
          >
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <Database className="w-4 h-4 shrink-0" />
              Google ile Giriş Yap (Cloud SQL)
            </span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onEnterPreview}
            className="flex items-center justify-between px-5 py-4 rounded-xl bg-zinc-100 text-zinc-900 font-medium text-sm border border-zinc-200 hover:bg-zinc-200/70 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <Sparkles className="w-4 h-4 shrink-0 text-emerald-800" />
              Önizleme Çalışma Alanını Aç
            </span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>

        <div className="mt-6 pt-5 border-t border-zinc-200 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            PostgreSQL (Cloud SQL) + Firebase Auth korumalı veri akışı
          </span>
          <span aria-hidden="true">·</span>
          <span>Önizleme modunda örnek toptan stok ve siparişlerle anında test edebilirsiniz</span>
        </div>
      </div>
    </div>
  );
}
