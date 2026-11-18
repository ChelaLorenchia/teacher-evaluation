import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertFileInEvaluationFolder,
  getDriveClient,
  getQueryString,
  parseDocumentKind,
  requireAdmin,
  sendDriveError,
  WEEK_PATTERN,
} from './_lib/drive';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'DELETE') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (!requireAdmin(req, res)) return;

  const fileId = getQueryString(req.query.fileId);
  const week = getQueryString(req.query.week);
  const kind = parseDocumentKind(getQueryString(req.query.documentKind));
  if (!fileId || !WEEK_PATTERN.test(week) || !kind) {
    return res.status(400).json({ success: false, message: 'fileId, minggu, atau kategori dokumen tidak valid.' });
  }

  try {
    const drive = getDriveClient();
    await assertFileInEvaluationFolder(drive, fileId, week, kind);
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });
    return res.status(200).json({ success: true, message: 'File dipindahkan ke sampah Google Drive.' });
  } catch (error) {
    return sendDriveError(res, error);
  }
}
