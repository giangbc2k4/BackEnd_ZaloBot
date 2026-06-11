# BackEnd_ZaloBot

TypeScript backend for a rental-house management project with Zalo bot routes, OCR, AI assistants, payment helpers, scheduled reminders, and Supabase integration.

## Features

- Express API server.
- Zalo route handlers.
- OCR route for extracting information from uploaded content.
- AI service integrations with Gemini and Groq.
- Supabase database client.
- Redis support through `ioredis`.
- VietQR payment helper.
- Scheduled reminder job with `node-cron`.
- Environment-based configuration.

## Tech Stack

- Node.js
- TypeScript
- Express 5
- Supabase
- Redis
- Gemini API
- Groq API
- VietQR

## Project Structure

```text
src/index.ts                 Server entry point
src/routes/                  API routes
src/services/ai/             Gemini and Groq services
src/services/payment/        VietQR helper
src/services/zalo/           Zalo API integration
src/config/supabase.ts       Supabase client config
src/cron/reminderJob.ts      Scheduled reminder job
```

## Getting Started

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the required credentials for:

- Supabase
- Zalo API
- Gemini or Groq
- Redis
- Payment/VietQR settings

Keep production secrets out of the repository.

## Scripts

```bash
npm run dev
npm run build
npm run start
```

## API Areas

- `src/routes/zalo.ts`: Zalo webhook/API handling.
- `src/routes/ocr.ts`: OCR endpoint.
- `src/services/db.ts`: database operations.
- `src/services/state.ts`: runtime state helpers.

## Roadmap

- Add endpoint documentation with request/response examples.
- Add deployment instructions.
- Add basic tests for routes and services.
