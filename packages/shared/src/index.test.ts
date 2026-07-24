import { describe, expect, it } from 'vitest';

import { setupAdminSchema } from './index.js';

describe('setupAdminSchema', () => {
  it('rejects mismatched passwords', () => {
    const result = setupAdminSchema.safeParse({
      username: 'admin',
      password: 'very-secure-password',
      confirmPassword: 'not-the-same',
    });

    expect(result.success).toBe(false);
  });
});
