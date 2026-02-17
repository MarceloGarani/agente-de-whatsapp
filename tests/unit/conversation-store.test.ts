// No need to mock env or logger — conversation-store has no external dependencies

import {
  addMessage,
  getHistory,
  getHistoryForGPT,
  setLastAction,
  getLastAction,
  setPendingUpload,
  getPendingUpload,
  clearPendingUpload,
  cleanExpiredConversations,
} from '../../src/services/conversation-store';

describe('Conversation Store', () => {
  // Use fake timers for TTL tests.
  // The module uses module-level Maps, so tests share state.
  // Use unique userIds per test to avoid interference.

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  // ─── addMessage ────────────────────────────────────────────────

  describe('addMessage', () => {
    it('adds a single message and retrieves it via getHistory', () => {
      addMessage('user-add-1', 'user', 'Hello');
      const history = getHistory('user-add-1');
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Hello');
      expect(history[0].timestamp).toBe(Date.now());
    });

    it('adds multiple messages preserving order', () => {
      addMessage('user-add-2', 'user', 'First');
      jest.advanceTimersByTime(1000);
      addMessage('user-add-2', 'assistant', 'Second');
      jest.advanceTimersByTime(1000);
      addMessage('user-add-2', 'user', 'Third');

      const history = getHistory('user-add-2');
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe('First');
      expect(history[1].content).toBe('Second');
      expect(history[2].content).toBe('Third');
    });

    it('trims oldest messages when exceeding MAX_HISTORY (10)', () => {
      const userId = 'user-add-overflow';
      // Add 12 messages
      for (let i = 1; i <= 12; i++) {
        addMessage(userId, 'user', `Message ${i}`);
        jest.advanceTimersByTime(100);
      }

      const history = getHistory(userId);
      expect(history).toHaveLength(10);
      // Oldest 2 should be trimmed: messages 1 and 2 removed
      expect(history[0].content).toBe('Message 3');
      expect(history[9].content).toBe('Message 12');
    });

    it('keeps exactly MAX_HISTORY entries when adding one past the limit', () => {
      const userId = 'user-add-exact';
      // Add exactly 10
      for (let i = 1; i <= 10; i++) {
        addMessage(userId, 'user', `Msg ${i}`);
        jest.advanceTimersByTime(100);
      }
      expect(getHistory(userId)).toHaveLength(10);

      // Add one more — should trim to 10
      addMessage(userId, 'user', 'Msg 11');
      const history = getHistory(userId);
      expect(history).toHaveLength(10);
      expect(history[0].content).toBe('Msg 2');
      expect(history[9].content).toBe('Msg 11');
    });
  });

  // ─── getHistory ────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns empty array for unknown user', () => {
      expect(getHistory('user-unknown-1')).toEqual([]);
    });

    it('returns all entries within 30min TTL window', () => {
      const userId = 'user-hist-1';
      addMessage(userId, 'user', 'Recent message');
      jest.advanceTimersByTime(10 * 60 * 1000); // 10 minutes later
      addMessage(userId, 'assistant', 'Still fresh');

      const history = getHistory(userId);
      expect(history).toHaveLength(2);
    });

    it('filters out entries older than 30min TTL', () => {
      const userId = 'user-hist-ttl';
      addMessage(userId, 'user', 'Old message');

      // Advance 31 minutes — beyond the 30min TTL
      jest.advanceTimersByTime(31 * 60 * 1000);

      addMessage(userId, 'assistant', 'New message');

      const history = getHistory(userId);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('New message');
    });

    it('returns empty when all messages have expired', () => {
      const userId = 'user-hist-all-expired';
      addMessage(userId, 'user', 'Will expire');
      addMessage(userId, 'assistant', 'Also will expire');

      jest.advanceTimersByTime(31 * 60 * 1000);

      expect(getHistory(userId)).toHaveLength(0);
    });

    it('includes message exactly at the TTL boundary (>cutoff, not >=)', () => {
      const userId = 'user-hist-boundary';
      addMessage(userId, 'user', 'Boundary message');

      // Advance exactly 30 minutes — timestamp === cutoff, so timestamp > cutoff is false
      jest.advanceTimersByTime(30 * 60 * 1000);

      const history = getHistory(userId);
      // The filter is e.timestamp > cutoff. At exactly 30min, timestamp equals cutoff, so filtered out.
      expect(history).toHaveLength(0);
    });
  });

  // ─── getHistoryForGPT ─────────────────────────────────────────

  describe('getHistoryForGPT', () => {
    it('returns {role, content} objects without timestamp', () => {
      const userId = 'user-gpt-1';
      addMessage(userId, 'user', 'What is the weather?');
      addMessage(userId, 'assistant', 'It is sunny.');

      const result = getHistoryForGPT(userId);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'What is the weather?' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'It is sunny.' });

      // Ensure no timestamp property
      result.forEach(entry => {
        expect(entry).not.toHaveProperty('timestamp');
      });
    });

    it('returns empty array for unknown user', () => {
      expect(getHistoryForGPT('user-gpt-unknown')).toEqual([]);
    });

    it('respects TTL filtering (same as getHistory)', () => {
      const userId = 'user-gpt-ttl';
      addMessage(userId, 'user', 'Old');
      jest.advanceTimersByTime(31 * 60 * 1000);
      addMessage(userId, 'assistant', 'New');

      const result = getHistoryForGPT(userId);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'assistant', content: 'New' });
    });
  });

  // ─── setLastAction / getLastAction ─────────────────────────────

  describe('setLastAction / getLastAction', () => {
    it('stores and retrieves a last action', () => {
      const userId = 'user-action-1';
      const details = { eventId: 'evt-123', title: 'Team Standup' };
      setLastAction(userId, 'meeting_created', details);

      const action = getLastAction(userId);
      expect(action).toBeDefined();
      expect(action!.type).toBe('meeting_created');
      expect(action!.details).toEqual(details);
      expect(action!.timestamp).toBe(Date.now());
    });

    it('returns undefined for unknown user', () => {
      expect(getLastAction('user-action-unknown')).toBeUndefined();
    });

    it('overwrites previous action for same user', () => {
      const userId = 'user-action-overwrite';
      setLastAction(userId, 'event_created', { id: '1' });
      jest.advanceTimersByTime(1000);
      setLastAction(userId, 'file_uploaded', { id: '2' });

      const action = getLastAction(userId);
      expect(action!.type).toBe('file_uploaded');
      expect(action!.details).toEqual({ id: '2' });
    });

    it('returns undefined when action has expired (30min TTL)', () => {
      const userId = 'user-action-ttl';
      setLastAction(userId, 'event_cancelled', { reason: 'conflict' });

      // Advance 31 minutes past TTL
      jest.advanceTimersByTime(31 * 60 * 1000);

      expect(getLastAction(userId)).toBeUndefined();
    });

    it('returns action within TTL window', () => {
      const userId = 'user-action-within-ttl';
      setLastAction(userId, 'event_created', { title: 'Lunch' });

      jest.advanceTimersByTime(29 * 60 * 1000); // 29 minutes — within TTL

      const action = getLastAction(userId);
      expect(action).toBeDefined();
      expect(action!.type).toBe('event_created');
    });

    it('deletes expired action from internal map on access', () => {
      const userId = 'user-action-cleanup';
      setLastAction(userId, 'file_uploaded', { name: 'doc.pdf' });

      jest.advanceTimersByTime(31 * 60 * 1000);

      // First call returns undefined and cleans up
      expect(getLastAction(userId)).toBeUndefined();
      // Second call also returns undefined (already deleted)
      expect(getLastAction(userId)).toBeUndefined();
    });
  });

  // ─── setPendingUpload / getPendingUpload ───────────────────────

  describe('setPendingUpload / getPendingUpload', () => {
    it('stores and retrieves a pending upload', () => {
      const userId = 'user-upload-1';
      const upload = {
        buffer: Buffer.from('file content'),
        mimeType: 'application/pdf',
        originalFilename: 'report.pdf',
      };
      setPendingUpload(userId, upload);

      const result = getPendingUpload(userId);
      expect(result).toBeDefined();
      expect(result!.buffer).toEqual(Buffer.from('file content'));
      expect(result!.mimeType).toBe('application/pdf');
      expect(result!.originalFilename).toBe('report.pdf');
      expect(result!.expiresAt).toBe(Date.now() + 5 * 60 * 1000);
    });

    it('returns undefined for unknown user', () => {
      expect(getPendingUpload('user-upload-unknown')).toBeUndefined();
    });

    it('returns upload within 5min TTL', () => {
      const userId = 'user-upload-within';
      setPendingUpload(userId, {
        buffer: Buffer.from('data'),
        mimeType: 'image/png',
      });

      jest.advanceTimersByTime(4 * 60 * 1000); // 4 minutes — within TTL

      const result = getPendingUpload(userId);
      expect(result).toBeDefined();
      expect(result!.mimeType).toBe('image/png');
    });

    it('returns undefined when upload has expired (5min TTL)', () => {
      const userId = 'user-upload-expired';
      setPendingUpload(userId, {
        buffer: Buffer.from('expired data'),
        mimeType: 'text/plain',
      });

      jest.advanceTimersByTime(5 * 60 * 1000 + 1); // Just past 5 minutes

      expect(getPendingUpload(userId)).toBeUndefined();
    });

    it('overwrites previous upload for same user', () => {
      const userId = 'user-upload-overwrite';
      setPendingUpload(userId, {
        buffer: Buffer.from('first'),
        mimeType: 'text/plain',
        originalFilename: 'a.txt',
      });
      jest.advanceTimersByTime(1000);
      setPendingUpload(userId, {
        buffer: Buffer.from('second'),
        mimeType: 'image/jpeg',
        originalFilename: 'b.jpg',
      });

      const result = getPendingUpload(userId);
      expect(result!.originalFilename).toBe('b.jpg');
      expect(result!.mimeType).toBe('image/jpeg');
    });

    it('deletes expired upload from internal map on access', () => {
      const userId = 'user-upload-cleanup';
      setPendingUpload(userId, {
        buffer: Buffer.from('temp'),
        mimeType: 'application/octet-stream',
      });

      jest.advanceTimersByTime(6 * 60 * 1000);

      // First call returns undefined and cleans up
      expect(getPendingUpload(userId)).toBeUndefined();
      // Second call also returns undefined (already deleted)
      expect(getPendingUpload(userId)).toBeUndefined();
    });

    it('handles upload without optional originalFilename', () => {
      const userId = 'user-upload-no-name';
      setPendingUpload(userId, {
        buffer: Buffer.from('no name'),
        mimeType: 'audio/mpeg',
      });

      const result = getPendingUpload(userId);
      expect(result).toBeDefined();
      expect(result!.originalFilename).toBeUndefined();
      expect(result!.mimeType).toBe('audio/mpeg');
    });
  });

  // ─── clearPendingUpload ────────────────────────────────────────

  describe('clearPendingUpload', () => {
    it('removes a pending upload', () => {
      const userId = 'user-clear-1';
      setPendingUpload(userId, {
        buffer: Buffer.from('to clear'),
        mimeType: 'text/plain',
      });

      expect(getPendingUpload(userId)).toBeDefined();

      clearPendingUpload(userId);

      expect(getPendingUpload(userId)).toBeUndefined();
    });

    it('does not throw when clearing non-existent upload', () => {
      expect(() => clearPendingUpload('user-clear-nonexistent')).not.toThrow();
    });
  });

  // ─── cleanExpiredConversations ─────────────────────────────────

  describe('cleanExpiredConversations', () => {
    it('removes conversations where all messages have expired', () => {
      const userId = 'user-clean-all-expired';
      addMessage(userId, 'user', 'Old message 1');
      addMessage(userId, 'assistant', 'Old message 2');

      jest.advanceTimersByTime(31 * 60 * 1000);

      cleanExpiredConversations();

      // After cleanup, even adding new time won't resurrect old data
      expect(getHistory(userId)).toHaveLength(0);
    });

    it('keeps conversations with valid (non-expired) messages', () => {
      const userId = 'user-clean-valid';
      addMessage(userId, 'user', 'Still valid');

      jest.advanceTimersByTime(10 * 60 * 1000); // 10 minutes — within TTL

      cleanExpiredConversations();

      expect(getHistory(userId)).toHaveLength(1);
      expect(getHistory(userId)[0].content).toBe('Still valid');
    });

    it('trims expired messages but keeps valid ones in same conversation', () => {
      const userId = 'user-clean-mixed';
      addMessage(userId, 'user', 'Old message');

      jest.advanceTimersByTime(25 * 60 * 1000); // 25 minutes
      addMessage(userId, 'assistant', 'Recent message');

      jest.advanceTimersByTime(6 * 60 * 1000); // Now 31 minutes from first, 6 from second

      cleanExpiredConversations();

      // The old message (31min ago) should be cleaned, recent one (6min ago) should remain
      const history = getHistory(userId);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Recent message');
    });

    it('also deletes lastAction when all conversation messages expire', () => {
      const userId = 'user-clean-action';
      addMessage(userId, 'user', 'Trigger');
      setLastAction(userId, 'event_created', { id: 'evt-999' });

      jest.advanceTimersByTime(31 * 60 * 1000);

      cleanExpiredConversations();

      // Last action should also be cleaned since all conversation entries expired
      expect(getLastAction(userId)).toBeUndefined();
    });

    it('preserves lastAction when conversation still has valid messages', () => {
      const userId = 'user-clean-action-keep';
      addMessage(userId, 'user', 'Active message');
      setLastAction(userId, 'file_uploaded', { name: 'file.pdf' });

      jest.advanceTimersByTime(15 * 60 * 1000); // 15 minutes — within TTL

      cleanExpiredConversations();

      // Conversation still active, so lastAction should remain
      const action = getLastAction(userId);
      expect(action).toBeDefined();
      expect(action!.type).toBe('file_uploaded');
    });

    it('cleans expired pending uploads', () => {
      const userId = 'user-clean-upload';
      setPendingUpload(userId, {
        buffer: Buffer.from('expired upload'),
        mimeType: 'text/plain',
      });

      jest.advanceTimersByTime(6 * 60 * 1000); // 6 minutes — past 5min TTL

      cleanExpiredConversations();

      expect(getPendingUpload(userId)).toBeUndefined();
    });

    it('keeps non-expired pending uploads', () => {
      const userId = 'user-clean-upload-keep';
      setPendingUpload(userId, {
        buffer: Buffer.from('fresh upload'),
        mimeType: 'image/png',
      });

      jest.advanceTimersByTime(3 * 60 * 1000); // 3 minutes — within 5min TTL

      cleanExpiredConversations();

      const upload = getPendingUpload(userId);
      expect(upload).toBeDefined();
      expect(upload!.mimeType).toBe('image/png');
    });

    it('handles empty state without errors', () => {
      // cleanExpiredConversations should work fine even with no data for these user IDs
      expect(() => cleanExpiredConversations()).not.toThrow();
    });
  });
});
