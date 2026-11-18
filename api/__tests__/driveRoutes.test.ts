import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import healthHandler from '../health-drive';
import listHandler from '../list-drive';
import uploadHandler from '../upload-drive';
import { handler as netlifyHealthHandler } from '../../netlify/functions/health-drive';

function mockResponse() {
  let statusCode = 200;
  let body: unknown;
  const response = {
    setHeader: vi.fn(),
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: unknown) {
      body = value;
      return response;
    },
    result: () => ({ statusCode, body }),
  };
  return response;
}

function request(
  method: string,
  query: Record<string, string> = {},
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return { method, query, headers, body } as unknown as VercelRequest;
}

describe('API Google Drive', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('health-check membedakan API online dari Google Drive yang belum dikonfigurasi', async () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', '');
    vi.stubEnv('GOOGLE_PRIVATE_KEY', '');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', '');
    const res = mockResponse();

    await healthHandler(request('GET'), res as unknown as VercelResponse);

    expect(res.result()).toMatchObject({
      statusCode: 200,
      body: {
        success: true,
        service: 'teacher-evaluation-drive-api',
        status: 'online',
        drive: { connected: false, message: expect.stringContaining('belum lengkap') },
      },
    });
  });

  it('menolak daftar jawaban tanpa token Admin', async () => {
    vi.stubEnv('DRIVE_ADMIN_TOKEN', 'secret-test-token');
    const res = mockResponse();

    await listHandler(
      request('GET', { week: 'WEEK 1', documentKind: 'answer' }),
      res as unknown as VercelResponse,
    );

    expect(res.result()).toMatchObject({
      statusCode: 401,
      body: { success: false, message: 'Token Admin tidak valid.' },
    });
  });

  it('menolak upload instrumen tanpa token Admin', async () => {
    vi.stubEnv('DRIVE_ADMIN_TOKEN', 'secret-test-token');
    const res = mockResponse();

    await uploadHandler(request('POST', {}, {}, {
      fileName: 'instrument.xlsx',
      fileBase64: 'UEs=',
      week: 'WEEK 1',
      documentKind: 'question',
    }), res as unknown as VercelResponse);

    expect(res.result()).toMatchObject({
      statusCode: 401,
      body: { success: false, message: 'Token Admin tidak valid.' },
    });
  });

  it('menjalankan Netlify health route dan mengembalikan JSON konfigurasi', async () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', '');
    vi.stubEnv('GOOGLE_PRIVATE_KEY', '');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', '');

    const result = await netlifyHealthHandler({
      httpMethod: 'GET',
      headers: {},
      body: null,
      isBase64Encoded: false,
      rawUrl: 'https://example.test/api/health-drive',
      rawQuery: null,
    });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      success: true,
      service: 'teacher-evaluation-drive-api',
      status: 'online',
      drive: { connected: false, message: expect.stringContaining('belum lengkap') },
    });
  });
});
