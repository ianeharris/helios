import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { connectDb } from './db/client.js';
import { connectMqtt } from './mqtt/client.js';
import { healthRoutes } from './routes/health.js';
import { energyRoutes } from './routes/energy.js';
import { roomRoutes } from './routes/rooms.js';
import { deviceRoutes } from './routes/devices.js';
import { streamRoutes } from './routes/stream.js';
import { metricsRoutes } from './routes/metrics.js';

const app = Fastify({ logger: true });

app.register(websocket);
app.register(healthRoutes);
app.register(metricsRoutes);
app.register(energyRoutes);
app.register(roomRoutes);
app.register(deviceRoutes);
app.register(streamRoutes);

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
