import { supabase } from '../db/supabase.js';

// High-rate test data injection script
// Run with: npx ts-node src/scripts/injectTestData.ts

async function injectTestData() {
  console.log('[TestData] Starting high-rate data injection...');

  const baseTime = Date.now();
  let injected = 0;
  let anomaliesCreated = 0;

  // 1. Inject a batch of transactions with various states
  const transactions = [];
  for (let i = 0; i < 20; i++) {
    const txnId = `pay_TEST${String(i + 1).padStart(3, '0')}`;
    const states = ['created', 'authorized', 'captured', 'settled'];
    const stateIndex = Math.floor(i / 5); // 5 of each state
    const currentState = states[stateIndex] || 'created';
    
    transactions.push({
      gateway: 'razorpay',
      gateway_txn_id: txnId,
      amount: Math.floor(Math.random() * 50000) + 1000,
      currency: 'INR',
      current_state: currentState,
      created_at: new Date(baseTime - (20 - i) * 60000).toISOString(),
    });
  }

  const { data: insertedTxns, error: txnError } = await supabase
    .from('transactions')
    .insert(transactions)
    .select();

  if (txnError) {
    console.error('[TestData] Failed to insert transactions:', txnError.message);
  } else {
    console.log(`[TestData] Inserted ${insertedTxns?.length || 0} transactions`);
    injected += insertedTxns?.length || 0;
  }

  // 2. Inject webhook events for those transactions (with unique idempotency keys)
  const events = [];
  for (let i = 0; i < 20; i++) {
    const txnId = `pay_TEST${String(i + 1).padStart(3, '0')}`;
    const stateIndex = Math.floor(i / 5);
    const txn = insertedTxns?.[i];
    const uniqueSuffix = `${Date.now()}-${i}`;
    
    // Add events based on state
    if (stateIndex >= 0 && txn) {
      events.push({
        transaction_id: txn.id,
        idempotency_key: `razorpay:${txnId}:created:${uniqueSuffix}`,
        event_type: 'created',
        gateway_timestamp: new Date(baseTime - (20 - i) * 60000 - 300000),
        source: 'gateway_poll',
        raw_payload: { event: 'created' },
      });
    }
    if (stateIndex >= 1 && txn) {
      events.push({
        transaction_id: txn.id,
        idempotency_key: `razorpay:${txnId}:authorized:${uniqueSuffix}`,
        event_type: 'authorized',
        gateway_timestamp: new Date(baseTime - (20 - i) * 60000 - 240000),
        source: 'gateway_poll',
        raw_payload: { event: 'authorized' },
      });
    }
    if (stateIndex >= 2 && txn) {
      events.push({
        transaction_id: txn.id,
        idempotency_key: `razorpay:${txnId}:captured:${uniqueSuffix}`,
        event_type: 'captured',
        gateway_timestamp: new Date(baseTime - (20 - i) * 60000 - 180000),
        source: 'gateway_poll',
        raw_payload: { event: 'captured' },
      });
    }
    if (stateIndex >= 3 && txn) {
      events.push({
        transaction_id: txn.id,
        idempotency_key: `razorpay:${txnId}:settled:${uniqueSuffix}`,
        event_type: 'settled',
        gateway_timestamp: new Date(baseTime - (20 - i) * 60000 - 120000),
        source: 'gateway_poll',
        raw_payload: { event: 'settled' },
      });
    }
  }

  if (events.length > 0) {
    const { data: insertedEvents, error: eventsError } = await supabase
      .from('webhook_events')
      .insert(events);

    if (eventsError) {
      console.error('[TestData] Failed to insert events:', eventsError.message);
    } else {
      console.log(`[TestData] Inserted ${events.length} webhook events`);
      injected += events.length;
    }
  }

  // 3. Inject healer_audit_log entries to boost AI Recovery Rate
  const auditEntries = [];
  const outcomes = ['healed', 'suppressed', 'processed'];
  
  for (let i = 0; i < 15; i++) {
    const outcome = outcomes[i % 3];
    const txnId = `pay_TEST${String(i + 1).padStart(3, '0')}`;
    
    auditEntries.push({
      gateway_txn_id: txnId,
      gateway: 'razorpay',
      original_event_type: 'created',
      healed_event_type: 'captured',
      outcome,
      actions_taken: outcome === 'healed' 
        ? ['Injected missing events from gateway']
        : outcome === 'suppressed'
        ? ['Suppressed duplicate event']
        : ['Normal processing'],
      bridge_events_synthesized: outcome === 'healed' ? 2 : 0,
      confidence_score: outcome === 'healed' ? 0.92 : 1.0,
      reasoning_trail: `Test data injection: ${outcome} scenario`,
      created_at: new Date(baseTime - (15 - i) * 30000).toISOString(),
    });
  }

  const { data: insertedAudits, error: auditError } = await supabase
    .from('healer_audit_log')
    .insert(auditEntries)
    .select();

  if (auditError) {
    console.error('[TestData] Failed to insert audit entries:', auditError.message);
    console.log('[TestData] Tip: Run the migration_add_ai_metadata.sql migration first');
  } else {
    console.log(`[TestData] Inserted ${insertedAudits ? insertedAudits.length : 0} healer audit entries`);
  }

  // 4. Create some open anomalies for testing (using valid enum values)
  if (insertedTxns && insertedTxns.length > 0) {
    const anomalies = [];
    const anomalyTypes = ['conflict', 'gateway_outage', 'impossible_transition', 'max_retries_exceeded'] as const;
    
    for (let i = 0; i < 5; i++) {
      anomalies.push({
        transaction_id: insertedTxns[i]?.id,
        type: anomalyTypes[i % anomalyTypes.length],
        severity: i % 3 === 0 ? 'high' : 'medium',
        description: `Test anomaly: Transaction ${insertedTxns[i]?.gateway_txn_id} has incomplete lifecycle`,
        created_at: new Date(baseTime - (5 - i) * 60000).toISOString(),
      });
    }

    const { data: insertedAnomalies, error: anomalyError } = await supabase
      .from('anomalies')
      .insert(anomalies)
      .select();

    if (anomalyError) {
      console.error('[TestData] Failed to insert anomalies:', anomalyError.message);
    } else {
      console.log(`[TestData] Created ${insertedAnomalies ? insertedAnomalies.length : 0} open anomalies`);
      anomaliesCreated += insertedAnomalies ? insertedAnomalies.length : 0;
    }
  }

  // 5. Create some heal_jobs entries
  if (insertedTxns && insertedTxns.length > 0) {
    const healJobs = [];
    for (let i = 0; i < 8; i++) {
      const status = i < 5 ? 'resolved' : i < 7 ? 'failed' : 'pending';
      healJobs.push({
        transaction_id: insertedTxns[i]?.id,
        missing_states: i < 5 ? ['created', 'authorized'] : ['captured'],
        status,
        attempts: i < 7 ? 1 : 0,
        created_at: new Date(baseTime - (8 - i) * 45000).toISOString(),
        last_attempted_at: status !== 'pending' ? new Date(baseTime - (8 - i) * 30000).toISOString() : null,
        resolution_notes: status === 'resolved' ? 'Auto-healed via gateway poll' : null,
      });
    }

    const { data: insertedHealJobs, error: healJobError } = await supabase
      .from('heal_jobs')
      .insert(healJobs)
      .select();

    if (healJobError) {
      console.error('[TestData] Failed to insert heal jobs:', healJobError.message);
    } else {
      console.log(`[TestData] Created ${insertedHealJobs ? insertedHealJobs.length : 0} heal jobs`);
    }
  }

  console.log(`\n[TestData] ✅ Injection complete!`);
  console.log(`[TestData] Total items injected: ${injected}`);
  console.log(`[TestData] Anomalies created: ${anomaliesCreated}`);
  console.log('[TestData] Refresh your dashboard to see updated metrics');
}

// Run the injection
injectTestData().catch(err => {
  console.error('[TestData] Fatal error:', err);
  process.exit(1);
});
