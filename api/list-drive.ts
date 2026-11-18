import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getDriveClient,
  getQueryString,
  listEvaluationFiles,
  parseDocumentKind,
  requireAdmin,
  sendDriveError,
  WEEK_PATTERN,
} from './_lib/drive';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed.' });

  const week = getQueryString(req.query.week) || 'WEEK 1';
  const rawKind = getQueryString(req.query.documentKind);
  const kind = rawKind ? parseDocumentKind(rawKind) : 'question';
  if (!kind) return res.status(400).json({ success: false, message: 'Jenis dokumen tidak valid.' });
  if (!WEEK_PATTERN.test(week)) return res.status(400).json({ success: false, message: 'Periode WEEK 1 sampai WEEK 4 tidak valid.' });
  if (kind === 'answer' && !requireAdmin(req, res)) return;

  try {
    const drive = getDriveClient();
    const result = await listEvaluationFiles(drive, week, kind);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendDriveError(res, error);
  }
}
