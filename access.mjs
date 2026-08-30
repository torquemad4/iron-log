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

if (existing.length) {
  console.log(`  ok policy already attached (${existing.length}) — leaving it alone`);
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
console.log(`     allowed: ${EMAILS.join(", ")}`);
