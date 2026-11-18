import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertFileInEvaluationFolder,
  getDriveClient,
  getQueryString,
  parseDocumentKind,
  requireAdmin,
  sendDriveError,
  WEEK_PATTERN,
  XLSX_MIME,
} from './_lib/drive';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed.' });

  const fileId = getQueryString(req.query.fileId);
  const week = getQueryString(req.query.week);
  const kind = parseDocumentKind(getQueryString(req.query.documentKind));
  if (!fileId || !WEEK_PATTERN.test(week) || !kind) {
    return res.status(400).json({ success: false, message: 'fileId, minggu, atau kategori dokumen tidak valid.' });
  }
  if (kind === 'answer' && !requireAdmin(req, res)) return;

  try {
    const drive = getDriveClient();
    const file = await assertFileInEvaluationFolder(drive, fileId, week, kind);
    const download = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' },
    );
    const safeName = (file.name ?? 'dokumen.xlsx').replace(/["\\\r\n]/g, '_');
    res.setHeader('Content-Type', file.mimeType || XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    if (file.size) res.setHeader('Content-Length', file.size);
    const stream = download.data;
    stream.on('error', error => {
      console.error('Google Drive download stream failed:', error);
      if (!res.headersSent) res.status(502).json({ success: false, message: 'Unduhan dari Google Drive gagal.' });
      else res.end();
    });
    stream.pipe(res);
  } catch (error) {
    return sendDriveError(res, error);
  }
}
