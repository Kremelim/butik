import { and, desc, eq } from 'drizzle-orm';
import {
  confirmPaidSizeStock,
  extractPhoneAndRackGroup,
  releaseSizeStock,
  reserveSizeStock,
  verifyReceiptDuplicateAndAmount,
} from '../core/boutiqueLogic.ts';
import { createInitialSeedSnapshot } from '../core/seedData.ts';
import type {
  CustomerDTO,
  LiveTranscriptDTO,
  ModelPreset,
  OrderDTO,
  OrderStatus,
  ProductDTO,
  ReceiptDTO,
  SizeStockMap,
  WhatsappMessageDTO,
  WorkspaceSnapshotDTO,
} from '../core/types.ts';
import { db } from './index.ts';
import {
  customers,
  liveTranscripts,
  orderItems,
  orders,
  products,
  receipts,
  users,
  whatsappMessages,
} from './schema.ts';

function toProductDTO(row: typeof products.$inferSelect): ProductDTO {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    wholesaleCost: row.wholesaleCost,
    salePrice: row.salePrice,
    imageUrl: row.imageUrl,
    colorHex: row.colorHex,
    modelPreset: (row.modelPreset as ModelPreset) || 'dress',
    fabricNote: row.fabricNote,
    sizeStock: row.sizeStock,
    isLiveNow: row.isLiveNow,
  };
}

function toCustomerDTO(row: typeof customers.$inferSelect): CustomerDTO {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    phoneLast4: row.phoneLast4,
    rackGroup: row.rackGroup ?? null,
    tiktokHandle: row.tiktokHandle,
    address: row.address,
    previousOrderCount: row.previousOrderCount,
  };
}

export async function getWorkspaceSnapshot(ownerId: number): Promise<WorkspaceSnapshotDTO> {
  try {
    const [userRow] = await db.select().from(users).where(eq(users.id, ownerId));
    const productRows = await db
      .select()
      .from(products)
      .where(eq(products.ownerId, ownerId))
      .orderBy(products.id);

    if (productRows.length === 0) {
      await seedInitialWorkspace(ownerId);
      return await getWorkspaceSnapshot(ownerId);
    }

    const [customerRows, orderRows, receiptRows, messageRows, transcriptRows] =
      await Promise.all([
        db
          .select()
          .from(customers)
          .where(eq(customers.ownerId, ownerId))
          .orderBy(desc(customers.updatedAt)),
        db
          .select()
          .from(orders)
          .where(eq(orders.ownerId, ownerId))
          .orderBy(desc(orders.createdAt)),
        db
          .select()
          .from(receipts)
          .where(eq(receipts.ownerId, ownerId))
          .orderBy(desc(receipts.createdAt)),
        db
          .select()
          .from(whatsappMessages)
          .where(eq(whatsappMessages.ownerId, ownerId))
          .orderBy(desc(whatsappMessages.createdAt)),
        db
          .select()
          .from(liveTranscripts)
          .where(eq(liveTranscripts.ownerId, ownerId))
          .orderBy(desc(liveTranscripts.createdAt)),
      ]);

    const itemRows =
      orderRows.length > 0
        ? await db.select().from(orderItems).orderBy(orderItems.id)
        : [];
    const orderIdSet = new Set(orderRows.map((o) => o.id));
    const filteredItems = itemRows.filter((i) => orderIdSet.has(i.orderId));

    const mappedOrders: OrderDTO[] = orderRows.map((o) => ({
      id: o.id,
      customerId: o.customerId,
      orderCode: o.orderCode,
      status: o.status as OrderStatus,
      holdReason: o.holdReason,
      totalAmount: o.totalAmount,
      shippingSlaDays: o.shippingSlaDays,
      labelPrinted: o.labelPrinted,
      ibanMessageSent: o.ibanMessageSent,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      items: filteredItems
        .filter((i) => i.orderId === o.id)
        .map((i) => ({
          id: i.id,
          orderId: i.orderId,
          productId: i.productId,
          productName: i.productName,
          size: i.size,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          tagPrinted: i.tagPrinted,
        })),
    }));

    return {
      settings: {
        storeName: userRow?.storeName ?? 'Kremelim Butik',
        iban: userRow?.iban ?? 'TR33 0006 1005 1978 6457 8413 26',
        ibanHolder: userRow?.ibanHolder ?? 'Kremelim Tekstil Ltd. Şti.',
      },
      products: productRows.map(toProductDTO),
      customers: customerRows.map(toCustomerDTO),
      orders: mappedOrders,
      receipts: receiptRows.map(
        (r): ReceiptDTO => ({
          id: r.id,
          orderId: r.orderId,
          referenceCode: r.referenceCode,
          senderName: r.senderName,
          transferDate: r.transferDate,
          transferTime: r.transferTime,
          amount: r.amount,
          status: r.status as ReceiptDTO['status'],
          note: r.note,
          createdAt: r.createdAt.toISOString(),
        })
      ),
      whatsappMessages: messageRows.map(
        (m): WhatsappMessageDTO => ({
          id: m.id,
          customerId: m.customerId ?? null,
          senderLabel: m.senderLabel,
          incomingText: m.incomingText,
          screenshotUrl: m.screenshotUrl,
          detectedProductId: m.detectedProductId ?? null,
          detectedSize: m.detectedSize,
          botReply: m.botReply,
          intent: m.intent as WhatsappMessageDTO['intent'],
          createdAt: m.createdAt.toISOString(),
        })
      ),
      liveTranscripts: transcriptRows.map(
        (t): LiveTranscriptDTO => ({
          id: t.id,
          speaker: t.speaker,
          text: t.text,
          detectedSku: t.detectedSku,
          createdAt: t.createdAt.toISOString(),
        })
      ),
    };
  } catch (error) {
    console.error('Database query failed in getWorkspaceSnapshot:', error);
    throw new Error('Çalışma alanı verileri yüklenemedi.', { cause: error });
  }
}

async function seedInitialWorkspace(ownerId: number) {
  const seed = createInitialSeedSnapshot();
  await db.transaction(async (tx) => {
    const productIdMap = new Map<number, number>();
    for (const p of seed.products) {
      const [inserted] = await tx
        .insert(products)
        .values({
          ownerId,
          sku: p.sku,
          name: p.name,
          category: p.category,
          wholesaleCost: p.wholesaleCost,
          salePrice: p.salePrice,
          imageUrl: p.imageUrl,
          colorHex: p.colorHex,
          modelPreset: p.modelPreset,
          fabricNote: p.fabricNote,
          sizeStock: p.sizeStock,
          isLiveNow: p.isLiveNow,
        })
        .returning();
      productIdMap.set(p.id, inserted.id);
    }

    const customerIdMap = new Map<number, number>();
    for (const c of seed.customers) {
      const [inserted] = await tx
        .insert(customers)
        .values({
          ownerId,
          fullName: c.fullName,
          phone: c.phone,
          phoneLast4: c.phoneLast4,
          rackGroup: c.rackGroup,
          tiktokHandle: c.tiktokHandle,
          address: c.address,
          previousOrderCount: c.previousOrderCount,
        })
        .returning();
      customerIdMap.set(c.id, inserted.id);
    }

    const orderIdMap = new Map<number, number>();
    for (const o of seed.orders) {
      const mappedCustomerId = customerIdMap.get(o.customerId);
      if (!mappedCustomerId) continue;
      const [insertedOrder] = await tx
        .insert(orders)
        .values({
          ownerId,
          customerId: mappedCustomerId,
          orderCode: o.orderCode,
          status: o.status,
          holdReason: o.holdReason,
          totalAmount: o.totalAmount,
          shippingSlaDays: o.shippingSlaDays,
          labelPrinted: o.labelPrinted,
          ibanMessageSent: o.ibanMessageSent,
          createdAt: new Date(o.createdAt),
          updatedAt: new Date(o.updatedAt),
        })
        .returning();
      orderIdMap.set(o.id, insertedOrder.id);

      for (const item of o.items) {
        const mappedProductId = productIdMap.get(item.productId);
        if (!mappedProductId) continue;
        await tx.insert(orderItems).values({
          orderId: insertedOrder.id,
          productId: mappedProductId,
          productName: item.productName,
          size: item.size,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          tagPrinted: item.tagPrinted,
        });
      }
    }

    for (const r of seed.receipts) {
      const mappedOrderId = orderIdMap.get(r.orderId);
      if (!mappedOrderId) continue;
      await tx.insert(receipts).values({
        ownerId,
        orderId: mappedOrderId,
        referenceCode: r.referenceCode,
        senderName: r.senderName,
        transferDate: r.transferDate,
        transferTime: r.transferTime,
        amount: r.amount,
        status: r.status,
        note: r.note,
      });
    }

    for (const m of seed.whatsappMessages) {
      await tx.insert(whatsappMessages).values({
        ownerId,
        customerId: m.customerId ? customerIdMap.get(m.customerId) ?? null : null,
        senderLabel: m.senderLabel,
        incomingText: m.incomingText,
        screenshotUrl: m.screenshotUrl,
        detectedProductId: m.detectedProductId
          ? productIdMap.get(m.detectedProductId) ?? null
          : null,
        detectedSize: m.detectedSize,
        botReply: m.botReply,
        intent: m.intent,
      });
    }

    for (const t of seed.liveTranscripts) {
      await tx.insert(liveTranscripts).values({
        ownerId,
        speaker: t.speaker,
        text: t.text,
        detectedSku: t.detectedSku,
      });
    }
  });
}

export async function createProductInDb(
  ownerId: number,
  input: {
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
  }
) {
  try {
    const [created] = await db
      .insert(products)
      .values({
        ownerId,
        sku: input.sku.trim().toUpperCase(),
        name: input.name.trim(),
        category: input.category.trim(),
        wholesaleCost: input.wholesaleCost,
        salePrice: input.salePrice,
        imageUrl: input.imageUrl,
        colorHex: input.colorHex,
        modelPreset: input.modelPreset,
        fabricNote: input.fabricNote,
        sizeStock: input.sizeStock,
        isLiveNow: false,
      })
      .returning();
    return toProductDTO(created);
  } catch (error) {
    console.error('Database query failed in createProductInDb:', error);
    throw new Error('Ürün kaydedilemedi.', { cause: error });
  }
}

export async function setLiveProductInDb(ownerId: number, productId: number) {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({ isLiveNow: false })
        .where(eq(products.ownerId, ownerId));
      await tx
        .update(products)
        .set({ isLiveNow: true })
        .where(and(eq(products.ownerId, ownerId), eq(products.id, productId)));
    });
  } catch (error) {
    console.error('Database query failed in setLiveProductInDb:', error);
    throw new Error('Yayındaki ürün güncellenemedi.', { cause: error });
  }
}

export async function updateProductStockInDb(
  ownerId: number,
  productId: number,
  sizeStock: SizeStockMap
) {
  try {
    await db
      .update(products)
      .set({ sizeStock })
      .where(and(eq(products.ownerId, ownerId), eq(products.id, productId)));
  } catch (error) {
    console.error('Database query failed in updateProductStockInDb:', error);
    throw new Error('Beden stok bilgisi güncellenemedi.', { cause: error });
  }
}

export async function upsertCustomerInDb(
  ownerId: number,
  input: {
    id?: number;
    fullName: string;
    phone?: string;
    tiktokHandle?: string;
    address?: string;
  }
) {
  try {
    const { normalizedPhone, last4, rackGroup } = extractPhoneAndRackGroup(input.phone);
    if (input.id) {
      const [updated] = await db
        .update(customers)
        .set({
          fullName: input.fullName.trim(),
          phone: normalizedPhone,
          phoneLast4: last4,
          rackGroup,
          tiktokHandle: (input.tiktokHandle ?? '').trim(),
          address: (input.address ?? '').trim(),
          updatedAt: new Date(),
        })
        .where(and(eq(customers.ownerId, ownerId), eq(customers.id, input.id)))
        .returning();
      return toCustomerDTO(updated);
    }

    const [created] = await db
      .insert(customers)
      .values({
        ownerId,
        fullName: input.fullName.trim(),
        phone: normalizedPhone,
        phoneLast4: last4,
        rackGroup,
        tiktokHandle: (input.tiktokHandle ?? '').trim(),
        address: (input.address ?? '').trim(),
        previousOrderCount: 0,
      })
      .returning();
    return toCustomerDTO(created);
  } catch (error) {
    console.error('Database query failed in upsertCustomerInDb:', error);
    throw new Error('Müşteri kaydı güncellenemedi.', { cause: error });
  }
}

export async function reserveItemsForCustomerInDb(
  ownerId: number,
  params: {
    customer: {
      fullName: string;
      phone?: string;
      tiktokHandle?: string;
      address?: string;
    };
    items: Array<{ productId: number; size: string; quantity: number }>;
    whatsappLog?: {
      senderLabel: string;
      incomingText: string;
      screenshotUrl: string;
      botReply: string;
      intent: WhatsappMessageDTO['intent'];
    };
  }
) {
  try {
    return await db.transaction(async (tx) => {
      const existingCustomers = await tx
        .select()
        .from(customers)
        .where(eq(customers.ownerId, ownerId));

      const phoneInfo = extractPhoneAndRackGroup(params.customer.phone);
      const handleClean = (params.customer.tiktokHandle ?? '').trim().toLowerCase();

      let matchedCustomer = existingCustomers.find((c) => {
        if (phoneInfo.last4 && c.phoneLast4 === phoneInfo.last4) return true;
        if (handleClean && c.tiktokHandle.toLowerCase() === handleClean) return true;
        return false;
      });

      if (!matchedCustomer) {
        const [inserted] = await tx
          .insert(customers)
          .values({
            ownerId,
            fullName: params.customer.fullName.trim(),
            phone: phoneInfo.normalizedPhone,
            phoneLast4: phoneInfo.last4,
            rackGroup: phoneInfo.rackGroup,
            tiktokHandle: (params.customer.tiktokHandle ?? '').trim(),
            address: (params.customer.address ?? '').trim(),
            previousOrderCount: 0,
          })
          .returning();
        matchedCustomer = inserted;
      } else {
        const [updated] = await tx
          .update(customers)
          .set({
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
            address: params.customer.address?.trim() || matchedCustomer.address,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, matchedCustomer.id))
          .returning();
        matchedCustomer = updated;
      }

      const reservedSummary: Array<{
        productId: number;
        productName: string;
        size: string;
        quantity: number;
        unitPrice: number;
      }> = [];
      const failedItems: Array<{ productName: string; size: string; hasUnpaid: boolean }> =
        [];

      for (const reqItem of params.items) {
        const [prod] = await tx
          .select()
          .from(products)
          .where(
            and(eq(products.ownerId, ownerId), eq(products.id, reqItem.productId))
          );
        if (!prod) continue;

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

        await tx
          .update(products)
          .set({ sizeStock: res.sizeStock })
          .where(eq(products.id, prod.id));

        reservedSummary.push({
          productId: prod.id,
          productName: prod.name,
          size: reqItem.size.toUpperCase(),
          quantity: reqItem.quantity || 1,
          unitPrice: prod.salePrice,
        });
      }

      if (reservedSummary.length > 0) {
        const activeOrders = await tx
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.ownerId, ownerId),
              eq(orders.customerId, matchedCustomer.id)
            )
          );
        let activeOrder = activeOrders.find(
          (o) =>
            o.status === 'reserved' ||
            o.status === 'awaiting_payment' ||
            o.status === 'held'
        );

        const addedTotal = reservedSummary.reduce(
          (sum, item) => sum + item.unitPrice * item.quantity,
          0
        );

        if (!activeOrder) {
          const [createdOrder] = await tx
            .insert(orders)
            .values({
              ownerId,
              customerId: matchedCustomer.id,
              orderCode: `KRM-${Math.floor(1000 + Math.random() * 8999)}`,
              status: 'reserved',
              holdReason: '',
              totalAmount: addedTotal,
              shippingSlaDays: 3,
            })
            .returning();
          activeOrder = createdOrder;
        } else {
          await tx
            .update(orders)
            .set({
              totalAmount: activeOrder.totalAmount + addedTotal,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, activeOrder.id));
        }

        for (const item of reservedSummary) {
          await tx.insert(orderItems).values({
            orderId: activeOrder.id,
            productId: item.productId,
            productName: item.productName,
            size: item.size,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            tagPrinted: false,
          });
        }
      }

      if (params.whatsappLog) {
        await tx.insert(whatsappMessages).values({
          ownerId,
          customerId: matchedCustomer.id,
          senderLabel: params.whatsappLog.senderLabel,
          incomingText: params.whatsappLog.incomingText,
          screenshotUrl: params.whatsappLog.screenshotUrl,
          detectedProductId: reservedSummary[0]?.productId ?? null,
          detectedSize: reservedSummary[0]?.size ?? '',
          botReply: params.whatsappLog.botReply,
          intent: params.whatsappLog.intent,
        });
      }

      return { reservedSummary, failedItems };
    });
  } catch (error) {
    console.error('Database query failed in reserveItemsForCustomerInDb:', error);
    throw new Error('Sipariş ayırma işlemi kaydedilemedi.', { cause: error });
  }
}

export async function updateOrderStatusInDb(
  ownerId: number,
  orderId: number,
  updates: {
    status?: OrderStatus;
    holdReason?: string;
    labelPrinted?: boolean;
    ibanMessageSent?: boolean;
  }
) {
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.ownerId, ownerId), eq(orders.id, orderId)));
      if (!existing) throw new Error('Sipariş bulunamadı.');

      if (updates.status === 'cancelled' && existing.status !== 'cancelled') {
        const items = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId));
        for (const item of items) {
          const [prod] = await tx
            .select()
            .from(products)
            .where(eq(products.id, item.productId));
          if (prod) {
            const released = releaseSizeStock(prod.sizeStock, item.size, item.quantity);
            await tx
              .update(products)
              .set({ sizeStock: released })
              .where(eq(products.id, prod.id));
          }
        }
      }

      await tx
        .update(orders)
        .set({
          ...(updates.status !== undefined ? { status: updates.status } : {}),
          ...(updates.holdReason !== undefined ? { holdReason: updates.holdReason } : {}),
          ...(updates.labelPrinted !== undefined
            ? { labelPrinted: updates.labelPrinted }
            : {}),
          ...(updates.ibanMessageSent !== undefined
            ? { ibanMessageSent: updates.ibanMessageSent }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));
    });
  } catch (error) {
    console.error('Database query failed in updateOrderStatusInDb:', error);
    throw new Error('Sipariş durumu güncellenemedi.', { cause: error });
  }
}

export async function verifyAndSaveReceiptInDb(
  ownerId: number,
  input: {
    orderId: number;
    referenceCode: string;
    senderName: string;
    transferDate: string;
    transferTime: string;
    amount: number;
  }
) {
  try {
    return await db.transaction(async (tx) => {
      const [orderRow] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.ownerId, ownerId), eq(orders.id, input.orderId)));
      if (!orderRow) throw new Error('Sipariş bulunamadı.');

      const existingReceipts = await tx
        .select()
        .from(receipts)
        .where(eq(receipts.ownerId, ownerId));

      const check = verifyReceiptDuplicateAndAmount(
        input,
        existingReceipts.map((r) => ({
          referenceCode: r.referenceCode,
          senderName: r.senderName,
          transferDate: r.transferDate,
          transferTime: r.transferTime,
          amount: r.amount,
          status: r.status as ReceiptDTO['status'],
        })),
        orderRow.totalAmount
      );

      const [savedReceipt] = await tx
        .insert(receipts)
        .values({
          ownerId,
          orderId: orderRow.id,
          referenceCode: input.referenceCode.trim().toUpperCase(),
          senderName: input.senderName.trim(),
          transferDate: input.transferDate.trim(),
          transferTime: input.transferTime.trim(),
          amount: input.amount,
          status: check.status,
          note: check.reason,
        })
        .returning();

      if (check.status === 'verified') {
        const items = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderRow.id));
        for (const item of items) {
          const [prod] = await tx
            .select()
            .from(products)
            .where(eq(products.id, item.productId));
          if (prod) {
            const paidStock = confirmPaidSizeStock(
              prod.sizeStock,
              item.size,
              item.quantity
            );
            await tx
              .update(products)
              .set({ sizeStock: paidStock })
              .where(eq(products.id, prod.id));
          }
        }
        await tx
          .update(orders)
          .set({
            status: 'paid_ready',
            holdReason: '',
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderRow.id));
      }

      return { verification: check, receipt: savedReceipt };
    });
  } catch (error) {
    console.error('Database query failed in verifyAndSaveReceiptInDb:', error);
    throw new Error('Dekont doğrulaması kaydedilemedi.', { cause: error });
  }
}

export async function saveLiveTranscriptInDb(
  ownerId: number,
  input: { speaker: string; text: string; detectedSku?: string }
) {
  try {
    const [row] = await db
      .insert(liveTranscripts)
      .values({
        ownerId,
        speaker: input.speaker || 'Yayıncı',
        text: input.text,
        detectedSku: input.detectedSku || '',
      })
      .returning();
    return row;
  } catch (error) {
    console.error('Database query failed in saveLiveTranscriptInDb:', error);
    throw new Error('Transkript kaydedilemedi.', { cause: error });
  }
}
