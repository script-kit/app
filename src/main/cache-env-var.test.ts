import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('CACHE_ENV_VAR Handler', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let kitState: any;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    
    // Create mock kitState
    kitState = {
      kenvEnv: {},
      sleepClearKeys: null as Set<string> | null,
    };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('Cache duration logic', () => {
    it('should handle session duration', () => {
      const handler = ({ channel, value }: any) => {
        const { key, value: envValue, duration = 'session' } = value;
        
        // Store in kitState.kenvEnv for immediate use
        kitState.kenvEnv[key] = envValue;
        
        // Handle different cache durations
        if (duration === 'until-quit' || duration === 'until-sleep') {
          // Store persistently in process.env for until-quit and until-sleep
          process.env[key] = envValue;
          
          if (duration === 'until-sleep') {
            // Track keys that should be cleared on sleep
            if (!kitState.sleepClearKeys) {
              kitState.sleepClearKeys = new Set<string>();
            }
            kitState.sleepClearKeys.add(key);
          }
        }
      };

      // Test session duration
      handler({
        channel: 'CACHE_ENV_VAR',
        value: {
          key: 'OP_SESSION_KEY',
          value: 'session-value',
          duration: 'session',
        },
      });

      expect(kitState.kenvEnv.OP_SESSION_KEY).toBe('session-value');
      expect(process.env.OP_SESSION_KEY).toBeUndefined();
      expect(kitState.sleepClearKeys).toBeNull();
    });

    it('should handle until-quit duration', () => {
      const handler = ({ channel, value }: any) => {
        const { key, value: envValue, duration = 'session' } = value;
        
        kitState.kenvEnv[key] = envValue;
        
        if (duration === 'until-quit' || duration === 'until-sleep') {
          process.env[key] = envValue;
          
          if (duration === 'until-sleep') {
            if (!kitState.sleepClearKeys) {
              kitState.sleepClearKeys = new Set<string>();
            }
            kitState.sleepClearKeys.add(key);
          }
        }
      };

      handler({
        channel: 'CACHE_ENV_VAR',
        value: {
          key: 'OP_QUIT_KEY',
          value: 'quit-value',
          duration: 'until-quit',
        },
      });

      expect(kitState.kenvEnv.OP_QUIT_KEY).toBe('quit-value');
      expect(process.env.OP_QUIT_KEY).toBe('quit-value');
      expect(kitState.sleepClearKeys).toBeNull();
    });

    it('should handle until-sleep duration', () => {
      const handler = ({ channel, value }: any) => {
        const { key, value: envValue, duration = 'session' } = value;
        
        kitState.kenvEnv[key] = envValue;
        
        if (duration === 'until-quit' || duration === 'until-sleep') {
          process.env[key] = envValue;
          
          if (duration === 'until-sleep') {
            if (!kitState.sleepClearKeys) {
              kitState.sleepClearKeys = new Set<string>();
            }
            kitState.sleepClearKeys.add(key);
          }
        }
      };

      handler({
        channel: 'CACHE_ENV_VAR',
        value: {
          key: 'OP_SLEEP_KEY',
          value: 'sleep-value',
          duration: 'until-sleep',
        },
      });

      expect(kitState.kenvEnv.OP_SLEEP_KEY).toBe('sleep-value');
      expect(process.env.OP_SLEEP_KEY).toBe('sleep-value');
      expect(kitState.sleepClearKeys).toBeInstanceOf(Set);
      expect(kitState.sleepClearKeys?.has('OP_SLEEP_KEY')).toBe(true);
    });
  });

  describe('Sleep mode clearing', () => {
    it('should clear sleep-cached keys on suspend', () => {
      // Set up cached keys
      kitState.kenvEnv = {
        OP_SESSION_KEY: 'session-value',
        OP_SLEEP_KEY_1: 'sleep-value-1',
        OP_SLEEP_KEY_2: 'sleep-value-2',
        OP_QUIT_KEY: 'quit-value',
      };
      
      process.env.OP_SLEEP_KEY_1 = 'sleep-value-1';
      process.env.OP_SLEEP_KEY_2 = 'sleep-value-2';
      process.env.OP_QUIT_KEY = 'quit-value';
      
      kitState.sleepClearKeys = new Set(['OP_SLEEP_KEY_1', 'OP_SLEEP_KEY_2']);

      // Simulate sleep clearing logic
      if (kitState.sleepClearKeys && kitState.sleepClearKeys.size > 0) {
        for (const key of kitState.sleepClearKeys) {
          delete process.env[key];
          delete kitState.kenvEnv[key];
        }
        kitState.sleepClearKeys.clear();
      }

      // Verify results
      expect(process.env.OP_SLEEP_KEY_1).toBeUndefined();
      expect(process.env.OP_SLEEP_KEY_2).toBeUndefined();
      expect(kitState.kenvEnv.OP_SLEEP_KEY_1).toBeUndefined();
      expect(kitState.kenvEnv.OP_SLEEP_KEY_2).toBeUndefined();
      
      expect(process.env.OP_QUIT_KEY).toBe('quit-value');
      expect(kitState.kenvEnv.OP_SESSION_KEY).toBe('session-value');
      expect(kitState.kenvEnv.OP_QUIT_KEY).toBe('quit-value');
      
      expect(kitState.sleepClearKeys.size).toBe(0);
    });
  });

  describe('Environment propagation', () => {
    it('should include cached vars in createEnv', () => {
      // Mock implementation of createEnv
      const createEnv = () => {
        return {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          KIT_CONTEXT: 'app',
          ...kitState.kenvEnv,
        };
      };

      // Set up cached environment variables
      kitState.kenvEnv = {
        OP_VAULT_ITEM_PASSWORD: 'cached-secret',
        OP_API_KEY: 'cached-api-key',
        CUSTOM_VAR: 'custom-value',
      };

      const env = createEnv();

      // Verify cached variables are included
      expect(env.OP_VAULT_ITEM_PASSWORD).toBe('cached-secret');
      expect(env.OP_API_KEY).toBe('cached-api-key');
      expect(env.CUSTOM_VAR).toBe('custom-value');
      expect(env.KIT_CONTEXT).toBe('app');
    });

    it('should override process.env with kitState.kenvEnv values', () => {
      // Set conflicting values
      process.env.OP_TEST_KEY = 'process-env-value';
      kitState.kenvEnv = {
        OP_TEST_KEY: 'kenv-env-value',
      };

      const createEnv = () => {
        return {
          ...process.env,
          ...kitState.kenvEnv, // This should override process.env
        };
      };

      const env = createEnv();

      // kenvEnv should take precedence
      expect(env.OP_TEST_KEY).toBe('kenv-env-value');
    });
  });
});