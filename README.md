# iDine Lite — Restaurant POS App

A fully offline-capable Restaurant Point of Sale (POS) mobile app built with React Native + Expo.

---

## Features

- Billing & KOT (Kitchen Order Ticket)
- Product & Category management
- Portions & Units
- Sales Dashboard with charts
- Recent orders & Receipt
- Offline-first (SQLite on-device)
- Server sync when internet available
- Navy blue theme

---

## Tech Stack

| Layer | Tech |
|---|---|
| Mobile | React Native + Expo Router |
| Language | TypeScript |
| Database | expo-sqlite (on-device) |
| Charts | react-native-svg |
| Backend | Hono + Bun |
| ORM | Drizzle |

---

## Project Structure

```
idine-lite/
├── packages/
│   ├── mobile/          # React Native app (main)
│   │   ├── app/         # Screens (Expo Router)
│   │   ├── lib/         # DB, auth, sync, theme
│   │   └── assets/      # Images & icons
│   ├── web/             # Backend API (Hono + Bun)
│   └── desktop/         # Electron (future)
├── package.json
└── turbo.json
```

---

## Getting Started in Runable

1. Open [Runable](https://runable.com) and start a new session
2. Tell the AI:
   ```
   Clone this repo and set up the project:
   https://github.com/tshainu/idine_lite
   ```
3. AI will clone, install dependencies and start Metro
4. Scan the QR code with **Expo Go** on your phone
5. Start building!

---

## Running Manually

### Install dependencies
```bash
bun install
```

### Start mobile (Metro bundler)
```bash
cd packages/mobile
bunx expo start --port 4300
```

### Start backend API
```bash
cd packages/web
bun run dev
```

---

## Environment Variables

Copy `.env.template` to `.env` in each package and fill in:

```
# packages/mobile/.env
API_URL=http://your-server:4200
```

---

## Building APK

Uses **EAS (Expo Application Services)**:

1. Install EAS CLI: `npm install -g eas-cli`
2. Login: `eas login`
3. Build: `eas build -p android --profile preview`

Or use the **Publish** button in Runable mobile preview dashboard.

---

## Pushing Changes to GitHub

```bash
git add -A
git commit -m "your message"
git push
```

---

## Screens

| Screen | File |
|---|---|
| Splash | `app/index.tsx` |
| Login | `app/login.tsx` |
| Dashboard | `app/dashboard.tsx` |
| Billing | `app/billing.tsx` |
| Items | `app/items.tsx` |
| Add Item | `app/add-item.tsx` |
| Categories | `app/categories.tsx` |
| Portions | `app/portions.tsx` |
| Reports | `app/reports.tsx` |
| Settings | `app/settings.tsx` |
| Users | `app/users.tsx` |

---

## Theme

All colors live in `packages/mobile/lib/theme.ts`.  
Primary color: **Navy Blue `#0A1F44`**

---

## Original Development

Built using [Runable](https://runable.com) AI platform — no local setup was needed during development.
