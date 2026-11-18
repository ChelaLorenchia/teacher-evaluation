export interface DriveApiResult {
  success: boolean;
  message?: string;
  connected?: boolean;
  status?: string;
  drive?: {
    connected: boolean;
    message?: string;
  };
  files?: Array<{
    id: string;
    name: string;
    size?: string;
    mimeType?: string;
    createdTime?: string;
    modifiedTime?: string;
    webViewLink?: string;
  }>;
  rootFolder?: {
    id?: string;
    name?: string;
  };
}

export async function readDriveApiResponse(response: Response): Promise<DriveApiResult> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      'Backend Google Drive tidak merespons sebagai API. Pastikan deployment menyertakan serverless functions dan route /api/* diarahkan ke functions.',
    );
  }

  let result: DriveApiResult;
  try {
    result = await response.json() as DriveApiResult;
  } catch (error) {
    console.error('Respons API Google Drive bukan JSON yang valid:', error);
    throw new Error('Respons layanan Google Drive tidak valid.');
  }

  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Tidak dapat memuat dokumen Google Drive.');
  }
  return result;
}
