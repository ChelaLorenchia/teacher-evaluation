import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Handler, NetlifyEvent } from './types';

type VercelHandler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>;

export function adaptVercelHandler(handler: VercelHandler): Handler {
  return async (event: NetlifyEvent) => {
    const url = new URL(event.rawUrl);
    const query: Record<string, string | string[]> = {};
    for (const [key, value] of url.searchParams) {
      const current = query[key];
      query[key] = current === undefined
        ? value
        : Array.isArray(current) ? [...current, value] : [current, value];
    }

    let body: unknown;
    if (event.body) {
      const text = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
      try {
        body = JSON.parse(text);
      } catch {
        return {
          statusCode: 400,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ success: false, message: 'Request body harus berupa JSON yang valid.' }),
        };
      }
    }

    const req = {
      method: event.httpMethod,
      query,
      headers: event.headers,
      body,
    } as VercelRequest;

    let statusCode = 200;
    const headers: Record<string, string> = {};
    let responseBody: unknown;
    const response = {
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
        return response;
      },
      status(code: number) {
        statusCode = code;
        return response;
      },
      json(value: unknown) {
        headers['content-type'] = 'application/json; charset=utf-8';
        responseBody = value;
        return response;
      },
    } as unknown as VercelResponse;

    await handler(req, response);
    return {
      statusCode,
      headers,
      body: responseBody === undefined ? '' : JSON.stringify(responseBody),
    };
  };
}
