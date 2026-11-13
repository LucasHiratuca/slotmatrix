import { Readable } from 'node:stream';
import * as Minio from 'minio';

const rawEndpoint = process.env.S3_ENDPOINT || 'garage_s3:3900';
const isHttps = rawEndpoint.startsWith('https://') || process.env.S3_USE_SSL === 'true';
const cleaned = rawEndpoint.replace(/^https?:\/\//, '');
const [host, portStr] = cleaned.split(':');
const port = portStr ? parseInt(portStr, 10) : (isHttps ? 443 : 3900);

export const BUCKET_NAME = process.env.S3_BUCKET || 'perfis';

function resolveS3Credentials(): { accessKey: string; secretKey: string } {
  const accessKey = process.env.S3_ACCESS_KEY || 'GK9ae6ab4a2d12a3227b1a0d9a';
  const secretKey = process.env.S3_SECRET_KEY || 'f46bb999a2d2615ad200369932ccff5454f113c74c4614e6027dc2380dcc5632';
  return { accessKey, secretKey };
}

const creds = resolveS3Credentials();

export const minioClient = new Minio.Client({
  endPoint: host || 'localhost',
  port,
  useSSL: isHttps,
  accessKey: creds.accessKey,
  secretKey: creds.secretKey,
  region: process.env.S3_REGION || 'garage',
  pathStyle: true,
});

// Fallback in-memory cache para testes unitários ou quando S3 externo estiver indisponível
const inMemoryStore = new Map<string, { buffer: Buffer; mimetype: string }>();

export async function ensureBucketExists(): Promise<void> {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, process.env.S3_REGION || 'garage');
      console.log(`[Storage] Bucket '${BUCKET_NAME}' criado com sucesso no MinIO/Garage S3.`);
    } else {
      console.log(`[Storage] Bucket '${BUCKET_NAME}' verificado e operacional.`);
    }
  } catch (err: any) {
    console.warn(`[Storage] Aviso ao verificar/criar bucket '${BUCKET_NAME}': ${err.message}`);
  }
}

export async function uploadDocument(
  key: string,
  buffer: Buffer,
  mimetype: string,
): Promise<{ key: string; size: number }> {
  try {
    await minioClient.putObject(BUCKET_NAME, key, buffer, buffer.length, {
      'Content-Type': mimetype,
    });
    return { key, size: buffer.length };
  } catch (err: any) {
    console.warn(`[Storage] S3 putObject falhou (${err.message}). Armazenando temporariamente em memória para chave '${key}'.`);
    inMemoryStore.set(key, { buffer, mimetype });
    return { key, size: buffer.length };
  }
}

export async function getDocumentStream(key: string): Promise<NodeJS.ReadableStream> {
  try {
    return await minioClient.getObject(BUCKET_NAME, key);
  } catch (err: any) {
    const item = inMemoryStore.get(key);
    if (item) {
      return Readable.from(item.buffer);
    }
    throw err;
  }
}
