import { buildContainer, Container } from './composition-root';
import { buildMySqlInfrastructure, loadEnv } from './infrastructure/mysql-infrastructure';
import { runMigrations, waitForDatabase } from './shared/infrastructure/mysql';
import { handleBillingWebhook } from './presentation/http/routes';
import { signBillingPayload } from './billing/infrastructure/BillingWebhookAcl';

export interface SeedResult {
  auraWorkspaceId: string;
  vitascanWorkspaceId: string;
  vitascanProcedureId: string;
  cancellableConfirmedBookingId: string;
}

/**
 * Populates a deterministic demo environment with 2 Workspaces:
 * 1. `Estúdio Aura` (`STARTER` plan, slug `estudio-aura`):
 *    - At the exact limit of 5/5 active BookableResources (attempting to add a 6th fails with HTTP 402 QuotaExceededError).
 * 2. `VitaScan Diagnósticos` (`PRO` plan active via signed billing webhook, slug `vitascan-diagnosticos`):
 *    - 4 RBAC members (`OWNER`, `ADMIN`, `COORDINATOR`, `SPECIALIST`)
 *    - 6 BookableResources (2 Specialists, 2 Rooms, 2 Equipments)
 *    - 2 Multi-resource ServiceProcedures with asymmetric room sterilization buffers (`cleanupMinutes: 20`) and `SecurityDeposit`
 *    - Confirmed bookings on the timeline, 1 cancelled booking with retained deposit penalty, 1 booking recovered from waitlist,
 *      and 3 WAITING `WaitlistEntry` patients ready so cancelling a booking immediately triggers a `SlotOffer`.
 */
export async function seedDemoData(c: Container): Promise<SeedResult> {
  const existingAura = await c.infra.workspaces.findBySlug('estudio-aura');
  const existingVitascan = await c.infra.workspaces.findBySlug('vitascan-diagnosticos');
  if (existingAura && existingVitascan) {
    const procs = await c.infra.procedures.listByTenant(existingVitascan.id.value);
    const bookings = await c.infra.bookings.listByTenant(existingVitascan.id.value);
    const confirmed = bookings.find((b) => b.status === 'CONFIRMED');
    return {
      auraWorkspaceId: existingAura.id.value,
      vitascanWorkspaceId: existingVitascan.id.value,
      vitascanProcedureId: procs[0]?.id.value ?? '',
      cancellableConfirmedBookingId: confirmed?.id.value ?? '',
    };
  }

  // =========================================================================
  // WORKSPACE 1: Estúdio Aura (STARTER Plan — 5/5 Active BookableResources)
  // =========================================================================
  const auraReg = await c.tenancy.register.execute({
    email: 'owner@aura.test',
    name: 'Clara Mendes (Aura Owner)',
    password: 'Passw0rd!',
    workspaceName: 'Estúdio Aura',
  });
  const auraId = auraReg.workspaceId;

  const auraResources = [
    { name: 'Dra. Helena Costa', category: 'SPECIALIST' as const, capabilities: ['DERM_LASER', 'PEELING'] },
    { name: 'Dr. Bruno Prado', category: 'SPECIALIST' as const, capabilities: ['DERM_LASER'] },
    { name: 'Cabine Laser 01', category: 'ROOM' as const, capabilities: ['CABINE_ESTERIL'] },
    { name: 'Cabine Facial 02', category: 'ROOM' as const, capabilities: ['CABINE_ESTERIL'] },
    { name: 'Laser CO2 Fracionado #A1', category: 'EQUIPMENT' as const, capabilities: ['LASER_CO2'] },
  ];

  for (const r of auraResources) {
    await c.catalog.createResource.execute({
      tenantId: auraId,
      name: r.name,
      category: r.category,
      capabilities: r.capabilities,
    });
  }

  await c.catalog.createProcedure.execute({
    tenantId: auraId,
    name: 'Sessão Laser CO2 Rejuvenescimento',
    durationMinutes: 40,
    priceCents: 65000,
    depositCents: 0, // STARTER plan does not allow securityDeposit > 0
    currency: 'BRL',
    requirements: [
      { category: 'SPECIALIST', requiredCapabilities: ['DERM_LASER'], prepMinutes: 0, cleanupMinutes: 0 },
      { category: 'ROOM', requiredCapabilities: ['CABINE_ESTERIL'], prepMinutes: 0, cleanupMinutes: 15 },
      { category: 'EQUIPMENT', requiredCapabilities: ['LASER_CO2'], prepMinutes: 0, cleanupMinutes: 10 },
    ],
  });

  // =========================================================================
  // WORKSPACE 2: VitaScan Diagnósticos (PRO Plan via Signed Billing Webhook)
  // =========================================================================
  const vitaReg = await c.tenancy.register.execute({
    email: 'owner@vitascan.test',
    name: 'Dr. Ricardo Vasconcelos (Owner)',
    password: 'Passw0rd!',
    workspaceName: 'VitaScan Diagnósticos',
  });
  const vitaId = vitaReg.workspaceId;
  const vitaOwnerId = vitaReg.userId;

  // Register extra team users and invite them into VitaScan with ADMIN, COORDINATOR, SPECIALIST roles
  const extraUsers = [
    { email: 'admin@vitascan.test', name: 'Fernanda Lima (Admin)', role: 'ADMIN' as const },
    { email: 'coord@vitascan.test', name: 'Marcos Azevedo (Coordinator)', role: 'COORDINATOR' as const },
    { email: 'spec@vitascan.test', name: 'Dra. Camila Rocha (Specialist)', role: 'SPECIALIST' as const },
  ];

  for (const u of extraUsers) {
    await c.tenancy.register.execute({
      email: u.email,
      name: u.name,
      password: 'Passw0rd!',
      workspaceName: `${u.name} Personal`,
    });
    await c.tenancy.invite.execute({
      tenantId: vitaId,
      actorId: vitaOwnerId,
      actorRole: 'OWNER',
      email: u.email,
      role: u.role,
    });
  }

  // Upgrade VitaScan to PRO via signed Billing Webhook
  const rawWebhookPayload = JSON.stringify({
    id: 'evt_seed_vitascan_pro_2026',
    type: 'checkout.session.completed',
    data: {
      object: {
        customer: 'cus_vitascan_pro',
        metadata: {
          workspace_id: vitaId,
          plan: 'PRO',
        },
      },
    },
  });
  const sig = signBillingPayload(rawWebhookPayload, c.config.billingWebhookSecret);
  await handleBillingWebhook(c, rawWebhookPayload, sig);

  // Create 6 BookableResources in VitaScan (2 Specialists, 2 Exam Rooms, 2 High-Tech Equipments)
  await c.catalog.createResource.execute({
    tenantId: vitaId,
    name: 'Dra. Camila Rocha (Radiologista Vascular)',
    category: 'SPECIALIST',
    capabilities: ['DOPPLER_VASCULAR', 'BIOPSIA_GUIADA', 'USG_GERAL'],
  });

  await c.catalog.createResource.execute({
    tenantId: vitaId,
    name: 'Dr. Eduardo Martins (Intervencionista)',
    category: 'SPECIALIST',
    capabilities: ['DOPPLER_VASCULAR', 'LASER_ENDOVENOSO'],
  });

  await c.catalog.createResource.execute({
    tenantId: vitaId,
    name: 'Sala de Procedimento Estéril 01',
    category: 'ROOM',
    capabilities: ['SALA_ESTERIL', 'MACA_VASCULAR', 'OXIGENIO'],
  });

  await c.catalog.createResource.execute({
    tenantId: vitaId,
    name: 'Sala de Imagem Avançada 02',
    category: 'ROOM',
    capabilities: ['SALA_ESTERIL', 'MACA_VASCULAR'],
  });

  await c.catalog.createResource.execute({
    tenantId: vitaId,
    name: 'Ultrassom Doppler GE Logiq E10 #01',
    category: 'EQUIPMENT',
    capabilities: ['USG_DOPPLER_HD', 'SONDA_LINEAR'],
  });

  await c.catalog.createResource.execute({
    tenantId: vitaId,
    name: 'Laser Endovenoso 1470nm Biolitec #02',
    category: 'EQUIPMENT',
    capabilities: ['LASER_1470NM', 'USG_DOPPLER_HD'],
  });

  // Create 2 Multi-Resource ServiceProcedures with Asymmetric Sterilization Buffers & Security Deposit
  const procDoppler = await c.catalog.createProcedure.execute({
    tenantId: vitaId,
    name: 'Eco-Doppler Vascular Completo + Mapeamento',
    durationMinutes: 40,
    priceCents: 80000, // R$ 800,00
    depositCents: 20000, // R$ 200,00 anti-no-show deposit
    currency: 'BRL',
    cancellationPolicy: {
      fullRefundThresholdHours: 48,
      partialRefundThresholdHours: 6,
      partialRetentionPercent: 50,
    },
    requirements: [
      { category: 'SPECIALIST', requiredCapabilities: ['DOPPLER_VASCULAR'], prepMinutes: 0, cleanupMinutes: 0 },
      { category: 'ROOM', requiredCapabilities: ['SALA_ESTERIL', 'MACA_VASCULAR'], prepMinutes: 0, cleanupMinutes: 20 },
      { category: 'EQUIPMENT', requiredCapabilities: ['USG_DOPPLER_HD'], prepMinutes: 0, cleanupMinutes: 10 },
    ],
  });

  const procLaser = await c.catalog.createProcedure.execute({
    tenantId: vitaId,
    name: 'Termoablação Endovenosa a Laser Guiada por USG',
    durationMinutes: 60,
    priceCents: 240000, // R$ 2.400,00
    depositCents: 60000, // R$ 600,00 deposit
    currency: 'BRL',
    requirements: [
      { category: 'SPECIALIST', requiredCapabilities: ['LASER_ENDOVENOSO'], prepMinutes: 0, cleanupMinutes: 0 },
      { category: 'ROOM', requiredCapabilities: ['SALA_ESTERIL', 'MACA_VASCULAR'], prepMinutes: 5, cleanupMinutes: 20 },
      { category: 'EQUIPMENT', requiredCapabilities: ['LASER_1470NM'], prepMinutes: 0, cleanupMinutes: 15 },
    ],
  });

  // Base date: Next Monday (or tomorrow if weekday) in UTC within 08:00 - 18:00 Mon-Sat window
  const now = c.infra.clock.now();
  const baseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  if (baseDate.getUTCDay() === 0) {
    // Advance from Sunday to Monday so all resources are inside their Mon-Sat working window
    baseDate.setUTCDate(baseDate.getUTCDate() + 1);
  }

  const slot0900 = new Date(baseDate.getTime() + 9 * 3600_000); // 09:00 - 09:40 (Room occupied until 10:00!)
  const slot1000 = new Date(baseDate.getTime() + 10 * 3600_000); // 10:00 - 10:40 (Room occupied until 11:00!)
  const slot1100 = new Date(baseDate.getTime() + 11 * 3600_000); // 11:00 - 12:00 (Laser procedure)
  const slot1400 = new Date(baseDate.getTime() + 14 * 3600_000); // 14:00 - 14:40

  // 1. Confirmed Booking at 09:00 (Ideal candidate to Cancel in the UI to trigger Waitlist Offer!)
  const b1 = await c.scheduling.scheduleBooking.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Roberto Almeida',
    clientEmail: 'roberto.almeida@cliente.test',
    startAt: slot0900,
  });
  await c.scheduling.confirmDeposit.execute({
    tenantId: vitaId,
    bookingId: b1.id.value,
  });

  // 2. Historical Late-Cancelled Booking at 14:00 demonstrating retained deposit penalty
  const bCancelled = await c.scheduling.scheduleBooking.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Patrícia Nogueira (Cancelamento Tardio)',
    clientEmail: 'patricia@cliente.test',
    startAt: slot1400,
  });
  await c.scheduling.confirmDeposit.execute({
    tenantId: vitaId,
    bookingId: bCancelled.id.value,
  });
  await c.scheduling.cancelBooking.execute({
    tenantId: vitaId,
    bookingId: bCancelled.id.value,
    actorId: vitaOwnerId,
    reason: 'Desistência de última hora pela paciente',
  });

  // 3. Waitlist Entry that was Offered & Claimed at 10:00 (Demonstrates Waitlist Recovered Revenue R$ 800,00)
  const wRecovered = await c.scheduling.joinWaitlist.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Juliana Paiva (Recuperada via Waitlist)',
    clientEmail: 'juliana.paiva@cliente.test',
    desiredStartAt: new Date(baseDate.getTime() + 8 * 3600_000),
    desiredEndAt: new Date(baseDate.getTime() + 17 * 3600_000),
    priority: 'STANDARD',
  });

  const temp1000 = await c.scheduling.scheduleBooking.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Paciente Desistente 10h',
    clientEmail: 'desistente10h@cliente.test',
    startAt: slot1000,
  });
  await c.scheduling.confirmDeposit.execute({
    tenantId: vitaId,
    bookingId: temp1000.id.value,
  });
  await c.scheduling.cancelBooking.execute({
    tenantId: vitaId,
    bookingId: temp1000.id.value,
    actorId: vitaOwnerId,
    reason: 'Imprevisto — liberando vaga para Smart Waitlist',
  });

  const claimed = await c.scheduling.claimWaitlistOffer.execute({
    tenantId: vitaId,
    waitlistEntryId: wRecovered.id.value,
  });
  await c.scheduling.confirmDeposit.execute({
    tenantId: vitaId,
    bookingId: claimed.booking.id.value,
  });

  // 4. Confirmed Laser Booking at 11:00
  const bLaser = await c.scheduling.scheduleBooking.execute({
    tenantId: vitaId,
    procedureId: procLaser.id.value,
    clientName: 'Henrique Fontes',
    clientEmail: 'henrique.fontes@cliente.test',
    startAt: slot1100,
  });
  await c.scheduling.confirmDeposit.execute({
    tenantId: vitaId,
    bookingId: bLaser.id.value,
  });

  // 5. Enqueue 3 WAITING patients for procDoppler covering the day window (08:00 - 17:00)
  const desiredStart = new Date(baseDate.getTime() + 8 * 3600_000);
  const desiredEnd = new Date(baseDate.getTime() + 17 * 3600_000);

  await c.scheduling.joinWaitlist.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Beatriz Monteiro (#1 na Fila)',
    clientEmail: 'beatriz.monteiro@cliente.test',
    desiredStartAt: desiredStart,
    desiredEndAt: desiredEnd,
    priority: 'STANDARD',
  });

  await c.scheduling.joinWaitlist.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Carlos Eduardo Silva (#2 na Fila - Cascata)',
    clientEmail: 'carlos.silva@cliente.test',
    desiredStartAt: desiredStart,
    desiredEndAt: desiredEnd,
    priority: 'STANDARD',
  });

  await c.scheduling.joinWaitlist.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Mariana Tavares (#3 na Fila)',
    clientEmail: 'mariana.tavares@cliente.test',
    desiredStartAt: desiredStart,
    desiredEndAt: desiredEnd,
    priority: 'STANDARD',
  });

  return {
    auraWorkspaceId: auraId,
    vitascanWorkspaceId: vitaId,
    vitascanProcedureId: procDoppler.id.value,
    cancellableConfirmedBookingId: b1.id.value,
  };
}

if (require.main === module) {
  (async () => {
    const env = loadEnv();
    const { db, infra } = buildMySqlInfrastructure(env);
    await waitForDatabase(db);
    await runMigrations(db);
    const c = buildContainer(infra, { billingWebhookSecret: env.billingWebhookSecret });
    const result = await seedDemoData(c);
    console.log('[SlotMatrix Seed] Completed successfully:', result);
    await db.close();
  })().catch((err) => {
    console.error('[SlotMatrix Seed] Failed:', err);
    process.exit(1);
  });
}
