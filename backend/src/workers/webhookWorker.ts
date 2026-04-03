import { EventEmitter } from 'events';

// Webhook worker placeholder — in production this would consume from a BullMQ queue
// For now, webhooks are processed synchronously in the route handler.
// This EventEmitter is kept for compatibility with the index.ts startup sequence.

export const webhookWorker = new EventEmitter();

// Emit ready signal on next tick so index.ts can log it
process.nextTick(() => {
  webhookWorker.emit('ready');
});
