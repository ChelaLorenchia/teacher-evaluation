import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  DriveConfigurationError,
  getDriveClient,
  getRootFolderId,
} from './_lib/drive';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed.' });

  try {
    const drive = getDriveClient();
    const response = await drive.files.get({
      fileId: getRootFolderId(),
      fields: 'id,name,mimeType',
      supportsAllDrives: true,
    });
    const isFolder = response.data.mimeType === 'application/vnd.google-apps.folder';
    if (!isFolder) {
      return res.status(200).json({
        success: true,
        service: 'teacher-evaluation-drive-api',
        status: 'online',
        timestamp: new Date().toISOString(),
        drive: { connected: false, message: 'Root Drive ditemukan tetapi bukan folder.' },
      });
    }
    return res.status(200).json({
      success: true,
      service: 'teacher-evaluation-drive-api',
      status: 'online',
      timestamp: new Date().toISOString(),
      drive: {
        connected: true,
        message: 'Service account dapat mengakses folder root.',
      },
      rootFolder: { id: response.data.id, name: response.data.name },
    });
  } catch (error) {
    if (error instanceof DriveConfigurationError) {
      return res.status(200).json({
        success: true,
        service: 'teacher-evaluation-drive-api',
        status: 'online',
        timestamp: new Date().toISOString(),
        drive: { connected: false, message: error.message },
      });
    }
    console.error('Google Drive health check failed:', error);
    return res.status(200).json({
      success: true,
      service: 'teacher-evaluation-drive-api',
      status: 'online',
      timestamp: new Date().toISOString(),
      drive: {
        connected: false,
        message: 'API aktif tetapi Google Drive tidak dapat diakses. Periksa credential, permission folder, dan status Drive API.',
      },
    });
  }
}
