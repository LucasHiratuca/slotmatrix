import { randomUUID } from 'node:crypto';
import { ForbiddenError, ValidationError } from '../domain/errors';

export interface AllowedFileType {
  mime: string;
  ext: string;
  matchesMagicBytes: (buf: Buffer) => boolean;
}

const ALLOWED_TYPES: Record<string, AllowedFileType> = {
  'application/pdf': {
    mime: 'application/pdf',
    ext: 'pdf',
    matchesMagicBytes: (buf) => buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-',
  },
  'image/png': {
    mime: 'image/png',
    ext: 'png',
    matchesMagicBytes: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  'image/jpeg': {
    mime: 'image/jpeg',
    ext: 'jpg',
    matchesMagicBytes: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  'image/webp': {
    mime: 'image/webp',
    ext: 'webp',
    matchesMagicBytes: (buf) =>
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP',
  },
};

export function validateAndBuildTenantUploadKey(
  tenantId: string,
  mimetype: string,
  buffer: Buffer,
): { key: string; safeMime: string; safeExt: string } {
  const rule = ALLOWED_TYPES[mimetype.toLowerCase()];
  if (!rule) {
    throw new ValidationError('Tipo de arquivo não permitido. Aceitos apenas PDF, PNG, JPEG e WebP.');
  }
  if (!rule.matchesMagicBytes(buffer)) {
    throw new ValidationError('Conteúdo do arquivo não corresponde ao tipo MIME declarado.');
  }
  return {
    key: `workspaces/${tenantId}/docs/${randomUUID()}.${rule.ext}`,
    safeMime: rule.mime,
    safeExt: rule.ext,
  };
}

export function assertTenantDocumentKey(tenantId: string, rawKey: string): string {
  const normalized = rawKey.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || normalized.includes('\0')) {
    throw new ForbiddenError('Chave de documento inválida.');
  }
  const expectedPrefix = `workspaces/${tenantId}/docs/`;
  if (!normalized.startsWith(expectedPrefix)) {
    throw new ForbiddenError('Acesso negado a documento fora do workspace autorizado.');
  }
  const suffix = normalized.slice(expectedPrefix.length);
  if (!/^[a-zA-Z0-9_-]+\.(pdf|png|jpg|webp)$/.test(suffix)) {
    throw new ForbiddenError('Formato de chave de documento inválido.');
  }
  return normalized;
}

export function contentTypeForDocumentKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}
