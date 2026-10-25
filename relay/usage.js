// MIAP's own Cloudflare usage, from Cloudflare's GraphQL Analytics API: the friday-relay Worker
// (requests, errors, CPU time), Workers AI (neurons) and the D1 database (size, rows read/written).
// Needs two Worker secrets:
//   CF_API_TOKEN  an API token with only "Account Analytics: Read"
//   CF_ACCOUNT_ID the account id (Workers & Pages overview, right-hand column)
// Each of the three is its own request, so one failing (e.g. a renamed field) leaves the others.

export const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
export const SCRIPT = 'friday-relay';
export const D1_DATABASE_ID = '5a98a893-6cb8-47e8-acab-07cb72df4356'; // as in wrangler.jsonc (not a secret)
const DAY_MS = 24 * 60 * 60 * 1000;

// Free limits reset at 00:00 UTC, so "today" counts from there; the charts show the last 24 h.
export function windows(now) {
  const to = new Date(now).toISOString();
  const today = to.slice(0, 10);
  return { to, today, dayStart: `${today}T00:00:00Z`, from: new Date(now - DAY_MS).toISOString(), weekAgo: new Date(now - 7 * DAY_MS).toISOString().slice(0, 10) };
}

export const WORKERS_QUERY = `query ($account: string!, $script: string!, $from: string!, $dayStart: string!, $to: string!) {
  viewer { accounts(filter: { accountTag: $account }) {
    today: workersInvocationsAdaptive(limit: 1, filter: { scriptName: $script, datetime_geq: $dayStart, datetime_leq: $to }) { sum { requests } }
    total: workersInvocationsAdaptive(limit: 1, filter: { scriptName: $script, datetime_geq: $from, datetime_leq: $to }) {
      sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP99 }
    }
    hourly: workersInvocationsAdaptive(limit: 48, orderBy: [datetimeHour_ASC], filter: { scriptName: $script, datetime_geq: $from, datetime_leq: $to }) {
      sum { requests errors } quantiles { cpuTimeP99 } dimensions { datetimeHour }
    }
    outcomes: workersInvocationsAdaptive(limit: 20, orderBy: [sum_requests_DESC], filter: { scriptName: $script, datetime_geq: $from, datetime_leq: $to }) {
      sum { requests } dimensions { status }
    }
  } }
}`;

export const AI_QUERY = `query ($account: string!, $dayStart: string!, $to: string!) {
  viewer { accounts(filter: { accountTag: $account }) {
    today: aiInferenceAdaptiveGroups(limit: 1, filter: { datetime_geq: $dayStart, datetime_leq: $to }) { sum { totalNeurons } }
  } }
}`;

export const D1_QUERY = `query ($account: string!, $db: string!, $today: string!, $weekAgo: string!) {
  viewer { accounts(filter: { accountTag: $account }) {
    today: d1AnalyticsAdaptiveGroups(limit: 1, filter: { databaseId: $db, date_geq: $today, date_leq: $today }) {
      sum { readQueries writeQueries rowsRead rowsWritten }
    }
    size: d1StorageAdaptiveGroups(limit: 1, orderBy: [date_DESC], filter: { databaseId: $db, date_geq: $weekAgo }) {
      max { databaseSizeBytes } dimensions { date }
    }
  } }
}`;

// -> the three { query, variables } bodies
export function usageQueries(env, now) {
  if (!env.CF_API_TOKEN) throw new Error('CF_API_TOKEN secret is not set on this Worker (see README, Cloudflare usage)');
  if (!env.CF_ACCOUNT_ID) throw new Error('CF_ACCOUNT_ID secret is not set on this Worker (see README, Cloudflare usage)');
  const w = windows(now);
  const account = env.CF_ACCOUNT_ID;
  return {
    workers: { query: WORKERS_QUERY, variables: { account, script: SCRIPT, from: w.from, dayStart: w.dayStart, to: w.to } },
    ai: { query: AI_QUERY, variables: { account, dayStart: w.dayStart, to: w.to } },
    d1: { query: D1_QUERY, variables: { account, db: D1_DATABASE_ID, today: w.today, weekAgo: w.weekAgo } },
  };
}

// GraphQL reports its errors in the body, with HTTP 200.
function account(json) {
  if (json?.errors?.length) throw new Error(`Cloudflare analytics: ${json.errors.map((e) => e.message).join('; ')}`);
  const a = json?.data?.viewer?.accounts?.[0];
  if (!a) throw new Error('Cloudflare analytics: account not found (check CF_ACCOUNT_ID and that the token has Account Analytics: Read)');
  return a;
}

const ms = (us) => Math.round((us ?? 0) / 10) / 100; // Cloudflare reports CPU time in microseconds

export function parseWorkers(json) {
  const a = account(json);
  const total = a.total[0];
  return {
    requestsToday: a.today[0]?.sum.requests ?? 0,
    requests: total?.sum.requests ?? 0,
    errors: total?.sum.errors ?? 0,
    subrequests: total?.sum.subrequests ?? 0,
    cpuP50Ms: ms(total?.quantiles.cpuTimeP50),
    cpuP99Ms: ms(total?.quantiles.cpuTimeP99),
    hours: a.hourly.map((h) => ({ hour: h.dimensions.datetimeHour, requests: h.sum.requests, errors: h.sum.errors, cpuP99Ms: ms(h.quantiles.cpuTimeP99) })),
    outcomes: a.outcomes.map((o) => ({ status: o.dimensions.status, requests: o.sum.requests })),
  };
}

export function parseAi(json) {
  return { neuronsToday: Math.round(account(json).today[0]?.sum.totalNeurons ?? 0) };
}

export function parseD1(json) {
  const a = account(json);
  const t = a.today[0]?.sum ?? {};
  return {
    rowsReadToday: t.rowsRead ?? 0,
    rowsWrittenToday: t.rowsWritten ?? 0,
    queriesToday: (t.readQueries ?? 0) + (t.writeQueries ?? 0),
    sizeBytes: a.size[0]?.max.databaseSizeBytes ?? null,
  };
}
