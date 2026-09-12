import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('ledger_records', {
  owner: text('owner').notNull(),
  id: text('id').notNull(),
  type: text('type', {enum:['income','expense']}).notNull(),
  cents: integer('cents').notNull(),
  note: text('note').notNull(),
  createdAt: integer('created_at').notNull(),
}, t => [primaryKey({columns:[t.owner,t.id]}), index('ledger_owner_created').on(t.owner,t.createdAt)]);
