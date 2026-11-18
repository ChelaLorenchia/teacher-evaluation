export interface NetlifyEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
  isBase64Encoded: boolean;
  rawUrl: string;
  rawQuery: string | null;
}

export interface NetlifyResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

export type Handler = (event: NetlifyEvent) => Promise<NetlifyResponse> | NetlifyResponse;
