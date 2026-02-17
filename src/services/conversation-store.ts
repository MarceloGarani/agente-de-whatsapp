/**
 * In-memory conversation history per user.
 * Enables context-aware intent classification (follow-ups, references to previous actions).
 * v1: in-memory with TTL — acceptable for single-user.
 */

const CONVERSATION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_HISTORY = 10;

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface LastAction {
  type: 'meeting_created' | 'event_created' | 'file_uploaded' | 'event_cancelled';
  details: Record<string, unknown>;
  timestamp: number;
}

export interface PendingUpload {
  buffer: Buffer;
  mimeType: string;
  originalFilename?: string;
  expiresAt: number;
}

const conversations = new Map<string, ConversationEntry[]>();
const lastActions = new Map<string, LastAction>();
const pendingUploads = new Map<string, PendingUpload>();

// --- Conversation History ---

export function addMessage(userId: string, role: 'user' | 'assistant', content: string): void {
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }
  const history = conversations.get(userId)!;
  history.push({ role, content, timestamp: Date.now() });

  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

export function getHistory(userId: string): ConversationEntry[] {
  const history = conversations.get(userId) || [];
  const cutoff = Date.now() - CONVERSATION_TTL_MS;
  return history.filter(e => e.timestamp > cutoff);
}

export function getHistoryForGPT(userId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  return getHistory(userId).map(({ role, content }) => ({ role, content }));
}

// --- Last Action Context ---

export function setLastAction(
  userId: string,
  type: LastAction['type'],
  details: Record<string, unknown>,
): void {
  lastActions.set(userId, { type, details, timestamp: Date.now() });
}

export function getLastAction(userId: string): LastAction | undefined {
  const action = lastActions.get(userId);
  if (!action) return undefined;
  if (Date.now() - action.timestamp > CONVERSATION_TTL_MS) {
    lastActions.delete(userId);
    return undefined;
  }
  return action;
}

// --- Pending Uploads ---

export function setPendingUpload(userId: string, upload: Omit<PendingUpload, 'expiresAt'>): void {
  pendingUploads.set(userId, {
    ...upload,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
  });
}

export function getPendingUpload(userId: string): PendingUpload | undefined {
  const upload = pendingUploads.get(userId);
  if (!upload) return undefined;
  if (Date.now() > upload.expiresAt) {
    pendingUploads.delete(userId);
    return undefined;
  }
  return upload;
}

export function clearPendingUpload(userId: string): void {
  pendingUploads.delete(userId);
}

// --- Cleanup ---

export function cleanExpiredConversations(): void {
  const cutoff = Date.now() - CONVERSATION_TTL_MS;
  for (const [userId, history] of conversations) {
    const valid = history.filter(e => e.timestamp > cutoff);
    if (valid.length === 0) {
      conversations.delete(userId);
      lastActions.delete(userId);
    } else {
      conversations.set(userId, valid);
    }
  }

  for (const [userId, upload] of pendingUploads) {
    if (Date.now() > upload.expiresAt) {
      pendingUploads.delete(userId);
    }
  }
}
