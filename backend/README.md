# Dearly Backend

Node.js, Express, TypeScript, and Prisma with PostgreSQL backend architecture.

---

## 📁 Directory Architecture

```text
backend/
├── prisma/
│   ├── migrations/            # Database migration history (.gitkeep)
│   └── schema.prisma          # Prisma schema with PostgreSQL datasource
├── src/
│   ├── configs/               # Environment, database, cors, redis configs (.gitkeep)
│   ├── constants/             # HTTP status codes, roles, error codes (.gitkeep)
│   ├── controllers/           # Route controllers / request handlers (.gitkeep)
│   ├── interfaces/            # TypeScript interfaces (.gitkeep)
│   ├── jobs/                  # Scheduling and enqueueing work (.gitkeep)
│   ├── middlewares/           # Auth, error handling, rate limiters, validation (.gitkeep)
│   ├── providers/             # Vendor-specific integrations
│   │   ├── email/             # Email delivery (.gitkeep)
│   │   ├── sms/               # SMS delivery (.gitkeep)
│   │   ├── storage/           # Attachment storage (.gitkeep)
│   │   └── whatsapp/          # WhatsApp delivery (.gitkeep)
│   ├── routes/                # Express routing endpoints (.gitkeep)
│   ├── services/              # Business logic & Prisma queries (.gitkeep)
│   ├── types/                 # Custom type definitions (.gitkeep)
│   ├── utils/                 # Logger, ApiError, ApiResponse, asyncHandler (.gitkeep)
│   ├── validators/            # Zod validation schemas (.gitkeep)
│   └── workers/               # Delivery execution and retries (.gitkeep)
├── logs/                      # Server and error logs (.gitkeep)
├── .env.example               # Environment variables template
├── .gitignore                 # Ignore node_modules, dist, logs, env
├── package.json               # Dependencies & scripts
└── tsconfig.json              # TypeScript configuration
```

---

## 🛠️ Tech Stack

- **Runtime**: Node.js + Express
- **Language**: TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Validation**: Zod
- **Security & Utilities**: Helmet, CORS, Express-Rate-Limit, Winston, Dotenv, ioredis

---

## 🚀 Setup & Commands

The commands below are intended for implementation. This is currently a
folder scaffold: `src/server.ts` has not been created, and the Prisma user model
is still a generic email/password template. See the
[project structure guide](../docs/project-structure.md) for the phone/OTP plan
and next steps. No scheduling or delivery provider is configured yet.

### 1. Install dependencies
```bash
cd backend
npm install
# or: pnpm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and set your PostgreSQL credentials:
```bash
cp .env.example .env
```

### 3. Prisma Migrations
```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations in dev
npm run prisma:migrate

# Open Prisma Studio GUI
npm run prisma:studio
```

### 4. Run Development Server
```bash
npm run dev
```
