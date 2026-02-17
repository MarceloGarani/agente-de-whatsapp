jest.mock('../../src/config/env', () => ({
  env: {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    WEBHOOK_VERIFY_TOKEN: 'test-verify',
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
    GOOGLE_REFRESH_TOKEN: 'test-refresh-token',
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

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    generateAuthUrl: jest.fn(),
    getToken: jest.fn(),
    setCredentials: jest.fn(),
    on: jest.fn(),
  })),
}));

const mockFilesList = jest.fn();
const mockFilesCreate = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    drive: jest.fn().mockReturnValue({
      files: {
        list: (...args: unknown[]) => mockFilesList(...args),
        create: (...args: unknown[]) => mockFilesCreate(...args),
      },
    }),
  },
}));

import { uploadFile, getMimeCategory } from '../../src/services/drive.service';

describe('Drive Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMimeCategory', () => {
    it('maps PDF to documentos', () => {
      expect(getMimeCategory('application/pdf')).toBe('documentos');
    });

    it('maps Word to documentos', () => {
      expect(getMimeCategory('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('documentos');
    });

    it('maps images to imagens', () => {
      expect(getMimeCategory('image/jpeg')).toBe('imagens');
      expect(getMimeCategory('image/png')).toBe('imagens');
    });

    it('maps Excel to planilhas', () => {
      expect(getMimeCategory('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('planilhas');
      expect(getMimeCategory('text/csv')).toBe('planilhas');
    });

    it('maps unknown types to outros', () => {
      expect(getMimeCategory('application/zip')).toBe('outros');
      expect(getMimeCategory('video/mp4')).toBe('outros');
    });
  });

  describe('uploadFile', () => {
    it('uploads PDF to documentos/MM-YYYY/ folder', async () => {
      // First call: list category folder → not found
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      // First create: category folder
      mockFilesCreate.mockResolvedValueOnce({ data: { id: 'folder-documentos' } });
      // Second call: list month folder → not found
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      // Second create: month folder
      mockFilesCreate.mockResolvedValueOnce({ data: { id: 'folder-month' } });
      // Third create: upload file
      mockFilesCreate.mockResolvedValueOnce({
        data: { id: 'file-123', webViewLink: 'https://drive.google.com/file/d/file-123/view' },
      });

      const result = await uploadFile(
        Buffer.from('fake-pdf'),
        'relatorio.pdf',
        'application/pdf',
      );

      expect(result.fileId).toBe('file-123');
      expect(result.webViewLink).toBe('https://drive.google.com/file/d/file-123/view');
      expect(result.folderPath).toMatch(/^documentos\/\d{2}-\d{4}\/$/);
      expect(result.filename).toBe('relatorio.pdf');

      // Verify file was uploaded with correct parent
      expect(mockFilesCreate).toHaveBeenCalledTimes(3);
      const uploadCall = mockFilesCreate.mock.calls[2][0];
      expect(uploadCall.requestBody.parents).toEqual(['folder-month']);
      expect(uploadCall.requestBody.name).toBe('relatorio.pdf');
    });

    it('uploads image to imagens/MM-YYYY/ folder', async () => {
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      mockFilesCreate.mockResolvedValueOnce({ data: { id: 'folder-imagens' } });
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      mockFilesCreate.mockResolvedValueOnce({ data: { id: 'folder-month' } });
      mockFilesCreate.mockResolvedValueOnce({
        data: { id: 'img-456', webViewLink: 'https://drive.google.com/file/d/img-456/view' },
      });

      const result = await uploadFile(
        Buffer.from('fake-image'),
        'photo.jpg',
        'image/jpeg',
      );

      expect(result.fileId).toBe('img-456');
      expect(result.folderPath).toMatch(/^imagens\/\d{2}-\d{4}\/$/);
    });

    it('reuses existing folder without creating duplicate', async () => {
      // Category folder already exists
      mockFilesList.mockResolvedValueOnce({ data: { files: [{ id: 'existing-folder' }] } });
      // Month folder already exists
      mockFilesList.mockResolvedValueOnce({ data: { files: [{ id: 'existing-month' }] } });
      // Upload file
      mockFilesCreate.mockResolvedValueOnce({
        data: { id: 'file-789', webViewLink: 'https://drive.google.com/file/d/file-789/view' },
      });

      const result = await uploadFile(
        Buffer.from('fake-file'),
        'report.pdf',
        'application/pdf',
      );

      expect(result.fileId).toBe('file-789');
      // Only 1 create call (the file upload), no folder creation
      expect(mockFilesCreate).toHaveBeenCalledTimes(1);
    });

    it('throws AppError on Drive API error', async () => {
      mockFilesList.mockRejectedValueOnce(new Error('ETIMEDOUT'));

      await expect(
        uploadFile(Buffer.from('data'), 'test.pdf', 'application/pdf'),
      ).rejects.toThrow();
    });

    it('uploads to custom folder path when customFolder is provided', async () => {
      // First list: "fotos" folder → not found
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      // Create "fotos" folder
      mockFilesCreate.mockResolvedValueOnce({ data: { id: 'folder-fotos' } });
      // Second list: "viagem" inside "fotos" → not found
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      // Create "viagem" folder
      mockFilesCreate.mockResolvedValueOnce({ data: { id: 'folder-viagem' } });
      // Upload file
      mockFilesCreate.mockResolvedValueOnce({
        data: { id: 'file-custom', webViewLink: 'https://drive.google.com/file/d/file-custom/view' },
      });

      const result = await uploadFile(
        Buffer.from('image-data'),
        'lindo.jpg',
        'image/jpeg',
        'fotos/viagem',
      );

      expect(result.fileId).toBe('file-custom');
      expect(result.folderPath).toBe('fotos/viagem/');
      expect(result.filename).toBe('lindo.jpg');

      // 3 create calls: fotos folder, viagem folder, file upload
      expect(mockFilesCreate).toHaveBeenCalledTimes(3);
      const uploadCall = mockFilesCreate.mock.calls[2][0];
      expect(uploadCall.requestBody.parents).toEqual(['folder-viagem']);
    });
  });
});
