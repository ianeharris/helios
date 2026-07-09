import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { subscribeMqttEvents, type MqttEvent } from '../mqtt/client.js';

type StreamQuery = {
  topics?: string;
};

export const streamRoutes = (app: FastifyInstance, _opts: unknown, done: () => void): void => {
  app.get('/stream', { websocket: true }, (connection: SocketStream, req: FastifyRequest<{ Querystring: StreamQuery }>) => {
    const filters = parseTopicFilters(req.query.topics);

    const unsubscribe = subscribeMqttEvents((event) => {
      if (!matchesAny(event.topic, filters)) return;
      connection.socket.send(JSON.stringify(event));
    });

    connection.socket.send(JSON.stringify({
      topic: 'helios/system/api/stream',
      payload: { status: 'connected', filters },
      receivedAt: new Date().toISOString(),
    } satisfies MqttEvent));

    connection.socket.on('close', unsubscribe);
  });

  done();
};

const parseTopicFilters = (topics: string | undefined): string[] => {
  if (!topics) return ['helios/#'];
  return topics
    .split(',')
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0);
};

const matchesAny = (topic: string, filters: string[]): boolean =>
  filters.some((filter) => matchesTopicFilter(topic, filter));

const matchesTopicFilter = (topic: string, filter: string): boolean => {
  const topicParts = topic.split('/');
  const filterParts = filter.split('/');

  for (let i = 0; i < filterParts.length; i += 1) {
    const part = filterParts[i];
    if (part === '#') return true;
    if (part === '+') continue;
    if (part !== topicParts[i]) return false;
  }

  return topicParts.length === filterParts.length;
};
