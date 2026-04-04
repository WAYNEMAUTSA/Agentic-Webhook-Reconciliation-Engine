import axios from 'axios';

type InjectorScenario =
  | 'normal'
  | 'duplicate'
  | 'out_of_order'
  | 'dropped'
  | 'invalid_payload'
  | 'gateway_outage'
  | 'state_conflict'
  | 'fraud_replay';

interface InjectorConfig {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  eventSequence: string[];
  scenarioWeights: Record<InjectorScenario, number>;
}

const DEFAULT_CONFIG: InjectorConfig = {
  enabled: true,
  intervalMs: 1500,
  batchSize: 3,
  eventSequence: [
    'payment.created',
    'payment.authorized',
    'payment.captured',
  ],
  scenarioWeights: {
    normal: 55,
    duplicate: 5,
    out_of_order: 5,
    dropped: 5,
    invalid_payload: 0,
    gateway_outage: 5,
    state_conflict: 5,
    fraud_replay: 20,
  },
};

let injectorInterval: NodeJS.Timeout | null = null;
let currentConfig: InjectorConfig = { ...DEFAULT_CONFIG };

/**
 * Start the continuous data injector
 */
export function startDataInjector(config: Partial<InjectorConfig> = {}): void {
  // Merge config but DON'T reset scenarioWeights from DEFAULT if override is provided
  const finalConfig: InjectorConfig = {
    ...DEFAULT_CONFIG,
    scenarioWeights: { ...DEFAULT_CONFIG.scenarioWeights, ...(config as any).scenarioWeights },
    ...config,
  };
  currentConfig = finalConfig;

  if (!finalConfig.enabled) {
    console.log('Data injector is disabled');
    return;
  }

  if (injectorInterval) {
    clearInterval(injectorInterval);
    injectorInterval = null;
  }

  console.log(
    `[Injector] Starting: batches of ${finalConfig.batchSize} every ${finalConfig.intervalMs}ms | weights:`,
    JSON.stringify(finalConfig.scenarioWeights)
  );

  injectorInterval = setInterval(async () => {
    try {
      await injectBatch(finalConfig);
    } catch (err: any) {
      console.error('[Injector] Batch error:', err.message);
    }
  }, finalConfig.intervalMs);
}

/**
 * Stop the data injector
 */
export function stopDataInjector(): void {
  if (injectorInterval) {
    clearInterval(injectorInterval);
    injectorInterval = null;
    console.log('[Injector] Stopped');
  }
}

/**
 * Inject a batch of synthetic transactions
 */
async function injectBatch(config: InjectorConfig): Promise<void> {
  const selfUrl = process.env.SELF_URL ?? 'http://127.0.0.1:3000';
  const webhookUrl = `${selfUrl}/webhook/razorpay`;

  for (let i = 0; i < config.batchSize; i++) {
    const scenario = pickScenario(config.scenarioWeights);
    try {
      await injectScenario(webhookUrl, config, scenario);
    } catch (err: any) {
      console.error(`[Injector] Scenario error (${scenario}):`, err.message);
    }
    await sleep(150);
  }
}

async function injectScenario(
  webhookUrl: string,
  config: InjectorConfig,
  scenario: InjectorScenario
): Promise<void> {
  const baseTxnId = makeTxnId();
  const txnId =
    scenario === 'gateway_outage'
      ? `${baseTxnId}503`
      : scenario === 'state_conflict'
      ? `${baseTxnId}conflict`
      : baseTxnId;

  // send() posts directly to the webhook endpoint with custom HTTP headers
  const send = async (eventType: string, customHeaders?: Record<string, string>) => {
    const payload = makePayload(txnId, eventType);
    try {
      const res = await axios.post(webhookUrl, payload, {
        timeout: 5000,
        validateStatus: () => true,
        headers: customHeaders,
      });
      console.log(`[Injector:${scenario}] ${eventType} → ${txnId} (HTTP ${res.status})`);
      return res;
    } catch (err: any) {
      console.error(`[Injector:${scenario}] Failed ${txnId}:`, err.message);
      throw err;
    }
  };

  // ─── NORMAL ───
  if (scenario === 'normal') {
    for (const eventType of config.eventSequence) {
      await send(eventType, {
        'x-razorpay-signature': `sig_${txnId}_${eventType}`,
        'x-forwarded-for': '192.168.1.100',
        'user-agent': 'Razorpay-Webhook/1.0',
      });
      await sleep(100);
    }
    return;
  }

  // ─── DUPLICATE ───
  if (scenario === 'duplicate') {
    // Send full lifecycle
    for (const eventType of config.eventSequence) {
      await send(eventType, {
        'x-razorpay-signature': `sig_${txnId}_${eventType}`,
        'x-forwarded-for': '192.168.1.100',
        'user-agent': 'Razorpay-Webhook/1.0',
      });
      await sleep(100);
    }
    // Re-send captured (duplicate) — will be caught by idempotency in chaosHealer
    await sleep(200);
    await send('payment.captured', {
      'x-razorpay-signature': `sig_${txnId}_captured_retry`,
      'x-forwarded-for': '192.168.1.100',
      'user-agent': 'Razorpay-Webhook/1.0',
    });
    return;
  }

  // ─── OUT OF ORDER ───
  if (scenario === 'out_of_order') {
    await send('payment.authorized', {
      'x-razorpay-signature': `sig_${txnId}_authorized`,
      'x-forwarded-for': '192.168.1.100',
      'user-agent': 'Razorpay-Webhook/1.0',
    });
    await sleep(100);
    await send('payment.created', {
      'x-razorpay-signature': `sig_${txnId}_created`,
      'x-forwarded-for': '192.168.1.100',
      'user-agent': 'Razorpay-Webhook/1.0',
    });
    await sleep(100);
    await send('payment.captured', {
      'x-razorpay-signature': `sig_${txnId}_captured`,
      'x-forwarded-for': '192.168.1.100',
      'user-agent': 'Razorpay-Webhook/1.0',
    });
    return;
  }

  // ─── DROPPED ───
  if (scenario === 'dropped') {
    await send('payment.created', {
      'x-razorpay-signature': `sig_${txnId}_created`,
      'x-forwarded-for': '192.168.1.100',
      'user-agent': 'Razorpay-Webhook/1.0',
    });
    await sleep(150);
    await send('payment.captured', {
      'x-razorpay-signature': `sig_${txnId}_captured`,
      'x-forwarded-for': '192.168.1.100',
      'user-agent': 'Razorpay-Webhook/1.0',
    });
    return;
  }

  // ─── INVALID PAYLOAD ───
  if (scenario === 'invalid_payload') {
    await send('payment.created', {
      'x-razorpay-signature': `sig_${txnId}_created`,
      'x-forwarded-for': '192.168.1.100',
      'user-agent': 'Razorpay-Webhook/1.0',
    }, );
    // Override payload to omit 'id'
    const badPayload = {
      event: 'payment.created',
      payload: {
        payment: {
          entity: {
            amount: generateRandomAmount(),
            currency: 'INR',
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };
    await axios.post(webhookUrl, badPayload, { timeout: 5000, validateStatus: () => true });
    console.log(`[Injector:invalid_payload] Sent malformed payload for ${txnId}`);
    return;
  }

  // ─── GATEWAY OUTAGE / STATE CONFLICT ───
  if (scenario === 'gateway_outage' || scenario === 'state_conflict') {
    await send('payment.captured', {
      'x-razorpay-signature': `sig_${txnId}_captured`,
      'x-forwarded-for': '192.168.1.100',
      'user-agent': 'Razorpay-Webhook/1.0',
    });
    return;
  }

  // ─── FRAUD REPLAY ───
  if (scenario === 'fraud_replay') {
    const fraudTxnId = `pay_FRAUD_${Date.now().toString().slice(-6)}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // Phase 1: LEGITIMATE event
    const legitRes = await axios.post(webhookUrl, makePayload(fraudTxnId, 'payment.captured'), {
      timeout: 5000,
      validateStatus: () => true,
      headers: {
        'x-razorpay-signature': `sig_legit_${fraudTxnId}`,
        'x-forwarded-for': '192.168.1.100',
        'user-agent': 'Razorpay-Webhook/1.0',
        'content-type': 'application/json',
      },
    });
    console.log(`[Injector:fraud] PHASE 1 (legit) → ${fraudTxnId} (HTTP ${legitRes.status})`);

    // Phase 2: Wait so Phase 1 is fully committed to DB
    await sleep(1500);

    // Phase 3: REPLAY — same txn ID + event type but DIFFERENT HTTP headers
    // The fraud detection middleware sees this as a duplicate with changed headers → BLOCK
    const replayRes = await axios.post(webhookUrl, makePayload(fraudTxnId, 'payment.captured'), {
      timeout: 5000,
      validateStatus: () => true,
      headers: {
        'x-razorpay-signature': `sig_ATTACKER_${Math.random().toString(36).substring(2, 8)}`,
        'x-forwarded-for': `45.${randInt(1, 254)}.${randInt(1, 254)}.${randInt(1, 254)}`,
        'user-agent': 'python-requests/2.31',
        'content-type': 'application/json',
      },
    });
    console.log(`[Injector:fraud] PHASE 3 (replay) → ${fraudTxnId} (HTTP ${replayRes.status}) ${replayRes.status === 403 ? '✅ BLOCKED' : '❌ NOT BLOCKED'}`);
    return;
  }
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeTxnId(): string {
  const ts = Date.now();
  const r = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `pay_INJ${ts}${r}`;
}

function makePayload(txnId: string, eventType: string): any {
  return {
    event: eventType,
    payload: {
      payment: {
        entity: {
          id: txnId,
          amount: generateRandomAmount(),
          currency: 'INR',
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  };
}

function pickScenario(weights: Record<InjectorScenario, number>): InjectorScenario {
  const entries = Object.entries(weights) as Array<[InjectorScenario, number]>;
  const total = entries.reduce((sum, [, v]) => sum + Math.max(0, v), 0);
  if (total <= 0) return 'normal';

  let cursor = Math.random() * total;
  for (const [scenario, weight] of entries) {
    cursor -= Math.max(0, weight);
    if (cursor <= 0) return scenario;
  }
  return 'normal';
}

function generateRandomAmount(): number {
  const amounts = [10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000];
  return amounts[Math.floor(Math.random() * amounts.length)] * 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getInjectorStatus(): { active: boolean; config: InjectorConfig } {
  return { active: injectorInterval !== null, config: currentConfig };
}
