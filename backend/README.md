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
│   ├── middlewares/           # Auth, error handling, rate limiters, validation (.gitkeep)
│   ├── routes/                # Express routing endpoints (.gitkeep)
│   ├── services/              # Business logic & Prisma queries (.gitkeep)
│   ├── types/                 # Custom type definitions (.gitkeep)
│   ├── utils/                 # Logger, ApiError, ApiResponse, asyncHandler (.gitkeep)
│   └── validators/            # Zod validation schemas (.gitkeep)
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
