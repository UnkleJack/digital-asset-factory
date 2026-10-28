import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { validation } from '../core/errors.ts';
import { registerSecretForRedaction } from '../logging/logger.ts';

export const SECRET_NAMES = [
  'anthropic_api_key', 'openai_api_key',
  'openrouter_api_key', 'groq_api_key', 'nvidia_api_key', 'cerebras_api_key', 'together_api_key',
  'gemini_api_key', 'mistral_api_key', 'github_models_token', 'huggingface_token',
  'etsy_api_key', 'etsy_oauth', 'gumroad_token',
  'tavily_api_key', 'exa_api_key', 'brave_search_api_key', 'smtp_password',
  'remote_access_token',
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

export interface SecretStatus {
  name: SecretName;
  configured: boolean;
  source: 'keychain' | 'dpapi' | 'environment' | 'memory' | 'none';
}

export interface SecretStore {
  readonly kind: 'keychain' | 'dpapi' | 'environment' | 'memory';
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

/** Encrypts and decrypts with Windows DPAPI for the signed-in Windows user, via the built-in PowerShell. */
export interface Protector {
  protect(plain: string): Promise<string>;
  unprotect(cipherB64: string): Promise<string>;
}

function powershell(script: string, stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill(), 20000);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`Windows secret storage failed (exit ${code}): ${err.trim().slice(0, 300)}`));
    });
    child.stdin.end(stdin);
  });
}

// The value travels over stdin, never on the command line, so it can't show up in process lists.
const PS_PROTECT = "Add-Type -AssemblyName System.Security; $t=[Console]::In.ReadToEnd(); $b=[Text.Encoding]::UTF8.GetBytes($t); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser'))";
const PS_UNPROTECT = "Add-Type -AssemblyName System.Security; $t=[Console]::In.ReadToEnd().Trim(); $b=[Convert]::FromBase64String($t); [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'))";

export const dpapiProtector: Protector = {
  protect: (plain) => powershell(PS_PROTECT, plain),
  unprotect: (cipher) => powershell(PS_UNPROTECT, cipher),
};

/**
 * Windows: each key is encrypted with DPAPI (only this Windows user on this computer can decrypt it)
 * and kept in data/secrets.dpapi.json. Environment variables still work as a fallback.
 */
export class DpapiSecretStore implements SecretStore {
  readonly kind = 'dpapi' as const;
  private file: string;
  private protector: Protector;
  private cache = new Map<SecretName, string | null>();

  constructor(dataDir: string, protector: Protector = dpapiProtector) {
    this.file = join(dataDir, 'secrets.dpapi.json');
    this.protector = protector;
  }

  static available(): boolean {
    return process.platform === 'win32';
  }

  private load(): Record<string, string> {
    if (!existsSync(this.file)) return {};
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private save(data: Record<string, string>): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, this.file);
  }

  async get(name: SecretName): Promise<string | null> {
    if (this.cache.has(name)) return this.cache.get(name)!;
    const cipher = this.load()[name];
    const value = cipher ? await this.protector.unprotect(cipher) : process.env[envName(name)] || null;
    this.cache.set(name, value);
    registerSecretForRedaction(value);
    return value;
  }

  async set(name: SecretName, value: string): Promise<void> {
    assertSecretName(name);
    assertSecretValue(value);
    registerSecretForRedaction(value);
    const cipher = await this.protector.protect(value);
    if ((await this.protector.unprotect(cipher)) !== value) throw new Error('Windows secret storage could not be verified');
    this.save({ ...this.load(), [name]: cipher });
    this.cache.set(name, value);
  }

  async delete(name: SecretName): Promise<void> {
    assertSecretName(name);
    const data = this.load();
    delete data[name];
    this.save(data);
    this.cache.delete(name);
  }

  async status(): Promise<SecretStatus[]> {
    const data = this.load();
    return SECRET_NAMES.map((name) => (data[name] ? { name, configured: true, source: 'dpapi' } : process.env[envName(name)] ? { name, configured: true, source: 'environment' } : { name, configured: false, source: 'none' }));
  }
}

export function createSecretStore(dataDir?: string): SecretStore {
  if (process.env.DAF_SECRET_STORE === 'memory') return new MemorySecretStore();
  if (process.env.DAF_SECRET_STORE === 'env') return new EnvSecretStore();
  if (KeychainSecretStore.available()) return new KeychainSecretStore(process.env.DAF_KEYCHAIN_SERVICE || 'digital-asset-factory');
  if (DpapiSecretStore.available() && dataDir) return new DpapiSecretStore(dataDir);
  return new EnvSecretStore();
}
