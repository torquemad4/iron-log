#!/usr/bin/env bash
# Iron Log — one-command Cloudflare deployment.
#
#   bash deploy.sh
#
# Idempotent: safe to re-run. Anything already created is detected and skipped,
# so a failed run can just be run again rather than unpicked.
set -uo pipefail
cd "$(dirname "$0")" || exit 1

BOLD=$'\e[1m'; GRN=$'\e[32m'; YEL=$'\e[33m'; RED=$'\e[31m'; OFF=$'\e[0m'
say()  { echo -e "\n${BOLD}==> $*${OFF}"; }
ok()   { echo -e "${GRN}  ok${OFF} $*"; }
warn() { echo -e "${YEL}  !${OFF} $*"; }
die()  { echo -e "${RED}  x${OFF} $*"; exit 1; }

PROJECT=gym-torquemada
DB=ironlog
APP_HOST=gym.torquemada.uk

# ---------------------------------------------------------------- 0. prereqs
say "Checking prerequisites"
command -v node >/dev/null || die "node is not installed.  sudo apt install nodejs npm"
command -v npm  >/dev/null || die "npm is not installed.   sudo apt install npm"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 18 ] || die "node 18+ required, found $(node -v)"
ok "node $(node -v)"

if [ ! -d node_modules ]; then
  say "Installing wrangler (first run only)"
  npm install --silent || die "npm install failed"
fi
WR="npx --no-install wrangler"
ok "wrangler $($WR --version 2>/dev/null | tail -1)"

# ---------------------------------------------------------------- 1. login
say "Cloudflare login"
if $WR whoami 2>&1 | grep -qi "not authenticated\|you are not logged in"; then
  warn "Not logged in — a browser window will open. Approve it, then come back here."
  $WR login || die "login failed"
else
  ok "already logged in as: $($WR whoami 2>&1 | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+' | head -1)"
fi

# ---------------------------------------------------------------- 2. D1
say "D1 database '$DB'"
DB_ID=$(node -e "
  const {execSync}=require('child_process');
  try{
    const out=execSync('npx --no-install wrangler d1 list --json',{stdio:['ignore','pipe','ignore']}).toString();
    const j=JSON.parse(out);
    const hit=(Array.isArray(j)?j:[]).find(d=>d.name==='$DB');
    if(hit) process.stdout.write(hit.uuid||hit.database_id||'');
  }catch(e){}
" 2>/dev/null)

if [ -z "$DB_ID" ]; then
  warn "not found — creating it"
  $WR d1 create "$DB" >/dev/null 2>&1
  sleep 2
  DB_ID=$(node -e "
    const {execSync}=require('child_process');
    const out=execSync('npx --no-install wrangler d1 list --json',{stdio:['ignore','pipe','ignore']}).toString();
    const j=JSON.parse(out);
    const hit=(Array.isArray(j)?j:[]).find(d=>d.name==='$DB');
    if(hit) process.stdout.write(hit.uuid||hit.database_id||'');
  " 2>/dev/null)
fi
[ -n "$DB_ID" ] || die "could not create or find the D1 database"
ok "database_id $DB_ID"

# Write the real id into wrangler.toml, replacing the local-testing placeholder.
node -e "
  const fs=require('fs');
  let t=fs.readFileSync('wrangler.toml','utf8');
  t=t.replace(/^database_id = \".*\"$/m, 'database_id = \"$DB_ID\"');
  fs.writeFileSync('wrangler.toml',t);
"
ok "wrangler.toml updated"

# ---------------------------------------------------------------- 3. schema
say "Creating tables"
$WR d1 execute "$DB" --remote --file=./schema.sql --yes >/dev/null 2>&1 \
  && ok "schema applied" \
  || warn "schema step reported an issue — tables may already exist (CREATE TABLE IF NOT EXISTS), continuing"

# ---------------------------------------------------------------- 4. project
say "Pages project '$PROJECT'"
if $WR pages project list 2>/dev/null | grep -q "\b$PROJECT\b"; then
  ok "already exists"
else
  $WR pages project create "$PROJECT" --production-branch main >/dev/null 2>&1 \
    && ok "created" || die "could not create the Pages project"
fi

# ---------------------------------------------------------------- 5. deploy
say "Deploying"
DEPLOY_OUT=$($WR pages deploy public --project-name "$PROJECT" --commit-dirty=true 2>&1)
echo "$DEPLOY_OUT" | tail -20
URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9.-]+\.pages\.dev' | tail -1)
[ -n "$URL" ] || die "deploy did not report a URL — see output above"
ok "live at $URL"

# ---------------------------------------------------------------- 6. Access
# ⛔ This runs BEFORE the custom domain, and the domain step below only happens
#    if this succeeds. The protection is a PRECONDITION of the public hostname,
#    not a reminder printed underneath it after the deploy already looks done.
say "Cloudflare Access"

ENVFILE=.cf-access.env
# shellcheck source=/dev/null
[ -f "$ENVFILE" ] && . "$ENVFILE"

WHO=$($WR whoami --json 2>/dev/null)

# -- account id (asked for only if there is genuine ambiguity)
if [ -z "${CF_ACCOUNT_ID:-}" ]; then
  ACCTS=$(printf '%s' "$WHO" | node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      try{
        const j=JSON.parse(s);
        const a=Array.isArray(j.accounts)?j.accounts:[];
        for(const x of a) console.log((x.id||x.account_id||'')+'\t'+(x.name||x.account_name||''));
      }catch(e){}
    });
  ")
  COUNT=$(printf '%s' "$ACCTS" | grep -c . || true)
  if [ "$COUNT" = "1" ]; then
    CF_ACCOUNT_ID=$(printf '%s' "$ACCTS" | cut -f1)
    ok "account $(printf '%s' "$ACCTS" | cut -f2) ($CF_ACCOUNT_ID)"
  elif [ "$COUNT" = "0" ]; then
    warn "could not read your account id from wrangler"
    read -r -p "  Cloudflare account id: " CF_ACCOUNT_ID
  else
    echo "  More than one account. Which one hosts torquemada.uk?"
    printf '%s\n' "$ACCTS" | nl -w3 -s'. ' | sed 's/\t/  —  /'
    read -r -p "  number: " PICK
    CF_ACCOUNT_ID=$(printf '%s\n' "$ACCTS" | sed -n "${PICK}p" | cut -f1)
  fi
fi
[ -n "${CF_ACCOUNT_ID:-}" ] || die "no account id — cannot configure Access"

# -- API token (entered once, then remembered in .cf-access.env, which is gitignored)
if [ -z "${CF_API_TOKEN:-}" ]; then
  cat <<TOK

  Access needs an API token once. Wrangler's browser login cannot create Access
  applications; this is the one extra credential the platform needs, and app two
  and three will reuse it.

    dash.cloudflare.com -> My Profile -> API Tokens -> Create Token
    -> Create Custom Token
       Permissions:        Account | Access: Apps and Policies | Edit
                           Account | Cloudflare Pages             | Edit
       Account Resources:  Include | the account above

TOK
  read -r -s -p "  CF_API_TOKEN: " CF_API_TOKEN; echo
fi
[ -n "${CF_API_TOKEN:-}" ] || die "no API token. Refusing to continue — without Access the custom domain would be public."

# -- who is allowed in
if [ -z "${ACCESS_EMAILS:-}" ]; then
  DEF=$(printf '%s' "$WHO" | node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      try{ const j=JSON.parse(s); process.stdout.write(j.email||j.user?.email||''); }catch(e){}
    });
  ")
  read -r -p "  Email(s) allowed in, comma separated${DEF:+ [$DEF]}: " ACCESS_EMAILS
  ACCESS_EMAILS=${ACCESS_EMAILS:-$DEF}
fi
[ -n "${ACCESS_EMAILS:-}" ] || die "no email given — an allow policy needs at least one"

# -- remember it so the next run and the next app do not ask again
umask 077
cat > "$ENVFILE" <<ENVEOF
# Written by deploy.sh. Gitignored — this file holds a real API token.
CF_ACCOUNT_ID=$CF_ACCOUNT_ID
CF_API_TOKEN=$CF_API_TOKEN
ACCESS_EMAILS=$ACCESS_EMAILS
ENVEOF
chmod 600 "$ENVFILE"

# The pages.dev hostname is public too, so it gets its own application.
# Protecting only the custom domain would leave the back door wide open.
PAGES_HOST="$PROJECT.pages.dev"

ACCESS_OK=1
for H in "$PAGES_HOST" "$APP_HOST"; do
  echo "  -- $H"
  CF_API_TOKEN="$CF_API_TOKEN" node access.mjs "$CF_ACCOUNT_ID" "$H" "$ACCESS_EMAILS" || ACCESS_OK=0
done

# ---------------------------------------------------------------- 7. domain
# `wrangler pages domain add` was removed in wrangler 4.x, so this goes through
# the Pages REST API. Still gated on ACCESS_OK: the protection remains a
# precondition of the public hostname.
say "Custom domain $APP_HOST"
CUSTOM=""
if [ "$ACCESS_OK" != "1" ]; then
  warn "Access is NOT confirmed, so the custom domain will not be attached."
  warn "Fix the error above and re-run: bash deploy.sh"
  warn "Nothing is lost — the app is deployed, it just has no public hostname yet."
elif CF_API_TOKEN="$CF_API_TOKEN" node domain.mjs "$CF_ACCOUNT_ID" "$PROJECT" "$APP_HOST"; then
  CUSTOM="https://$APP_HOST"
else
  warn "the custom domain was not attached — see the error above."
  warn "Access is confirmed, so nothing is exposed. Re-run once that is fixed:"
  warn "  bash deploy.sh"
fi

# ---------------------------------------------------------------- done
cat <<EOF

${BOLD}${GRN}Deployed.${OFF}
  pages.dev:      $URL
  custom domain:  ${CUSTOM:-not attached — see the warning above}
  Access:         $([ "$ACCESS_OK" = "1" ] && echo "on, for $ACCESS_EMAILS" || echo "${RED}NOT CONFIRMED${OFF}")

${BOLD}One residual gap${OFF}, so you know rather than find out:
  Per-deployment preview URLs (a hash in front of $PAGES_HOST) are not covered
  by these two applications. Turn preview deployments off in the Pages project
  settings if that bothers you.

To ship a change later:  bash deploy.sh
EOF
