import 'dotenv/config'

import express, { Request, Response } from 'express';
import cors from 'cors';
import webhookRouter from './routes/webhook';
import mockRouter from './routes/mock';
import transactionsRouter from './routes/transactions';
import metricsRouter from './routes/metrics';
import anomaliesRouter from './routes/anomalies';
import { webhookWorker } from './workers/webhookWorker';
import { healWorker } from './workers/healWorker';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, timestamp: new Date() });
});

app.use('/webhook', webhookRouter);
app.use('/mock', mockRouter);
app.use('/transactions', transactionsRouter);
app.use('/metrics', metricsRouter);
app.use('/anomalies', anomaliesRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

webhookWorker.on('ready', () => {
  console.log('Webhook worker is ready');
});

healWorker.on('ready', () => {
  console.log('Heal worker is ready');
});

export default app;
