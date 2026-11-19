/**
 * Klien Google Drive minimal untuk Transfer PDF ke Drive — HANYA server (memakai kunci akun layanan).
 * REST langsung (tanpa pustaka googleapis): token OAuth dari JWT akun layanan (RS256, node:crypto), lalu
 * Drive v3 dengan `supportsAllDrives` karena tujuan = Shared Drive (akun layanan tak punya kuota Drive pribadi).
 *
 * Env (TEKNIS.md §2/§3):
 *  - GOOGLE_DRIVE_SERVICE_ACCOUNT — isi berkas JSON kunci akun layanan (client_email + private_key).
 *  - GOOGLE_DRIVE_FOLDER_ID       — id folder induk di Shared Drive; akun layanan = anggota "Pengelola konten".
 * Tanpa keduanya fitur mati (driveConfigured() = false) dan tombol menjelaskan "belum aktif".
 *
 * Penanda berkas: appProperties { paPeriod, paEmp } → berkas yang sama ditemukan lagi walau dipindah/diganti nama,
 * sehingga transfer ulang menimpa/memindahkan, bukan menggandakan.
 */
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/drive';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ALL = 'supportsAllDrives=true';

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export class DriveError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!sa.client_email || !sa.private_key) return null;
    return { client_email: sa.client_email, private_key: sa.private_key.replace(/\\n/g, '\n'), token_uri: sa.token_uri };
  } catch {
    return null;
  }
}

export function driveRootFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null;
}

export function driveConfigured(): boolean {
  return !!serviceAccount() && !!driveRootFolderId();
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** JWT bertanda tangan untuk ditukar dengan token akses (diekspor untuk diuji). */
export function signServiceJwt(sa: ServiceAccount, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: nowSec, exp: nowSec + 3600,
  }));
  const sig = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
  return `${header}.${claims}.${b64url(sig)}`;
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const sa = serviceAccount();
  if (!sa) throw new DriveError('Kunci akun layanan Google belum diatur.');
  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signServiceJwt(sa, now) }),
  });
  const json = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new DriveError(`Login akun layanan Google gagal${json.error_description ? `: ${json.error_description}` : ''}.`, res.status);
  cached = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cached.token;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    const detail = body.error?.message ?? res.statusText;
    if (res.status === 404) throw new DriveError(`Folder/berkas Drive tidak ditemukan atau akun layanan belum menjadi anggota Shared Drive (${detail}).`, 404);
    if (res.status === 403) throw new DriveError(`Akun layanan tidak punya izin di Shared Drive — jadikan anggota "Pengelola konten" (${detail}).`, 403);
    throw new DriveError(`Google Drive menolak permintaan (${res.status}): ${detail}`, res.status);
  }
  return res.status === 204 ? (undefined as T) : (await res.json() as T);
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function list(query: string): Promise<{ id: string; name: string; parents?: string[] }[]> {
  const out: { id: string; name: string; parents?: string[] }[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({
      q: query, fields: 'nextPageToken,files(id,name,parents)', pageSize: '100',
      supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', corpora: 'allDrives',
      ...(pageToken ? { pageToken } : {}),
    });
    const r = await call<{ files?: { id: string; name: string; parents?: string[] }[]; nextPageToken?: string }>(`${API}?${p}`);
    out.push(...(r.files ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

/** Pastikan folder induk bisa dibuka akun layanan (pesan jelas sebelum memproses pegawai). */
export async function checkRootFolder(rootId: string): Promise<void> {
  await call(`${API}/${encodeURIComponent(rootId)}?${ALL}&fields=id`);
}

/**
 * Cari-atau-buat rantai folder `path` di bawah `rootId`. `cache` (parent|name → id) dipakai lintas pegawai dalam
 * satu panggilan agar folder yang sama tak dicari berulang. Mengembalikan id folder terdalam.
 */
export async function ensureFolderPath(rootId: string, path: string[], cache: Map<string, string>): Promise<string> {
  let parent = rootId;
  for (const name of path) {
    const key = `${parent}|${name}`;
    let id = cache.get(key);
    if (!id) {
      const found = await list(`'${q(parent)}' in parents and name = '${q(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`);
      id = found[0]?.id;
      if (!id) {
        const made = await call<{ id: string }>(`${API}?${ALL}&fields=id`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
        });
        id = made.id;
      }
      cache.set(key, id);
    }
    parent = id;
  }
  return parent;
}

/** Semua salinan PDF seorang pegawai untuk satu periode (berdasarkan penanda appProperties). */
export async function findPaFiles(periodId: string, employeeId: string): Promise<{ id: string; parentId: string | null }[]> {
  const files = await list(
    `appProperties has { key='paPeriod' and value='${q(periodId)}' } and appProperties has { key='paEmp' and value='${q(employeeId)}' } and trashed = false`,
  );
  return files.map((f) => ({ id: f.id, parentId: f.parents?.[0] ?? null }));
}

function multipart(meta: object, pdf: Buffer): { body: Buffer; type: string } {
  const boundary = `pa${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    pdf,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return { body, type: `multipart/related; boundary=${boundary}` };
}

export async function uploadPaPdf(folderId: string, name: string, pdf: Buffer, tag: { periodId: string; employeeId: string }): Promise<void> {
  const { body, type } = multipart({
    name, mimeType: 'application/pdf', parents: [folderId],
    appProperties: { paPeriod: tag.periodId, paEmp: tag.employeeId },
  }, pdf);
  await call(`${UPLOAD}?uploadType=multipart&${ALL}&fields=id`, { method: 'POST', headers: { 'Content-Type': type }, body: new Uint8Array(body) });
}

/** Ganti isi (dan nama) berkas; pindahkan ke `folderId` bila `fromParent` diisi. */
export async function replacePaPdf(fileId: string, name: string, pdf: Buffer, move: { folderId: string; fromParent: string | null } | null): Promise<void> {
  const p = new URLSearchParams({ uploadType: 'multipart', supportsAllDrives: 'true', fields: 'id' });
  if (move) {
    p.set('addParents', move.folderId);
    if (move.fromParent) p.set('removeParents', move.fromParent);
  }
  const { body, type } = multipart({ name, mimeType: 'application/pdf' }, pdf);
  await call(`${UPLOAD}/${encodeURIComponent(fileId)}?${p}`, { method: 'PATCH', headers: { 'Content-Type': type }, body: new Uint8Array(body) });
}

/** Buang ke Sampah Shared Drive (bisa dipulihkan ±30 hari), bukan hapus permanen. */
export async function trashFile(fileId: string): Promise<void> {
  await call(`${API}/${encodeURIComponent(fileId)}?${ALL}&fields=id`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
  });
}
