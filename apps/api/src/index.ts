import Fastify from 'fastify';
import { connectDb } from './db/client.js';
import { connectMqtt } from './mqtt/client.js';
import { healthRoutes } from './routes/health.js';

const app = Fastify({ logger: true });

app.register(healthRoutes);

const start = async (): Promise<void> => {
  await connectDb();
  await connectMqtt();

  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
