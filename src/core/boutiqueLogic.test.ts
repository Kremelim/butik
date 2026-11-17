import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIbanPaymentMessage,
  buildShippingLabelPayload,
  calculateSlaStatus,
  confirmPaidSizeStock,
  extractPhoneAndRackGroup,
  getAvailableStock,
  getMissingCustomerFields,
  matchTranscriptToProducts,
  releaseSizeStock,
  reserveSizeStock,
  verifyReceiptDuplicateAndAmount,
} from './boutiqueLogic';
import type { SizeStockMap } from './types';

test('extractPhoneAndRackGroup extracts last 4 digits and 0-9 rack group', () => {
  const res = extractPhoneAndRackGroup('0532 419 88 27');
  assert.equal(res.last4, '8827');
  assert.equal(res.rackGroup, 7);

  const zeroRack = extractPhoneAndRackGroup('+90 555 123 45 10');
  assert.equal(zeroRack.last4, '4510');
  assert.equal(zeroRack.rackGroup, 0);

  const handleOnly = extractPhoneAndRackGroup('@elif_butik');
  assert.equal(handleOnly.last4, '');
  assert.equal(handleOnly.rackGroup, null);
});

test('getMissingCustomerFields detects missing phone, address, or @handle-only name', () => {
  const missingAll = getMissingCustomerFields({
    fullName: '@zeynep_live',
    phone: '',
    address: 'İstanbul',
  });
  assert.deepEqual(missingAll, ['Ad Soyad', 'Telefon Numarası', 'Açık Adres']);

  const complete = getMissingCustomerFields({
    fullName: 'Ayşe Yılmaz',
    phone: '05324198827',
    address: 'Bağdat Cad. No:42 D:5 Kadıköy / İstanbul',
  });
  assert.deepEqual(complete, []);
});

test('reserveSizeStock enforces first-to-write stock bounds and unpaid holder tracking', () => {
  const initial: SizeStockMap = {
    S: { total: 2, reserved: 1, sold: 0 },
    M: { total: 1, reserved: 1, sold: 0 },
  };

  assert.equal(getAvailableStock(initial, 'S'), 1);
  assert.equal(getAvailableStock(initial, 'M'), 0);

  const firstReserve = reserveSizeStock(initial, 'S', 1);
  assert.equal(firstReserve.ok, true);
  assert.equal(firstReserve.remainingAfter, 0);
  assert.equal(firstReserve.sizeStock.S.reserved, 2);

  const secondReserve = reserveSizeStock(firstReserve.sizeStock, 'S', 1);
  assert.equal(secondReserve.ok, false);
  assert.equal(secondReserve.hasUnpaidReserved, true);

  const released = releaseSizeStock(firstReserve.sizeStock, 'S', 1);
  assert.equal(getAvailableStock(released, 'S'), 1);

  const paid = confirmPaidSizeStock(released, 'S', 1);
  assert.equal(paid.S.reserved, 0);
  assert.equal(paid.S.sold, 1);
});

test('buildIbanPaymentMessage includes IBAN, holder, itemized sizes, and rack info', () => {
  const msg = buildIbanPaymentMessage({
    storeName: 'Kremelim Butik',
    iban: 'TR33 0006 1005 1978 6457 8413 26',
    ibanHolder: 'Kremelim Tekstil Ltd. Şti.',
    customer: { fullName: 'Selin Demir', phoneLast4: '4827', rackGroup: 7 },
    items: [
      { productName: 'Zümrüt Saten Elbise', size: 'M', quantity: 1, unitPrice: 1250 },
      { productName: 'Camel Kaşe Kaban', size: 'L', quantity: 1, unitPrice: 2450 },
    ],
    totalAmount: 3700,
    orderCode: 'KRM-1042',
  });

  assert.match(msg, /Selin Demir/);
  assert.match(msg, /Raf Grubu: 7 \(Son 4 Hane: 4827\)/);
  assert.match(msg, /Zümrüt Saten Elbise \(M Beden x1\)/);
  assert.match(msg, /3\.700 TL/);
  assert.match(msg, /TR33 0006 1005 1978 6457 8413 26/);
  assert.match(msg, /2-3 iş günü/);
});

test('verifyReceiptDuplicateAndAmount rejects duplicates and mismatched amounts', () => {
  const existing = [
    {
      referenceCode: 'EFT-99412',
      senderName: 'Selin Demir',
      transferDate: '2026-11-17',
      transferTime: '14:22',
      amount: 1250,
      status: 'verified' as const,
    },
  ];

  const dupByRef = verifyReceiptDuplicateAndAmount(
    {
      referenceCode: 'eft-99412',
      senderName: 'Başka Kişi',
      transferDate: '2026-11-17',
      transferTime: '15:00',
      amount: 1250,
    },
    existing,
    1250
  );
  assert.equal(dupByRef.status, 'duplicate_rejected');

  const dupByTimestamp = verifyReceiptDuplicateAndAmount(
    {
      referenceCode: 'EFT-99999',
      senderName: 'selin demir',
      transferDate: '2026-11-17',
      transferTime: '14:22',
      amount: 1250,
    },
    existing,
    1250
  );
  assert.equal(dupByTimestamp.status, 'duplicate_rejected');

  const mismatch = verifyReceiptDuplicateAndAmount(
    {
      referenceCode: 'EFT-88111',
      senderName: 'Merve Kaya',
      transferDate: '2026-11-17',
      transferTime: '16:10',
      amount: 1100,
    },
    existing,
    1250
  );
  assert.equal(mismatch.status, 'mismatch');

  const valid = verifyReceiptDuplicateAndAmount(
    {
      referenceCode: 'EFT-88111',
      senderName: 'Merve Kaya',
      transferDate: '2026-11-17',
      transferTime: '16:10',
      amount: 1250,
    },
    existing,
    1250
  );
  assert.equal(valid.status, 'verified');
});

test('calculateSlaStatus tracks 2-3 business days shipping window', () => {
  const now = new Date('2026-11-17T12:00:00Z').getTime();
  assert.equal(calculateSlaStatus('2026-11-17T10:00:00Z', 3, now).state, 'normal');
  assert.equal(calculateSlaStatus('2026-11-15T10:00:00Z', 3, now).state, 'due_soon');
  assert.equal(calculateSlaStatus('2026-11-12T10:00:00Z', 3, now).state, 'overdue');
});

test('buildShippingLabelPayload formats hold reason and customer details', () => {
  const label = buildShippingLabelPayload(
    {
      orderCode: 'KRM-2004',
      totalAmount: 1850,
      holdReason: 'Müşteri yeni ürün ekleyecek',
      shippingSlaDays: 3,
    },
    {
      fullName: 'Deniz Aksoy',
      phone: '0544 333 22 19',
      phoneLast4: '2219',
      rackGroup: 9,
      address: 'Tunalı Hilmi Cad. No:18 Çankaya / Ankara',
      tiktokHandle: '@deniz_ak',
    },
    [{ productName: 'Ekru Fitilli Triko Takım', size: 'M', quantity: 1 }]
  );

  assert.equal(label.rackCode, 'RAF-9 · ...2219');
  assert.equal(label.holdReason, 'BEKLETME: Müşteri yeni ürün ekleyecek');
  assert.equal(label.totalAmountFormatted, '1.850 TL');
});

test('matchTranscriptToProducts identifies live product SKU and sizes from spoken Turkish text', () => {
  const products = [
    {
      id: 1,
      sku: 'ELB-101',
      name: 'Zümrüt Saten Wrap Elbise',
      sizeStock: {
        S: { total: 4, reserved: 0, sold: 0 },
        M: { total: 5, reserved: 0, sold: 0 },
        L: { total: 2, reserved: 0, sold: 0 },
      },
    },
  ];
  const matched = matchTranscriptToProducts(
    'Kızlar şimdi ELB-101 Zümrüt Saten Elbiseyi gösteriyorum, S ve M bedenlerimiz mevcut!',
    products
  );
  assert.ok(matched);
  assert.equal(matched.productId, 1);
  assert.deepEqual(matched.mentionedSizes, ['S', 'M']);
});
