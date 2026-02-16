import { google } from 'googleapis';
import { Readable } from 'stream';
import { getAuthenticatedClient } from './google-auth.js';
import { logger } from '../utils/logger.js';
import { handleApiError } from '../utils/error-handler.js';
import { TIMEOUTS } from '../config/env.js';
import type { DriveUpload } from '../types/index.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export function getMimeCategory(mimeType: string): string {
  if (
    mimeType === 'application/pdf' ||
    mimeType === 'application/msword' ||
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('presentationml') ||
    mimeType === 'text/plain'
  ) {
    return 'documentos';
  }

  if (mimeType.startsWith('image/')) {
    return 'imagens';
  }

  if (
    mimeType.includes('spreadsheetml') ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'text/csv'
  ) {
    return 'planilhas';
  }

  return 'outros';
}

async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId?: string,
): Promise<string> {
  let query = `name='${name}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const listRes = await drive.files.list({
    q: query,
    fields: 'files(id)',
    spaces: 'drive',
  });

  const existing = listRes.data.files?.[0];
  if (existing?.id) {
    return existing.id;
  }

  const createRes = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  });

  const folderId = createRes.data.id;
  if (!folderId) {
    throw new Error(`Failed to create folder: ${name}`);
  }

  logger.info({ service: 'drive', action: 'create-folder', name }, `Folder created: ${name}`);
  return folderId;
}

function getMonthYear(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${month}-${year}`;
}

export async function uploadFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<DriveUpload> {
  try {
    const auth = getAuthenticatedClient();
    const drive = google.drive({ version: 'v3', auth, timeout: TIMEOUTS.GOOGLE_APIS });

    const category = getMimeCategory(mimeType);
    const monthYear = getMonthYear();

    const categoryFolderId = await getOrCreateFolder(drive, category);
    const monthFolderId = await getOrCreateFolder(drive, monthYear, categoryFolderId);

    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const uploadRes = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [monthFolderId],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, webViewLink',
    });

    const fileId = uploadRes.data.id!;
    const webViewLink = uploadRes.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
    const folderPath = `${category}/${monthYear}/`;

    logger.info(
      { service: 'drive', action: 'upload', fileId, folderPath, filename },
      `File uploaded: ${filename} → ${folderPath}`,
    );

    return { fileId, webViewLink, folderPath, filename };
  } catch (error) {
    logger.error({ service: 'drive', action: 'upload', error, filename }, 'Failed to upload file');
    throw handleApiError(error, 'drive');
  }
}
