import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';

export const ROOT_FOLDER_ID = '1pTfZiAc0-H3Te3NvZsL5wUmb_fUaCf_B';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_FILE_SIZE = 3 * 1024 * 1024;
export const WEEK_PATTERN = /^WEEK [1-4]$/;
export const QUESTION_FOLDER = '01_SOAL_EVALUASI';
export const ANSWER_FOLDER = '02_JAWABAN_GURU';

export type DocumentKind = 'question' | 'answer';

export function getQueryString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export function getDriveClient(): drive_v3.Drive {
  let clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if ((!clientEmail || !privateKey) && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let credentials: { client_email?: string; private_key?: string };
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (error) {
      console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON:', error);
      throw new DriveConfigurationError('Credential Google Drive tidak valid.');
    }
    clientEmail = clientEmail || credentials.client_email;
    privateKey = privateKey || credentials.private_key;
  }

  if (!clientEmail || !privateKey) {
    throw new DriveConfigurationError(
      'Konfigurasi GOOGLE_SERVICE_ACCOUNT_EMAIL dan GOOGLE_PRIVATE_KEY belum lengkap.',
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

export class DriveConfigurationError extends Error {}

export function getRootFolderId(): string {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ||
    process.env.GOOGLE_DRIVE_FOLDER_ID ||
    ROOT_FOLDER_ID;
}

export function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const result = checkAdminAuthorization(req.headers.authorization);
  if (result === 'missing-config') {
    res.status(503).json({
      success: false,
      message: 'Akses Admin belum dikonfigurasi (DRIVE_ADMIN_TOKEN).',
    });
    return false;
  }
  if (!result) {
    res.status(401).json({ success: false, message: 'Token Admin tidak valid.' });
    return false;
  }
  return true;
}

export function checkAdminAuthorization(authorization: string | undefined): boolean | 'missing-config' {
  const expected = process.env.DRIVE_ADMIN_TOKEN;
  if (!expected) return 'missing-config';
  return authorization === `Bearer ${expected}`;
}

export function parseDocumentKind(value: string): DocumentKind | null {
  return value === 'question' || value === 'answer' ? value : null;
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string> {
  const response = await drive.files.list({
    q: `name = '${escapeDriveQuery(name)}' and '${escapeDriveQuery(parentId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const folderId = response.data.files?.find(file => file.id)?.id;
  if (folderId) return folderId;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id,name',
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`Google Drive tidak mengembalikan ID folder ${name}.`);
  return created.data.id;
}

export async function getEvaluationFolderId(
  drive: drive_v3.Drive,
  week: string,
  kind: DocumentKind,
): Promise<string> {
  if (!WEEK_PATTERN.test(week)) throw new DriveInputError('Periode WEEK 1 sampai WEEK 4 tidak valid.');
  const rootId = getRootFolderId();
  const weekId = await findOrCreateFolder(drive, rootId, week);
  return findOrCreateFolder(
    drive,
    weekId,
    kind === 'question' ? QUESTION_FOLDER : ANSWER_FOLDER,
  );
}

export class DriveInputError extends Error {}

export async function listEvaluationFiles(
  drive: drive_v3.Drive,
  week: string,
  kind: DocumentKind,
) {
  const folderId = await getEvaluationFolderId(drive, week, kind);
  const response = await drive.files.list({
    q: `'${escapeDriveQuery(folderId)}' in parents and trashed = false and mimeType = '${XLSX_MIME}'`,
    fields: 'files(id,name,mimeType,size,createdTime,modifiedTime)',
    orderBy: 'createdTime desc',
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return { folderId, files: response.data.files ?? [] };
}

export async function assertFileInEvaluationFolder(
  drive: drive_v3.Drive,
  fileId: string,
  week: string,
  kind: DocumentKind,
): Promise<drive_v3.Schema$File> {
  const folderId = await getEvaluationFolderId(drive, week, kind);
  const response = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,size,parents,createdTime',
    supportsAllDrives: true,
  });
  if (!response.data.id || !response.data.parents?.includes(folderId)) {
    throw new DriveInputError('File tidak ditemukan pada folder periode yang dipilih.');
  }
  if (response.data.mimeType !== XLSX_MIME) {
    throw new DriveInputError('Hanya dokumen Excel .xlsx yang dapat diakses melalui endpoint ini.');
  }
  return response.data;
}

export function sendDriveError(res: VercelResponse, error: unknown): void {
  const result = getDriveErrorResponse(error);
  res.status(result.status).json(result.body);
}

export function getDriveErrorResponse(error: unknown): {
  status: number;
  body: { success: false; message: string };
} {
  if (error instanceof DriveConfigurationError) {
    return { status: 503, body: { success: false, message: error.message } };
  } else if (error instanceof DriveInputError) {
    return { status: 400, body: { success: false, message: error.message } };
  } else {
    console.error('Google Drive API request failed:', error);
    return {
      status: 502,
      body: {
        success: false,
        message: 'Google Drive gagal memproses permintaan. Periksa credential, permission folder, dan status Drive API.',
      },
    };
  }
}

export async function uploadXlsx(
  drive: drive_v3.Drive,
  fileName: string,
  fileBase64: string,
  week: string,
  kind: DocumentKind,
  fileId?: string,
) {
  if (!/^[\w.-]+\.xlsx$/i.test(fileName)) {
    throw new DriveInputError('Nama file harus berupa file .xlsx yang valid.');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(fileBase64) || fileBase64.length % 4 !== 0) {
    throw new DriveInputError('Format Base64 tidak valid.');
  }

  const buffer = Buffer.from(fileBase64, 'base64');
  if (!buffer.length || buffer.length > MAX_FILE_SIZE) {
    throw new DriveInputError('Ukuran file harus lebih kecil dari 3 MB.');
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new DriveInputError('File tidak memiliki signature XLSX yang valid.');
  }

  const folderId = await getEvaluationFolderId(drive, week, kind);
  if (fileId) {
    const existing = await assertFileInEvaluationFolder(drive, fileId, week, kind);
    const duplicate = await drive.files.list({
      q: `name = '${escapeDriveQuery(fileName)}' and '${escapeDriveQuery(folderId)}' in parents and trashed = false`,
      fields: 'files(id,name)',
      pageSize: 10,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (duplicate.data.files?.some(file => file.id !== existing.id)) {
      throw new DriveInputError('Nama file tersebut sudah digunakan pada periode ini.');
    }
    const response = await drive.files.update({
      fileId: existing.id!,
      requestBody: { name: fileName, mimeType: XLSX_MIME },
      media: { mimeType: XLSX_MIME, body: Readable.from(buffer) },
      fields: 'id,name,mimeType,size,createdTime,modifiedTime',
      supportsAllDrives: true,
    });
    return response.data;
  }

  const duplicate = await drive.files.list({
    q: `name = '${escapeDriveQuery(fileName)}' and '${escapeDriveQuery(folderId)}' in parents and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 2,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (duplicate.data.files?.length) {
    throw new DriveInputError('File dengan nama yang sama sudah ada. Kirim fileId untuk memperbarui dokumen.');
  }

  const response = await drive.files.create({
    requestBody: { name: fileName, mimeType: XLSX_MIME, parents: [folderId] },
    media: { mimeType: XLSX_MIME, body: Readable.from(buffer) },
    fields: 'id,name,mimeType,size,createdTime,modifiedTime',
    supportsAllDrives: true,
  });
  return response.data;
}
