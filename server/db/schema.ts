import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// `provider_id` is the Clerk user id. Rows are keyed by an internal serial id so
// future foreign keys point at our own identifier rather than a vendor one.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  providerId: text("provider_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
