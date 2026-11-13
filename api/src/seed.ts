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
 *    - Confirmed bookings on the timeline in local São Paulo business hours (09:00, 10:00, 11:00 local = 12:00Z, 13:00Z, 14:00Z),
 *      1 cancelled booking with retained deposit penalty, 1 booking recovered from waitlist,
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
    name: 'Clara Mendes',
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
    name: 'Dra. Renata Silveira',
    password: 'Passw0rd!',
    workspaceName: 'VitaScan Diagnósticos',
  });
  const vitaId = vitaReg.workspaceId;
  const vitaOwnerId = vitaReg.userId;

  // Register extra team users and invite them into VitaScan with ADMIN, COORDINATOR, SPECIALIST roles
  const extraUsers = [
    { email: 'admin@vitascan.test', name: 'Marcos Vasconcelos', role: 'ADMIN' as const },
    { email: 'coord@vitascan.test', name: 'Helena Prado', role: 'COORDINATOR' as const },
    { email: 'spec@vitascan.test', name: 'Dra. Camila Rocha', role: 'SPECIALIST' as const },
  ];

  for (const u of extraUsers) {
    await c.tenancy.register.execute({
      email: u.email,
      name: u.name,
      password: 'Passw0rd!',
      workspaceName: `${u.name} Consultório`,
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

  // Base date: Hoje no fuso horário de São Paulo (America/Sao_Paulo, UTC-3), em horário comercial local (09:00 às 14:00 locais = 12:00Z às 17:00Z)
  const now = c.infra.clock.now();
  const spParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const spY = Number(spParts.find((p) => p.type === 'year')?.value ?? now.getUTCFullYear());
  const spM = Number(spParts.find((p) => p.type === 'month')?.value ?? now.getUTCMonth() + 1);
  const spD = Number(spParts.find((p) => p.type === 'day')?.value ?? now.getUTCDate());
  const baseDate = new Date(Date.UTC(spY, spM - 1, spD, 0, 0, 0));
  if (baseDate.getUTCDay() === 0) {
    baseDate.setUTCDate(baseDate.getUTCDate() + 1);
  }

  const slot0900 = new Date(baseDate.getTime() + 12 * 3600_000); // 09:00 - 09:40 local SP (12:00Z - 12:40Z; sala até 10:00 local)
  const slot1000 = new Date(baseDate.getTime() + 13 * 3600_000); // 10:00 - 10:40 local SP (13:00Z - 13:40Z; sala até 11:00 local)
  const slot1100 = new Date(baseDate.getTime() + 14 * 3600_000); // 11:00 - 12:00 local SP (14:00Z - 15:00Z; procedimento a laser)
  const slot1400 = new Date(baseDate.getTime() + 17 * 3600_000); // 14:00 - 14:40 local SP (17:00Z - 17:40Z)
  const desiredStart = new Date(baseDate.getTime() + 11 * 3600_000); // 08:00 local SP (11:00Z)
  const desiredEnd = new Date(baseDate.getTime() + 21 * 3600_000); // 18:00 local SP (21:00Z)

  // 1. Confirmed Booking at 09:00 local SP (Ideal candidate to Cancel in the UI to trigger Waitlist Offer!)
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

  // 2. Historical Late-Cancelled Booking at 14:00 local SP demonstrating retained deposit penalty
  const bCancelled = await c.scheduling.scheduleBooking.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Patrícia Nogueira',
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

  // 3. Waitlist Entry that was Offered & Claimed at 10:00 local SP (Demonstrates Waitlist Recovered Revenue R$ 800,00)
  const wRecovered = await c.scheduling.joinWaitlist.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Juliana Paiva',
    clientEmail: 'juliana.paiva@cliente.test',
    desiredStartAt: desiredStart,
    desiredEndAt: desiredEnd,
    priority: 'STANDARD',
  });

  const temp1000 = await c.scheduling.scheduleBooking.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Lucas Mendonça',
    clientEmail: 'lucas.mendonca@cliente.test',
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
    reason: 'Imprevisto familiar — liberando vaga para a lista de espera',
  });

  const claimed = await c.scheduling.claimWaitlistOffer.execute({
    tenantId: vitaId,
    waitlistEntryId: wRecovered.id.value,
  });
  await c.scheduling.confirmDeposit.execute({
    tenantId: vitaId,
    bookingId: claimed.booking.id.value,
  });

  // 4. Confirmed Laser Booking at 11:00 local SP
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

  // 5. Enqueue 3 WAITING patients for procDoppler covering the local day window (08:00 - 18:00 SP)
  await c.scheduling.joinWaitlist.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Beatriz Monteiro',
    clientEmail: 'beatriz.monteiro@cliente.test',
    desiredStartAt: desiredStart,
    desiredEndAt: desiredEnd,
    priority: 'STANDARD',
  });

  await c.scheduling.joinWaitlist.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Carlos Eduardo Silva',
    clientEmail: 'carlos.silva@cliente.test',
    desiredStartAt: desiredStart,
    desiredEndAt: desiredEnd,
    priority: 'STANDARD',
  });

  await c.scheduling.joinWaitlist.execute({
    tenantId: vitaId,
    procedureId: procDoppler.id.value,
    clientName: 'Mariana Tavares',
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
