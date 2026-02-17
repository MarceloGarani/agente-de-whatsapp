jest.mock('../../src/config/env', () => ({
  env: {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    WEBHOOK_VERIFY_TOKEN: 'test-verify',
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
    GOOGLE_REFRESH_TOKEN: 'test-refresh',
    OPENAI_API_KEY: 'test',
    PORT: 3000,
    NODE_ENV: 'development',
  },
  TIMEOUTS: {
    WHATSAPP_API: 10000,
    OPENAI_GPT: 10000,
    OPENAI_WHISPER: 15000,
    GOOGLE_APIS: 10000,
    NODEMAILER: 10000,
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/services/whatsapp.client', () => ({
  sendText: jest.fn().mockResolvedValue(undefined),
  sendProcessingMessage: jest.fn().mockResolvedValue(undefined),
  downloadMedia: jest.fn().mockResolvedValue(Buffer.from('fake-file')),
}));

jest.mock('../../src/services/intent-classifier', () => ({
  classifyIntent: jest.fn(),
}));

jest.mock('../../src/services/drive.service', () => ({
  uploadFile: jest.fn(),
}));

jest.mock('../../src/services/calendar.service', () => ({
  createEvent: jest.fn(),
  deleteEvent: jest.fn(),
  findEventsByTitle: jest.fn(),
  resolveDateTime: jest.fn(),
  formatDateTimeBR: jest.fn(),
}));

jest.mock('../../src/services/email.service', () => ({
  sendMeetingInvite: jest.fn(),
}));

jest.mock('../../src/services/audio-transcriber', () => ({
  transcribeAudio: jest.fn(),
}));

jest.mock('../../src/services/conversation-store', () => ({
  addMessage: jest.fn(),
  getHistoryForGPT: jest.fn().mockReturnValue([]),
  setLastAction: jest.fn(),
  getLastAction: jest.fn().mockReturnValue(undefined),
  setPendingUpload: jest.fn(),
  getPendingUpload: jest.fn().mockReturnValue(undefined),
  clearPendingUpload: jest.fn(),
  cleanExpiredConversations: jest.fn(),
}));

import { routeMessage } from '../../src/services/message-router';
import { sendText, sendProcessingMessage, downloadMedia } from '../../src/services/whatsapp.client';
import { classifyIntent } from '../../src/services/intent-classifier';
import { uploadFile } from '../../src/services/drive.service';
import { createEvent, deleteEvent, findEventsByTitle, resolveDateTime, formatDateTimeBR } from '../../src/services/calendar.service';
import { pendingActions } from '../../src/services/message-router';
import { sendMeetingInvite } from '../../src/services/email.service';
import { transcribeAudio } from '../../src/services/audio-transcriber';
import { setPendingUpload, getPendingUpload, getLastAction, clearPendingUpload } from '../../src/services/conversation-store';
import { Intent, MessageType } from '../../src/types/index';
import { messages } from '../../src/utils/messages';

const mockClassifyIntent = classifyIntent as jest.MockedFunction<typeof classifyIntent>;
const mockSendText = sendText as jest.MockedFunction<typeof sendText>;
const mockSendProcessing = sendProcessingMessage as jest.MockedFunction<typeof sendProcessingMessage>;
const mockDownloadMedia = downloadMedia as jest.MockedFunction<typeof downloadMedia>;
const mockUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;
const mockCreateEvent = createEvent as jest.MockedFunction<typeof createEvent>;
const mockResolveDateTime = resolveDateTime as jest.MockedFunction<typeof resolveDateTime>;
const mockFormatDateTimeBR = formatDateTimeBR as jest.MockedFunction<typeof formatDateTimeBR>;
const mockDeleteEvent = deleteEvent as jest.MockedFunction<typeof deleteEvent>;
const mockFindEventsByTitle = findEventsByTitle as jest.MockedFunction<typeof findEventsByTitle>;
const mockSendMeetingInvite = sendMeetingInvite as jest.MockedFunction<typeof sendMeetingInvite>;
const mockTranscribeAudio = transcribeAudio as jest.MockedFunction<typeof transcribeAudio>;
const mockSetPendingUpload = setPendingUpload as jest.MockedFunction<typeof setPendingUpload>;
const mockGetPendingUpload = getPendingUpload as jest.MockedFunction<typeof getPendingUpload>;
const mockGetLastAction = getLastAction as jest.MockedFunction<typeof getLastAction>;
const mockClearPendingUpload = clearPendingUpload as jest.MockedFunction<typeof clearPendingUpload>;

describe('Message Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pendingActions.clear();
    mockGetPendingUpload.mockReturnValue(undefined);
    mockGetLastAction.mockReturnValue(undefined);
  });

  describe('Text routing', () => {
    it('routes TEXT message through intent classifier with history', async () => {
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.AJUDA,
        entities: {},
        confidence: 0.95,
        rawText: 'ajuda',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'ajuda',
        timestamp: '1708100000',
      });

      expect(mockSendProcessing).toHaveBeenCalledWith('5511999999999');
      expect(mockClassifyIntent).toHaveBeenCalledWith('ajuda', expect.any(Array));
      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.prompts.help);
    });

    it('responds with clarification for CLARIFICACAO intent', async () => {
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.CLARIFICACAO,
        entities: {},
        confidence: 0.4,
        rawText: 'preciso disso',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'preciso disso',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.prompts.clarification);
    });

    it('creates calendar event for CRIAR_EVENTO intent', async () => {
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.CRIAR_EVENTO,
        entities: { titulo: 'Dentista', data: '2026-02-17', hora: '15:00' },
        confidence: 0.9,
        rawText: 'agendar dentista amanha as 15',
      });
      mockResolveDateTime.mockReturnValue({
        startTime: '2026-02-17T18:00:00.000Z',
        endTime: '2026-02-17T19:00:00.000Z',
      });
      mockCreateEvent.mockResolvedValue({
        eventId: 'ev-123',
        title: 'Dentista',
        startTime: '2026-02-17T18:00:00.000Z',
        endTime: '2026-02-17T19:00:00.000Z',
        meetLink: undefined,
      });
      mockFormatDateTimeBR.mockReturnValue({ data: '17/02', hora: '15:00' });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'agendar dentista amanha as 15',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.processing.event);
      expect(mockResolveDateTime).toHaveBeenCalledWith('2026-02-17', '15:00', undefined);
      expect(mockCreateEvent).toHaveBeenCalledWith('Dentista', '2026-02-17T18:00:00.000Z', '2026-02-17T19:00:00.000Z', undefined);

      const confirmCall = mockSendText.mock.calls.find(
        call => typeof call[1] === 'string' && call[1].includes('Dentista'),
      );
      expect(confirmCall).toBeDefined();
      expect(confirmCall![1]).toContain('17/02');
      expect(confirmCall![1]).toContain('15:00');
    });

    it('tells user to send file directly for UPLOAD_ARQUIVO text intent', async () => {
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.UPLOAD_ARQUIVO,
        entities: {},
        confidence: 0.9,
        rawText: 'salvar no drive',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'salvar no drive',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith(
        '5511999999999',
        messages.prompts.uploadInstruction,
      );
    });
  });

  describe('File upload flow', () => {
    it('uploads DOCUMENT with caption using extracted name', async () => {
      mockDownloadMedia.mockResolvedValue(Buffer.from('pdf-content'));
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.UPLOAD_ARQUIVO,
        entities: { nomeArquivo: 'relatorio' },
        confidence: 0.9,
        rawText: 'salvar como relatorio',
      });
      mockUploadFile.mockResolvedValue({
        fileId: 'file-123',
        webViewLink: 'https://drive.google.com/file/d/file-123/view',
        folderPath: 'documentos/02-2026/',
        filename: 'relatorio.pdf',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.DOCUMENT,
        mediaId: 'doc-456',
        mimeType: 'application/pdf',
        filename: 'relatorio.pdf',
        text: 'salvar como relatorio',
        timestamp: '1708100000',
      });

      expect(mockDownloadMedia).toHaveBeenCalledWith('doc-456');
      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        'relatorio.pdf',
        'application/pdf',
        undefined,
      );

      const confirmCall = mockSendText.mock.calls.find(
        call => typeof call[1] === 'string' && call[1].includes('relatorio.pdf'),
      );
      expect(confirmCall).toBeDefined();
    });

    it('asks for name/folder when IMAGE has no caption', async () => {
      mockDownloadMedia.mockResolvedValue(Buffer.from('image-content'));

      await routeMessage({
        from: '5511999999999',
        type: MessageType.IMAGE,
        mediaId: 'img-123',
        mimeType: 'image/jpeg',
        timestamp: '1708100000',
      });

      expect(mockDownloadMedia).toHaveBeenCalledWith('img-123');
      expect(mockSetPendingUpload).toHaveBeenCalledWith('5511999999999', {
        buffer: expect.any(Buffer),
        mimeType: 'image/jpeg',
        originalFilename: undefined,
      });

      const askCall = mockSendText.mock.calls.find(
        call => typeof call[1] === 'string' && call[1].includes('Como deseja salvar'),
      );
      expect(askCall).toBeDefined();
    });

    it('uploads with caption-extracted name for IMAGE', async () => {
      mockDownloadMedia.mockResolvedValue(Buffer.from('image-content'));
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.UPLOAD_ARQUIVO,
        entities: { nomeArquivo: 'lindo' },
        confidence: 0.9,
        rawText: 'Salvar com o nome lindo',
      });
      mockUploadFile.mockResolvedValue({
        fileId: 'img-789',
        webViewLink: 'https://drive.google.com/file/d/img-789/view',
        folderPath: 'imagens/02-2026/',
        filename: 'lindo.jpg',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.IMAGE,
        mediaId: 'img-123',
        mimeType: 'image/jpeg',
        text: 'Salvar com o nome lindo',
        timestamp: '1708100000',
      });

      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        'lindo.jpg',
        'image/jpeg',
        undefined,
      );
    });

    it('sends driveUnavailable on Drive API error (with caption)', async () => {
      mockDownloadMedia.mockResolvedValue(Buffer.from('data'));
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.UPLOAD_ARQUIVO,
        entities: { nomeArquivo: 'test' },
        confidence: 0.9,
        rawText: 'salvar como test',
      });
      const driveError = new Error('Drive unavailable');
      (driveError as unknown as { code: string }).code = 'SERVICE_UNAVAILABLE';
      mockUploadFile.mockRejectedValue(driveError);

      await routeMessage({
        from: '5511999999999',
        type: MessageType.DOCUMENT,
        mediaId: 'doc-err',
        mimeType: 'application/pdf',
        filename: 'test.pdf',
        text: 'salvar como test',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.errors.driveUnavailable);
    });

    it('sends generic error on download failure', async () => {
      mockDownloadMedia.mockRejectedValue(new Error('ECONNREFUSED'));

      await routeMessage({
        from: '5511999999999',
        type: MessageType.DOCUMENT,
        mediaId: 'doc-fail',
        mimeType: 'application/pdf',
        filename: 'test.pdf',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.errors.generic);
    });

    it('sends generic error when mediaId is missing', async () => {
      await routeMessage({
        from: '5511999999999',
        type: MessageType.DOCUMENT,
        timestamp: '1708100000',
      });

      expect(mockDownloadMedia).not.toHaveBeenCalled();
      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.errors.generic);
    });
  });

  describe('Pending upload response flow', () => {
    const pendingUploadData = {
      buffer: Buffer.from('pending-image'),
      mimeType: 'image/jpeg',
      originalFilename: undefined,
      expiresAt: Date.now() + 300000,
    };

    it('uploads with auto-organize when user replies "automatico"', async () => {
      mockGetPendingUpload.mockReturnValue(pendingUploadData);
      mockUploadFile.mockResolvedValue({
        fileId: 'auto-123',
        webViewLink: 'https://drive.google.com/file/d/auto-123/view',
        folderPath: 'imagens/02-2026/',
        filename: 'arquivo_1234.jpg',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'automatico',
        timestamp: '1708100000',
      });

      expect(mockClearPendingUpload).toHaveBeenCalledWith('5511999999999');
      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringMatching(/^arquivo_\d+\.jpg$/),
        'image/jpeg',
        undefined,
      );
      expect(mockClassifyIntent).not.toHaveBeenCalled();
    });

    it('uploads with GPT-extracted name when user replies with name', async () => {
      mockGetPendingUpload.mockReturnValue(pendingUploadData);
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.UPLOAD_ARQUIVO,
        entities: { nomeArquivo: 'foto-viagem', pastaDestino: 'fotos' },
        confidence: 0.9,
        rawText: 'foto-viagem na pasta fotos',
      });
      mockUploadFile.mockResolvedValue({
        fileId: 'named-123',
        webViewLink: 'https://drive.google.com/file/d/named-123/view',
        folderPath: 'fotos/',
        filename: 'foto-viagem.jpg',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'foto-viagem na pasta fotos',
        timestamp: '1708100000',
      });

      expect(mockClearPendingUpload).toHaveBeenCalledWith('5511999999999');
      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        'foto-viagem.jpg',
        'image/jpeg',
        'fotos',
      );
    });

    it('uses originalFilename as fallback when GPT extracts no name', async () => {
      const uploadWithFilename = {
        ...pendingUploadData,
        originalFilename: 'IMG_2024.jpg',
      };
      mockGetPendingUpload.mockReturnValue(uploadWithFilename);
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.CLARIFICACAO,
        entities: {},
        confidence: 0.5,
        rawText: 'pode ser',
      });
      mockUploadFile.mockResolvedValue({
        fileId: 'fallback-123',
        webViewLink: 'https://drive.google.com/file/d/fallback-123/view',
        folderPath: 'imagens/02-2026/',
        filename: 'IMG_2024.jpg',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'pode ser',
        timestamp: '1708100000',
      });

      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        'IMG_2024.jpg',
        'image/jpeg',
        undefined,
      );
    });

    it('uploads with "sim" as auto-organize shortcut', async () => {
      mockGetPendingUpload.mockReturnValue(pendingUploadData);
      mockUploadFile.mockResolvedValue({
        fileId: 'sim-123',
        webViewLink: 'https://drive.google.com/file/d/sim-123/view',
        folderPath: 'imagens/02-2026/',
        filename: 'arquivo_9999.jpg',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'sim',
        timestamp: '1708100000',
      });

      expect(mockClearPendingUpload).toHaveBeenCalledWith('5511999999999');
      expect(mockClassifyIntent).not.toHaveBeenCalled();
      expect(mockUploadFile).toHaveBeenCalled();
    });
  });

  describe('Meeting creation flow', () => {
    it('creates meeting with Meet link and sends invites', async () => {
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.CRIAR_REUNIAO,
        entities: {
          titulo: 'Daily Standup',
          data: '2026-02-18',
          hora: '10:00',
          participantes: [
            { nome: 'Joao', email: 'joao@email.com' },
            { nome: 'Maria', telefone: '5511888888888' },
          ],
        },
        confidence: 0.95,
        rawText: 'reuniao daily amanha 10h com joao e maria',
      });
      mockResolveDateTime.mockReturnValue({
        startTime: '2026-02-18T13:00:00.000Z',
        endTime: '2026-02-18T14:00:00.000Z',
      });
      mockCreateEvent.mockResolvedValue({
        eventId: 'ev-meet-1',
        title: 'Daily Standup',
        startTime: '2026-02-18T13:00:00.000Z',
        endTime: '2026-02-18T14:00:00.000Z',
        meetLink: 'https://meet.google.com/abc-defg-hij',
      });
      mockFormatDateTimeBR.mockReturnValue({ data: '18/02', hora: '10:00' });
      mockSendMeetingInvite.mockResolvedValue(undefined);

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'reuniao daily amanha 10h com joao e maria',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.processing.meeting);
      expect(mockCreateEvent).toHaveBeenCalledWith(
        'Daily Standup',
        '2026-02-18T13:00:00.000Z',
        '2026-02-18T14:00:00.000Z',
        undefined,
        { withMeet: true, attendees: ['joao@email.com'] },
      );

      // WhatsApp invite sent to phone participant
      const whatsappInviteCall = mockSendText.mock.calls.find(
        call => call[0] === '5511888888888',
      );
      expect(whatsappInviteCall).toBeDefined();
      expect(whatsappInviteCall![1]).toContain('Daily Standup');
      expect(whatsappInviteCall![1]).toContain('https://meet.google.com/abc-defg-hij');

      // Email invite sent to email participant
      expect(mockSendMeetingInvite).toHaveBeenCalledWith(
        'joao@email.com',
        'Daily Standup',
        'https://meet.google.com/abc-defg-hij',
        expect.stringContaining('18/02'),
      );

      // Confirmation sent to user
      const confirmCall = mockSendText.mock.calls.find(
        call => call[0] === '5511999999999' && typeof call[1] === 'string' && call[1].includes('Daily Standup') && call[1].includes('Meet'),
      );
      expect(confirmCall).toBeDefined();
    });

    it('handles meeting creation with failed email invite gracefully', async () => {
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.CRIAR_REUNIAO,
        entities: {
          titulo: 'Sync',
          data: '2026-02-18',
          hora: '14:00',
          participantes: [
            { nome: 'Pedro', email: 'bad-email' },
          ],
        },
        confidence: 0.9,
        rawText: 'reuniao sync',
      });
      mockResolveDateTime.mockReturnValue({
        startTime: '2026-02-18T17:00:00.000Z',
        endTime: '2026-02-18T18:00:00.000Z',
      });
      mockCreateEvent.mockResolvedValue({
        eventId: 'ev-meet-2',
        title: 'Sync',
        startTime: '2026-02-18T17:00:00.000Z',
        endTime: '2026-02-18T18:00:00.000Z',
        meetLink: 'https://meet.google.com/xyz',
      });
      mockFormatDateTimeBR.mockReturnValue({ data: '18/02', hora: '14:00' });
      mockSendMeetingInvite.mockRejectedValue(new Error('Invalid email'));

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'reuniao sync',
        timestamp: '1708100000',
      });

      // Should not throw — confirmation still sent with (falha) note
      const confirmCall = mockSendText.mock.calls.find(
        call => call[0] === '5511999999999' && typeof call[1] === 'string' && call[1].includes('Sync'),
      );
      expect(confirmCall).toBeDefined();
      expect(confirmCall![1]).toContain('falha');
    });
  });

  describe('Resend invite flow', () => {
    it('resends invite to new email using last action context', async () => {
      mockGetLastAction.mockReturnValue({
        type: 'meeting_created',
        details: {
          eventId: 'ev-1',
          title: 'Daily',
          meetLink: 'https://meet.google.com/abc',
          dateTimeStr: '18/02 as 10:00',
          failedInvites: ['old@email.com'],
        },
        timestamp: Date.now(),
      });
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.REENVIAR_CONVITE,
        entities: {
          participantes: [{ email: 'new@email.com' }],
        },
        confidence: 0.9,
        rawText: 'envie pra esse entao new@email.com',
      });
      mockSendMeetingInvite.mockResolvedValue(undefined);

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'envie pra esse entao new@email.com',
        timestamp: '1708100000',
      });

      expect(mockSendMeetingInvite).toHaveBeenCalledWith(
        'new@email.com',
        'Daily',
        'https://meet.google.com/abc',
        '18/02 as 10:00',
      );

      const confirmCall = mockSendText.mock.calls.find(
        call => typeof call[1] === 'string' && call[1].includes('reenviados'),
      );
      expect(confirmCall).toBeDefined();
    });

    it('resends invite to phone participant via WhatsApp', async () => {
      mockGetLastAction.mockReturnValue({
        type: 'meeting_created',
        details: {
          eventId: 'ev-1',
          title: 'Sync',
          meetLink: 'https://meet.google.com/xyz',
          dateTimeStr: '18/02 as 14:00',
          failedInvites: [],
        },
        timestamp: Date.now(),
      });
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.REENVIAR_CONVITE,
        entities: {
          participantes: [{ nome: 'Carlos', telefone: '5511777777777' }],
        },
        confidence: 0.9,
        rawText: 'manda pro carlos 5511777777777',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'manda pro carlos 5511777777777',
        timestamp: '1708100000',
      });

      const whatsappCall = mockSendText.mock.calls.find(
        call => call[0] === '5511777777777',
      );
      expect(whatsappCall).toBeDefined();
      expect(whatsappCall![1]).toContain('Sync');
      expect(whatsappCall![1]).toContain('https://meet.google.com/xyz');
      expect(mockSendMeetingInvite).not.toHaveBeenCalled();
    });

    it('tells user no meetLink when meeting has none', async () => {
      mockGetLastAction.mockReturnValue({
        type: 'meeting_created',
        details: {
          eventId: 'ev-1',
          title: 'Sync',
          meetLink: undefined,
          dateTimeStr: '18/02 as 14:00',
        },
        timestamp: Date.now(),
      });
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.REENVIAR_CONVITE,
        entities: { participantes: [{ email: 'a@b.com' }] },
        confidence: 0.9,
        rawText: 'envie pra a@b.com',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'envie pra a@b.com',
        timestamp: '1708100000',
      });

      expect(mockSendMeetingInvite).not.toHaveBeenCalled();
      const call = mockSendText.mock.calls.find(
        c => typeof c[1] === 'string' && c[1].includes('nao tem link'),
      );
      expect(call).toBeDefined();
    });

    it('handles failed resend email gracefully', async () => {
      mockGetLastAction.mockReturnValue({
        type: 'meeting_created',
        details: {
          eventId: 'ev-1',
          title: 'Daily',
          meetLink: 'https://meet.google.com/abc',
          dateTimeStr: '18/02 as 10:00',
        },
        timestamp: Date.now(),
      });
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.REENVIAR_CONVITE,
        entities: { participantes: [{ email: 'bad@email.com' }] },
        confidence: 0.9,
        rawText: 'envie pra bad@email.com',
      });
      mockSendMeetingInvite.mockRejectedValue(new Error('SMTP error'));

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'envie pra bad@email.com',
        timestamp: '1708100000',
      });

      // Should not throw — reports failure in confirmation
      const confirmCall = mockSendText.mock.calls.find(
        call => call[0] === '5511999999999' && typeof call[1] === 'string' && call[1].includes('reenviados'),
      );
      expect(confirmCall).toBeDefined();
      expect(confirmCall![1]).toContain('falha');
    });

    it('tells user no recent meeting when last action is not meeting_created', async () => {
      mockGetLastAction.mockReturnValue({
        type: 'event_created',
        details: { eventId: 'ev-1', title: 'Dentista' },
        timestamp: Date.now(),
      });
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.REENVIAR_CONVITE,
        entities: { participantes: [{ email: 'a@b.com' }] },
        confidence: 0.9,
        rawText: 'envie pra a@b.com',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'envie pra a@b.com',
        timestamp: '1708100000',
      });

      expect(mockSendMeetingInvite).not.toHaveBeenCalled();
      const call = mockSendText.mock.calls.find(
        c => typeof c[1] === 'string' && c[1].includes('Nao encontrei'),
      );
      expect(call).toBeDefined();
    });

    it('tells user no recent meeting when no last action', async () => {
      mockGetLastAction.mockReturnValue(undefined);
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.REENVIAR_CONVITE,
        entities: { participantes: [{ email: 'a@b.com' }] },
        confidence: 0.9,
        rawText: 'envie pra a@b.com',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'envie pra a@b.com',
        timestamp: '1708100000',
      });

      expect(mockSendMeetingInvite).not.toHaveBeenCalled();
      const call = mockSendText.mock.calls.find(
        c => typeof c[1] === 'string' && c[1].includes('Nao encontrei'),
      );
      expect(call).toBeDefined();
    });
  });

  describe('Event cancellation flow', () => {
    it('finds single event and asks for confirmation', async () => {
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.CANCELAR_EVENTO,
        entities: { titulo: 'Dentista' },
        confidence: 0.9,
        rawText: 'cancelar dentista',
      });
      mockFindEventsByTitle.mockResolvedValue([{
        eventId: 'ev-cancel-1',
        title: 'Dentista',
        startTime: '2026-02-18T15:00:00.000Z',
        endTime: '2026-02-18T16:00:00.000Z',
      }]);
      mockFormatDateTimeBR.mockReturnValue({ data: '18/02', hora: '15:00' });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'cancelar dentista',
        timestamp: '1708100000',
      });

      expect(mockFindEventsByTitle).toHaveBeenCalledWith('Dentista');
      expect(mockSendText).toHaveBeenCalledWith(
        '5511999999999',
        expect.stringContaining('Dentista'),
      );
      expect(pendingActions.has('5511999999999')).toBe(true);
      expect(pendingActions.get('5511999999999')!.type).toBe('cancel_confirm');
    });

    it('confirms cancellation when user replies "sim"', async () => {
      pendingActions.set('5511999999999', {
        type: 'cancel_confirm',
        eventId: 'ev-cancel-1',
        eventTitle: 'Dentista',
        expiresAt: new Date(Date.now() + 300000),
      });
      mockDeleteEvent.mockResolvedValue(undefined);

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'sim',
        timestamp: '1708100000',
      });

      expect(mockDeleteEvent).toHaveBeenCalledWith('ev-cancel-1');
      expect(mockClassifyIntent).not.toHaveBeenCalled();

      const confirmCall = mockSendText.mock.calls.find(
        call => typeof call[1] === 'string' && call[1].includes('Dentista') && call[1].includes('cancelado'),
      );
      expect(confirmCall).toBeDefined();
      expect(pendingActions.has('5511999999999')).toBe(false);
    });

    it('discards cancellation when user does not reply "sim"', async () => {
      pendingActions.set('5511999999999', {
        type: 'cancel_confirm',
        eventId: 'ev-cancel-1',
        eventTitle: 'Dentista',
        expiresAt: new Date(Date.now() + 300000),
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'nao',
        timestamp: '1708100000',
      });

      expect(mockDeleteEvent).not.toHaveBeenCalled();
      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.prompts.cancelDiscarded);
    });

    it('responds eventNotFound when no events match', async () => {
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.CANCELAR_EVENTO,
        entities: { titulo: 'Nada' },
        confidence: 0.9,
        rawText: 'cancelar nada',
      });
      mockFindEventsByTitle.mockResolvedValue([]);

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'cancelar nada',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.errors.eventNotFound);
    });

    it('lists multiple events and waits for selection', async () => {
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.CANCELAR_EVENTO,
        entities: { titulo: 'Reuniao' },
        confidence: 0.9,
        rawText: 'cancelar reuniao',
      });
      mockFindEventsByTitle.mockResolvedValue([
        { eventId: 'ev-1', title: 'Reuniao Daily', startTime: '2026-02-18T10:00:00Z', endTime: '2026-02-18T11:00:00Z' },
        { eventId: 'ev-2', title: 'Reuniao Semanal', startTime: '2026-02-19T10:00:00Z', endTime: '2026-02-19T11:00:00Z' },
      ]);
      mockFormatDateTimeBR.mockReturnValue({ data: '18/02', hora: '10:00' });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'cancelar reuniao',
        timestamp: '1708100000',
      });

      expect(pendingActions.get('5511999999999')!.type).toBe('cancel_select');

      const listCall = mockSendText.mock.calls.find(
        call => typeof call[1] === 'string' && call[1].includes('2 eventos'),
      );
      expect(listCall).toBeDefined();
    });
  });

  describe('Audio routing', () => {
    it('transcribes audio and routes as text', async () => {
      mockDownloadMedia.mockResolvedValue(Buffer.from('fake-audio'));
      mockTranscribeAudio.mockResolvedValue('agendar dentista amanha');
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.AJUDA,
        entities: {},
        confidence: 0.9,
        rawText: 'agendar dentista amanha',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.AUDIO,
        mediaId: 'audio-123',
        mimeType: 'audio/ogg',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.processing.audio);
      expect(mockDownloadMedia).toHaveBeenCalledWith('audio-123');
      expect(mockTranscribeAudio).toHaveBeenCalledWith(expect.any(Buffer));
      expect(mockClassifyIntent).toHaveBeenCalledWith('agendar dentista amanha', expect.any(Array));
    });

    it('sends whisperFailed when transcription returns empty', async () => {
      mockDownloadMedia.mockResolvedValue(Buffer.from('fake-audio'));
      mockTranscribeAudio.mockResolvedValue('');

      await routeMessage({
        from: '5511999999999',
        type: MessageType.AUDIO,
        mediaId: 'audio-456',
        mimeType: 'audio/ogg',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.errors.whisperFailed);
      expect(mockClassifyIntent).not.toHaveBeenCalled();
    });

    it('sends whisperFailed when transcription throws', async () => {
      mockDownloadMedia.mockResolvedValue(Buffer.from('fake-audio'));
      mockTranscribeAudio.mockRejectedValue(new Error('Whisper error'));

      await routeMessage({
        from: '5511999999999',
        type: MessageType.AUDIO,
        mediaId: 'audio-789',
        mimeType: 'audio/ogg',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.errors.whisperFailed);
    });
  });

  describe('Edge cases', () => {
    it('sends clarification for ambiguous intent (EC-4)', async () => {
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.CLARIFICACAO,
        entities: {},
        confidence: 0.4,
        rawText: 'talvez',
      });

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'talvez',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.prompts.clarification);
    });

    it('sends generic error for unknown message type', async () => {
      await routeMessage({
        from: '5511999999999',
        type: 'sticker' as MessageType,
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.errors.generic);
    });

    it('sends invalidOption for invalid cancel selection', async () => {
      mockFindEventsByTitle.mockResolvedValue([
        { eventId: 'ev-1', title: 'Evento 1', startTime: '2026-02-17T10:00:00Z', endTime: '2026-02-17T11:00:00Z' },
        { eventId: 'ev-2', title: 'Evento 2', startTime: '2026-02-17T14:00:00Z', endTime: '2026-02-17T15:00:00Z' },
      ]);
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.CANCELAR_EVENTO,
        entities: { titulo: 'Evento' },
        confidence: 0.9,
        rawText: 'cancelar evento',
      });

      // First call — triggers cancel_select
      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'cancelar evento',
        timestamp: '1708100000',
      });

      jest.clearAllMocks();
      mockGetPendingUpload.mockReturnValue(undefined);

      // Second call — invalid option "abc"
      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'abc',
        timestamp: '1708100001',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.prompts.invalidOption);
    });

    it('sends calendarUnavailable when Calendar API fails during event creation', async () => {
      mockClassifyIntent.mockResolvedValue({
        intent: Intent.CRIAR_EVENTO,
        entities: { titulo: 'Dentista', data: 'amanha', hora: '15:00' },
        confidence: 0.95,
        rawText: 'agendar dentista amanha 15h',
      });
      mockCreateEvent.mockRejectedValue(new Error('Calendar API error'));

      await routeMessage({
        from: '5511999999999',
        type: MessageType.TEXT,
        text: 'agendar dentista amanha 15h',
        timestamp: '1708100000',
      });

      expect(mockSendText).toHaveBeenCalledWith('5511999999999', messages.errors.calendarUnavailable);
    });
  });
});
