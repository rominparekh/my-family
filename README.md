# 🎉 Parekh Family

A private social network for celebrating the people you love. Sign in with your phone
(via a WhatsApp one-time code), add your friends and family, record their birthdays and
anniversaries, and the platform will craft a heartfelt wish — **for your approval** — and
deliver it on the day, in the recipient's timezone.

---

## What it does

- **WhatsApp OTP login.** Phone + one-time code delivered over the WhatsApp Cloud API.
  (There is no "Login with WhatsApp" OAuth and no API to read a user's contacts — see
  [Design notes](#design-notes--whatsapp-reality-check).)
- **Friends & family.** Add people manually or bulk-import from a `.vcf`/`.csv` export.
  Record relationships (spouse, child, parent…), notes, photos, and special days.
- **Discovery / auto-link.** When you add a friend whose number belongs to an existing
  (discoverable) member, we auto-link the accounts — matched via a salted phone hash, never
  by comparing raw numbers.
- **AI-crafted wishes.** Claude writes a personal message (≤ 300 chars). Optional AI image
  (≤ 3 photos). Video is a phase-2 stub. All content respects the limits: **≤ 30s video,
  ≤ 300 chars text, ≤ 3 photos.**
- **Approval workflow.** A few days before each occasion you get a WhatsApp message with
  **👍 Approve** / **✏️ Request changes** buttons. Reply `yes`/`👍` to approve, or type what
  to change and we regenerate. You can also do all of this in the web app.
- **Timezone-aware delivery.** Wishes go out at 9am in the *recipient's* local time.

## Architecture

```
Next.js (App Router)  ── UI + API routes (Vercel)
  │
  ├─ Auth: phone + WhatsApp OTP → signed JWT session cookie (jose)
  ├─ DB: Postgres (Neon serverless) via Drizzle ORM
  ├─ Media: Vercel Blob (photos)
  ├─ AI: Anthropic Claude (text) + pluggable image provider (stub → Firefly/Replicate)
  │
  └─ Orchestration:
       Vercel Cron (hourly)  →  /api/cron/scan  →  finds upcoming occasions
                                                    creates a draft + emits Inngest event
       Inngest durable fn "generate-and-approve":
            generate → request approval → waitForEvent(reply)
                     → regenerate on feedback (bounded) → sleepUntil(delivery) → deliver
       WhatsApp webhook  →  /api/webhooks/whatsapp  →  routes button taps / replies
                                                        back into the Inngest wait
```

Key files:

| Area | Path |
|---|---|
| DB schema | `src/db/schema.ts` |
| Auth | `src/lib/auth/*`, `src/app/api/auth/*`, `src/middleware.ts` |
| WhatsApp client | `src/lib/whatsapp/client.ts` |
| AI generation | `src/lib/ai/*` |
| Orchestration | `src/inngest/*`, `src/app/api/cron/scan`, `src/app/api/webhooks/whatsapp` |
| Friends/photos API | `src/app/api/friends/*` |
| UI | `src/app/(app)/*`, `src/components/*` |

## Local development

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Provision services

- **Database** — create a [Neon](https://neon.tech) Postgres DB, put its URL in `DATABASE_URL`.
- **Session secret** — `openssl rand -base64 32` → `SESSION_SECRET`.
- **Anthropic** — add `ANTHROPIC_API_KEY` (optional locally; without it a friendly fallback
  message is used so the flow still works).
- **Vercel Blob** — add a Blob store in the Vercel dashboard; it sets `BLOB_READ_WRITE_TOKEN`.
- **WhatsApp** — see [WhatsApp setup](#whatsapp-cloud-api-setup) (optional locally; without
  it, OTP codes are returned in the API response so you can still log in).

### 3. Push the schema

```bash
npm run db:push
```

### 4. Run

```bash
npm run dev                 # Next.js on :3000
npx inngest-cli@latest dev  # Inngest dev server (separate terminal) — runs the workflows
```

> **Dev login without WhatsApp:** request a code on `/login`; the 6-digit code is shown in
> the UI (and returned by `/api/auth/request-otp` as `devCode`) whenever WhatsApp creds are
> absent.

### Trigger the scheduler manually

```bash
curl http://localhost:3000/api/cron/scan
```

## WhatsApp Cloud API setup

1. Create a Meta app → add the **WhatsApp** product → note your **Phone Number ID** and a
   **permanent access token** → `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`.
2. Create and get approval for an **Authentication** message template (one body param = the
   code, plus a copy-code/URL button). Set `WHATSAPP_OTP_TEMPLATE_NAME` / `_LANG`.
3. Configure the webhook → callback URL `https://YOUR_DOMAIN/api/webhooks/whatsapp`,
   verify token = `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Subscribe to **messages**.
4. (Recommended) set `WHATSAPP_APP_SECRET` so incoming webhooks are signature-verified.

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add all env vars from `.env.example` in **Project → Settings → Environment Variables**.
3. Add **Vercel Blob** storage and **Neon** (or any Postgres) from the integrations.
4. The cron in `vercel.json` (`/api/cron/scan`, hourly) is picked up automatically. Vercel
   sets `CRON_SECRET`; the endpoint checks the `Authorization: Bearer` header.
5. Connect the Inngest Vercel integration (or set `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`)
   and register the app at `/api/inngest`.
6. Point your purchased domain at the Vercel project.

## Design notes — WhatsApp reality check

- **There is no social "Login with WhatsApp."** The only real mechanism is phone + OTP over
  the Cloud API, which is what this app does.
- **You cannot read a user's WhatsApp contacts.** Meta exposes no contacts API. "Friend
  discovery" therefore works by matching numbers *the user provides* (manual entry / file
  import) against registered, discoverable members — never by pulling a contact list.
- **Phase 2:** outbound invites to unregistered friends, AI video generation, native mobile
  app (for OS-level address-book import).

## Security

- Secrets live only in env vars; `.gitignore` excludes every `.env*` except `.env.example`.
- Sessions are httpOnly, signed JWTs (`jose`).
- Phone numbers are stored for messaging but matched for discovery via a salted SHA-256 hash.
- WhatsApp webhooks are signature-verified when `WHATSAPP_APP_SECRET` is set.
- OTPs are hashed at rest, single-use, expiring, and rate-limited by attempt count.

## Content limits

Enforced in `src/lib/constants.ts` and at generation time: **text ≤ 300 chars, photos ≤ 3,
video ≤ 30s.**
