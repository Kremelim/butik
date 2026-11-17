import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export interface SizeStockEntry {
  total: number;
  reserved: number;
  sold: number;
}

export type SizeStockMap = Record<string, SizeStockEntry>;

export type ModelPreset = 'dress' | 'coat' | 'knitset' | 'tunic';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').default('Butik Yöneticisi').notNull(),
  storeName: text('store_name').default('Kremelim Butik').notNull(),
  iban: text('iban').default('TR33 0006 1005 1978 6457 8413 26').notNull(),
  ibanHolder: text('iban_holder').default('Kremelim Tekstil Ltd. Şti.').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  ownerId: integer('owner_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  wholesaleCost: integer('wholesale_cost').notNull(),
  salePrice: integer('sale_price').notNull(),
  imageUrl: text('image_url').notNull(),
  colorHex: text('color_hex').default('#0F5132').notNull(),
  modelPreset: text('model_preset').default('dress').notNull(),
  fabricNote: text('fabric_note').default('Standart kalıp, 2-3 iş günü kargo').notNull(),
  sizeStock: jsonb('size_stock').$type<SizeStockMap>().notNull(),
  isLiveNow: boolean('is_live_now').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  ownerId: integer('owner_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone').default('').notNull(),
  phoneLast4: text('phone_last4').default('').notNull(),
  rackGroup: integer('rack_group'),
  tiktokHandle: text('tiktok_handle').default('').notNull(),
  address: text('address').default('').notNull(),
  previousOrderCount: integer('previous_order_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  ownerId: integer('owner_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  customerId: integer('customer_id')
    .references(() => customers.id, { onDelete: 'cascade' })
    .notNull(),
  orderCode: text('order_code').notNull(),
  status: text('status').default('reserved').notNull(),
  holdReason: text('hold_reason').default('').notNull(),
  totalAmount: integer('total_amount').default(0).notNull(),
  shippingSlaDays: integer('shipping_sla_days').default(3).notNull(),
  labelPrinted: boolean('label_printed').default(false).notNull(),
  ibanMessageSent: boolean('iban_message_sent').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  productName: text('product_name').notNull(),
  size: text('size').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  unitPrice: integer('unit_price').notNull(),
  tagPrinted: boolean('tag_printed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const receipts = pgTable('receipts', {
  id: serial('id').primaryKey(),
  ownerId: integer('owner_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  referenceCode: text('reference_code').notNull(),
  senderName: text('sender_name').notNull(),
  transferDate: text('transfer_date').notNull(),
  transferTime: text('transfer_time').notNull(),
  amount: integer('amount').notNull(),
  status: text('status').notNull(),
  note: text('note').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const whatsappMessages = pgTable('whatsapp_messages', {
  id: serial('id').primaryKey(),
  ownerId: integer('owner_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  customerId: integer('customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  senderLabel: text('sender_label').notNull(),
  incomingText: text('incoming_text').notNull(),
  screenshotUrl: text('screenshot_url').default('').notNull(),
  detectedProductId: integer('detected_product_id'),
  detectedSize: text('detected_size').default('').notNull(),
  botReply: text('bot_reply').notNull(),
  intent: text('intent').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const liveTranscripts = pgTable('live_transcripts', {
  id: serial('id').primaryKey(),
  ownerId: integer('owner_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  speaker: text('speaker').default('Yayıncı').notNull(),
  text: text('text').notNull(),
  detectedSku: text('detected_sku').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  products: many(products),
  customers: many(customers),
  orders: many(orders),
  receipts: many(receipts),
  whatsappMessages: many(whatsappMessages),
  liveTranscripts: many(liveTranscripts),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  owner: one(users, {
    fields: [products.ownerId],
    references: [users.id],
  }),
  orderItems: many(orderItems),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  owner: one(users, {
    fields: [customers.ownerId],
    references: [users.id],
  }),
  orders: many(orders),
  whatsappMessages: many(whatsappMessages),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  owner: one(users, {
    fields: [orders.ownerId],
    references: [users.id],
  }),
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  items: many(orderItems),
  receipts: many(receipts),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  owner: one(users, {
    fields: [receipts.ownerId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [receipts.orderId],
    references: [orders.id],
  }),
}));

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  owner: one(users, {
    fields: [whatsappMessages.ownerId],
    references: [users.id],
  }),
  customer: one(customers, {
    fields: [whatsappMessages.customerId],
    references: [customers.id],
  }),
}));

export const liveTranscriptsRelations = relations(liveTranscripts, ({ one }) => ({
  owner: one(users, {
    fields: [liveTranscripts.ownerId],
    references: [users.id],
  }),
}));
