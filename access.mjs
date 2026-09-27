#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Cloudflare Access provisioning — PLATFORM PATTERN, reused by every app.
//
//   CF_API_TOKEN=... APP_NAME="..." node access.mjs <account_id> <hostname> <email>[,<email>]
//
// APP_NAME only labels the application and its policy in the Cloudflare
// dashboard. It is optional and defaults to the hostname, so this file stays
// byte-identical across every app on the platform.
//
// Creates a self-hosted Access application for <hostname> and an allow policy
// for the given emails. Idempotent: an application that already exists is
// detected and left alone, and a policy is only added if the app has none.
//
// ⚠️ An EXISTING allow policy made only of emails is brought in line with the
// list given — added AND removed — so the list passed in (app.conf) is the one
// truth. It used to be left alone, which silently ignored every change to the
// list after the first deploy while still printing the new list as "allowed".
// A policy with any non-email rule is never touched; it is reported instead.
//
// Exits NON-ZERO unless the application is confirmed to exist with at least
// one policy. The caller must treat that as fatal and must NOT attach a public
// custom domain to an unprotected app. That is the whole point of this file:
// the protection is a precondition of the domain, not a reminder afterwards.
// ---------------------------------------------------------------------------

const API = "https://api.cloudflare.com/client/v4";
const [, , ACCOUNT, HOST, EMAILS_RAW] = process.argv;
const TOKEN = process.env.CF_API_TOKEN;

if (!ACCOUNT || !HOST || !EMAILS_RAW || !TOKEN) {
  console.error("usage: CF_API_TOKEN=... node access.mjs <account_id> <hostname> <emails>");
  process.exit(2);
}

const APP_NAME = process.env.APP_NAME || HOST;

const EMAILS = EMAILS_RAW.split(",").map(s => s.trim()).filter(Boolean);
if (!EMAILS.length) { console.error("  x no emails given"); process.exit(2); }

async function cf(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
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

const base = `/accounts/${ACCOUNT}/access`;

// ---------------------------------------------------------------- 1. the app
let list = await cf("GET", `${base}/apps?per_page=200`);
if (!list.ok) {
  console.error(`  x could not list Access applications — ${firstError(list)}`);
  if (list.status === 403 || list.status === 401) {
    console.error("    The API token is missing the 'Access: Apps and Policies' Edit permission,");
    console.error("    or it is scoped to a different account.");
  }
  process.exit(1);
}

let app = (list.body?.result || []).find(a => a.domain === HOST);

if (app) {
  console.log(`  ok application already exists (${app.id})`);
} else {
  const created = await cf("POST", `${base}/apps`, {
    name: `${APP_NAME} (${HOST})`,
    domain: HOST,
    type: "self_hosted",
    session_duration: "24h",
    app_launcher_visible: true,
    auto_redirect_to_identity: false,
  });
  if (!created.ok) {
    console.error(`  x could not create the Access application — ${firstError(created)}`);
    process.exit(1);
  }
  app = created.body.result;
  console.log(`  ok application created (${app.id})`);
}

// ------------------------------------------------------------- 2. the policy
let pol = await cf("GET", `${base}/apps/${app.id}/policies`);
let existing = pol.ok ? (pol.body?.result || []) : [];

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const norm = e => String(e).trim().toLowerCase();

if (existing.length) {
  console.log(`  ok policy already attached (${existing.length})`);
  const want = EMAILS.map(norm);
  for (const p of existing) {
    const inc = p.include || [];
    const emailsOnly = p.decision === "allow" && inc.length && inc.every(i => i.email?.email);
    if (!emailsOnly) {
      console.log(`  ! policy "${p.name}" has non-email rules — left as it is; check it by hand`);
      continue;
    }
    const have = inc.map(i => norm(i.email.email));
    if (sameSet(have, want)) { console.log(`  ok policy "${p.name}" already allows exactly this list`); continue; }
    const body = {
      name: p.name, decision: p.decision,
      include: EMAILS.map(e => ({ email: { email: e } })),
      exclude: p.exclude || [], require: p.require || [],
    };
    const path = p.reusable ? `${base}/policies/${p.id}` : `${base}/apps/${app.id}/policies/${p.id}`;
    if (!p.reusable) body.precedence = p.precedence || 1;
    const upd = await cf("PUT", path, body);
    if (!upd.ok) {
      console.error(`  x could not update policy "${p.name}" — ${firstError(upd)}`);
      process.exit(1);
    }
    const added = want.filter(e => !have.includes(e)), removed = have.filter(e => !want.includes(e));
    console.log(`  ok policy "${p.name}" updated` +
      (added.length ? ` — added ${added.join(", ")}` : "") +
      (removed.length ? ` — removed ${removed.join(", ")}` : ""));
  }
} else {
  const rule = {
    name: `Allow — ${APP_NAME}`,
    decision: "allow",
    include: EMAILS.map(e => ({ email: { email: e } })),
    precedence: 1,
  };

  // Preferred: an app-scoped policy.
  let made = await cf("POST", `${base}/apps/${app.id}/policies`, rule);

  // Fallback: accounts migrated to reusable policies reject the app-scoped
  // endpoint. Create a reusable policy and bind it to the app instead.
  if (!made.ok) {
    console.log(`  ! app-scoped policy rejected (${firstError(made)}) — trying a reusable policy`);
    const reusable = await cf("POST", `${base}/policies`, {
      name: `Allow — ${APP_NAME} (${HOST})`,
      decision: "allow",
      include: EMAILS.map(e => ({ email: { email: e } })),
    });
    if (!reusable.ok) {
      console.error(`  x could not create a policy — ${firstError(reusable)}`);
      process.exit(1);
    }
    const bound = await cf("PUT", `${base}/apps/${app.id}`, {
      name: app.name,
      domain: HOST,
      type: "self_hosted",
      session_duration: app.session_duration || "24h",
      policies: [reusable.body.result.id],
    });
    if (!bound.ok) {
      console.error(`  x created the policy but could not bind it to the app — ${firstError(bound)}`);
      process.exit(1);
    }
    console.log("  ok reusable policy created and bound");
  } else {
    console.log("  ok policy created");
  }
}

// ------------------------------------------------------------- 3. verify it
// Read it back. A policy we believe we created is not a policy until the API
// says it is there.
const verifyApp = await cf("GET", `${base}/apps/${app.id}`);
const verifyPol = await cf("GET", `${base}/apps/${app.id}/policies`);
const count = (verifyPol.body?.result || []).length
           || (verifyApp.body?.result?.policies || []).length;

if (!verifyApp.ok || !count) {
  console.error("  x verification failed — the application does not have a policy.");
  console.error("    Refusing to report success. The hostname would be unprotected.");
  process.exit(1);
}

console.log(`  ok verified: ${HOST} is behind Access with ${count} polic${count === 1 ? "y" : "ies"}`);
// Print what Cloudflare says is allowed, not what was asked for. The old line
// echoed the input, which is how a policy that never changed looked updated.
const actual = [...new Set((verifyPol.body?.result || [])
  .flatMap(p => (p.include || []).map(i => i.email?.email || "(non-email rule)")))];
console.log(`     allowed: ${actual.join(", ") || "(could not read back)"}`);
const missing = EMAILS.map(norm).filter(e => !actual.map(norm).includes(e));
if (missing.length) {
  console.error(`  x not in the policy after all: ${missing.join(", ")}`);
  process.exit(1);
}
