import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import {
  buildIbanPaymentMessage,
  confirmPaidSizeStock,
  extractPhoneAndRackGroup,
  getMissingCustomerFields,
  releaseSizeStock,
  reserveSizeStock,
  verifyReceiptDuplicateAndAmount,
} from '../core/boutiqueLogic.ts';
import { createInitialSeedSnapshot } from '../core/seedData.ts';
import type {
  CustomerDTO,
  ModelPreset,
  OrderDTO,
  OrderStatus,
  ProductDTO,
  SizeStockMap,
  WhatsappMessageDTO,
  WorkspaceSnapshotDTO,
} from '../core/types.ts';

const PREVIEW_STORAGE_KEY = 'kremelim_butik_preview_v1';

export type WorkspaceMode = 'loading' | 'gate' | 'preview' | 'cloudsql';

function loadPreviewSnapshot(): WorkspaceSnapshotDTO {
  try {
    const raw = localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceSnapshotDTO;
      if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.orders)) {
        return parsed;
      }
    }
  } catch {
    // ignore corrupted localStorage and re-seed
  }
  const seed = createInitialSeedSnapshot();
  localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

export function useBoutiqueWorkspace() {
  const [mode, setMode] = useState<WorkspaceMode>('loading');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshotDTO>(() =>
    createInitialSeedSnapshot()
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const persistPreview = useCallback((next: WorkspaceSnapshotDTO) => {
    setSnapshot(next);
    try {
      localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const fetchCloudWorkspace = useCallback(async (token: string) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/workspace', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Veritabanı bağlantısı kurulamadı.');
      }
      const data = (await res.json()) as WorkspaceSnapshotDTO;
      setSnapshot(data);
      setMode('cloudsql');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Veri yüklenemedi.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart') === '1';

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const token = await user.getIdToken();
          setIdToken(token);
          await fetchCloudWorkspace(token);
        } catch (err: unknown) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Oturum doğrulanamadı.'
          );
          setMode('gate');
        }
      } else {
        setIdToken(null);
        if (autostart || localStorage.getItem('kremelim_preview_active') === '1') {
          setSnapshot(loadPreviewSnapshot());
          setMode('preview');
        } else {
          setMode('gate');
        }
      }
    });
    return () => unsub();
  }, [fetchCloudWorkspace]);

  const enterPreviewMode = useCallback(() => {
    localStorage.setItem('kremelim_preview_active', '1');
    setSnapshot(loadPreviewSnapshot());
    setMode('preview');
    setErrorMessage(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      setIdToken(token);
      localStorage.removeItem('kremelim_preview_active');
      await fetchCloudWorkspace(token);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Google ile giriş yapılamadı.'
      );
    } finally {
      setBusy(false);
    }
  }, [fetchCloudWorkspace]);

  const logout = useCallback(async () => {
    localStorage.removeItem('kremelim_preview_active');
    if (firebaseUser) {
      await signOut(auth);
    }
    setMode('gate');
  }, [firebaseUser]);

  const setLiveProduct = useCallback(
    async (productId: number) => {
      if (mode === 'cloudsql' && idToken) {
        const res = await fetch(`/api/workspace/products/${productId}/live`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) throw new Error('Canlı ürün güncellenemedi.');
        await fetchCloudWorkspace(idToken);
        return;
      }
      persistPreview({
        ...snapshot,
        products: snapshot.products.map((p) => ({
          ...p,
          isLiveNow: p.id === productId,
        })),
      });
    },
    [mode, idToken, snapshot, persistPreview, fetchCloudWorkspace]
  );

  const addProduct = useCallback(
    async (input: {
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
    }) => {
      if (mode === 'cloudsql' && idToken) {
        const res = await fetch('/api/workspace/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error('Ürün eklenemedi.');
        await fetchCloudWorkspace(idToken);
        return;
      }
      const nextId = Math.max(0, ...snapshot.products.map((p) => p.id)) + 1;
      const newProduct: ProductDTO = {
        id: nextId,
        ...input,
        sku: input.sku.trim().toUpperCase(),
        isLiveNow: false,
      };
      persistPreview({
        ...snapshot,
        products: [...snapshot.products, newProduct],
      });
    },
    [mode, idToken, snapshot, persistPreview, fetchCloudWorkspace]
  );

  const adjustProductStock = useCallback(
    async (productId: number, size: string, deltaTotal: number) => {
      const target = snapshot.products.find((p) => p.id === productId);
      if (!target) return;
      const existing = target.sizeStock[size] ?? { total: 0, reserved: 0, sold: 0 };
      const minTotal = existing.reserved + existing.sold;
      const nextTotal = Math.max(minTotal, existing.total + deltaTotal);
      const nextSizeStock: SizeStockMap = {
        ...target.sizeStock,
        [size]: { ...existing, total: nextTotal },
      };

      if (mode === 'cloudsql' && idToken) {
        const res = await fetch(`/api/workspace/products/${productId}/stock`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ sizeStock: nextSizeStock }),
        });
        if (!res.ok) throw new Error('Stok güncellenemedi.');
        await fetchCloudWorkspace(idToken);
        return;
      }

      persistPreview({
        ...snapshot,
        products: snapshot.products.map((p) =>
          p.id === productId ? { ...p, sizeStock: nextSizeStock } : p
        ),
      });
    },
    [mode, idToken, snapshot, persistPreview, fetchCloudWorkspace]
  );

  const saveCustomer = useCallback(
    async (input: {
      id?: number;
      fullName: string;
      phone: string;
      tiktokHandle: string;
      address: string;
    }) => {
      if (mode === 'cloudsql' && idToken) {
        const res = await fetch('/api/workspace/customers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error('Müşteri kaydedilemedi.');
        await fetchCloudWorkspace(idToken);
        return;
      }

      const phoneInfo = extractPhoneAndRackGroup(input.phone);
      if (input.id) {
        persistPreview({
          ...snapshot,
          customers: snapshot.customers.map((c) =>
            c.id === input.id
              ? {
                  ...c,
                  fullName: input.fullName.trim(),
                  phone: phoneInfo.normalizedPhone,
                  phoneLast4: phoneInfo.last4,
                  rackGroup: phoneInfo.rackGroup,
                  tiktokHandle: input.tiktokHandle.trim(),
                  address: input.address.trim(),
                }
              : c
          ),
        });
      } else {
        const nextId = Math.max(0, ...snapshot.customers.map((c) => c.id)) + 1;
        const created: CustomerDTO = {
          id: nextId,
          fullName: input.fullName.trim(),
          phone: phoneInfo.normalizedPhone,
          phoneLast4: phoneInfo.last4,
          rackGroup: phoneInfo.rackGroup,
          tiktokHandle: input.tiktokHandle.trim(),
          address: input.address.trim(),
          previousOrderCount: 0,
        };
        persistPreview({
          ...snapshot,
          customers: [created, ...snapshot.customers],
        });
      }
    },
    [mode, idToken, snapshot, persistPreview, fetchCloudWorkspace]
  );

  const processWhatsappReservation = useCallback(
    async (params: {
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
    }) => {
      if (mode === 'cloudsql' && idToken) {
        const res = await fetch('/api/workspace/reserve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            customer: params.customer,
            items: params.items,
            whatsappLog: {
              senderLabel:
                params.customer.fullName ||
                params.customer.tiktokHandle ||
                params.customer.phone,
              incomingText: params.incomingText,
              screenshotUrl: params.screenshotUrl,
              botReply: params.botReply,
              intent: params.intent,
            },
          }),
        });
        if (!res.ok) throw new Error('Rezervasyon kaydedilemedi.');
        const data = await res.json();
        if (data.snapshot) setSnapshot(data.snapshot);
        return data;
      }

      const phoneInfo = extractPhoneAndRackGroup(params.customer.phone);
      const handleClean = params.customer.tiktokHandle.trim().toLowerCase();
      let customers = [...snapshot.customers];
      let matchedCustomer = customers.find((c) => {
        if (phoneInfo.last4 && c.phoneLast4 === phoneInfo.last4) return true;
        if (handleClean && c.tiktokHandle.toLowerCase() === handleClean) return true;
        return false;
      });

      if (!matchedCustomer) {
        const nextCid = Math.max(0, ...customers.map((c) => c.id)) + 1;
        matchedCustomer = {
          id: nextCid,
          fullName:
            params.customer.fullName.trim() ||
            params.customer.tiktokHandle.trim() ||
            'Yeni Müşteri',
          phone: phoneInfo.normalizedPhone,
          phoneLast4: phoneInfo.last4,
          rackGroup: phoneInfo.rackGroup,
          tiktokHandle: params.customer.tiktokHandle.trim(),
          address: params.customer.address.trim(),
          previousOrderCount: 0,
        };
        customers = [matchedCustomer, ...customers];
      } else {
        matchedCustomer = {
          ...matchedCustomer,
          fullName:
            params.customer.fullName && !params.customer.fullName.startsWith('@')
              ? params.customer.fullName.trim()
              : matchedCustomer.fullName,
          phone: phoneInfo.normalizedPhone || matchedCustomer.phone,
          phoneLast4: phoneInfo.last4 || matchedCustomer.phoneLast4,
          rackGroup:
            phoneInfo.rackGroup !== null
              ? phoneInfo.rackGroup
              : matchedCustomer.rackGroup,
          address: params.customer.address.trim() || matchedCustomer.address,
        };
        customers = customers.map((c) =>
          c.id === matchedCustomer!.id ? matchedCustomer! : c
        );
      }

      let products = [...snapshot.products];
      const reservedSummary: Array<{
        productId: number;
        productName: string;
        size: string;
        quantity: number;
        unitPrice: number;
      }> = [];
      const failedItems: Array<{
        productName: string;
        size: string;
        hasUnpaid: boolean;
      }> = [];

      for (const reqItem of params.items) {
        const prodIdx = products.findIndex((p) => p.id === reqItem.productId);
        if (prodIdx === -1) continue;
        const prod = products[prodIdx];
        const res = reserveSizeStock(
          prod.sizeStock,
          reqItem.size,
          reqItem.quantity || 1
        );
        if (!res.ok) {
          failedItems.push({
            productName: prod.name,
            size: reqItem.size,
            hasUnpaid: res.hasUnpaidReserved,
          });
          continue;
        }
        products[prodIdx] = { ...prod, sizeStock: res.sizeStock };
        reservedSummary.push({
          productId: prod.id,
          productName: prod.name,
          size: reqItem.size.toUpperCase(),
          quantity: reqItem.quantity || 1,
          unitPrice: prod.salePrice,
        });
      }

      let orders = [...snapshot.orders];
      if (reservedSummary.length > 0) {
        const existingOrderIdx = orders.findIndex(
          (o) =>
            o.customerId === matchedCustomer!.id &&
            (o.status === 'reserved' ||
              o.status === 'awaiting_payment' ||
              o.status === 'held')
        );
        const addedTotal = reservedSummary.reduce(
          (acc, item) => acc + item.unitPrice * item.quantity,
          0
        );
        const maxItemId = Math.max(
          0,
          ...orders.flatMap((o) => o.items.map((i) => i.id))
        );
        const nowIso = new Date().toISOString();

        if (existingOrderIdx === -1) {
          const nextOrderId = Math.max(0, ...orders.map((o) => o.id)) + 1;
          const missing = getMissingCustomerFields(matchedCustomer);
          const newOrder: OrderDTO = {
            id: nextOrderId,
            customerId: matchedCustomer.id,
            orderCode: `KRM-${1040 + nextOrderId}`,
            status: 'reserved',
            holdReason:
              missing.length > 0 ? `Eksik bilgi: ${missing.join(', ')}` : '',
            totalAmount: addedTotal,
            shippingSlaDays: 3,
            labelPrinted: false,
            ibanMessageSent: false,
            createdAt: nowIso,
            updatedAt: nowIso,
            items: reservedSummary.map((item, idx) => ({
              id: maxItemId + idx + 1,
              orderId: nextOrderId,
              productId: item.productId,
              productName: item.productName,
              size: item.size,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              tagPrinted: false,
            })),
          };
          orders = [newOrder, ...orders];
        } else {
          const targetOrder = orders[existingOrderIdx];
          orders[existingOrderIdx] = {
            ...targetOrder,
            totalAmount: targetOrder.totalAmount + addedTotal,
            updatedAt: nowIso,
            items: [
              ...targetOrder.items,
              ...reservedSummary.map((item, idx) => ({
                id: maxItemId + idx + 1,
                orderId: targetOrder.id,
                productId: item.productId,
                productName: item.productName,
                size: item.size,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                tagPrinted: false,
              })),
            ],
          };
        }
      }

      const nextMsgId =
        Math.max(0, ...snapshot.whatsappMessages.map((m) => m.id)) + 1;
      const newMessage: WhatsappMessageDTO = {
        id: nextMsgId,
        customerId: matchedCustomer.id,
        senderLabel: `${matchedCustomer.fullName}${
          matchedCustomer.phoneLast4 ? ` (...${matchedCustomer.phoneLast4})` : ''
        }`,
        incomingText: params.incomingText,
        screenshotUrl: params.screenshotUrl,
        detectedProductId: reservedSummary[0]?.productId ?? params.items[0]?.productId ?? null,
        detectedSize: reservedSummary[0]?.size ?? params.items[0]?.size ?? '',
        botReply: params.botReply,
        intent: params.intent,
        createdAt: new Date().toISOString(),
      };

      persistPreview({
        ...snapshot,
        products,
        customers,
        orders,
        whatsappMessages: [newMessage, ...snapshot.whatsappMessages],
      });

      return { reservedSummary, failedItems };
    },
    [mode, idToken, snapshot, persistPreview]
  );

  const updateOrderStatus = useCallback(
    async (
      orderId: number,
      updates: {
        status?: OrderStatus;
        holdReason?: string;
        labelPrinted?: boolean;
        ibanMessageSent?: boolean;
      }
    ) => {
      if (mode === 'cloudsql' && idToken) {
        const res = await fetch(`/api/workspace/orders/${orderId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error('Sipariş güncellenemedi.');
        await fetchCloudWorkspace(idToken);
        return;
      }

      let products = [...snapshot.products];
      const orders = snapshot.orders.map((o) => {
        if (o.id !== orderId) return o;
        if (updates.status === 'cancelled' && o.status !== 'cancelled') {
          for (const item of o.items) {
            products = products.map((p) =>
              p.id === item.productId
                ? {
                    ...p,
                    sizeStock: releaseSizeStock(p.sizeStock, item.size, item.quantity),
                  }
                : p
            );
          }
        }
        return {
          ...o,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
      });

      persistPreview({
        ...snapshot,
        products,
        orders,
      });
    },
    [mode, idToken, snapshot, persistPreview, fetchCloudWorkspace]
  );

  const submitReceiptVerification = useCallback(
    async (input: {
      orderId: number;
      referenceCode: string;
      senderName: string;
      transferDate: string;
      transferTime: string;
      amount: number;
    }) => {
      if (mode === 'cloudsql' && idToken) {
        const res = await fetch('/api/workspace/receipts/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error('Dekont doğrulanamadı.');
        const data = await res.json();
        if (data.snapshot) setSnapshot(data.snapshot);
        return data.verification;
      }

      const targetOrder = snapshot.orders.find((o) => o.id === input.orderId);
      if (!targetOrder) {
        throw new Error('Sipariş bulunamadı.');
      }

      const verification = verifyReceiptDuplicateAndAmount(
        input,
        snapshot.receipts,
        targetOrder.totalAmount
      );

      const nextReceiptId =
        Math.max(0, ...snapshot.receipts.map((r) => r.id)) + 1;
      const newReceipt = {
        id: nextReceiptId,
        orderId: targetOrder.id,
        referenceCode: input.referenceCode.trim().toUpperCase(),
        senderName: input.senderName.trim(),
        transferDate: input.transferDate.trim(),
        transferTime: input.transferTime.trim(),
        amount: input.amount,
        status: verification.status,
        note: verification.reason,
        createdAt: new Date().toISOString(),
      };

      let products = [...snapshot.products];
      let orders = [...snapshot.orders];
      if (verification.status === 'verified') {
        for (const item of targetOrder.items) {
          products = products.map((p) =>
            p.id === item.productId
              ? {
                  ...p,
                  sizeStock: confirmPaidSizeStock(
                    p.sizeStock,
                    item.size,
                    item.quantity
                  ),
                }
              : p
          );
        }
        orders = orders.map((o) =>
          o.id === targetOrder.id
            ? {
                ...o,
                status: 'paid_ready',
                holdReason: '',
                updatedAt: new Date().toISOString(),
              }
            : o
        );
      }

      persistPreview({
        ...snapshot,
        products,
        orders,
        receipts: [newReceipt, ...snapshot.receipts],
      });

      return verification;
    },
    [mode, idToken, snapshot, persistPreview]
  );

  const appendLiveTranscript = useCallback(
    async (speaker: string, text: string, detectedSku = '') => {
      if (mode === 'cloudsql' && idToken) {
        const res = await fetch('/api/workspace/transcripts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ speaker, text, detectedSku }),
        });
        if (res.ok) {
          await fetchCloudWorkspace(idToken);
          return;
        }
      }
      const nextId =
        Math.max(0, ...snapshot.liveTranscripts.map((t) => t.id)) + 1;
      persistPreview({
        ...snapshot,
        liveTranscripts: [
          {
            id: nextId,
            speaker,
            text,
            detectedSku,
            createdAt: new Date().toISOString(),
          },
          ...snapshot.liveTranscripts,
        ],
      });
    },
    [mode, idToken, snapshot, persistPreview, fetchCloudWorkspace]
  );

  const generateIbanMessageForOrder = useCallback(
    (order: OrderDTO) => {
      const customer = snapshot.customers.find((c) => c.id === order.customerId);
      if (!customer) return '';
      return buildIbanPaymentMessage({
        storeName: snapshot.settings.storeName,
        iban: snapshot.settings.iban,
        ibanHolder: snapshot.settings.ibanHolder,
        customer,
        items: order.items,
        totalAmount: order.totalAmount,
        orderCode: order.orderCode,
      });
    },
    [snapshot]
  );

  return {
    mode,
    firebaseUser,
    snapshot,
    busy,
    errorMessage,
    setErrorMessage,
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
  };
}
