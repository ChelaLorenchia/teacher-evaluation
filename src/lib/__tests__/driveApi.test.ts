import { describe, expect, it } from 'vitest';
import { readDriveApiResponse } from '../driveApi';

describe('respons API Google Drive', () => {
  it('menjelaskan jika endpoint mengembalikan halaman hosting, bukan JSON', async () => {
    const response = new Response('<html>import __vite__</html>', {
      headers: { 'content-type': 'text/html' },
    });

    await expect(readDriveApiResponse(response)).rejects.toThrow(
      'deployment menyertakan serverless functions',
    );
  });

  it('mengembalikan daftar file dari respons JSON yang berhasil', async () => {
    const response = new Response(JSON.stringify({
      success: true,
      files: [{ id: 'file-1', name: 'Instrumen.xlsx' }],
    }), {
      headers: { 'content-type': 'application/json' },
    });

    await expect(readDriveApiResponse(response)).resolves.toMatchObject({
      success: true,
      files: [{ id: 'file-1', name: 'Instrumen.xlsx' }],
    });
  });
});
