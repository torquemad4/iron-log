#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Cloudflare Pages custom domain — PLATFORM PATTERN, reused by every app.
//
//   CF_API_TOKEN=... node domain.mjs <account_id> <project> <hostname>
//
// Why this exists rather than `wrangler pages domain add`: that subcommand was
// removed in wrangler 4.x. `wrangler pages` now offers only dev / functions /
// project / deployment / deploy / secret / download. The old call failed
// silently behind a 2>/dev/null and the deploy reported "could not attach it
// from the CLI", which read like a permissions problem and was not.
//
// Idempotent: a domain already attached is detected and left alone. Exits
// NON-ZERO unless the API confirms the hostname is on the project.
// ---------------------------------------------------------------------------

const API = "https://api.cloudflare.com/client/v4";
const [, , ACCOUNT, PROJECT, HOST] = process.argv;
const TOKEN = process.env.CF_API_TOKEN;

if (!ACCOUNT || !PROJECT || !HOST || !TOKEN) {
  console.error("usage: CF_API_TOKEN=... node domain.mjs <account_id> <project> <hostname>");
  process.exit(2);
}

async function cf(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null;
  try { j = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, ok: res.ok && j?.success !== false, body: j };
}

function firstError(r) {
  const e = r.body?.errors?.[0];
  if (e) return `${e.code ? e.code + ": " : ""}${e.message}`;
  return `http ${r.status}`;
}

function permHint(r) {
  if (r.status === 403 || r.status === 401) {
    console.error("    The API token is missing the 'Cloudflare Pages: Edit' permission.");
    console.error("    dash.cloudflare.com -> My Profile -> API Tokens -> edit your token");
    console.error("    and add:  Account | Cloudflare Pages | Edit");
    console.error("    Then re-run: bash deploy.sh");
  }
}

const base = `/accounts/${ACCOUNT}/pages/projects/${PROJECT}/domains`;

// ------------------------------------------------------------- 1. already on?
const list = await cf("GET", base);
if (!list.ok) {
  console.error(`  x could not list custom domains — ${firstError(list)}`);
  permHint(list);
  process.exit(1);
}

const names = (list.body?.result || []).map(d => d.name || d.domain).filter(Boolean);
if (names.includes(HOST)) {
  console.log(`  ok already attached`);
} else {
  const made = await cf("POST", base, { name: HOST });
  if (!made.ok) {
    console.error(`  x could not attach ${HOST} — ${firstError(made)}`);
    permHint(made);
    process.exit(1);
  }
  console.log(`  ok attached — the certificate takes a few minutes to issue`);
}

// -------------------------------------------------------------- 2. verify it
const verify = await cf("GET", base);
const after = (verify.body?.result || []).map(d => d.name || d.domain).filter(Boolean);
if (!verify.ok || !after.includes(HOST)) {
  console.error(`  x verification failed — ${HOST} is not on the project.`);
  process.exit(1);
}

const rec = (verify.body.result || []).find(d => (d.name || d.domain) === HOST) || {};
console.log(`  ok attached to the project${rec.status ? ` (status: ${rec.status})` : ""}`);

// ---------------------------------------------------------------- 3. the DNS
// Registering the domain on the project is NOT enough. The dashboard flow also
// writes a proxied CNAME; the API does not, so the hostname stays pending and
// simply does not resolve. Without this the deploy prints a custom-domain URL
// that no browser can reach — the script looking successful is the whole
// failure mode this file exists to prevent.
const zones = await cf("GET", "/zones?per_page=50");
if (!zones.ok) {
  console.error(`  x could not list zones — ${firstError(zones)}`);
  permHint(zones);
  process.exit(1);
}
// Longest matching suffix, so a.b.example.com picks example.com over com.
const zone = (zones.body?.result || [])
  .filter(z => HOST === z.name || HOST.endsWith("." + z.name))
  .sort((a, b) => b.name.length - a.name.length)[0];

if (!zone) {
  console.error(`  x no Cloudflare zone on this account covers ${HOST}`);
  process.exit(1);
}

const recs = await cf("GET", `/zones/${zone.id}/dns_records?name=${encodeURIComponent(HOST)}`);
if (!recs.ok) {
  console.error(`  x could not read DNS records in ${zone.name} — ${firstError(recs)}`);
  if (recs.status === 403 || recs.status === 401) {
    console.error("    The API token is missing DNS permission. Edit your token and add:");
    console.error(`      Zone | DNS | Edit    (Zone Resources: Include | ${zone.name})`);
    console.error("    Then re-run: bash deploy.sh");
  }
  process.exit(1);
}

const TARGET = `${PROJECT}.pages.dev`;
const existing = (recs.body?.result || [])[0];

if (existing && existing.type === "CNAME" && existing.content === TARGET) {
  console.log(`  ok DNS already points ${HOST} -> ${TARGET}`);
} else if (existing) {
  // Something else lives here. Refuse rather than silently repoint his DNS.
  console.error(`  x ${HOST} already has a ${existing.type} record -> ${existing.content}`);
  console.error("    Refusing to overwrite it. Remove or repoint it by hand, then re-run.");
  process.exit(1);
} else {
  const made = await cf("POST", `/zones/${zone.id}/dns_records`, {
    type: "CNAME", name: HOST, content: TARGET, proxied: true,
    comment: "Cloudflare Pages custom domain — created by domain.mjs",
  });
  if (!made.ok) {
    console.error(`  x could not create the CNAME — ${firstError(made)}`);
    process.exit(1);
  }
  console.log(`  ok DNS created: ${HOST} -> ${TARGET} (proxied)`);
}

console.log(`  ok verified: ${HOST} is attached and resolving via ${zone.name}`);
console.log("     the certificate takes a few minutes to issue after this");
