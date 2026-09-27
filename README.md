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

- **Planner tab.** Every day has a morning slot and a bonus slot. Tap one, pick
  exercises from the library (or add a new one — banded or weighted, sets, reps,
  suggested load), then **lock** it. A locked slot is what the Log shows that day;
  locking is enforced by the server, so nothing edits it without an unlock first.
  Bookmarkable at `/#planner`.
- **Rep maxes.** Every exercise has a history of the heaviest load for each rep
  count — Trainerize's history (imported) merged with everything logged here.
  "Maxes" on any card in the Log, or tap an exercise in the Planner's library.

**Where the programme lives.** A locked planner slot (D1, `plan_slots`) wins. Any
day or slot with nothing locked falls back to `public/programme.js`, which is also
the seed for the exercise library. So the planner can be filled in a day at a time
without the Log ever going blank.

### Importing rep maxes from Trainerize

⚠️ **Trainerize has no export for workout history.** Its only CSV export is the
client contact list; workout history, stats and personal bests cannot be exported
([Trainerize help](https://help.trainerize.com/hc/en-us/articles/31089834946324-What-Information-Can-Be-Exported-from-ABC-Trainerize)).
So they come out through **[agentic-fitness-sync](https://github.com/versantus/agentic-fitness-sync)**
(MIT, unofficial): it logs in as Karl, reads his own workouts read-only, and
`trainerize export` writes one CSV row per logged set. It was read in full before
use — the password goes only to `api.trainerize.com`. Trainerize's terms may
restrict automated access; it was used once, deliberately, for Karl's own data.
It is run on Karl's machine from a packaged `trainerize-export-v1.zip` (not in this
repo) so the password never leaves it. Login is `csainzmartinez@gmail.com` on
`sophierayfitness.trainerize.com`.

Fallback if that ever stops working: screenshots of the Trainerize app, or the
hand-filled template `public/rep-maxes-template.csv`.

Then, with the CSV:

```bash
node scripts/import-rep-maxes.mjs export.csv > rep-maxes.sql   # prints SQL, writes nothing
npx wrangler d1 execute ironlog --remote --file=rep-maxes.sql
```

It reads columns by name, keeps only the heaviest set per exercise × reps × date,
and skips sets with no load. Tested against agentic-fitness-sync's own demo export
(5,553 sets → 2,203 rows); not yet against Karl's real one.
It also lists exercise names that are not in the library; map them in `RENAME`
first, or "Dumbbell Row" and "Single-Arm DB Row" become two lifts with two
histories. Re-running an import is harmless: row ids come from the content.

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

## Deploying from another machine

`deploy.sh` normally leans on `wrangler login`, whose OAuth token is stored on the
machine that ran it. That is why the first deploy had to happen at the keyboard. To
run it anywhere else, hand wrangler a token instead — it reads `CLOUDFLARE_API_TOKEN`
natively, skips the browser entirely, and the script then needs no input at all.

**Make a deploy-only token** at dash.cloudflare.com → My Profile → API Tokens →
Create Custom Token. It is deliberately separate from the one on Skunkworks, so the
travelling copy can be revoked on its own without breaking anything at home:

| Scope | Permission |
| --- | --- |
| Account | Cloudflare Pages — Edit |
| Account | D1 — Edit |
| Account | Access: Apps and Policies — Edit |
| Account | Account Settings — Read |
| Zone | DNS — Edit |
| Zone | Zone — Read |

Account Resources: include the account. Zone Resources: include `torquemada.uk`.

**Then, on the other machine:**

```bash
git clone git@github.com:torquemad4/iron-log.git && cd iron-log
export CLOUDFLARE_API_TOKEN=...            # the deploy-only token
export CLOUDFLARE_ACCOUNT_ID=...           # the account holding torquemada.uk
bash deploy.sh
```

Who is let in comes from `ACCESS_EMAILS` in `app.conf` — edit it there and redeploy.

That runs start to finish unattended. The one credential covers all of it: wrangler
uses it to deploy, and `access.mjs` and `domain.mjs` reuse it for the Access
applications and the DNS record.

Two things worth knowing rather than discovering:

- **The token is not written to disk on that machine.** When it arrives via
  `CLOUDFLARE_API_TOKEN`, `deploy.sh` deliberately skips writing `.cf-access.env`,
  so nothing is left behind on hardware that may not be yours. It lives in the shell
  and dies with it. On Skunkworks, where there is no env var, the file is still
  written and reused as before.
- **Revoking it is the whole point.** If a machine is lost or you stop trusting it,
  delete that one token in the dashboard. Skunkworks keeps working, because its
  OAuth login and its own `.cf-access.env` are untouched.

This does not change what deploying *is*. There is still no build integration and no
CI: pushing to `main` deploys nothing, and someone still has to run `deploy.sh`
on purpose. It only removes the requirement that the someone be sitting at Skunkworks.

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
