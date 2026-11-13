import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeHarness, registerTenant } from '../support/harness';
import { createApp } from '../../src/presentation/http/app';
import { ForbiddenError, ValidationError } from '../../src/shared/domain/errors';

describe('Perfil do Usuário & Object Storage (Garage S3 / MinIO)', () => {
  it('1. Permite visualizar o perfil inicial com bio vazia e sem foto', async () => {
    const h = makeHarness();
    const { userId, token } = await registerTenant(h, 'Clínica Perfil');

    const app = createApp(h.c);
    const res = await request(app)
      .get(`/api/perfil/${userId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
    expect(res.body.nome).toBe('Clinic Owner');
    expect(res.body.bio).toBe('');
    expect(res.body.fotoUrl).toBeNull();
    expect(res.body.ehDono).toBe(true);
  });

  it('2. Permite atualizar bio de até 500 caracteres', async () => {
    const h = makeHarness();
    const { userId, token } = await registerTenant(h, 'Clínica Perfil');

    const app = createApp(h.c);
    const updateRes = await request(app)
      .post(`/api/perfil/${userId}/editar`)
      .set('Authorization', `Bearer ${token}`)
      .field('bio', 'Médica especialista em radiologia intervencionista com 10 anos de experiência.');

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.ok).toBe(true);
    expect(updateRes.body.message).toContain('Perfil atualizado com sucesso');
    expect(updateRes.body.bio).toBe('Médica especialista em radiologia intervencionista com 10 anos de experiência.');

    const getRes = await request(app)
      .get(`/api/perfil/${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.bio).toBe('Médica especialista em radiologia intervencionista com 10 anos de experiência.');
  });

  it('3. Permite upload de foto válida (JPEG/PNG/GIF/WebP) e serve via streaming com headers corretos', async () => {
    const h = makeHarness();
    const { userId, token } = await registerTenant(h, 'Clínica Perfil');

    const app = createApp(h.c);
    // 1x1 PNG dummy buffer
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

    const uploadRes = await request(app)
      .post(`/api/perfil/${userId}/editar`)
      .set('Authorization', `Bearer ${token}`)
      .field('bio', 'Bio com foto')
      .attach('foto', pngBuffer, 'avatar.png');

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.ok).toBe(true);
    expect(uploadRes.body.fotoUrl).toBe(`/api/perfil/${userId}/foto`);

    // Busca foto via streaming
    const fotoRes = await request(app).get(`/api/perfil/${userId}/foto`);
    expect(fotoRes.status).toBe(200);
    expect(fotoRes.header['content-type']).toContain('image/png');
    expect(fotoRes.header['cache-control']).toBe('public, max-age=60, must-revalidate');
    expect(fotoRes.body.length).toBe(pngBuffer.length);
  });

  it('4. CONTROLE DE ACESSO: recusa edição de perfil alheio com 403 Forbidden', async () => {
    const h = makeHarness();
    const userA = await registerTenant(h, 'Clínica A');
    const userB = await registerTenant(h, 'Clínica B');

    const app = createApp(h.c);
    const res = await request(app)
      .post(`/api/perfil/${userB.userId}/editar`)
      .set('Authorization', `Bearer ${userA.token}`)
      .field('bio', 'Tentando hackear o perfil do usuário B');

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Você não tem permissão para editar o perfil de outro usuário.');
  });

  it('5. Valida tipo MIME proibido (rejeita .pdf / .txt com 422 Unprocessable Entity)', async () => {
    const h = makeHarness();
    const { userId, token } = await registerTenant(h, 'Clínica Perfil');

    const app = createApp(h.c);
    const textBuffer = Buffer.from('Arquivo texto malicioso');

    const res = await request(app)
      .post(`/api/perfil/${userId}/editar`)
      .set('Authorization', `Bearer ${token}`)
      .attach('foto', textBuffer, { filename: 'malware.txt', contentType: 'text/plain' });

    expect(res.status).toBe(422);
    expect(res.body.message).toContain('Tipo de arquivo inválido');
  });

  it('6. GET /api/auth/session retorna bio e photoUrl do usuário autenticado', async () => {
    const h = makeHarness();
    const { userId, token } = await registerTenant(h, 'Clínica Perfil');

    const app = createApp(h.c);
    const pngBuffer = Buffer.from('dummy');
    await request(app)
      .post(`/api/perfil/${userId}/editar`)
      .set('Authorization', `Bearer ${token}`)
      .field('bio', 'Bio no session')
      .attach('foto', pngBuffer, { filename: 'avatar.webp', contentType: 'image/webp' });

    const sessionRes = await request(app)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${token}`);

    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.authenticated).toBe(true);
    expect(sessionRes.body.bio).toBe('Bio no session');
    expect(sessionRes.body.photoUrl).toBe(`/api/perfil/${userId}/foto`);
  });
});
