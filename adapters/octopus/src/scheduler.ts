import cron, { type ScheduledTask } from 'node-cron';

export const LONDON_TIMEZONE = 'Europe/London';

type DailyTaskKey = 'consumption' | 'rateRefresh' | 'savingSessions' | 'dispatch';

type DailyTasks = Record<DailyTaskKey, () => Promise<void>>;

type ScheduleDefinition = {
  expression: string;
  name: string;
  task: DailyTaskKey;
};

const DAILY_SCHEDULES: ScheduleDefinition[] = [
  { expression: '0 2 * * *', name: 'octopus-consumption', task: 'consumption' },
  { expression: '0 5 * * *', name: 'octopus-rate-refresh', task: 'rateRefresh' },
  { expression: '0 9 * * *', name: 'octopus-saving-sessions', task: 'savingSessions' },
  { expression: '0 20 * * *', name: 'octopus-dispatch', task: 'dispatch' },
];

export const scheduleDailyTasks = (tasks: DailyTasks): ScheduledTask[] =>
  DAILY_SCHEDULES.map(({ expression, name, task }) =>
    cron.schedule(expression, () => void tasks[task](), {
      name,
      timezone: LONDON_TIMEZONE,
      noOverlap: true,
    }),
  );
