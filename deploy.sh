#!/usr/bin/env bash
# Platform deployment — one command, any app on torquemada.uk.
#
#   bash deploy.sh
#
# ⛔ This file is IDENTICAL across every app. Everything app-specific lives in
#    app.conf next to it. If you find yourself editing this file for one app,
#    the thing you want is a new variable in app.conf.
#
# Idempotent: anything already created is detected and skipped, so a failed run
# can just be run again rather than unpicked.
set -uo pipefail
cd "$(dirname "$0")" || exit 1

BOLD=$'\e[1m'; GRN=$'\e[32m'; YEL=$'\e[33m'; RED=$'\e[31m'; OFF=$'\e[0m'
say()  { echo -e "\n${BOLD}==> $*${OFF}"; }
ok()   { echo -e "${GRN}  ok${OFF} $*"; }
warn() { echo -e "${YEL}  !${OFF} $*"; }
die()  { echo -e "${RED}  x${OFF} $*"; exit 1; }

[ -f app.conf ] || die "app.conf is missing — it defines which app this is."
# shellcheck source=/dev/null
. ./app.conf
: "${PROJECT:?app.conf must set PROJECT}"
: "${APP_HOST:?app.conf must set APP_HOST}"
: "${APP_NAME:=$PROJECT}"
: "${D1_DATABASE:=}"
: "${KV_BINDINGS:=}"
export APP_NAME

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
ok "app: $APP_NAME  ->  $APP_HOST  (project $PROJECT)"

# Anything remembered from a previous run (account id, token, allowed emails).
# Sourced before login so a stored token can stand in for the browser flow.
ENVFILE=.cf-access.env
# shellcheck source=/dev/null
[ -f "$ENVFILE" ] && . "$ENVFILE"

# ---------------------------------------------------------------- 1. login
#   CLOUDFLARE_API_TOKEN  — wrangler reads this natively; no browser, runs
#                           unattended on any machine. The portable path.
#   wrangler login        — interactive OAuth, stored on this machine only.
say "Cloudflare login"
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  $WR whoami >/dev/null 2>&1 \
    && ok "using CLOUDFLARE_API_TOKEN — no browser login needed" \
    || die "CLOUDFLARE_API_TOKEN is set but wrangler rejected it. Check it has not expired and is scoped to the right account."
  : "${CF_API_TOKEN:=$CLOUDFLARE_API_TOKEN}"
  : "${CF_ACCOUNT_ID:=${CLOUDFLARE_ACCOUNT_ID:-}}"
elif $WR whoami 2>&1 | grep -qi "not authenticated\|you are not logged in"; then
  warn "Not logged in — a browser window will open. Approve it, then come back here."
  warn "To run this without a browser (and off this machine), set CLOUDFLARE_API_TOKEN instead."
  $WR login || die "login failed"
else
  ok "already logged in as: $($WR whoami 2>&1 | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+' | head -1)"
fi

# ---------------------------------------------------------------- 2. D1
if [ -n "$D1_DATABASE" ]; then
  say "D1 database '$D1_DATABASE'"
  DB_ID=$(DBN="$D1_DATABASE" node -e "
    const {execSync}=require('child_process');
    try{
      const out=execSync('npx --no-install wrangler d1 list --json',{stdio:['ignore','pipe','ignore']}).toString();
      const j=JSON.parse(out);
      const hit=(Array.isArray(j)?j:[]).find(d=>d.name===process.env.DBN);
      if(hit) process.stdout.write(hit.uuid||hit.database_id||'');
    }catch(e){}
  " 2>/dev/null)
  if [ -z "$DB_ID" ]; then
    warn "not found — creating it"
    $WR d1 create "$D1_DATABASE" >/dev/null 2>&1; sleep 2
    DB_ID=$(DBN="$D1_DATABASE" node -e "
      const {execSync}=require('child_process');
      const out=execSync('npx --no-install wrangler d1 list --json',{stdio:['ignore','pipe','ignore']}).toString();
      const j=JSON.parse(out);
      const hit=(Array.isArray(j)?j:[]).find(d=>d.name===process.env.DBN);
      if(hit) process.stdout.write(hit.uuid||hit.database_id||'');
    " 2>/dev/null)
  fi
  [ -n "$DB_ID" ] || die "could not create or find the D1 database"
  ok "database_id $DB_ID"
  DBID="$DB_ID" node -e "
    const fs=require('fs');let t=fs.readFileSync('wrangler.toml','utf8');
    t=t.replace(/^database_id = \".*\"\$/m,'database_id = \"'+process.env.DBID+'\"');
    fs.writeFileSync('wrangler.toml',t);"
  ok "wrangler.toml updated"

  if [ -f schema.sql ]; then
    say "Creating tables"
    $WR d1 execute "$D1_DATABASE" --remote --file=./schema.sql --yes >/dev/null 2>&1 \
      && ok "schema applied" \
      || warn "schema step reported an issue — tables may already exist, continuing"
  fi
fi

# ---------------------------------------------------------------- 2b. KV
for B in $KV_BINDINGS; do
  say "KV namespace for binding '$B'"
  TITLE="$PROJECT-$B"
  NS_ID=$(NST="$TITLE" node -e "
    const {execSync}=require('child_process');
    try{
      const out=execSync('npx --no-install wrangler kv namespace list',{stdio:['ignore','pipe','ignore']}).toString();
      const j=JSON.parse(out.slice(out.indexOf('[')));
      const hit=j.find(n=>n.title===process.env.NST)||j.find(n=>n.title.endsWith('_'+process.env.NST));
      if(hit) process.stdout.write(hit.id||'');
    }catch(e){}
  " 2>/dev/null)
  if [ -z "$NS_ID" ]; then
    warn "not found — creating '$TITLE'"
    $WR kv namespace create "$TITLE" >/dev/null 2>&1; sleep 2
    NS_ID=$(NST="$TITLE" node -e "
      const {execSync}=require('child_process');
      try{
        const out=execSync('npx --no-install wrangler kv namespace list',{stdio:['ignore','pipe','ignore']}).toString();
        const j=JSON.parse(out.slice(out.indexOf('[')));
        const hit=j.find(n=>n.title===process.env.NST)||j.find(n=>n.title.endsWith('_'+process.env.NST));
        if(hit) process.stdout.write(hit.id||'');
      }catch(e){}
    " 2>/dev/null)
  fi
  [ -n "$NS_ID" ] || die "could not create or find the KV namespace for '$B'"
  ok "namespace id $NS_ID"
  BND="$B" NSID="$NS_ID" node -e "
    const fs=require('fs');let t=fs.readFileSync('wrangler.toml','utf8');
    const re=new RegExp('(binding = \"'+process.env.BND+'\"[\\\\s\\\\S]*?\\\\nid = )\"[^\"]*\"');
    if(!re.test(t)){ console.error('  x no [[kv_namespaces]] block for '+process.env.BND); process.exit(1); }
    fs.writeFileSync('wrangler.toml', t.replace(re,'\$1\"'+process.env.NSID+'\"'));
  " || die "could not write the namespace id into wrangler.toml"
  ok "wrangler.toml updated"
done

# ---------------------------------------------------------------- 3. project
say "Pages project '$PROJECT'"
if $WR pages project list 2>/dev/null | grep -q "\b$PROJECT\b"; then
  ok "already exists"
else
  $WR pages project create "$PROJECT" --production-branch main >/dev/null 2>&1 \
    && ok "created" || die "could not create the Pages project"
fi

# ---------------------------------------------------------------- 4. deploy
say "Deploying"
DEPLOY_OUT=$($WR pages deploy public --project-name "$PROJECT" --commit-dirty=true 2>&1)
echo "$DEPLOY_OUT" | tail -20
URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9.-]+\.pages\.dev' | tail -1)
[ -n "$URL" ] || die "deploy did not report a URL — see output above"
ok "live at $URL"

# ---------------------------------------------------------------- 5. Access
# ⛔ This runs BEFORE the custom domain, and the domain step only happens if it
#    succeeds. The protection is a PRECONDITION of the public hostname, not a
#    reminder printed underneath it after the deploy already looks done.
say "Cloudflare Access"

WHO=$($WR whoami --json 2>/dev/null)

if [ -z "${CF_ACCOUNT_ID:-}" ]; then
  ACCTS=$(printf '%s' "$WHO" | node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      try{ const j=JSON.parse(s); for(const x of (j.accounts||[])) console.log((x.id||'')+'\t'+(x.name||'')); }catch(e){}
    });")
  COUNT=$(printf '%s' "$ACCTS" | grep -c . || true)
  if [ "$COUNT" = "1" ]; then
    CF_ACCOUNT_ID=$(printf '%s' "$ACCTS" | cut -f1)
    ok "account $(printf '%s' "$ACCTS" | cut -f2) ($CF_ACCOUNT_ID)"
  elif [ "$COUNT" = "0" ]; then
    warn "could not read your account id from wrangler"
    read -r -p "  Cloudflare account id: " CF_ACCOUNT_ID
  else
    echo "  More than one account. Which one hosts $APP_HOST?"
    printf '%s\n' "$ACCTS" | nl -w3 -s'. ' | sed 's/\t/  —  /'
    read -r -p "  number: " PICK
    CF_ACCOUNT_ID=$(printf '%s\n' "$ACCTS" | sed -n "${PICK}p" | cut -f1)
  fi
fi
[ -n "${CF_ACCOUNT_ID:-}" ] || die "no account id — cannot configure Access"

if [ -z "${CF_API_TOKEN:-}" ]; then
  cat <<TOK

  Access needs an API token once. Wrangler's browser login cannot create Access
  applications; this is the one extra credential the platform needs, and every
  later app reuses it.

    dash.cloudflare.com -> My Profile -> API Tokens -> Create Token
    -> Create Custom Token
       Permissions:        Account | Access: Apps and Policies | Edit
                           Account | Cloudflare Pages             | Edit
                           Account | Workers KV Storage           | Edit
                           Zone    | DNS                          | Edit
       Account Resources:  Include | the account above
       Zone Resources:     Include | the zone holding $APP_HOST

TOK
  read -r -s -p "  CF_API_TOKEN: " CF_API_TOKEN; echo
fi
[ -n "${CF_API_TOKEN:-}" ] || die "no API token. Refusing to continue — without Access the custom domain would be public."

if [ -z "${ACCESS_EMAILS:-}" ]; then
  DEF=$(printf '%s' "$WHO" | node -e "
    let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      try{ const j=JSON.parse(s); process.stdout.write(j.email||j.user?.email||''); }catch(e){}
    });")
  read -r -p "  Email(s) allowed in, comma separated${DEF:+ [$DEF]}: " ACCESS_EMAILS
  ACCESS_EMAILS=${ACCESS_EMAILS:-$DEF}
fi
[ -n "${ACCESS_EMAILS:-}" ] || die "no email given — an allow policy needs at least one"

umask 077
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  ok "token came from CLOUDFLARE_API_TOKEN — deliberately not written to $ENVFILE"
else
  cat > "$ENVFILE" <<ENVEOF
# Written by deploy.sh. Gitignored — this file holds a real API token.
CF_ACCOUNT_ID=$CF_ACCOUNT_ID
CF_API_TOKEN=$CF_API_TOKEN
ACCESS_EMAILS=$ACCESS_EMAILS
ENVEOF
  chmod 600 "$ENVFILE"
fi

# The pages.dev host is public too, and so is every per-deployment hash URL. A
# direct-upload project has no "preview deployments" toggle to switch off —
# that hash URL is not a preview branch, it is how Pages addresses a deployment
# — so the wildcard application is what actually closes it.
PAGES_HOST="$PROJECT.pages.dev"
PREVIEW_HOST="*.$PROJECT.pages.dev"

ACCESS_OK=1
for H in "$PAGES_HOST" "$PREVIEW_HOST" "$APP_HOST"; do
  echo "  -- $H"
  CF_API_TOKEN="$CF_API_TOKEN" APP_NAME="$APP_NAME" node access.mjs "$CF_ACCOUNT_ID" "$H" "$ACCESS_EMAILS" || ACCESS_OK=0
done

# ---------------------------------------------------------------- 6. domain
# `wrangler pages domain add` was removed in wrangler 4.x, and the Pages API
# registers a domain without writing the CNAME. domain.mjs does both.
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

${BOLD}${GRN}Deployed.${OFF} $APP_NAME
  pages.dev:      $URL
  custom domain:  ${CUSTOM:-not attached — see the warning above}
  Access:         $([ "$ACCESS_OK" = "1" ] && echo "on, for $ACCESS_EMAILS" || echo "${RED}NOT CONFIRMED${OFF}")

${BOLD}Behind Access${OFF} — all three, so there is no back door:
  $APP_HOST
  $PAGES_HOST
  $PREVIEW_HOST  (covers every per-deployment hash URL)

To ship a change later:  bash deploy.sh
EOF
