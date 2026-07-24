import { request as httpsRequest } from 'node:https';
import { Agent as HttpsAgent } from 'node:https';

import type { DeviceProvider } from '@protect-broker/broker-core';
import type { ProtectConnectionInput } from '@protect-broker/shared';

interface HttpResult {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ProtectSession {
  baseUrl: string;
  cookieHeader: string;
  authenticatedAt: string;
  bootstrapPath?: string;
}

export interface ProtectClient extends DeviceProvider {
  testConnection(settings: ProtectConnectionInput): Promise<{ ok: boolean; message?: string }>;
}

function buildBaseUrl(settings: ProtectConnectionInput): string {
  const hostInput = settings.host.trim();

  if (hostInput.startsWith('http://') || hostInput.startsWith('https://')) {
    const parsed = new URL(hostInput);
    return `${parsed.protocol}//${parsed.hostname}:${settings.port}`;
  }

  return `https://${hostInput}:${settings.port}`;
}

function extractCookieHeader(headers: Record<string, string | string[] | undefined>): string {
  const setCookie = headers['set-cookie'];

  if (!setCookie) {
    return '';
  }

  const rawEntries = Array.isArray(setCookie) ? setCookie : [setCookie];
  const tokens = rawEntries
    .map((entry) => entry.split(';')[0]?.trim())
    .filter((entry): entry is string => Boolean(entry));

  return tokens.join('; ');
}

export class UnifiProtectClient implements ProtectClient {
  readonly providerName = 'unifi-protect';
  private session: ProtectSession | null = null;

  async testConnection(settings: ProtectConnectionInput): Promise<{ ok: boolean; message?: string }> {
    const baseUrl = buildBaseUrl(settings);

    try {
      const loginResponse = await this.httpRequest({
        method: 'POST',
        url: `${baseUrl}/api/auth/login`,
        allowSelfSignedCertificate: settings.allowSelfSignedCertificate,
        body: {
          username: settings.username,
          password: settings.password,
        },
      });

      if (loginResponse.statusCode === 401 || loginResponse.statusCode === 403) {
        return {
          ok: false,
          message: 'Protect credentials were rejected. Verify username and password.',
        };
      }

      if (loginResponse.statusCode < 200 || loginResponse.statusCode >= 300) {
        return {
          ok: false,
          message: `Protect login returned HTTP ${loginResponse.statusCode}.`,
        };
      }

      const cookieHeader = extractCookieHeader(loginResponse.headers);

      if (!cookieHeader) {
        return {
          ok: false,
          message: 'Protect login succeeded but no session cookie was returned.',
        };
      }

      const bootstrapPaths = ['/proxy/protect/api/bootstrap', '/api/bootstrap'];
      let bootstrapDetected: string | undefined;

      for (const path of bootstrapPaths) {
        const bootstrapResponse = await this.httpRequest({
          method: 'GET',
          url: `${baseUrl}${path}`,
          allowSelfSignedCertificate: settings.allowSelfSignedCertificate,
          headers: {
            Cookie: cookieHeader,
          },
        });

        if (bootstrapResponse.statusCode >= 200 && bootstrapResponse.statusCode < 300) {
          bootstrapDetected = path;
          break;
        }
      }

      this.session = {
        baseUrl,
        cookieHeader,
        authenticatedAt: new Date().toISOString(),
        bootstrapPath: bootstrapDetected,
      };

      if (bootstrapDetected) {
        return {
          ok: true,
          message: `Connected. Protect bootstrap endpoint detected at ${bootstrapDetected}.`,
        };
      }

      return {
        ok: true,
        message: 'Connected. Login succeeded; Protect bootstrap endpoint probe will be expanded next.',
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? `Unable to connect to Protect: ${error.message}`
            : 'Unable to connect to Protect.',
      };
    }
  }

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    this.session = null;
  }

  private async httpRequest(args: {
    method: 'GET' | 'POST';
    url: string;
    allowSelfSignedCertificate: boolean;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  }): Promise<HttpResult> {
    const bodyString = args.body ? JSON.stringify(args.body) : undefined;

    return new Promise((resolve, reject) => {
      const request = httpsRequest(
        args.url,
        {
          method: args.method,
          headers: {
            Accept: 'application/json',
            ...(bodyString
              ? {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(bodyString).toString(),
                }
              : {}),
            ...(args.headers ?? {}),
          },
          agent: new HttpsAgent({
            rejectUnauthorized: !args.allowSelfSignedCertificate,
          }),
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          response.on('end', () => {
            resolve({
              statusCode: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
              headers: response.headers,
            });
          });
        },
      );

      request.on('error', (error) => {
        reject(error);
      });

      request.setTimeout(10000, () => {
        request.destroy(new Error('Connection timed out after 10 seconds.'));
      });

      if (bodyString) {
        request.write(bodyString);
      }

      request.end();
    });
  }
}
