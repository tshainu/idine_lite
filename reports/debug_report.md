# iDine Lite Mobile — Debug Report
**Date:** 2026-05-19  
**Scope:** Full audit of all 14 mobile screens + 8 lib files  
**Files reviewed:** `billing.tsx`, `dashboard.tsx`, `items.tsx`, `add-item.tsx`, `categories.tsx`, `reports.tsx`, `settings.tsx`, `users.tsx`, `change-password.tsx`, `portions.tsx`, `units.tsx`, `login.tsx`, `(drawer).tsx`, `_layout.tsx`, `lib/database.ts`, `lib/auth.ts`, `lib/sync.ts`, `lib/printer.ts`, `lib/store.ts`, `lib/theme.ts`

---

## BUGS FIXED (6 issues)

### 🔴 BUG 1 — `reports.tsx`: All DB queries return wrong data or crash  
**Severity:** Critical — affects every report  
**File:** `app/reports.tsx` lines 106–170  
**Root cause:** `db.getFirstSync()` and `db.getAllSync()` were called with positional spread args instead of a bound-params array:
```ts
// BEFORE (broken) — params passed as extra function arguments
db.getFirstSync(`SELECT ... WHERE created_at >= ? AND created_at <= ?`, from, to)
db.getAllSync(`SELECT ... WHERE ... >= ? AND ... <= ?`, from, to)

// AFTER (fixed) — params correctly passed as array
db.getFirstSync(`SELECT ... WHERE created_at >= ? AND created_at <= ?`, [from, to])
db.getAllSync(`SELECT ... WHERE ... >= ? AND ... <= ?`, [from, to])
```
**Impact:** All 5 queries in `loadReport()` were affected — Summary, Bills, Top Items, Category Sales, and Hourly Sales all returned empty/null data regardless of date range.  
**Status:** ✅ Fixed

---

### 🔴 BUG 2 — `billing.tsx`: Null `orderId` causes silent data corruption  
**Severity:** Critical  
**File:** `app/billing.tsx` line 555  
**Root cause:** `db.getFirstSync("SELECT last_insert_rowid() as id")` can return `null` in edge cases (race conditions, failed insert). There was no null guard — order items would be inserted with `orderId = null`, corrupting the `order_items` table silently.
```ts
// AFTER (fixed) — guard added
const orderId = (db.getFirstSync("SELECT last_insert_rowid() as id") as any)?.id;
if (!orderId) {
  console.warn("saveOrder: last_insert_rowid() returned null — order items skipped");
  return null;
}
```
**Status:** ✅ Fixed

---

### 🟠 BUG 3 — `billing.tsx`: KOT regex breaks items with parentheses in name  
**Severity:** High  
**File:** `app/billing.tsx` lines 695–700  
**Root cause:** In `handlePrintBillAndKOT`, items from `receiptData` (which already has separate `name` and `portionName` fields) were being re-parsed through a regex `/^(.+?)\s*\((.+)\)$/` to "split back" the portion name. This regex would:
1. Silently fail for product names containing `(` or `)` (e.g. "Egg (Boiled)")
2. Drop the `portionName` entirely when no match
3. Was completely unnecessary since `receiptData.items` stores `name` and `portionName` as separate fields

```ts
// BEFORE (broken)
items: data.items.map(it => {
  const match = it.name.match(/^(.+?)\s*\((.+)\)$/);
  return {
    name: match ? match[1] : it.name,
    portionName: match ? match[2] : undefined,
    qty: it.qty,
  };
}),

// AFTER (fixed) — use fields directly
items: data.items.map(it => ({
  name: it.name,
  portionName: it.portionName,
  qty: it.qty,
})),
```
**Status:** ✅ Fixed

---

### 🟠 BUG 4 — `add-item.tsx`: Edit mode hard-deletes portions, breaks server sync  
**Severity:** High  
**File:** `app/add-item.tsx` line ~404  
**Root cause:** When editing a product, the code wiped all its portions with `DELETE FROM portions WHERE product_id=?` — a hard (permanent) delete. Since the sync engine pushes `order_items` referencing `portion_id` values that the server still knows about, this breaks sync reconciliation.
```ts
// BEFORE (broken) — hard delete
db.runSync("DELETE FROM portions WHERE product_id=?", [parseInt(editId)]);

// AFTER (fixed) — soft delete preserves sync history
db.runSync("UPDATE portions SET deleted_at=? WHERE product_id=?", [Date.now(), parseInt(editId)]);
```
**Status:** ✅ Fixed

---

### 🟡 BUG 5 — `items.tsx`: Dead `editPanel` code (unreachable UI)  
**Severity:** Medium — dead code, no runtime impact, but adds confusion  
**File:** `app/items.tsx` lines 175–270, 328–356  
**Root cause:** `editPanel` state, `handleSave()` function, full inline edit form JSX, and 8 associated styles (`editPanel`, `editPanelHeader`, `editPanelTitle`, `editInput`, `catChip`, `editBtnRow`, `saveBtn`, `cancelBtn`) were all present in the file — but `openEdit()` calls `router.push('/add-item?id=...')`, meaning `editPanel` is never set to a non-null value. The entire panel is unreachable.

**Removed:**
- `editPanel` state
- `handleSave()` function  
- Inline edit panel JSX block (`{editPanel && <View>...</View>}`)
- 8 dead style definitions
- Unused `Check` and `X` imports from phosphor-react-native

**Status:** ✅ Fixed

---

### 🟡 BUG 6 — `users.tsx`: API errors silently ignored  
**Severity:** Medium  
**File:** `app/users.tsx` lines 44–63  
**Root cause:** Both `PUT` and `POST` fetch calls did not check `res.ok`. A 400/401/409 from the server would be treated as success — the modal closes and `loadUsers()` runs, showing the old state without any error message to the user.
```ts
// AFTER (fixed) — check response status
if (!res.ok) {
  const err = await res.json().catch(() => ({}));
  throw new Error((err as any).error ?? `Server error ${res.status}`);
}
```
**Status:** ✅ Fixed

---

## ISSUES FOUND BUT NOT FIXED (by design or acceptable risk)

### ℹ️ Pre-existing TypeScript type mismatches (SQLiteBindValue)
**Files:** Virtually every screen that uses `db.runSync` / `db.getAllSync`  
**What:** expo-sqlite's strict TS types flag `number[]` as not assignable to `SQLiteBindValue`. The whole codebase uses arrays as bind params — these compile and run fine via Metro/Babel but cause TS type errors.  
**Decision:** Not fixed — would require casting every call site with `as any`. This is a TS config issue, not a runtime issue. The project doesn't run `tsc` as a build step.

### ℹ️ `dashboard.tsx`: TCP socket `checkPrinter` — false concern  
**What:** Previously flagged as potential timer/socket leak. On re-read: `done` guard, `clearTimeout` in every branch, and `client.destroy()` in `finish()` are all present. No actual leak.  
**Decision:** No fix needed.

### ℹ️ `portions.tsx`: UPDATE by `MIN(id)` — correct by design  
`SELECT DISTINCT name, MIN(id) as id FROM portions WHERE product_id=0` uses `MIN(id)` as a stable representative row per portion name. Edit updates the right row. Acceptable.

### ℹ️ `change-password.tsx`: `currentPassword: "__skip__"` workaround  
Sends a fake current password for the force-change flow. Backend explicitly skips the current password check when `user.mustChangePassword = true`. This is intentional and correct.

---

## ARCHITECTURE OBSERVATIONS

| Area | Observation |
|------|------------|
| **Drawer menu** | Duplicated inline in billing, dashboard, items — not shared component. Acceptable for now, but creates maintenance burden if menu items change. |
| **Session handling** | `getSession()` is async (AsyncStorage) — called in multiple `useEffect` hooks across screens. No global auth context. Fine for this scale. |
| **Sync engine** | `startSyncEngine()` polls every 10s from `dashboard.tsx`. No de-dup: if dashboard unmounts/remounts rapidly, multiple intervals could stack up. `stopSyncEngine()` exists but relies on caller discipline. |
| **`product_id=0` hack** | Portions with `product_id=0` serve as global template pool. It works but pollutes the portions table. A separate `portion_templates` table would be cleaner. |
| **Order numbers** | `billNo` is `SELECT MAX(id)+1 FROM orders` — not crash-safe if table is empty (returns `null+1 = 1`, which is actually fine). No gap-free guarantee but fine for POS use. |
| **No offline error boundary** | If `db.getAllSync` throws (e.g., DB not initialized yet), most screens catch with `try/catch` and set empty state — silent fail. Good defensive coding. |
| **Printer timeout** | WiFi printer connection times out after 8s (`printWifi`) vs 5s (`checkPrinter`). Slight inconsistency but not a bug. |

---

## SUGGESTED FEATURES TO ADD

### 🔥 High-value / quick wins

**1. Table Management**  
Currently `table_no` is a free-text field in billing. A proper table map would:
- Show a visual floor plan with numbered tables
- Color-code tables: Available / Occupied / Bill Requested
- Let staff tap a table to open its active order
- Ideal for dine-in restaurants

**2. Order Hold / Park**  
Save a cart as "parked" (status = `parked`) and recall it later. Essential for busy counters where a customer steps away mid-order. DB column and UI toggle needed.

**3. Split Bill**  
Split an order by items or by amount between multiple customers. Common requirement for table service.

**4. Void / Refund**  
Currently there's no void. Add: Void item from existing order (admin only), void full order, mark as `voided` in DB, exclude from reports.

**5. Cash Drawer Open**  
ESC/POS command `\x1B\x70\x00\x19\x19` (pulse pin 2) to trigger connected cash drawers. One line in `printer.ts`, one button in billing screen.

---

### 📊 Reports & Analytics

**6. End-of-Day (EOD) Report**  
Auto-generate a summary at close: total sales, cash collected, orders count, top 3 items, payment method breakdown. Print directly from settings/reports.

**7. Cashier-wise Report**  
Filter reports by `user_id` to see per-cashier performance — useful for shift tracking. Column already exists in `orders` table.

**8. Export to CSV/PDF**  
Allow exporting the current report view as CSV (for accounting) or PDF. `expo-print` or `expo-file-system` + a share sheet.

**9. Stock / Inventory Alerts**  
Add a `stock_qty` field to products. Decrement on order. Alert when below threshold. Dashboard widget for low-stock items.

---

### 🖨 Printing

**10. Customer Copy / Merchant Copy**  
Print two receipts per bill — one for customer, one for merchant records. Option in settings.

**11. QR Code on Receipt**  
Print a QR code on receipts linking to a digital copy or feedback form. ESC/POS GS v 0 command or embed as ASCII art (for basic printers).

**12. Bluetooth KOT Printer**  
Currently KOT printer is WiFi-only. Add Bluetooth option (already have BT infra in settings) so kitchens without network can still get KOTs.

---

### 💳 Payments & Operations

**13. Multiple Payment Methods**  
Currently hardcoded to "cash". Add: card, QR/digital wallet, split payment (partial cash + partial card). DB column `payment_method` already exists.

**14. Daily Opening Balance**  
Cashier declares opening float at shift start, EOD report shows expected vs actual cash. Common in POS systems.

**15. Customer Loyalty / Quick Notes**  
Optional customer name/phone on bill. Repeat customer lookup. Simple, but high perceived value for restaurants.

---

### 🔧 UX / Polish

**16. Dark Mode**  
All colors are in `lib/theme.ts` — already centralized. Adding a dark theme variant is straightforward.

**17. Biometric Lock**  
Use `expo-local-authentication` to require fingerprint/face before opening the app or accessing settings. Security feature for shared devices.

**18. Offline Indicator**  
Visual badge when device is offline. Currently the app silently falls back — let staff know sync is paused.

**19. Haptic Feedback on Billing Actions**  
`expo-haptics` — subtle vibration on "Add to cart", "Place Order", "Print". Makes the POS feel more tactile and responsive.

**20. Item Search in Billing Screen**  
Currently items are browsed by category only. A search bar to quickly find items by name speeds up order taking dramatically for large menus.

---

## SUMMARY

| Category | Count |
|----------|-------|
| Critical bugs fixed | 2 |
| High bugs fixed | 2 |
| Medium bugs fixed | 2 |
| Architecture observations | 8 |
| Features suggested | 20 |
| Files modified | 5 |

**Modified files:**
- `app/reports.tsx` — fixed all 5 DB query param bugs  
- `app/billing.tsx` — null orderId guard + KOT regex removal  
- `app/add-item.tsx` — soft-delete on portion edit  
- `app/items.tsx` — removed dead editPanel code + imports + styles  
- `app/users.tsx` — API error response handling
