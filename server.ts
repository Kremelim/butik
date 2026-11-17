import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { Modality, type LiveServerMessage } from '@google/genai';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import { getOrCreateUser } from './src/db/users.ts';
import {
  createProductInDb,
  getWorkspaceSnapshot,
  reserveItemsForCustomerInDb,
  saveLiveTranscriptInDb,
  setLiveProductInDb,
  updateOrderStatusInDb,
  updateProductStockInDb,
  upsertCustomerInDb,
  verifyAndSaveReceiptInDb,
} from './src/db/repository.ts';
import {
  analyzeWhatsappWithGemini,
  getGeminiClient,
  parseReceiptImageWithGemini,
  transcribeAudioClipWithGemini,
} from './src/lib/gemini.ts';
import { getMissingCustomerFields } from './src/core/boutiqueLogic.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/workspace', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = await getOrCreateUser(
        req.user!.uid,
        req.user!.email || 'yonetici@butik.local',
        req.user!.name
      );
      const snapshot = await getWorkspaceSnapshot(dbUser.id);
      res.json(snapshot);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Veri yüklenemedi.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/workspace/products', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = await getOrCreateUser(
        req.user!.uid,
        req.user!.email || 'yonetici@butik.local',
        req.user!.name
      );
      const created = await createProductInDb(dbUser.id, req.body);
      res.status(201).json(created);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Ürün eklenemedi.';
      res.status(500).json({ error: message });
    }
  });

  app.post(
    '/api/workspace/products/:id/live',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const dbUser = await getOrCreateUser(
          req.user!.uid,
          req.user!.email || 'yonetici@butik.local',
          req.user!.name
        );
        await setLiveProductInDb(dbUser.id, Number(req.params.id));
        res.json({ ok: true });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Canlı ürün seçilemedi.';
        res.status(500).json({ error: message });
      }
    }
  );

  app.patch(
    '/api/workspace/products/:id/stock',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const dbUser = await getOrCreateUser(
          req.user!.uid,
          req.user!.email || 'yonetici@butik.local',
          req.user!.name
        );
        await updateProductStockInDb(
          dbUser.id,
          Number(req.params.id),
          req.body.sizeStock
        );
        res.json({ ok: true });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Stok güncellenemedi.';
        res.status(500).json({ error: message });
      }
    }
  );

  app.post('/api/workspace/customers', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = await getOrCreateUser(
        req.user!.uid,
        req.user!.email || 'yonetici@butik.local',
        req.user!.name
      );
      const customer = await upsertCustomerInDb(dbUser.id, req.body);
      res.json(customer);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Müşteri kaydedilemedi.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/workspace/reserve', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = await getOrCreateUser(
        req.user!.uid,
        req.user!.email || 'yonetici@butik.local',
        req.user!.name
      );
      const result = await reserveItemsForCustomerInDb(dbUser.id, req.body);
      const snapshot = await getWorkspaceSnapshot(dbUser.id);
      res.json({ ...result, snapshot });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Ayırma işlemi başarısız.';
      res.status(500).json({ error: message });
    }
  });

  app.patch(
    '/api/workspace/orders/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const dbUser = await getOrCreateUser(
          req.user!.uid,
          req.user!.email || 'yonetici@butik.local',
          req.user!.name
        );
        await updateOrderStatusInDb(dbUser.id, Number(req.params.id), req.body);
        res.json({ ok: true });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Sipariş güncellenemedi.';
        res.status(500).json({ error: message });
      }
    }
  );

  app.post(
    '/api/workspace/receipts/verify',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const dbUser = await getOrCreateUser(
          req.user!.uid,
          req.user!.email || 'yonetici@butik.local',
          req.user!.name
        );
        const result = await verifyAndSaveReceiptInDb(dbUser.id, req.body);
        const snapshot = await getWorkspaceSnapshot(dbUser.id);
        res.json({ ...result, snapshot });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Dekont doğrulanamadı.';
        res.status(500).json({ error: message });
      }
    }
  );

  app.post(
    '/api/workspace/transcripts',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const dbUser = await getOrCreateUser(
          req.user!.uid,
          req.user!.email || 'yonetici@butik.local',
          req.user!.name
        );
        const saved = await saveLiveTranscriptInDb(dbUser.id, req.body);
        res.status(201).json(saved);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Transkript kaydedilemedi.';
        res.status(500).json({ error: message });
      }
    }
  );

  app.post('/api/ai/whatsapp-bot', async (req, res) => {
    try {
      const {
        incomingText,
        senderLabel,
        customer,
        products: clientProducts,
        screenshotBase64,
        screenshotMimeType,
      } = req.body;

      const missingFields = getMissingCustomerFields({
        fullName: customer?.fullName || senderLabel || '',
        phone: customer?.phone || '',
        address: customer?.address || '',
      });

      const analysis = await analyzeWhatsappWithGemini({
        incomingText,
        senderLabel,
        customerExists: Boolean(customer?.existing),
        previousOrderCount: Number(customer?.previousOrderCount ?? 0),
        missingFields,
        products: clientProducts ?? [],
        screenshotBase64,
        screenshotMimeType,
      });

      res.json(analysis);
    } catch (error: unknown) {
      console.error('Gemini WhatsApp bot error:', error);
      const message =
        error instanceof Error ? error.message : 'WhatsApp yapay zeka yanıtı üretilemedi.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/ai/parse-receipt', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ error: 'Dekont görseli gereklidir.' });
      }
      const parsed = await parseReceiptImageWithGemini(imageBase64, mimeType);
      res.json(parsed);
    } catch (error: unknown) {
      console.error('Gemini receipt parse error:', error);
      const message =
        error instanceof Error ? error.message : 'Dekont görseli okunamadı.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/ai/transcribe-audio', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body;
      if (!audioBase64 || !mimeType) {
        return res.status(400).json({ error: 'Ses verisi gereklidir.' });
      }
      const text = await transcribeAudioClipWithGemini(audioBase64, mimeType);
      res.json({ text });
    } catch (error: unknown) {
      console.error('Gemini audio transcribe error:', error);
      const message =
        error instanceof Error ? error.message : 'Ses dosyası çözümlenemedi.';
      res.status(502).json({ error: message });
    }
  });

  const server = http.createServer(app);

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url || '';
    if (reqUrl.startsWith('/ws/transcribe')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<ReturnType<typeof getGeminiClient>['live']['connect']>> | null =
      null;

    try {
      const ai = getGeminiClient();
      liveSession = await ai.live.connect({
        model: 'gemini-3.5-transcribe-live',
        config: {
          responseModalities: [Modality.TEXT],
          inputAudioTranscription: {
            languageCodes: ['tr', 'en'],
          },
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (content?.interimInputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  interimTranscript: content.interimInputTranscription.text,
                })
              );
            }
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  transcript: content.inputTranscription.text,
                })
              );
            }
          },
          onerror: (err: unknown) => {
            console.error('Gemini Live transcription error:', err);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({ error: 'Canlı transkripsiyon oturum hatası.' })
              );
            }
          },
        },
      });
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ ready: true }));
      }
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Canlı ses transkripsiyonu başlatılamadı.';
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: msg }));
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession) return;
      try {
        const parsed = JSON.parse(raw.toString()) as { audio?: string };
        if (parsed.audio) {
          liveSession.sendRealtimeInput({
            audio: {
              data: parsed.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        }
      } catch (err) {
        console.error('Invalid WS audio payload:', err);
      }
    });

    clientWs.on('close', () => {
      try {
        liveSession?.close();
      } catch {
        // ignore close errors
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
