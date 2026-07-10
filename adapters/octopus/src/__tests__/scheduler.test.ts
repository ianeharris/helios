import { beforeEach, describe, expect, it, vi } from 'vitest';

const schedule = vi.hoisted(() => vi.fn());

vi.mock('node-cron', () => ({
  default: { schedule },
}));

import { LONDON_TIMEZONE, scheduleDailyTasks } from '../scheduler.js';

describe('scheduleDailyTasks', () => {
  beforeEach(() => {
    schedule.mockReset();
    schedule.mockReturnValue({ stop: vi.fn() });
  });

  it('runs every daily job in London time without overlap', () => {
    const task = vi.fn().mockResolvedValue(undefined);

    scheduleDailyTasks({
      consumption: task,
      rateRefresh: task,
      savingSessions: task,
      dispatch: task,
    });

    expect(schedule).toHaveBeenNthCalledWith(1, '0 2 * * *', expect.any(Function), {
      name: 'octopus-consumption',
      timezone: LONDON_TIMEZONE,
      noOverlap: true,
    });
    expect(schedule).toHaveBeenNthCalledWith(2, '0 5 * * *', expect.any(Function), {
      name: 'octopus-rate-refresh',
      timezone: LONDON_TIMEZONE,
      noOverlap: true,
    });
    expect(schedule).toHaveBeenNthCalledWith(3, '0 9 * * *', expect.any(Function), {
      name: 'octopus-saving-sessions',
      timezone: LONDON_TIMEZONE,
      noOverlap: true,
    });
    expect(schedule).toHaveBeenNthCalledWith(4, '0 20 * * *', expect.any(Function), {
      name: 'octopus-dispatch',
      timezone: LONDON_TIMEZONE,
      noOverlap: true,
    });
  });
});
