# VPS deploy checklist

## 1. Prepare env
1. Copy `.env.example` to `.env.local` (or your process manager env file).
2. Fill all secrets and domain URLs.
3. Do not commit `.env.local`.

## 2. Build and run apps
```bash
npm ci
npm run build
```

Run Next.js app on port `3000` and auth server on port `3001` with PM2 (example):

```bash
pm2 start "npm run start:web" --name partson-web
pm2 start "npm run start:auth" --name partson-auth
pm2 save
pm2 startup
```

## 3. Configure Nginx
1. Copy `deployment/nginx/partson.conf` to `/etc/nginx/sites-available/partson.conf`.
2. Replace `example.com` with your real domain.
3. Enable site and reload:

```bash
sudo ln -s /etc/nginx/sites-available/partson.conf /etc/nginx/sites-enabled/partson.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Issue SSL certificate (Let's Encrypt)
```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com --redirect --agree-tos -m you@example.com
```

Check auto-renew:

```bash
sudo certbot renew --dry-run
```

## 5. Security checks
1. Verify HTTPS works for `https://example.com`.
2. Verify `https://example.com/auth/telegram` is reachable through Nginx proxy.
3. Ensure `CORS_ORIGINS` contains only trusted domains.
4. Confirm no secrets remain in git history.
5. Rotate all keys that were ever committed in `.env.local` before going live.

## 6. Google Search Console checklist
1. Add property for your production domain (`Domain` property preferred).
2. Verify ownership:
   - Domain property: DNS TXT record at registrar/DNS provider.
   - URL-prefix property: either
     - HTML file in `public/google*.html`, or
     - meta tag via `GOOGLE_SITE_VERIFICATION` env var.
3. After deploy, check:
   - `https://example.com/robots.txt`
   - `https://example.com/sitemap.xml`
   - `https://example.com/product/sitemap.xml`
4. Submit sitemaps in Search Console:
   - `https://example.com/sitemap.xml`
   - `https://example.com/product/sitemap.xml`
5. Run URL Inspection for homepage and one product URL, then request indexing if needed.
