import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { validation } from '../core/errors.ts';
import { registerSecretForRedaction } from '../logging/logger.ts';

export const SECRET_NAMES = [
  'anthropic_api_key', 'openai_api_key',
  'openrouter_api_key', 'groq_api_key', 'nvidia_api_key', 'cerebras_api_key', 'together_api_key',
  'etsy_api_key', 'etsy_oauth', 'gumroad_token',
  'tavily_api_key', 'exa_api_key', 'brave_search_api_key', 'smtp_password',
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

export interface SecretStatus {
  name: SecretName;
  configured: boolean;
  source: 'keychain' | 'environment' | 'memory' | 'none';
}

export interface SecretStore {
  readonly kind: 'keychain' | 'environment' | 'memory';
  get(name: SecretName): Promise<string | null>;
  set(name: SecretName, value: string): Promise<void>;
  delete(name: SecretName): Promise<void>;
  status(): Promise<SecretStatus[]>;
}

const VALUE_RE = /^[A-Za-z0-9._~+/=:-]{8,4096}$/;

export function assertSecretName(name: string): asserts name is SecretName {
  if (!(SECRET_NAMES as readonly string[]).includes(name)) throw validation(`Unknown secret: ${name}`);
}

function assertSecretValue(value: string): void {
  if (!VALUE_RE.test(value)) {
    throw validation('Secret values must be 8-4096 characters of letters, digits or . _ ~ + / = : -');
  }
}

const envName = (name: SecretName) => `DAF_SECRET_${name.toUpperCase()}`;

function runSecurity(args: string[], stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    if (stdin === undefined) {
      execFile('/usr/bin/security', args, { timeout: 15000 }, (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      });
      return;
    }
    const child = spawn('/usr/bin/security', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}

export class KeychainSecretStore implements SecretStore {
  readonly kind = 'keychain' as const;
  private service: string;
  private cache = new Map<SecretName, { value: string | null; at: number }>();

  constructor(service = 'digital-asset-factory') {
    this.service = service;
  }

  static available(): boolean {
    return process.platform === 'darwin' && existsSync('/usr/bin/security');
  }

  async get(name: SecretName): Promise<string | null> {
    const hit = this.cache.get(name);
    if (hit && Date.now() - hit.at < 60_000) return hit.value;
    const env = process.env[envName(name)];
    const r = await runSecurity(['find-generic-password', '-s', this.service, '-a', name, '-w']);
    const value = r.code === 0 ? r.stdout.replace(/\n$/, '') : env ?? null;
    this.cache.set(name, { value, at: Date.now() });
    registerSecretForRedaction(value);
    return value || null;
  }

  async set(name: SecretName, value: string): Promise<void> {
    assertSecretName(name);
    assertSecretValue(value);
    registerSecretForRedaction(value);
    const cmd = `add-generic-password -U -s "${this.service}" -a "${name}" -l "Digital Asset Factory: ${name}" -w "${value}"\n`;
    const r = await runSecurity(['-i'], cmd);
    if (r.code !== 0 || /error|fail/i.test(r.stderr)) {
      throw new Error(`Keychain write failed (exit ${r.code}). Check that the login keychain is unlocked.`);
    }
    this.cache.delete(name);
    if ((await this.get(name)) !== value) throw new Error('Keychain write could not be verified');
  }

  async delete(name: SecretName): Promise<void> {
    assertSecretName(name);
    await runSecurity(['delete-generic-password', '-s', this.service, '-a', name]);
    this.cache.delete(name);
  }

  async status(): Promise<SecretStatus[]> {
    const out: SecretStatus[] = [];
    for (const name of SECRET_NAMES) {
      const r = await runSecurity(['find-generic-password', '-s', this.service, '-a', name]);
      if (r.code === 0) out.push({ name, configured: true, source: 'keychain' });
      else if (process.env[envName(name)]) out.push({ name, configured: true, source: 'environment' });
      else out.push({ name, configured: false, source: 'none' });
    }
    return out;
  }
}

export class EnvSecretStore implements SecretStore {
  readonly kind = 'environment' as const;
  async get(name: SecretName) {
    const v = process.env[envName(name)] || null;
    registerSecretForRedaction(v);
    return v;
  }
  async set(): Promise<void> {
    throw validation('This platform stores secrets in environment variables (DAF_SECRET_<NAME>); set them before starting the app.');
  }
  async delete(): Promise<void> {
    throw validation('Environment secrets cannot be deleted from the app.');
  }
  async status(): Promise<SecretStatus[]> {
    return SECRET_NAMES.map((name) => ({ name, configured: !!process.env[envName(name)], source: process.env[envName(name)] ? 'environment' : 'none' }));
  }
}

export class MemorySecretStore implements SecretStore {
  readonly kind = 'memory' as const;
  private values = new Map<SecretName, string>();
  async get(name: SecretName) {
    const v = this.values.get(name) ?? null;
    registerSecretForRedaction(v);
    return v;
  }
  async set(name: SecretName, value: string) {
    assertSecretName(name);
    assertSecretValue(value);
    registerSecretForRedaction(value);
    this.values.set(name, value);
  }
  async delete(name: SecretName) {
    this.values.delete(name);
  }
  async status(): Promise<SecretStatus[]> {
    return SECRET_NAMES.map((name) => ({ name, configured: this.values.has(name), source: this.values.has(name) ? 'memory' : 'none' }));
  }
}

export function createSecretStore(): SecretStore {
  if (process.env.DAF_SECRET_STORE === 'memory') return new MemorySecretStore();
  if (process.env.DAF_SECRET_STORE === 'env' || !KeychainSecretStore.available()) return new EnvSecretStore();
  return new KeychainSecretStore(process.env.DAF_KEYCHAIN_SERVICE || 'digital-asset-factory');
}
