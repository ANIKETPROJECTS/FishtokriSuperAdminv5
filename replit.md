# FishTokri Admin

Operations console for the FishTokri seafood distribution network. Manages hubs, vendors, inventory, orders and deliveries across the distribution network.

## Stack

- **Frontend**: React 19 + Vite 7 + TailwindCSS 4 → port 5000
- **Backend**: Express 5 + Mongoose 9 → port 8080
- **Database**: MongoDB Atlas (`fishtokri_admin` DB)
- **Monorepo**: pnpm workspaces

```
pnpm monorepo
├── artifacts/
│   ├── api-server/        Express 5 API  →  port 8080
│   └── fishtokri-admin/   React + Vite   →  port 5000 (preview)
├── lib/
│   ├── api-client-react/  React Query hooks used by frontend
│   ├── api-zod/           Zod schemas used by API server
│   └── db/                (unused template package)
└── scripts/
    └── dev.sh             Unified startup script
```

Vite proxies all `/api/*` requests to `localhost:8080`.

## How to Run

Two workflows must be running simultaneously:

1. **Start API** — builds and starts the Express server on port 8080
2. **Start Frontend** — starts Vite dev server on port 5000

Or use the unified **`artifacts/fishtokri-admin: web`** workflow (runs `scripts/dev.sh`) which waits for the API then starts Vite.

**First run after import:** the API server dist doesn't exist yet — run `cd artifacts/api-server && pnpm run build` in the shell before starting the API workflow.

## Environment Variables (set in Replit Secrets / Env Vars)

| Key | Purpose |
|-----|---------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `SESSION_SECRET` | JWT/session signing secret |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary image hosting |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `QZ_PRIVATE_KEY` | QZ Tray print station private key |
| `QZ_CERTIFICATE` | QZ Tray print station certificate |

All values are sourced from `ecosystem.config.cjs` (PM2 production config).

## Default Login

| Field | Value |
|-------|-------|
| Email | `admin@fishtokri.com` |
| Password | `FishTokri@Admin2024` |
| Role | Master Admin |

## User Preferences
