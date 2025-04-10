import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../logger';

describe('Logger', () => {
  let stderrWrite: ReturnType<typeof vi.fn<[string | Uint8Array], boolean>>;
  const originalStderrWrite = process.stderr.write;

  beforeEach(() => {
    stderrWrite = vi.fn<[string | Uint8Array], boolean>().mockReturnValue(true);
    process.stderr.write = stderrWrite;
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
    vi.clearAllMocks();
  });

  describe('info', () => {
    it('should write message to stderr with INFO prefix', () => {
      logger.info('test message');
      expect(stderrWrite).toHaveBeenCalledWith('[INFO] test message\n');
    });

    it('should write additional args as JSON', () => {
      const args = { foo: 'bar' };
      logger.info('test message', args);
      expect(stderrWrite).toHaveBeenCalledWith('[INFO] test message\n');
      expect(stderrWrite).toHaveBeenCalledWith(JSON.stringify([args], null, 2) + '\n');
    });
  });

  describe('error', () => {
    it('should write message to stderr with ERROR prefix', () => {
      logger.error('test error');
      expect(stderrWrite).toHaveBeenCalledWith('[ERROR] test error\n');
    });

    it('should write Error stack when error is provided', () => {
      const error = new Error('test error');
      logger.error('error occurred', error);
      expect(stderrWrite).toHaveBeenCalledWith('[ERROR] error occurred\n');
      expect(stderrWrite).toHaveBeenCalledWith(error.stack + '\n');
    });

    it('should write non-Error objects as JSON', () => {
      const error = { message: 'test error' };
      logger.error('error occurred', error);
      expect(stderrWrite).toHaveBeenCalledWith('[ERROR] error occurred\n');
      expect(stderrWrite).toHaveBeenCalledWith(JSON.stringify(error, null, 2) + '\n');
    });
  });

  describe('debug', () => {
    it('should write message to stderr with DEBUG prefix', () => {
      logger.debug('test debug');
      expect(stderrWrite).toHaveBeenCalledWith('[DEBUG] test debug\n');
    });

    it('should write additional args as JSON', () => {
      const args = { foo: 'bar' };
      logger.debug('test debug', args);
      expect(stderrWrite).toHaveBeenCalledWith('[DEBUG] test debug\n');
      expect(stderrWrite).toHaveBeenCalledWith(JSON.stringify([args], null, 2) + '\n');
    });
  });

  describe('warn', () => {
    it('should write message to stderr with WARN prefix', () => {
      logger.warn('test warning');
      expect(stderrWrite).toHaveBeenCalledWith('[WARN] test warning\n');
    });

    it('should write additional args as JSON', () => {
      const args = { foo: 'bar' };
      logger.warn('test warning', args);
      expect(stderrWrite).toHaveBeenCalledWith('[WARN] test warning\n');
      expect(stderrWrite).toHaveBeenCalledWith(JSON.stringify([args], null, 2) + '\n');
    });
  });
});
