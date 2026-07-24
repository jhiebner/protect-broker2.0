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
  bootstrapPath: string;
}

export interface DiscoveredProtectDevice {
  externalId: string;
  name: string;
  category: string;
  isOnline: boolean;
  metadata: Record<string, unknown>;
}

export interface ProtectClient extends DeviceProvider {
  testConnection(settings: ProtectConnectionInput): Promise<{ ok: boolean; message?: string }>;
  discoverDevices(settings: ProtectConnectionInput): Promise<DiscoveredProtectDevice[]>;
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
    try {
      const session = await this.authenticate(settings);
      this.session = session;

      if (session.bootstrapPath) {
        return {
          ok: true,
          message: `Connected. Protect bootstrap endpoint detected at ${session.bootstrapPath}.`,
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

  async discoverDevices(settings: ProtectConnectionInput): Promise<DiscoveredProtectDevice[]> {
    const session = await this.authenticate(settings);
    this.session = session;

    const bootstrapResponse = await this.httpRequest({
      method: 'GET',
      url: `${session.baseUrl}${session.bootstrapPath}`,
      allowSelfSignedCertificate: settings.allowSelfSignedCertificate,
      headers: {
        Cookie: session.cookieHeader,
      },
    });

    if (bootstrapResponse.statusCode < 200 || bootstrapResponse.statusCode >= 300) {
      throw new Error(`Protect bootstrap returned HTTP ${bootstrapResponse.statusCode}.`);
    }

    const payload = JSON.parse(bootstrapResponse.body) as Record<string, unknown>;
    return normalizeDevicesFromBootstrap(payload);
  }

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    this.session = null;
  }

  private async authenticate(settings: ProtectConnectionInput): Promise<ProtectSession> {
    const baseUrl = buildBaseUrl(settings);

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
      throw new Error('Protect credentials were rejected. Verify username and password.');
    }

    if (loginResponse.statusCode < 200 || loginResponse.statusCode >= 300) {
      throw new Error(`Protect login returned HTTP ${loginResponse.statusCode}.`);
    }

    const cookieHeader = extractCookieHeader(loginResponse.headers);

    if (!cookieHeader) {
      throw new Error('Protect login succeeded but no session cookie was returned.');
    }

    const bootstrapPaths = ['/proxy/protect/api/bootstrap', '/api/bootstrap'];

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
        return {
          baseUrl,
          cookieHeader,
          authenticatedAt: new Date().toISOString(),
          bootstrapPath: path,
        };
      }
    }

    throw new Error('Protect login succeeded but bootstrap endpoint could not be reached.');
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

function toDeviceArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === 'object' && !Array.isArray(entry),
  );
}

function normalizeDevicesFromBootstrap(
  bootstrap: Record<string, unknown>,
): DiscoveredProtectDevice[] {
  const deviceGroups: Array<{ key: string; items: Array<Record<string, unknown>> }> = [
    { key: 'cameras', items: toDeviceArray(bootstrap.cameras) },
    { key: 'lights', items: toDeviceArray(bootstrap.lights) },
    { key: 'sensors', items: toDeviceArray(bootstrap.sensors) },
    { key: 'doorlocks', items: toDeviceArray(bootstrap.doorlocks) },
    { key: 'bridges', items: toDeviceArray(bootstrap.bridges) },
    { key: 'chimes', items: toDeviceArray(bootstrap.chimes) },
    { key: 'viewers', items: toDeviceArray(bootstrap.viewers) },
    { key: 'liveviews', items: toDeviceArray(bootstrap.liveviews) },
  ];

  const discovered: DiscoveredProtectDevice[] = [];

  for (const group of deviceGroups) {
    for (const raw of group.items) {
      const externalId =
        (typeof raw.id === 'string' && raw.id) ||
        (typeof raw.mac === 'string' && raw.mac) ||
        (typeof raw.uuid === 'string' && raw.uuid) ||
        '';

      if (!externalId) {
        continue;
      }

      const name =
        (typeof raw.name === 'string' && raw.name) ||
        (typeof raw.displayName === 'string' && raw.displayName) ||
        `${group.key}-${externalId.slice(0, 6)}`;

      const isOnline =
        typeof raw.isConnected === 'boolean'
          ? raw.isConnected
          : typeof raw.isOnline === 'boolean'
            ? raw.isOnline
            : false;

      discovered.push({
        externalId,
        name,
        category: group.key,
        isOnline,
        metadata: raw,
      });
    }
  }

  return discovered;
}
