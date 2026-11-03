import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { isUuid, resolveDeviceInDatabase } from '../src/services/deviceResolver.ts';

// Mock database rows representing the user's Supabase public.devices table
const USER_ID = 'a1111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = 'b2222222-2222-4222-8222-222222222222';
const HOME_ID = 'h3333333-3333-4333-8333-333333333333';

const MOCK_DB_DEVICES = [
  {
    id: 'd1111111-0000-0000-0000-000000000001',
    home_id: HOME_ID,
    user_id: USER_ID,
    device_slug: 'light',
    name: 'Smart Light',
    type: 'light',
    relay_channel: 1,
    gpio_pin: 14,
    state: false,
    is_hardware_connected: true,
  },
  {
    id: 'd2222222-0000-0000-0000-000000000002',
    home_id: HOME_ID,
    user_id: USER_ID,
    device_slug: 'fan',
    name: 'Smart Fan',
    type: 'fan',
    relay_channel: 2,
    gpio_pin: 25,
    state: false,
    is_hardware_connected: true,
  },
  {
    id: 'd3333333-0000-0000-0000-000000000003',
    home_id: HOME_ID,
    user_id: USER_ID,
    device_slug: 'motor',
    name: 'Smart Motor',
    type: 'motor',
    relay_channel: 3,
    gpio_pin: 26,
    state: false,
    is_hardware_connected: true,
  },
];

/**
 * Creates a mock Supabase client that tracks executed queries and prevents
 * invalid UUID queries (simulating PostgreSQL 22P02 error if id.eq is called with non-UUID).
 */
function createMockSupabaseClient() {
  const queryLogs = [];

  return {
    queryLogs,
    from(table) {
      assert.strictEqual(table, 'devices', 'Expected query to target devices table');
      const queryState = {
        table,
        filters: {},
      };

      const chain = {
        select(cols) {
          queryState.cols = cols;
          return chain;
        },
        eq(col, val) {
          // PostgreSQL strict type check simulation:
          // If col is 'id', val MUST be a valid UUID or PostgreSQL crashes with 22P02!
          if (col === 'id') {
            if (!isUuid(val)) {
              const err = new Error(`PostgreSQL 22P02: invalid input syntax for type uuid: "${val}"`);
              err.code = '22P02';
              queryState.error = err;
            }
          }
          queryState.filters[col] = val;
          return chain;
        },
        async maybeSingle() {
          queryLogs.push({ ...queryState });

          if (queryState.error) {
            return { data: null, error: queryState.error };
          }

          // Match row in MOCK_DB_DEVICES against filters
          const matched = MOCK_DB_DEVICES.find(row => {
            for (const [k, v] of Object.entries(queryState.filters)) {
              if (row[k] !== v) return false;
            }
            return true;
          });

          return { data: matched || null, error: null };
        },
      };

      return chain;
    },
  };
}

describe('SmartHomeX AI - Device Registration & Command Targeting Audit', () => {
  let client;

  beforeEach(() => {
    client = createMockSupabaseClient();
  });

  // =========================================================================
  // Test Group 1: UUID Type Safety & 22P02 Syntax Prevention
  // =========================================================================
  describe('UUID Syntax & Validation', () => {
    test('isUuid correctly validates standard UUID v4 strings', () => {
      assert.strictEqual(isUuid('d3333333-0000-0000-0000-000000000003'), true);
      assert.strictEqual(isUuid('a1111111-1111-4111-8111-111111111111'), true);
    });

    test('isUuid rejects non-UUID slugs and channel identifiers', () => {
      assert.strictEqual(isUuid('motor'), false);
      assert.strictEqual(isUuid('light'), false);
      assert.strictEqual(isUuid('fan'), false);
      assert.strictEqual(isUuid('relay-1'), false);
      assert.strictEqual(isUuid('relay-2'), false);
      assert.strictEqual(isUuid('relay-3'), false);
      assert.strictEqual(isUuid(''), false);
      assert.strictEqual(isUuid(null), false);
      assert.strictEqual(isUuid(undefined), false);
    });

    test('Simulated PostgreSQL fails if id.eq is queried with non-UUID string', async () => {
      const mock = createMockSupabaseClient();
      const res = await mock.from('devices').select('id').eq('id', 'motor').maybeSingle();
      assert.ok(res.error, 'Should produce an error when id.eq is called with non-UUID');
      assert.strictEqual(res.error.code, '22P02');
      assert.strictEqual(res.data, null);
    });
  });

  // =========================================================================
  // Test Group 2: Target Device Resolution for Light, Fan, and Motor
  // =========================================================================
  describe('Device Resolution by Slug & Legacy Identifier', () => {
    test('Resolves Smart Light by slug "light"', async () => {
      const resolved = await resolveDeviceInDatabase(client, USER_ID, {
        id: 'light',
        name: 'Smart Light',
        type: 'light',
        relayChannel: 1,
      });

      assert.ok(resolved, 'Smart Light should resolve successfully');
      assert.strictEqual(resolved.id, 'd1111111-0000-0000-0000-000000000001');
      assert.strictEqual(resolved.device_slug, 'light');
      assert.strictEqual(resolved.relay_channel, 1);
      assert.strictEqual(resolved.user_id, USER_ID);

      // Verify no 22P02 errors occurred in any executed query
      for (const log of client.queryLogs) {
        assert.strictEqual(log.error, undefined, 'No query should trigger PostgreSQL 22P02 error');
        assert.strictEqual(log.filters.user_id, USER_ID, 'Every query must filter by user_id');
      }
    });

    test('Resolves Smart Fan by slug "fan"', async () => {
      const resolved = await resolveDeviceInDatabase(client, USER_ID, {
        id: 'fan',
        name: 'Smart Fan',
        type: 'fan',
        relayChannel: 2,
      });

      assert.ok(resolved, 'Smart Fan should resolve successfully');
      assert.strictEqual(resolved.id, 'd2222222-0000-0000-0000-000000000002');
      assert.strictEqual(resolved.device_slug, 'fan');
      assert.strictEqual(resolved.relay_channel, 2);
      assert.strictEqual(resolved.user_id, USER_ID);
    });

    test('Resolves Smart Motor by slug "motor"', async () => {
      const resolved = await resolveDeviceInDatabase(client, USER_ID, {
        id: 'motor',
        name: 'Smart Motor',
        type: 'motor',
        relayChannel: 3,
      });

      assert.ok(resolved, 'Smart Motor should resolve successfully');
      assert.strictEqual(resolved.id, 'd3333333-0000-0000-0000-000000000003');
      assert.strictEqual(resolved.device_slug, 'motor');
      assert.strictEqual(resolved.relay_channel, 3);
      assert.strictEqual(resolved.user_id, USER_ID);
    });

    test('Resolves Smart Motor by legacy identifier "relay-3"', async () => {
      const resolved = await resolveDeviceInDatabase(client, USER_ID, {
        id: 'relay-3',
        name: 'Water Booster Motor',
        type: 'motor',
        relayChannel: 3,
      });

      assert.ok(resolved, 'Should resolve relay-3 to the motor database record');
      assert.strictEqual(resolved.id, 'd3333333-0000-0000-0000-000000000003');
      assert.strictEqual(resolved.device_slug, 'motor');
    });

    test('Resolves device when dbId UUID is already attached', async () => {
      const resolved = await resolveDeviceInDatabase(client, USER_ID, {
        id: 'motor',
        dbId: 'd3333333-0000-0000-0000-000000000003',
        name: 'Smart Motor',
        type: 'motor',
        relayChannel: 3,
      });

      assert.ok(resolved);
      assert.strictEqual(resolved.id, 'd3333333-0000-0000-0000-000000000003');
      // Should have performed direct UUID match
      assert.strictEqual(client.queryLogs[0].filters.id, 'd3333333-0000-0000-0000-000000000003');
    });
  });

  // =========================================================================
  // Test Group 3: User Ownership & Security Isolation
  // =========================================================================
  describe('User Ownership & Isolation Enforcement', () => {
    test('Prevents resolving device belonging to a different user', async () => {
      const resolved = await resolveDeviceInDatabase(client, OTHER_USER_ID, {
        id: 'motor',
        name: 'Smart Motor',
        type: 'motor',
        relayChannel: 3,
      });

      assert.strictEqual(resolved, null, 'Should return null when device belongs to another user');
    });

    test('Every executed database filter strictly enforces user_id', async () => {
      await resolveDeviceInDatabase(client, USER_ID, {
        id: 'unknown-device',
        relayChannel: 4,
        type: 'unused',
      });

      assert.ok(client.queryLogs.length > 0, 'Queries should have executed');
      for (const log of client.queryLogs) {
        assert.strictEqual(log.filters.user_id, USER_ID, 'Every query must include user_id filter');
      }
    });
  });

  // =========================================================================
  // Test Group 4: Command Targeting & device_commands Payload Construction
  // =========================================================================
  describe('Command Targeting & device_commands Payload Construction', () => {
    test('Constructs verified device_commands record for Smart Motor', async () => {
      const resolved = await resolveDeviceInDatabase(client, USER_ID, {
        id: 'motor',
        name: 'Smart Motor',
        type: 'motor',
        relayChannel: 3,
      });

      assert.ok(resolved);
      const commandPayload = {
        user_id: USER_ID,
        device_id: resolved.id,
        action: 'ON',
        source: 'manual',
        status: 'pending',
        nonce: 'n_test_123',
      };

      assert.strictEqual(commandPayload.device_id, 'd3333333-0000-0000-0000-000000000003');
      assert.strictEqual(isUuid(commandPayload.device_id), true);
      assert.strictEqual(commandPayload.user_id, USER_ID);
      assert.strictEqual(commandPayload.status, 'pending');
    });

    test('Constructs verified device_commands record for Smart Light', async () => {
      const resolved = await resolveDeviceInDatabase(client, USER_ID, {
        id: 'light',
        name: 'Smart Light',
        type: 'light',
        relayChannel: 1,
      });

      assert.ok(resolved);
      const commandPayload = {
        user_id: USER_ID,
        device_id: resolved.id,
        action: 'OFF',
        source: 'manual',
        status: 'pending',
        nonce: 'n_test_456',
      };

      assert.strictEqual(commandPayload.device_id, 'd1111111-0000-0000-0000-000000000001');
      assert.strictEqual(isUuid(commandPayload.device_id), true);
      assert.strictEqual(commandPayload.user_id, USER_ID);
    });

    test('Constructs verified device_commands record for Smart Fan', async () => {
      const resolved = await resolveDeviceInDatabase(client, USER_ID, {
        id: 'fan',
        name: 'Smart Fan',
        type: 'fan',
        relayChannel: 2,
      });

      assert.ok(resolved);
      const commandPayload = {
        user_id: USER_ID,
        device_id: resolved.id,
        action: 'ON',
        source: 'schedule',
        status: 'pending',
        nonce: 'n_test_789',
      };

      assert.strictEqual(commandPayload.device_id, 'd2222222-0000-0000-0000-000000000002');
      assert.strictEqual(isUuid(commandPayload.device_id), true);
      assert.strictEqual(commandPayload.user_id, USER_ID);
    });
  });
});
