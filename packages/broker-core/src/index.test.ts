import { describe, expect, it } from 'vitest';

import { EventBus } from './index.js';

describe('EventBus', () => {
  it('delivers typed payloads to subscribers', () => {
    const bus = new EventBus();
    let received = false;

    bus.on('system.health', (payload) => {
      received = payload.status === 'healthy';
    });

    bus.emit('system.health', {
      status: 'healthy',
      at: new Date().toISOString(),
    });

    expect(received).toBe(true);
  });
});
