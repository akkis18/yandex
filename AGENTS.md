# AGENTS.md - Taxi Lead Bot Systems Log

Welcome, Agent! This file is the Master Log and Architecture Reference for the **Taxi Lead SaaS Telegram Bot**. It outlines the entire codebase, what has been implemented, how files interact, database schemas, and a history of all developer work. 

**DO NOT delete this file. Always append new work, features, and fixes at the bottom of this document when completing a task.**

---

## 🚀 1. Systems Overview & Architecture

This is a multi-tenant Taxi Lead generation SaaS Telegram bot designed to onboard taxi drivers (leads) and route their details to operator groups and admin panels.

### Technology Stack
* **Language**: Node.js, TypeScript (Strict ESM loader mode)
* **Framework**: Telegraf.js (Telegram Bot API wrapper)
* **ORM**: Prisma (with PostgreSQL client)
* **Database**: PostgreSQL (with in-memory fallback in local development)
* **Validation**: Zod (for configuration schema validations)

### Folder Structure
```
yandex/
├── src/
│   ├── bot/
│   │   └── bootstrap.ts        # Main bot entry point, hears buttons, actions
│   ├── config/
│   │   └── env.ts              # Zod validation schema for process.env configurations
│   ├── database/
│   │   └── client.ts           # PrismaClient initialization & connection helpers
│   ├── handlers/
│   │   └── README.md
│   ├── keyboards/
│   │   └── registration.keyboard.ts # Reusable driver wizard & welcome layouts
│   ├── middlewares/
│   │   ├── admin.middleware.ts # Admin callback authorization protection
│   │   ├── error.middleware.ts # Global panic catcher & logger
│   │   ├── logger.middleware.ts# Command processing duration logger
│   │   └── start-param.middleware.ts # Deep-link parameter parsing
│   ├── prisma/
│   │   └── schema.prisma       # Database design
│   ├── scenes/
│   │   └── registration.wizard.ts # Mandatory 5-step Uzbek driver wizard
│   ├── services/
│   │   ├── admin.service.ts    # Statistics & compiled document drivers exporter
│   │   ├── lead.service.ts     # Save lead to DB, safe-notify operator groups
│   │   └── taxipark.service.ts # Find/register taxipark tenant contexts
│   ├── types/
│   │   └── context.ts          # Strong typings for session & state context
│   ├── utils/
│   │   ├── formatter.ts        # Clean Uzbek formatting (+998 phone, dates)
│   │   └── logger.ts           # Unified timestamp console logger
│   └── index.ts                # App bootstrapper
├── .agentignore                # AI token-conserving exclusion paths
├── AGENTS.md                   # THIS MASTER LOG FILE
└── package.json                # Project configurations & scripts
```

---

## 🗄️ 2. Database Models & Prisma Schema

The Prisma database design (`src/prisma/schema.prisma`) consists of two core tables:

### 1. `Taxipark`
Holds active tenants (taxi parks connected to the SaaS platform).
* `id` (String, Primary Key)
* `name` (String) - Taxipark name
* `slug` (String, Unique) - Deep link query slug (e.g., `t.me/bot?start=slug`)
* `telegram_group_id` (String) - Operator chat ID where leads are dispatched
* `is_active` (Boolean) - Tenant status
* `created_at` (DateTime)

### 2. `Lead`
Holds registered driver applications.
* `id` (String, Primary Key)
* `taxipark_id` (String) - Foreign key referencing `Taxipark`
* `fullname` (String) - Extracted automatically from Telegram profile
* `phone` (String) - Uzbekistan format
* `license_front_file_id` (String) - Telegram persistent image file ID
* `license_back_file_id` (String)
* `tex_passport_front_file_id` (String)
* `tex_passport_back_file_id` (String)
* `status` (Enum: `NEW`, `CONTACTED`, `APPROVED`, `REJECTED`)
* `created_at` (DateTime)

---

## 🔄 3. Driver Registration Wizard Flow

Located in `src/scenes/registration.wizard.ts`.
This is a **strictly 5-step, fully mandatory Uzbek language wizard**:

1. **Step 1 (Phone Number)**: Requested via a native `📱 Kontaktni ulashish` contact-request button or custom typing.
2. **Step 2 (License FRONT)**: Requests a photo of the front of the driver's license.
3. **Step 3 (License BACK)**: Requests a photo of the back of the driver's license.
4. **Step 4 (Tex Passport FRONT)**: Requests STS front photo.
5. **Step 5 (Tex Passport BACK)**: Requests STS back photo.
6. **Step 6 (Confirmation Card)**: Displays a Markdown summary card of uploaded assets. Once the driver presses `✅ Tasdiqlash`, it persists the lead data and triggers operator notification.

**Note**: All steps are fully mandatory. The skip (`⏭️ O'tkazib yuborish`) button was completely deleted from code and keyboards to satisfy database constraints.

---

## 👑 4. Administrative Features

### Admin Commands Menu
Authorized users listed in the `.env` `ADMIN_USER_IDS` environment variable can access:
* **`📊 Statistika`**: Computes total registered leads, new applications, contacted, and approved statistics.
* **`📥 Haydovchilarni yuklash`**: Generates a `.txt` report of all registered drivers with their details using in-memory streams and delivers it as an attachment.
* **`⚙️ Sozlamalar`**: Displays node runtime environment configurations.

---

## 🛠️ 5. Completed Task History & Changelog

### Task 1: Wizard Refactoring (Uzbek, Mandatory)
* **Action**: Translated all steps to pure Uzbek. Removed skip keyboard buttons.
* **Benefit**: Guaranteed that file IDs for back side images are never null, eliminating Prisma DB insertion crashes.

### Task 2: Operator Group Resiliency Fix
* **Action**: Separated the database save from the Telegram operator group notification in `LeadService.handleRegistrationCompletion`.
* **Benefit**: If the Telegram operator group notification fails (e.g., bot not added to group or dummy ID), it logs a warning in the background but **does not** post a scary system error to the driver. The driver sees their congratulations card cleanly.

### Task 3: Command Sidebar Menu
* **Action**: Registered commands (`/start`, `/help`, `/admin`) using `this.bot.telegram.setMyCommands` on startup inside `bootstrap.ts`.
* **Benefit**: Provides direct sidebar command accessibility to users in their Telegram app client.

### Task 4: Interactive Loading Indication
* **Action**: Intercepted the clicks for `📊 Statistika`, `📥 Haydovchilarni yuklash`, and `⚙️ Sozlamalar` inside `bootstrap.ts`. Immediate delivery of a temporary `⏳ Ma'lumotlar yuklanmoqda...` message is executed. It is deleted immediately once the database fetches or document compilations finish.
* **Benefit**: Prevents laggy-feeling experiences for administrators.

### Task 5: Mock Taksopark Env Fallback Fix
* **Action**: Updated `findById` and `findBySlug` database error catch fallbacks in `src/services/taxipark.service.ts` to fetch `process.env.OPERATOR_GROUP_ID` rather than hardcoding a dummy ID.
* **Benefit**: Ensures operator cards are delivered to the correct operator group in `.env` even in local database-less mode.

### Task 6: Premium Unified Congratulations Card
* **Action**: Updated both driver and admin congrats text inside `registration.wizard.ts` to output a gorgeous card. Shows Yandex Pro app links for Play Store / App Store and reassures them that *"Tez orada operatorimiz siz bilan bog'lanadi."*.

### Task 7: Native HTTP Health-Check Server
* **Action**: Implemented a lightweight, zero-dependency HTTP server using Node's native `http` module inside `src/index.ts` listening on `PORT` (default: 3000). Serves a `/health` endpoint.
* **Benefit**: Started **before** the blocking `this.bot.launch()` thread in `index.ts`. This guarantees that the HTTP server binds to the port immediately, so Render's port scan succeeds instantly and marks the service `Live`, while the bot runs in the background. It also serves as an endpoint for UptimeRobot to keep the bot awake 24/7.

### Task 8: Global Uncaught Error Logging
* **Action**: Registered process-level listeners for `unhandledRejection` and `uncaughtException` inside `src/index.ts`.
* **Benefit**: Guarantees that any asynchronous polling conflicts or background connection errors on Render are captured with exact stack traces, preventing silent exits and simplifying diagnostics.

### Task 9: Automatic Database Seeding & Upsert on Startup
* **Action**: Added `ensureDefaultTaxipark()` static method to `TaxiparkService` and triggered it inside `BotBootstrap.start()` right after database connection.
* **Benefit**: Automatically detects if the default taxipark ID is missing in a fresh production database and seeds it. If it exists but the `.env` `OPERATOR_GROUP_ID` changed, it automatically updates the row, preventing foreign key constraint errors (`leads_taxipark_id_fkey`) when drivers register.

---

## 📋 6. Future Work: Production Deployment Checklist

If you are a deployment agent or developer taking over, execute these steps for Production:

1. **Database Setup**:
   * Create a free serverless database on **Neon.tech** (100% free forever, no card required).
   * Retrieve the connection string.
2. **Web Hosting Setup (100% Free - Render.com)**:
   * Create a free account on **Render.com** (100% free tier for Web Services, **no credit card required**).
   * Connect your GitHub repository containing the bot code.
3. **Environment Variables Config (.env)**:
   Set these in the Render Dashboard under **Environment Variables**:
   ```env
   NODE_ENV=production
   PORT=3000
   TELEGRAM_BOT_TOKEN=your_production_token
   DATABASE_URL=postgresql://user:pass@ep-host.neon.tech/dbname?sslmode=require
   ADMIN_USER_IDS=311574536,your_admin_id
   OPERATOR_GROUP_ID=-1002339537567
   ```
4. **Database Migration**:
   * Run the production schema migrations command:
     `npx prisma db push --schema=src/prisma/schema.prisma`
5. **Render Settings**:
   * Build Command: `npm run build`
   * Start Command: `npm run start`
6. **Keep Active 24/7 (UptimeRobot - 100% Free)**:
   * Create a free account on [UptimeRobot](https://uptimerobot.com/).
   * Create an HTTP Monitor pointing to: `https://your-render-app-name.onrender.com/health` (ping every 5 or 10 minutes).
   * This keeps the Render container from going to sleep, ensuring your bot is always online 24/7 for $0!
