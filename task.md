# Server Sync - Full Implementation

## Done
- [x] units route created (packages/web/src/api/routes/units.ts)
- [x] portionTemplates route created (packages/web/src/api/routes/portionTemplates.ts)

## In Progress
- [ ] Add units + portionTemplates tables to server schema
- [ ] Register units + portionTemplates routes in api/index.ts
- [ ] Update products route to handle portions in PUT properly
- [ ] Run db migration (drizzle-kit push)
- [ ] Create mobile serverApi.ts
- [ ] Update auth.ts login - pull all data from server after login
- [ ] Update categories.tsx - write to server
- [ ] Update units.tsx - write to server
- [ ] Update portions.tsx - write to server
- [ ] Update add-item.tsx - write to server
- [ ] Update billing.tsx - push order to server on bill complete
- [ ] Restart server
- [ ] Trigger APK build

## Schema additions needed
- units table: id, shop_id, name, abbreviation, created_at, updated_at, deleted_at
- portion_templates table: id, shop_id, name, created_at, updated_at, deleted_at

## Key decisions
- Local SQLite = read cache, populated from server
- On login: pull all categories, products, portions(templates+product), units → write to local DB
- On save: write to server first, then refresh local from server
- Orders: push to server on billing complete (best-effort, silent fail ok for now)
