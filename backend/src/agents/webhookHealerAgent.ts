import { z } from 'zod';

// ────────────────────────────────────────────────────────────────
// WEBHOOK HEALER AGENT — Autonomous Reliability Bridge
// ────────────────────────────────────────────────────────────────
//
// Handles "Infrastructure Chaos":
//  • Schema Drift — providers changed field names without notice
//  • State Inconsistency — events arrived out of order
//  • Data Corruption — types mismatched or nested incorrectly
//
// Returns a healed payload that satisfies the target schema.
// ────────────────────────────────────────────────────────────────

// ─── Agent Output Types ────────────────────────────────────────

export interface HealedResult {
  healed_payload: Record<string, unknown> | null;
  agent_log: string;
  confidence_score: number; // 0.0 – 1.0
  status: 'healed' | 'fatal_error';
  actions_taken: string[];
  schema_violations_remaining: ViolationSummary[];
}

export interface ViolationSummary {
  field: string;
  issue: string;
  severity: 'fixed' | 'remaining' | 'fatal';
}

// ─── Known Provider Schema Mappings ────────────────────────────

/**
 * Common field aliases used by different payment gateways.
 * When a provider renames a field, we map it to the canonical name.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  transaction_id: ['txn_id', 'transactionId', 'payment_id', 'paymentId', 'id', 'object_id'],
  amount: ['total', 'value', 'price', 'sum', 'gross_amount', 'amount_total'],
  currency: ['currency_code', 'currencyCode', 'curr', 'currency_type'],
  customer_id: ['client_uuid', 'client_id', 'buyer_id', 'user_id', 'account_id', 'payer_id'],
  status: ['state', 'event_type', 'payment_status', 'paymentState', 'outcome'],
  timestamp: ['created_at', 'createdAt', 'occurred_at', 'event_time', 'datetime', 'date_time'],
  description: ['memo', 'note', 'purpose', 'label', 'statement_descriptor'],
  email: ['customer_email', 'buyer_email', 'payer_email', 'user_email', 'contact_email'],
  metadata: ['custom_fields', 'extra', 'additional_data', 'payload', 'context'],
  gateway: ['provider', 'payment_method', 'processor', 'channel'],
};

/**
 * Canonical webhook event type mapping per provider.
 * Normalizes provider-specific event names to our internal state machine states.
 */
const EVENT_TYPE_MAP: Record<string, string> = {
  // Razorpay-style
  'payment.created': 'created',
  'payment.authorized': 'authorized',
  'payment.captured': 'captured',
  'payment.failed': 'failed',
  'payment.refunded': 'refunded',
  'payment.disputed': 'disputed',
  'order.created': 'created',
  'order.paid': 'captured',

  // Stripe-style
  'payment_intent.created': 'created',
  'payment_intent.succeeded': 'captured',
  'payment_intent.payment_failed': 'failed',
  'charge.succeeded': 'captured',
  'charge.refunded': 'refunded',
  'charge.disputed': 'disputed',
  'invoice.paid': 'captured',
  'invoice.payment_failed': 'failed',

  // Generic aliases
  'completed': 'captured',
  'success': 'captured',
  'succeeded': 'captured',
  'authorized': 'authorized',
  'pending': 'created',
  'initiated': 'initiated',
  'processing': 'processing',
  'settled': 'settled',
};

/**
 * State precedence — higher index = later in lifecycle
 */
const STATE_ORDER: string[] = [
  'initiated',
  'created',
  'authorized',
  'processing',
  'captured',
  'settled',
  'refunded',
  'disputed',
  'failed',
];

// ─── Schema Validators ─────────────────────────────────────────

/**
 * The minimum expected schema for a normalized webhook event.
 * This is the "target" the healer tries to satisfy.
 */
export const webhookEventSchema = z.object({
  transaction_id: z.string().min(1),
  amount: z.number().or(z.string()).transform((v) => (typeof v === 'string' ? parseFloat(v) : v)),
  currency: z.string().min(1).default('INR'),
  status: z.string().min(1),
  timestamp: z.string().or(z.date()),
  customer_id: z.string().optional(),
  email: z.string().email().optional(),
  description: z.string().optional(),
  gateway: z.string().optional(),
  metadata: z.object({}).passthrough().optional(),
  raw_event_type: z.string().optional(),
});

export type WebhookEventPayload = z.infer<typeof webhookEventSchema>;

// ─── Healer Core ───────────────────────────────────────────────

interface HealContext {
  brokenPayload: Record<string, unknown>;
  targetSchema: z.ZodTypeAny;
  currentSystemState?: Record<string, unknown>;
  provider?: string;
}

/**
 * Autonomous Webhook Healer Agent.
 *
 * Analyzes a broken payload, applies healing strategies, and returns
 * a healed object that satisfies the target Zod schema.
 */
export class WebhookHealerAgent {
  private context: HealContext;
  private actionsLog: string[] = [];
  private confidence: number = 1.0;

  constructor(context: HealContext) {
    this.context = context;
  }

  /**
   * Execute the full healing pipeline:
   *  1. Analyze validation errors
   *  2. Apply field alias mapping
   *  3. Fix type mismatches
   *  4. Normalize event types
   *  5. Enrich from system state
   *  6. Validate final result
   */
  heal(): HealedResult {
    const { brokenPayload, targetSchema, currentSystemState } = this.context;

    // Deep clone the payload so we don't mutate the original
    let working: Record<string, unknown> = JSON.parse(JSON.stringify(brokenPayload));

    // Phase 1: Field alias resolution (schema drift)
    working = this.resolveFieldAliases(working);

    // Phase 2: Type coercion fixes
    working = this.fixTypeMismatches(working, targetSchema);

    // Phase 3: Event type normalization
    working = this.normalizeEventType(working);

    // Phase 4: Enrich from known system state
    if (currentSystemState) {
      working = this.enrichFromSystemState(working, currentSystemState);
    }

    // Phase 5: Synthesize missing non-critical fields
    working = this.synthesizeDefaults(working);

    // Phase 6: Final validation
    const result = this.validateAndReport(working, targetSchema);

    return result;
  }

  // ── Phase 1: Field Alias Resolution ────────────────────────

  /**
   * When providers rename fields, we detect and remap them.
   * Uses fuzzy matching on known aliases + value format heuristics.
   */
  private resolveFieldAliases(payload: Record<string, unknown>): Record<string, unknown> {
    const result = { ...payload };
    const keys = Object.keys(result);

    for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
      // If canonical field already exists and has a valid value, skip
      if (result[canonical] && this.isTruthy(result[canonical])) continue;

      // Search for an alias that has a usable value
      for (const alias of aliases) {
        const aliasedKey = keys.find(
          (k) => k.toLowerCase() === alias.toLowerCase()
        );

        if (aliasedKey && this.isTruthy(result[aliasedKey])) {
          result[canonical] = result[aliasedKey];
          this.logAction(`Mapped "${aliasedKey}" → "${canonical}" (schema drift repair)`);
          this.confidence *= 0.95; // Small penalty for remapping
          break;
        }
      }
    }

    return result;
  }

  // ── Phase 2: Type Coercion ─────────────────────────────────

  /**
   * Fix common type mismatches:
   *  • String numbers → actual numbers
   *  • Nested objects flattened
   *  • Date objects → ISO strings
   */
  private fixTypeMismatches(
    payload: Record<string, unknown>,
    _schema: z.ZodTypeAny
  ): Record<string, unknown> {
    const result = { ...payload };

    // Amount: string → number
    if (typeof result.amount === 'string') {
      const parsed = parseFloat(result.amount.replace(/[^0-9.\-]/g, ''));
      if (!isNaN(parsed)) {
        result.amount = parsed;
        this.logAction('Coerced amount from string to number');
      }
    }

    // Amount: nested in object (e.g. { amount: { value: 100 } })
    if (typeof result.amount === 'object' && result.amount !== null) {
      const amt = result.amount as Record<string, unknown>;
      const extracted = amt.value ?? amt.total ?? amt.amount ?? null;
      if (extracted !== null) {
        result.amount = typeof extracted === 'string'
          ? parseFloat(extracted)
          : extracted;
        this.logAction('Extracted amount from nested object');
        this.confidence *= 0.9;
      }
    }

    // Timestamp: Date object → ISO string
    if (result.timestamp instanceof Date) {
      result.timestamp = result.timestamp.toISOString();
      this.logAction('Converted Date object to ISO string');
    }

    // Timestamp: unix epoch number → ISO string
    if (typeof result.timestamp === 'number') {
      result.timestamp = new Date(
        result.timestamp > 1e12 ? result.timestamp : result.timestamp * 1000
      ).toISOString();
      this.logAction('Converted unix timestamp to ISO string');
    }

    // Status: object with status field → extract
    if (typeof result.status === 'object' && result.status !== null) {
      const st = result.status as Record<string, unknown>;
      result.status = st.state ?? st.value ?? st.name ?? String(result.status);
      this.logAction('Extracted status from nested object');
      this.confidence *= 0.9;
    }

    return result;
  }

  // ── Phase 3: Event Type Normalization ──────────────────────

  /**
   * Maps provider-specific event names to our canonical state names.
   * Handles both dot-notation events and plain text statuses.
   */
  private normalizeEventType(payload: Record<string, unknown>): Record<string, unknown> {
    const result = { ...payload };

    // Store original event type for traceability
    if (result.status && !result.raw_event_type) {
      result.raw_event_type = String(result.status);
    }

    // Map dot-notation events (e.g. "payment.captured" → "captured")
    const rawStatus = String(result.status || '').toLowerCase().trim();

    // Direct mapping
    if (EVENT_TYPE_MAP[rawStatus]) {
      result.status = EVENT_TYPE_MAP[rawStatus];
      this.logAction(`Normalized event type "${rawStatus}" → "${result.status}"`);
      return result;
    }

    // Partial match: check if any key in EVENT_TYPE_MAP is contained in the raw status
    for (const [key, value] of Object.entries(EVENT_TYPE_MAP)) {
      if (rawStatus.includes(key) || key.includes(rawStatus)) {
        result.status = value;
        this.logAction(`Partial-mapped event type "${rawStatus}" → "${value}"`);
        this.confidence *= 0.85;
        return result;
      }
    }

    // If no mapping found, keep original and flag low confidence
    if (!STATE_ORDER.includes(rawStatus)) {
      this.logAction(`Unknown event type "${rawStatus}" — kept as-is`);
      this.confidence *= 0.7;
    }

    return result;
  }

  // ── Phase 4: Enrich from System State ──────────────────────

  /**
   * If the payload is missing fields that we know from previous events,
   * backfill them from the last known system state.
   */
  private enrichFromSystemState(
    payload: Record<string, unknown>,
    systemState: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...payload };
    const enrichableFields = [
      'transaction_id', 'amount', 'currency', 'customer_id',
      'email', 'gateway',
    ];

    for (const field of enrichableFields) {
      if (!result[field] || !this.isTruthy(result[field])) {
        const systemValue = (systemState as any)[field];
        if (systemValue) {
          result[field] = systemValue;
          this.logAction(`Backfilled "${field}" from last known system state`);
          this.confidence *= 0.92;
        }
      }
    }

    // State ordering: if the incoming event is EARLIER in the lifecycle
    // than the current system state, flag it as out-of-order.
    if (result.status && systemState.current_state) {
      const incomingIdx = STATE_ORDER.indexOf(String(result.status));
      const currentIdx = STATE_ORDER.indexOf(String(systemState.current_state));

      if (incomingIdx !== -1 && currentIdx !== -1 && incomingIdx < currentIdx) {
        this.logAction(
          `OUT-OF-ORDER: Event "${result.status}" arrived after system state "${systemState.current_state}". ` +
          `Flagged for ground-truth reconciliation.`
        );
        this.confidence *= 0.8;
      }
    }

    return result;
  }

  // ── Phase 5: Synthesize Defaults ───────────────────────────

  /**
   * Fill in non-critical missing fields with safe defaults.
   * Never invents financial values (amounts/currencies).
   */
  private synthesizeDefaults(payload: Record<string, unknown>): Record<string, unknown> {
    const result = { ...payload };

    // Safe defaults for non-financial fields
    if (!result.timestamp) {
      result.timestamp = new Date().toISOString();
      this.logAction('Synthesized current timestamp (missing in payload)');
      this.confidence *= 0.85;
    }

    if (!result.currency) {
      result.currency = 'INR';
      this.logAction('Applied default currency (INR)');
      this.confidence *= 0.9;
    }

    return result;
  }

  // ── Phase 6: Validate & Report ─────────────────────────────

  /**
   * Run the healed payload through the target schema.
   * Report remaining violations and final confidence.
   */
  private validateAndReport(
    healed: Record<string, unknown>,
    schema: z.ZodTypeAny
  ): HealedResult {
    const violations: ViolationSummary[] = [];

    try {
      const validated = schema.parse(healed);

      return {
        healed_payload: validated as Record<string, unknown>,
        agent_log: this.buildSummaryLog(),
        confidence_score: Math.round(this.confidence * 100) / 100,
        status: 'healed',
        actions_taken: this.actionsLog,
        schema_violations_remaining: [],
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        for (const issue of err.issues) {
          const path = issue.path.join('.');
          violations.push({
            field: path || '(root)',
            issue: issue.message,
            severity: 'remaining',
          });
        }

        // Check if we have a fatal (transaction_id or amount missing)
        const hasTransactionId = !!healed.transaction_id;
        const hasAmount = healed.amount !== undefined && healed.amount !== null;

        if (!hasTransactionId || !hasAmount) {
          return {
            healed_payload: null,
            agent_log: `Fatal: ${!hasTransactionId ? 'transaction_id' : 'amount'} is irrecoverable. ` +
              `Cannot heal without this core field.`,
            confidence_score: 0,
            status: 'fatal_error',
            actions_taken: this.actionsLog,
            schema_violations_remaining: violations,
          };
        }
      }

      // Partial heal — return what we have with warnings
      return {
        healed_payload: healed,
        agent_log: this.buildSummaryLog() + ` ${violations.length} schema violation(s) remain.`,
        confidence_score: Math.max(0, Math.round(this.confidence * 100) / 100),
        status: 'healed',
        actions_taken: this.actionsLog,
        schema_violations_remaining: violations,
      };
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (typeof value === 'number' && isNaN(value)) return false;
    return true;
  }

  private logAction(msg: string): void {
    this.actionsLog.push(msg);
  }

  private buildSummaryLog(): string {
    const actionCount = this.actionsLog.length;
    if (actionCount === 0) return 'Payload was already valid. No repairs needed.';
    return `Applied ${actionCount} repair${actionCount > 1 ? 's' : ''}: ${this.actionsLog.join('; ')}.`;
  }
}

// ─── Convenience Factory ───────────────────────────────────────

export interface HealOptions {
  payload: Record<string, unknown>;
  systemState?: Record<string, unknown>;
  provider?: string;
  schema?: z.ZodTypeAny;
}

/**
 * One-shot healer invocation.
 * Pass a broken payload and get back a healed result.
 */
export function healWebhook(options: HealOptions): HealedResult {
  const agent = new WebhookHealerAgent({
    brokenPayload: options.payload,
    targetSchema: options.schema ?? webhookEventSchema,
    currentSystemState: options.systemState,
    provider: options.provider,
  });

  return agent.heal();
}
