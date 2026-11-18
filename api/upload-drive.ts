import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getDriveClient,
  requireAdmin,
  sendDriveError,
  uploadXlsx,
} from './_lib/drive';

export const config = {
  api: {
    bodyParser: { sizeLimit: '5mb' },
  },
};

function requireTeacherUpload(req: VercelRequest, res: VercelResponse): boolean {
  if (process.env.DRIVE_TEACHER_UPLOAD_ENABLED !== 'true') {
    res.status(403).json({ success: false, message: 'Unggah jawaban melalui website belum diaktifkan.' });
    return false;
  }
  const expected = process.env.DRIVE_TEACHER_UPLOAD_TOKEN;
  if (!expected) {
    res.status(503).json({ success: false, message: 'Token unggah guru belum dikonfigurasi.' });
    return false;
  }
  if (req.headers.authorization !== `Bearer ${expected}`) {
    res.status(401).json({ success: false, message: 'Token unggah tidak valid.' });
    return false;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });

  const { fileName, fileBase64, week, documentKind, fileId } = req.body ?? {};
  const kind = documentKind === 'question' || documentKind === 'answer' ? documentKind : null;
  if (
    typeof fileName !== 'string' ||
    typeof fileBase64 !== 'string' ||
    typeof week !== 'string' ||
    !kind
  ) {
    return res.status(400).json({ success: false, message: 'Nama, konten, periode, dan jenis file wajib valid.' });
  }

  if (kind === 'question') {
    if (!requireAdmin(req, res)) return;
  } else if (!requireTeacherUpload(req, res)) {
    return;
  }

  try {
    const drive = getDriveClient();
    const file = await uploadXlsx(
      drive,
      fileName,
      fileBase64,
      week,
      kind,
      typeof fileId === 'string' && fileId ? fileId : undefined,
    );
    return res.status(200).json({ success: true, message: 'Berhasil disimpan ke Google Drive.', file });
  } catch (error) {
    return sendDriveError(res, error);
  }
}
