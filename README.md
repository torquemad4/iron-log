# Iron Log

Karl's training log. Cloudflare Pages + Pages Functions + D1.

Replaces the localStorage artifact, which only ever existed on one browser on one
machine. History now lives server-side in D1 and is readable from any device.

---

## What it does

- Opens straight onto today's session. Three exercises, no navigation to reach them.
- Shows last session's numbers per lift and prefills reps/weight from them.
- One tap logs a set. Rest timer starts automatically.
- **Offline-first.** Sets are written to `localStorage` the instant you tap, then
  synced to D1 in the background. If the gym network drops mid-set you lose nothing;
  the queue drains when you're back. The header pill tells you which state you're in.
- "End session" closes the session in D1 and confirms what was stored.

The programme lives in `public/programme.js` — one place, edit it there.

---

## Deploy it

```bash
bash deploy.sh
```

That is the whole thing. The script is idempotent — if it fails halfway, fix the cause
and run it again; anything already created is detected and skipped.

It will:

1. check node and install wrangler on first run
2. open a browser once for Cloudflare login
3. create the D1 database and write its real id into `wrangler.toml`
4. create the tables from `schema.sql`
5. create the Pages project and deploy
6. create the Access application and allow policy, and verify them
7. attach the custom domain — **only if step 6 succeeded**

It prints the live URL at the end.

### Access is not optional, and not manual

⭐ **`deploy.sh` creates the Cloudflare Access application itself** and will not attach
`gym.torquemada.uk` unless it succeeds. There is nothing to remember afterwards and no
window in which the URL is live but unprotected.

It protects **two** hostnames — the custom domain and `ironlog.pages.dev` — because
protecting only the pretty one leaves the back door open.

The first run asks for an API token once, then stores it in `.cf-access.env`
(gitignored, `chmod 600`) so no later run asks again. To create it:

> dash.cloudflare.com → **My Profile** → **API Tokens** → **Create Token**
> → **Create Custom Token**
> Permissions: **Account | Access: Apps and Policies | Edit**
> Account Resources: **Include** | your account

The provisioning itself lives in **`access.mjs`**, deliberately separate from
`deploy.sh`. ⭐ It is the platform pattern — app two copies that file rather than
reinventing it, and Clousto Kitchen's two-email policy is a comma in `ACCESS_EMAILS`,
not a build.

**Residual gap, stated rather than hidden:** per-deployment preview URLs (a hash in
front of `ironlog.pages.dev`) are not covered. Turn preview deployments off in the
Pages project settings if that matters.

### Custom domain

`torquemada.uk` is already on Cloudflare DNS, so the script attaches
`gym.torquemada.uk` itself and Cloudflare creates the CNAME. The certificate takes a
few minutes to issue. If the CLI cannot claim it, the script says so and the dashboard
path is Pages project → **Custom domains** → **Set up a custom domain**.

---

## Local development

```bash
npm install
npm run dev          # http://localhost:8788 — start this FIRST
npm run db:local     # then create the local tables
```

⚠️ **Order matters, and it is not the obvious one.** `wrangler pages dev` creates the
local D1 file on first start; seeding before it exists puts the tables somewhere the
dev server never reads, and every endpoint answers `no such table: sets`. Start the
server, then seed, then reload.

The local database is a separate sqlite file under `.wrangler/` — nothing you do
locally touches production.

---

## Deploying changes

```bash
bash deploy.sh
```

⚠️ **There is no GitHub build integration.** The repo is version control — history and
rollback — not a deploy trigger. Pushing to `main` deploys nothing; `deploy.sh` pushes
straight to Cloudflare with wrangler. Committing and deploying are two separate acts.

---

## Costs

Nothing. D1's free tier is 5 GB and 5 million row reads a day; a training session is
about ten rows. Pages is free for this. Access is free up to 50 users.

---

## Notes on the design

**Why the client generates set IDs.** Every set gets a UUID from the browser, and the
insert is `INSERT OR IGNORE`. A retried batch after a dropped connection writes
nothing the second time, so the offline queue can be aggressive about resending
without ever creating phantom sets.

**Why the session end counts sets back out of D1.** The confirmation is built from
what actually got stored, not from what the browser thought it sent. If a set failed to
sync, the number you see reflects reality rather than optimism.

**Why there is no second store.** ⭐ D1 is the whole record. An earlier draft also
pushed each finished session into a Notion database, which meant two places holding the
same training history and a reconciliation problem the first time they disagreed.
Anything hosted on Cloudflare keeps its data on Cloudflare.
