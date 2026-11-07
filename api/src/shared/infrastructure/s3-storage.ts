import * as Minio from 'minio';

const ENDPOINT = process.env.S3_ENDPOINT || 'garage:3900';
const [host, port] = ENDPOINT.split(':');

export const BUCKET_NAME = process.env.S3_BUCKET || 'slotmatrix-docs';

export const minioClient = new Minio.Client({
  endPoint: host || 'localhost',
  port: parseInt(port || '3900', 10),
  useSSL: false,
  accessKey: process.env.S3_ACCESS_KEY || 'GK9ae6ab4a2d12a3227b1a0d9a',
  secretKey: process.env.S3_SECRET_KEY || 'f46bb999a2d2615ad200369932ccff5454f113c74c4614e6027dc2380dcc5632',
  region: process.env.S3_REGION || 'garage',
  pathStyle: true,
});

export async function ensureBucketExists(): Promise<void> {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
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
  await minioClient.putObject(BUCKET_NAME, key, buffer, buffer.length, {
    'Content-Type': mimetype,
  });
  return { key, size: buffer.length };
}

export async function getDocumentStream(key: string): Promise<NodeJS.ReadableStream> {
  return await minioClient.getObject(BUCKET_NAME, key);
}
