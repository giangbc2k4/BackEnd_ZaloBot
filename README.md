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

## Luồng xử lý chính

`src/index.ts` khởi tạo Express, CORS và các route. Webhook Zalo đi vào `src/routes/zalo.ts`, kiểm tra secret rồi phối hợp state, database và dịch vụ Zalo. OCR được tách tại `src/routes/ocr.ts`. Gemini/Groq là lớp AI; Supabase lưu dữ liệu; Redis hỗ trợ state tạm; cron chạy nhắc lịch; VietQR tạo dữ liệu thanh toán.

## Cấu hình môi trường đầy đủ

| Biến | Mục đích |
|---|---|
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Khóa server, tuyệt đối không đưa ra client |
| `PORT` | Cổng API, mặc định có thể dùng `3001` |
| `CLIENT_URL` | Origin frontend được phép gọi |
| `ZALO_OA_TOKEN` | Token Official Account |
| `WEBHOOK_SECRET` | Bí mật xác minh webhook |
| `GEMINI_API_KEY` | Khóa Gemini |
| `UPSTASH_REDIS_URL` | Redis TLS URL |
| `BANK_ID`, `BANK_ACCOUNT_NO`, `BANK_ACCOUNT_NAME` | Dữ liệu VietQR |
| `OWNER_CHAT_ID` | Người nhận báo cáo/nhắc việc |

Sao chép `.env.example` thành `.env`; không commit `.env`. Service-role key có toàn quyền nên chỉ được dùng phía server.

## Tích hợp và triển khai

Sau `npm run build`, chạy `npm start`. Nền tảng deploy phải hỗ trợ process lâu dài nếu dùng polling/cron trong process; với serverless, chuyển cron sang scheduler riêng. Webhook cần HTTPS công khai và URL ổn định. CORS phải giới hạn đúng frontend production.

## Checklist production

- Xác minh chữ ký/secret trước khi xử lý webhook và chống replay.
- Validate payload, giới hạn kích thước upload OCR và rate-limit endpoint tốn AI.
- Timeout/retry có kiểm soát cho Zalo, AI, Redis và Supabase.
- Không log token, CCCD, số tài khoản hoặc nội dung nhạy cảm.
- Làm cho webhook idempotent để event gửi lại không tạo hóa đơn/nhắc việc trùng.
- Thêm health check, structured logging, test route/service và tài liệu request/response.
