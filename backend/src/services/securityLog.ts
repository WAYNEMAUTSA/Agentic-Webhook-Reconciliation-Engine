import { supabase } from '../db/supabase.js';
import { SecurityLogEntry } from '../types/index.js';

// ─── Demo seed data — simulates live incoming fraud events ───
let _demoSeeded = false;
let _demoLogs: SecurityLogEntry[] = [];
let _demoCounter = 0;

const ATTACK_IPS = ['45.33.178.92', '103.21.44.15', '185.220.101.33', '91.121.87.44', '23.94.12.67', '77.247.181.163', '171.25.193.77'];
const ATTACK_UAS = ['python-requests/2.31', 'curl/7.88.1', 'python-requests/2.28', 'go-http-client/1.1', 'Scrapy/2.8', 'Wget/1.21', 'libwww-perl/6.67'];
const ATTACK_SIGS = () => `sig_ATTACKER_${Math.random().toString(36).substring(2, 8)}`;

function generateNewEntry(assessment: 'block' | 'drop' | 'allow'): SecurityLogEntry {
  _demoCounter++;
  const now = Date.now();
  const delta = assessment === 'block' ? 800 + Math.random() * 3000 :
                assessment === 'drop' ? 3000 + Math.random() * 4000 :
                500 + Math.random() * 3000;
  const risk = assessment === 'block' ? 65 + Math.floor(Math.random() * 30) :
               assessment === 'drop' ? 28 + Math.floor(Math.random() * 22) :
               2 + Math.floor(Math.random() * 18);
  const ip = ATTACK_IPS[Math.floor(Math.random() * ATTACK_IPS.length)];
  const ua = ATTACK_UAS[Math.floor(Math.random() * ATTACK_UAS.length)];
  const sig = ATTACK_SIGS();
  const txnId = `pay_${assessment === 'block' ? 'BLK' : assessment === 'drop' ? 'DRP' : 'OK'}_${_demoCounter.toString(16).toUpperCase().padStart(6, '0')}`;

  return {
    gateway_txn_id: txnId,
    event_type: 'payment.captured',
    risk_score: risk,
    fraud_flag: assessment === 'block',
    assessment,
    original_timestamp: new Date(now - delta - 200).toISOString(),
    retry_timestamp: new Date(now - delta).toISOString(),
    time_delta_ms: Math.round(delta),
    header_consistency: assessment === 'block' ? 0 : assessment === 'drop' ? 0.3 + Math.random() * 0.3 : 1.0,
    flagged_fields: assessment === 'block' ? ['x-razorpay-signature', 'x-forwarded-for', 'user-agent'] :
                    assessment === 'drop' ? ['x-razorpay-signature', 'user-agent'] : [],
    request_headers: { 'x-razorpay-signature': sig, 'x-forwarded-for': ip, 'user-agent': ua },
    original_headers: { 'x-razorpay-signature': `sig_legit_${txnId}`, 'x-forwarded-for': '192.168.1.100', 'user-agent': 'Razorpay-Webhook/1.0' },
    ip_address: ip,
    user_agent: ua,
  };
}

function generateDemoData(): SecurityLogEntry[] {
  if (_demoSeeded) return _demoLogs;
  _demoSeeded = true;

  // Seed with 25 initial entries
  for (let i = 0; i < 8; i++) _demoLogs.push(generateNewEntry('block'));
  for (let i = 0; i < 5; i++) _demoLogs.push(generateNewEntry('drop'));
  for (let i = 0; i < 12; i++) _demoLogs.push(generateNewEntry('allow'));

  return _demoLogs;
}

/**
 * Log a fraud assessment to the security dashboard (Supabase).
 * Creates a record in `security_logs` table for blocked/dropped requests.
 */
export async function logSecurityEvent(entry: SecurityLogEntry): Promise<void> {
  try {
    const { error } = await supabase.from('security_logs').insert({
      gateway_txn_id: entry.gateway_txn_id,
      event_type: entry.event_type,
      risk_score: entry.risk_score,
      fraud_flag: entry.fraud_flag,
      assessment: entry.assessment,
      original_timestamp: entry.original_timestamp,
      retry_timestamp: entry.retry_timestamp,
      time_delta_ms: entry.time_delta_ms,
      header_consistency: entry.header_consistency,
      flagged_fields: entry.flagged_fields,
      request_headers: entry.request_headers,
      original_headers: entry.original_headers,
      ip_address: entry.ip_address,
      user_agent: entry.user_agent,
    });

    if (error) {
      console.error('[SecurityLog] Failed to log security event:', error.message);
      return;
    }

    const level = entry.fraud_flag ? 'BLOCKED' : entry.assessment === 'drop' ? 'DROPPED' : 'ALLOWED';
    console.log(
      `[SecurityLog] ${level} — txn: ${entry.gateway_txn_id}, risk: ${entry.risk_score}, ` +
      `delta: ${entry.time_delta_ms}ms, consistency: ${(entry.header_consistency * 100).toFixed(0)}%`
    );
  } catch (err: any) {
    // Never crash the pipeline on audit failure
    console.error('[SecurityLog] Unexpected error:', err.message);
  }
}

/**
 * Fetch recent security log entries for the dashboard.
 * Falls back to demo data when DB is empty, adding new entries on each call
 * to simulate live incoming fraud events.
 */
export async function getSecurityLogs(limit = 50, offset = 0): Promise<{
  entries: SecurityLogEntry[];
  total: number;
}> {
  const { data, count, error } = await supabase
    .from('security_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[SecurityLog] Failed to fetch logs:', error.message);
  }

  if (data && data.length > 0) {
    return { entries: data as SecurityLogEntry[], total: count || data.length };
  }

  // DB empty — simulate live incoming events by adding new entries each call
  const weights = [0.4, 0.15, 0.45]; // 40% block, 15% drop, 45% allow
  const r = Math.random();
  const newType = r < weights[0] ? 'block' : r < weights[0] + weights[1] ? 'drop' : 'allow';
  const newEntry = generateNewEntry(newType);
  _demoLogs.unshift(newEntry); // Add to front (newest first)

  // Keep capped at 200 entries
  if (_demoLogs.length > 200) _demoLogs = _demoLogs.slice(0, 200);

  return { entries: _demoLogs.slice(offset, offset + limit), total: _demoLogs.length };
}

/**
 * Get fraud statistics for the dashboard summary.
 * Falls back to demo data when DB is empty.
 */
export async function getFraudStats(): Promise<{
  totalBlocked: number;
  totalDropped: number;
  totalAllowed: number;
  avgRiskScore: number;
  topFlaggedFields: { field: string; count: number }[];
}> {
  const [blockedRes, droppedRes, allowedRes, riskRes] = await Promise.all([
    supabase.from('security_logs').select('id', { count: 'exact', head: true }).eq('assessment', 'block'),
    supabase.from('security_logs').select('id', { count: 'exact', head: true }).eq('assessment', 'drop'),
    supabase.from('security_logs').select('id', { count: 'exact', head: true }).eq('assessment', 'allow'),
    supabase.from('security_logs').select('risk_score'),
  ]);

  const dbBlocked = blockedRes.count || 0;
  const dbDropped = droppedRes.count || 0;
  const dbAllowed = allowedRes.count || 0;

  if (dbBlocked + dbDropped + dbAllowed > 0) {
    const riskScores = (riskRes.data || []).map((d: any) => d.risk_score as number);
    const avgRisk = riskScores.length > 0
      ? riskScores.reduce((a: number, b: number) => a + b, 0) / riskScores.length
      : 0;

    const fieldCounts = new Map<string, number>();
    const allLogs = (await supabase.from('security_logs').select('flagged_fields')).data || [];
    for (const log of allLogs as any[]) {
      for (const field of (log.flagged_fields || [])) {
        fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
      }
    }

    const topFlaggedFields = Array.from(fieldCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([field, count]) => ({ field, count }));

    return {
      totalBlocked: dbBlocked,
      totalDropped: dbDropped,
      totalAllowed: dbAllowed,
      avgRiskScore: Math.round(avgRisk * 10) / 10,
      topFlaggedFields,
    };
  }

  // DB empty — compute from growing demo data
  const totalB = _demoLogs.filter(e => e.assessment === 'block').length;
  const totalD = _demoLogs.filter(e => e.assessment === 'drop').length;
  const totalA = _demoLogs.filter(e => e.assessment === 'allow').length;
  const avg = _demoLogs.length > 0 ? _demoLogs.reduce((s, e) => s + e.risk_score, 0) / _demoLogs.length : 0;

  const fieldCounts = new Map<string, number>();
  for (const e of _demoLogs) {
    for (const f of e.flagged_fields || []) {
      fieldCounts.set(f, (fieldCounts.get(f) || 0) + 1);
    }
  }
  const topFlaggedFields = Array.from(fieldCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([field, count]) => ({ field, count }));

  return {
    totalBlocked: totalB,
    totalDropped: totalD,
    totalAllowed: totalA,
    avgRiskScore: Math.round(avg * 10) / 10,
    topFlaggedFields,
  };
}
