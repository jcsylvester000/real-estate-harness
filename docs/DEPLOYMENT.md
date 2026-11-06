# Deploying Grid Agentic

Grid Agentic is a standard Next.js 16 (Node.js 22) application with a PostgreSQL database. It runs on any host that can run Node.js, or Docker, and reach PostgreSQL.

## What every deployment needs

| Item | Value |
|---|---|
| Node.js | 22 (minimum 20.12) |
| Build | `npm ci` then `npm run build` |
| Start | `npm start` (port 3000, or `PORT`) |
| Database | PostgreSQL 15+ (Neon, DigitalOcean Managed PostgreSQL, AWS RDS, Supabase, or self-hosted). The `pg_trgm` extension must be allowed (migrations create it). |
| Migrations | `npm run db:migrate` before the first start and after every update (safe to repeat) |
| Request timeout | At least 60 s for `/api/drivers/call` (AI Research turns take up to ~50 s) |

### Environment variables (minimum)

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/grid?sslmode=require` | Neon hosts use Neon's serverless driver; any other host uses node-postgres automatically (`DB_DRIVER=pg` or `neon` forces one). |
| `DATABASE_URL_UNPOOLED` | same as above without a pooler | Used by migrations (Neon: the host without `-pooler`). Optional elsewhere. |
| `DATABASE_SSL` | `no-verify` | Only if the provider uses a self-signed certificate and you do not install its CA file. |
| `APP_SECRET` | 32+ random characters | Encrypts saved AI keys. Changing it makes saved keys unreadable. Generate with `openssl rand -base64 48`. |
| `APP_ORIGIN` | `https://grid.example.com` | The public URL. |
| `GRID_ACCESS_PIN` | your own 4–8 digits | The default 4120 is public in the repository: always change it. |

Optional: `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY` (steadier web search for Research), `GRID_DAILY_AI_CAP_PHP`, team AI keys and limits (see `.env.example`). Never commit `.env.local` or `.env.production`.

### After deploying (smoke test, 5 minutes)

1. Open `https://<your-domain>/desktop`, enter the PIN.
2. Listings → Import CSV (a GRID export) → "rows read" appears.
3. Property Finder: "condo for rent in Taguig under 40k".
4. Deal Desk: "Cost to buy a ₱7.6M condo in Pasig" (Query Engine, no AI).
5. Deal Desk → ＋ Add key… → test a key → Research: "/" → Research → Zonal value.
6. Property Teaser: new presentation → Export → PowerPoint.

---

## Netlify (included configuration)

`netlify.toml` builds with `npm run build:netlify` (migrate + build) and the Next.js runtime.

1. Create a Neon database (or any PostgreSQL reachable from the internet).
2. Netlify → Add new site → Import from GitHub → pick the repository. Build settings come from `netlify.toml`.
3. Site configuration → Environment variables: the minimum set above.
4. Deploy. Netlify functions stop at 60 s; Research keeps each turn within 50 s (`RESEARCH_DEADLINE_MS`).

## Vercel

1. Import the repository in Vercel (framework: Next.js).
2. Build command: `npm run db:migrate && npm run build`. Install command: `npm ci`.
3. Environment variables: the minimum set. Functions default to 300 s with Fluid compute, so Research has room.

## DigitalOcean

### App Platform (managed, simplest)
1. Create a Managed PostgreSQL cluster (or use Neon). Copy its connection string; add the app as a trusted source.
2. Apps → Create App → GitHub → this repository. App Platform detects Node.js (Next.js) or the `Dockerfile`.
3. Buildpack settings: Build command `npm run build`; Run command `npx tsx scripts/db-migrate.ts && npm start`; HTTP port 3000.
4. Environment variables: the minimum set. For Managed PostgreSQL either set `DATABASE_SSL=no-verify` or add the cluster's CA certificate.
5. Add your domain under Settings → Domains (HTTPS is automatic).

### Droplet (a VPS you manage): see "Any VPS" below.

## Hostinger

- **VPS (recommended for full control):** follow "Any VPS" below (Ubuntu 24.04 template).
- **Web Apps Hosting (Node.js plans):** Hostinger's Node.js web app hosting supports Next.js. Connect the GitHub repository, set Node 22, build `npm run build`, start `npm start`, and add the environment variables. These plans include MySQL, not PostgreSQL, so use an external PostgreSQL such as Neon or DigitalOcean for `DATABASE_URL`, and run `npm run db:migrate` once from your computer against that database.

## Any VPS (DigitalOcean Droplet, Hostinger VPS, AWS Lightsail, Linode, Vultr…)

### Option A: Docker Compose (app + PostgreSQL on one server)
```bash
# on the server (Ubuntu 24.04), as a sudo user
curl -fsSL https://get.docker.com | sh
git clone https://github.com/<owner>/<repo>.git grid && cd grid
cp .env.example .env.production   # fill APP_SECRET, APP_ORIGIN, GRID_ACCESS_PIN
export POSTGRES_PASSWORD='a-long-random-password'
docker compose up -d --build      # migrations run automatically at start
```
Then HTTPS with Caddy (automatic certificates):
```bash
sudo apt install -y caddy
echo 'grid.example.com {
  reverse_proxy 127.0.0.1:3000
}' | sudo tee /etc/caddy/Caddyfile && sudo systemctl reload caddy
```
Updates: `git pull && docker compose up -d --build`. Backups: `docker compose exec db pg_dump -U grid grid > backup.sql` (schedule it with cron and copy off the server).

### Option B: Node.js + PM2 + Nginx (no Docker)
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs nginx
git clone https://github.com/<owner>/<repo>.git grid && cd grid
cp .env.example .env.local        # fill DATABASE_URL, APP_SECRET, APP_ORIGIN, GRID_ACCESS_PIN
npm ci && npm run db:migrate && npm run build
sudo npm i -g pm2 && pm2 start npm --name grid -- start && pm2 save && pm2 startup
```
Nginx site (then `sudo certbot --nginx` for HTTPS):
```nginx
server {
  server_name grid.example.com;
  client_max_body_size 12m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }
}
```

## Docker image only (Render, Railway, Fly.io, Google Cloud Run, Azure)
`docker build -t grid-agentic .` then run with your environment variables; the container migrates the database and starts on port 3000.

## Notes
- PDF and photo reading (OCR) for Deal Desk runs in the browser; `npm run build` copies its files into `public/ocr` and `public/pdfjs`.
- Research reads web pages from the server: allow outbound HTTPS. Never set `RESEARCH_ALLOW_PRIVATE_NETWORK` in production.
- Keep the repository's `.env.example` as the reference for every setting.
