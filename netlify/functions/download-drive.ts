import {
  assertFileInEvaluationFolder,
  checkAdminAuthorization,
  getDriveClient,
  getDriveErrorResponse,
  parseDocumentKind,
  WEEK_PATTERN,
  XLSX_MIME,
} from '../../api/_lib/drive';
import type { Handler } from './_lib/types';

export const config = { path: '/api/download-drive' };

export const handler: Handler = async event => {
  const params = new URLSearchParams(event.rawQuery ?? '');
  const fileId = params.get('fileId') ?? '';
  const week = params.get('week') ?? '';
  const kind = parseDocumentKind(params.get('documentKind') ?? '');
  if (!fileId || !WEEK_PATTERN.test(week) || !kind) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'fileId, minggu, atau kategori dokumen tidak valid.' }),
    };
  }
  if (kind === 'answer') {
    const authorization = event.headers.authorization ?? event.headers.Authorization;
    const access = checkAdminAuthorization(authorization);
    if (access !== true) {
      return {
        statusCode: access === 'missing-config' ? 503 : 401,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: access === 'missing-config' ? 'Akses Admin belum dikonfigurasi.' : 'Token Admin tidak valid.',
        }),
      };
    }
  }

  try {
    const drive = getDriveClient();
    const file = await assertFileInEvaluationFolder(drive, fileId, week, kind);
    const result = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' },
    );
    const chunks: Buffer[] = [];
    for await (const chunk of result.data) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const safeName = (file.name ?? 'dokumen.xlsx').replace(/["\\\r\n]/g, '_');
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'content-type': file.mimeType || XLSX_MIME,
        'content-disposition': `attachment; filename="${safeName}"`,
        ...(file.size ? { 'content-length': file.size } : {}),
      },
      body: Buffer.concat(chunks).toString('base64'),
    };
  } catch (error) {
    const result = getDriveErrorResponse(error);
    return {
      statusCode: result.status,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(result.body),
    };
  }
};
