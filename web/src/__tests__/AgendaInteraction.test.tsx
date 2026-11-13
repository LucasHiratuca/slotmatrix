import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ResourceTimelineMatrix } from '../ResourceTimelineMatrix';
import {
  BookableResourceDto,
  BookingDto,
  ServiceProcedureDto,
  TimelineMatrixResponse,
  WaitlistEntryDto,
} from '../api';

const SAMPLE_PROCEDURE: ServiceProcedureDto = {
  id: 'proc-1',
  name: 'Eco-Doppler Vascular Completo',
  durationMinutes: 40,
  priceCents: 80000,
  depositCents: 20000,
  currency: 'BRL',
  active: true,
  cancellationPolicy: {
    fullRefundThresholdHours: 24,
    partialRefundThresholdHours: 6,
    partialRetentionPercent: 50,
  },
  requirements: [
    {
      category: 'SPECIALIST',
      requiredCapabilities: ['doppler_vascular'],
      prepMinutes: 5,
      cleanupMinutes: 5,
    },
    {
      category: 'ROOM',
      requiredCapabilities: ['sala_ecografia'],
      prepMinutes: 5,
      cleanupMinutes: 10,
    },
    {
      category: 'EQUIPMENT',
      requiredCapabilities: ['usg_doppler_hd'],
      prepMinutes: 5,
      cleanupMinutes: 15,
    },
  ],
};

const SAMPLE_RESOURCES: BookableResourceDto[] = [
  {
    id: 'res-spec-1',
    name: 'Dra. Camila Rocha',
    category: 'SPECIALIST',
    capabilities: ['doppler_vascular', 'eco_cardiograma'],
    status: 'ACTIVE',
    weeklyWindows: [],
    maintenanceBlocks: [],
    createdAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 'res-room-1',
    name: 'Sala Doppler 01',
    category: 'ROOM',
    capabilities: ['sala_ecografia'],
    status: 'ACTIVE',
    weeklyWindows: [],
    maintenanceBlocks: [],
    createdAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 'res-equip-1',
    name: 'Ultrassom GE Voluson',
    category: 'EQUIPMENT',
    capabilities: ['usg_doppler_hd'],
    status: 'ACTIVE',
    weeklyWindows: [],
    maintenanceBlocks: [],
    createdAt: '2026-11-01T10:00:00.000Z',
  },
];

const SAMPLE_BOOKING: BookingDto = {
  id: 'booking-roberto-1',
  procedureId: 'proc-1',
  procedureName: 'Eco-Doppler Vascular Completo',
  status: 'CONFIRMED',
  clientName: 'Roberto Almeida',
  clientEmail: 'roberto.almeida@cliente.test',
  startAt: '2026-11-12T12:00:00.000Z', // 09:00 BRT
  endAt: '2026-11-12T12:40:00.000Z',   // 09:40 BRT
  priceCents: 80000,
  currency: 'BRL',
  depositCents: 20000,
  depositStatus: 'PAID',
  depositExpiresAt: null,
  retainedCents: 0,
  refundedCents: 0,
  cancellationReason: null,
  originWaitlistEntryId: null,
  allocations: [
    {
      resourceId: 'res-spec-1',
      resourceName: 'Dra. Camila Rocha',
      category: 'SPECIALIST',
      serviceStartAt: '2026-11-12T12:00:00.000Z',
      serviceEndAt: '2026-11-12T12:40:00.000Z',
      prepMinutes: 5,
      cleanupMinutes: 5,
      effectiveStartAt: '2026-11-12T11:55:00.000Z',
      effectiveEndAt: '2026-11-12T12:45:00.000Z',
    },
    {
      resourceId: 'res-room-1',
      resourceName: 'Sala Doppler 01',
      category: 'ROOM',
      serviceStartAt: '2026-11-12T12:00:00.000Z',
      serviceEndAt: '2026-11-12T12:40:00.000Z',
      prepMinutes: 5,
      cleanupMinutes: 10,
      effectiveStartAt: '2026-11-12T11:55:00.000Z',
      effectiveEndAt: '2026-11-12T12:50:00.000Z',
    },
    {
      resourceId: 'res-equip-1',
      resourceName: 'Ultrassom GE Voluson',
      category: 'EQUIPMENT',
      serviceStartAt: '2026-11-12T12:00:00.000Z',
      serviceEndAt: '2026-11-12T12:40:00.000Z',
      prepMinutes: 5,
      cleanupMinutes: 15,
      effectiveStartAt: '2026-11-12T11:55:00.000Z',
      effectiveEndAt: '2026-11-12T12:55:00.000Z',
    },
  ],
  createdAt: '2026-11-11T15:00:00.000Z',
};

const SAMPLE_WAITLIST: WaitlistEntryDto[] = [
  {
    id: 'wl-offer-1',
    procedureId: 'proc-1',
    clientName: 'Beatriz Nogueira',
    clientEmail: 'beatriz.nogueira@cliente.test',
    desiredStartAt: '2026-11-12T14:00:00.000Z',
    desiredEndAt: '2026-11-12T14:40:00.000Z',
    priority: 'STANDARD',
    status: 'OFFERED',
    activeOffer: {
      offeredStartAt: '2026-11-12T14:00:00.000Z',
      offeredEndAt: '2026-11-12T14:40:00.000Z',
      reservedResourceIds: ['res-spec-1', 'res-room-1', 'res-equip-1'],
      offeredAt: '2026-11-12T13:55:00.000Z',
      expiresAt: '2026-11-12T14:25:00.000Z',
    },
    claimedBookingId: null,
    createdAt: '2026-11-11T18:00:00.000Z',
  },
  {
    id: 'wl-next-2',
    procedureId: 'proc-1',
    clientName: 'Marcos Tavares',
    clientEmail: 'marcos.tavares@cliente.test',
    desiredStartAt: '2026-11-12T14:00:00.000Z',
    desiredEndAt: '2026-11-12T14:40:00.000Z',
    priority: 'VIP',
    status: 'WAITING',
    activeOffer: null,
    claimedBookingId: null,
    createdAt: '2026-11-11T19:00:00.000Z',
  },
];

const SAMPLE_TIMELINE: TimelineMatrixResponse = {
  date: '2026-11-12',
  resources: [
    {
      resource: SAMPLE_RESOURCES[0],
      allocations: [
        {
          bookingId: 'booking-roberto-1',
          clientName: 'Roberto Almeida',
          procedureName: 'Eco-Doppler Vascular Completo',
          bookingStatus: 'CONFIRMED',
          prepMinutes: 5,
          cleanupMinutes: 5,
          effectiveStartAt: '2026-11-12T11:55:00.000Z',
          serviceStartAt: '2026-11-12T12:00:00.000Z',
          serviceEndAt: '2026-11-12T12:40:00.000Z',
          effectiveEndAt: '2026-11-12T12:45:00.000Z',
        },
      ],
      waitlistOfferHolds: [
        {
          waitlistEntryId: 'wl-offer-1',
          clientName: 'Beatriz Nogueira',
          offeredStartAt: '2026-11-12T14:00:00.000Z',
          offeredEndAt: '2026-11-12T14:40:00.000Z',
          expiresAt: '2026-11-12T14:25:00.000Z',
        },
      ],
    },
    {
      resource: SAMPLE_RESOURCES[1],
      allocations: [
        {
          bookingId: 'booking-roberto-1',
          clientName: 'Roberto Almeida',
          procedureName: 'Eco-Doppler Vascular Completo',
          bookingStatus: 'CONFIRMED',
          prepMinutes: 5,
          cleanupMinutes: 10,
          effectiveStartAt: '2026-11-12T11:55:00.000Z',
          serviceStartAt: '2026-11-12T12:00:00.000Z',
          serviceEndAt: '2026-11-12T12:40:00.000Z',
          effectiveEndAt: '2026-11-12T12:50:00.000Z',
        },
      ],
      waitlistOfferHolds: [],
    },
    {
      resource: SAMPLE_RESOURCES[2],
      allocations: [
        {
          bookingId: 'booking-roberto-1',
          clientName: 'Roberto Almeida',
          procedureName: 'Eco-Doppler Vascular Completo',
          bookingStatus: 'CONFIRMED',
          prepMinutes: 5,
          cleanupMinutes: 15,
          effectiveStartAt: '2026-11-12T11:55:00.000Z',
          serviceStartAt: '2026-11-12T12:00:00.000Z',
          serviceEndAt: '2026-11-12T12:40:00.000Z',
          effectiveEndAt: '2026-11-12T12:55:00.000Z',
        },
      ],
      waitlistOfferHolds: [],
    },
  ],
};

describe('FIX Agenda — Interação com reservas (clicar, teclado, drawer, RBAC, oferta)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. Clique no bloco da raia de Especialista, Sala ou Equipamento abre o drawer correto e destaca a raia', () => {
    render(
      <ResourceTimelineMatrix
        token="tok"
        workspaceId="ws-1"
        timeline={SAMPLE_TIMELINE}
        selectedDate="2026-11-12"
        onDateChange={vi.fn()}
        procedures={[SAMPLE_PROCEDURE]}
        bookings={[SAMPLE_BOOKING]}
        resourcesCatalog={SAMPLE_RESOURCES}
        role="OWNER"
        onRefresh={vi.fn(async () => {})}
      />,
    );

    const equipBlock = screen.getByTestId('booking-block-booking-roberto-1-res-equip-1');
    expect(equipBlock.tagName).toBe('BUTTON');
    fireEvent.click(equipBlock);

    const drawer = screen.getByTestId('booking-details-drawer');
    expect(drawer).toBeTruthy();
    expect(screen.getByTestId('drawer-patient-name').textContent).toBe('Roberto Almeida');
    expect(window.location.search).toContain('reserva=booking-roberto-1');
    // Chip de seleção ativo aparece na barra de legenda
    expect(screen.getByTestId('active-selection-chip').textContent).toContain('Roberto Almeida');
  });

  it('2. Navegação por teclado (Tab/Focus + Enter/Click abre drawer; Escape fecha e devolve o foco ao bloco)', async () => {
    vi.useRealTimers();
    render(
      <ResourceTimelineMatrix
        token="tok"
        workspaceId="ws-1"
        timeline={SAMPLE_TIMELINE}
        selectedDate="2026-11-12"
        onDateChange={vi.fn()}
        procedures={[SAMPLE_PROCEDURE]}
        bookings={[SAMPLE_BOOKING]}
        resourcesCatalog={SAMPLE_RESOURCES}
        role="OWNER"
        onRefresh={vi.fn(async () => {})}
      />,
    );

    const specBlock = screen.getByTestId('booking-block-booking-roberto-1-res-spec-1');
    specBlock.focus();
    expect(document.activeElement).toBe(specBlock);

    // Em um <button>, Enter aciona click; simulamos o clique com o bloco focado
    fireEvent.click(specBlock);
    expect(screen.getByTestId('booking-details-drawer')).toBeTruthy();

    // Pressionar Escape fecha o drawer e restaura o foco no bloco original
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('booking-details-drawer')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(specBlock);
    });
  });

  it('3. Clique em célula vazia aciona onQuickSchedule("Agendar às HH:00"), mas clique no bloco não dispara o clique da célula', () => {
    const onQuickSchedule = vi.fn();
    render(
      <ResourceTimelineMatrix
        token="tok"
        workspaceId="ws-1"
        timeline={SAMPLE_TIMELINE}
        selectedDate="2026-11-12"
        onDateChange={vi.fn()}
        procedures={[SAMPLE_PROCEDURE]}
        bookings={[SAMPLE_BOOKING]}
        resourcesCatalog={SAMPLE_RESOURCES}
        role="OWNER"
        onRefresh={vi.fn(async () => {})}
        onQuickSchedule={onQuickSchedule}
      />,
    );

    // Clicar no bloco não deve chamar onQuickSchedule
    fireEvent.click(screen.getByTestId('booking-block-booking-roberto-1-res-room-1'));
    expect(onQuickSchedule).not.toHaveBeenCalled();
    expect(screen.getByTestId('booking-details-drawer')).toBeTruthy();

    // Clicar em uma célula vazia às 16:00 deve sugerir agendamento rápido às 16h
    const emptySlotBtn = screen.getByRole('button', {
      name: /Agendar às 16:00 em Dra\. Camila Rocha/i,
    });
    fireEvent.click(emptySlotBtn);
    expect(onQuickSchedule).toHaveBeenCalledWith({
      resourceId: 'res-spec-1',
      hour: 16,
    });
  });

  it('4. Estado selecionado sobrevive ao refresh via ?reserva=ID na URL', () => {
    window.history.replaceState({}, '', '/?reserva=booking-roberto-1');

    render(
      <ResourceTimelineMatrix
        token="tok"
        workspaceId="ws-1"
        timeline={SAMPLE_TIMELINE}
        selectedDate="2026-11-12"
        onDateChange={vi.fn()}
        procedures={[SAMPLE_PROCEDURE]}
        bookings={[SAMPLE_BOOKING]}
        resourcesCatalog={SAMPLE_RESOURCES}
        role="OWNER"
        onRefresh={vi.fn(async () => {})}
      />,
    );

    expect(screen.getByTestId('booking-details-drawer')).toBeTruthy();
    expect(screen.getByTestId('drawer-patient-name').textContent).toBe('Roberto Almeida');
  });

  it('5. Ação do drawer ("Registrar chegada") atualiza otimisticamente e exibe toast de confirmação', async () => {
    vi.useRealTimers();
    const updatedBooking: BookingDto = {
      ...SAMPLE_BOOKING,
      status: 'CHECKED_IN',
    };
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(updatedBooking), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const onOptimisticStatusUpdate = vi.fn();

    render(
      <ResourceTimelineMatrix
        token="tok"
        workspaceId="ws-1"
        timeline={SAMPLE_TIMELINE}
        selectedDate="2026-11-12"
        onDateChange={vi.fn()}
        procedures={[SAMPLE_PROCEDURE]}
        bookings={[SAMPLE_BOOKING]}
        resourcesCatalog={SAMPLE_RESOURCES}
        role="COORDINATOR"
        onOptimisticStatusUpdate={onOptimisticStatusUpdate}
        onRefresh={vi.fn(async () => {})}
      />,
    );

    fireEvent.click(screen.getByTestId('booking-block-booking-roberto-1-res-spec-1'));
    const primaryBtn = screen.getByTestId('drawer-primary-action');
    expect(primaryBtn.textContent).toContain('Registrar chegada');

    fireEvent.click(primaryBtn);

    await waitFor(() => {
      expect(onOptimisticStatusUpdate).toHaveBeenCalledWith(
        'booking-roberto-1',
        'CHECKED_IN',
        updatedBooking,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('agenda-toast').textContent).toContain(
        'Chegada de Roberto Almeida registrada.',
      );
    });
  });

  it('6. Especialista (somente leitura) vê o aviso "Somente a coordenação altera reservas" e não vê botões de editar/alterar estado', () => {
    render(
      <ResourceTimelineMatrix
        token="tok"
        workspaceId="ws-1"
        timeline={SAMPLE_TIMELINE}
        selectedDate="2026-11-12"
        onDateChange={vi.fn()}
        procedures={[SAMPLE_PROCEDURE]}
        bookings={[SAMPLE_BOOKING]}
        resourcesCatalog={SAMPLE_RESOURCES}
        role="SPECIALIST"
        onRefresh={vi.fn(async () => {})}
      />,
    );

    fireEvent.click(screen.getByTestId('booking-block-booking-roberto-1-res-spec-1'));
    expect(screen.getByTestId('drawer-specialist-readonly-banner').textContent).toContain(
      'Somente a coordenação altera reservas',
    );
    expect(screen.queryByTestId('drawer-primary-action')).toBeNull();
    expect(screen.queryByTestId('drawer-more-menu-btn')).toBeNull();
    expect(screen.queryByTestId('drawer-reschedule-disabled')).toBeNull();
  });

  it('7. Hover card usa pointer-events-none para nunca bloquear o clique no bloco ou em vizinhos', async () => {
    render(
      <ResourceTimelineMatrix
        token="tok"
        workspaceId="ws-1"
        timeline={SAMPLE_TIMELINE}
        selectedDate="2026-11-12"
        onDateChange={vi.fn()}
        procedures={[SAMPLE_PROCEDURE]}
        bookings={[SAMPLE_BOOKING]}
        resourcesCatalog={SAMPLE_RESOURCES}
        role="OWNER"
        onRefresh={vi.fn(async () => {})}
      />,
    );

    const specBlock = screen.getByTestId('booking-block-booking-roberto-1-res-spec-1');
    fireEvent.mouseEnter(specBlock);

    act(() => {
      vi.advanceTimersByTime(160);
    });

    const hoverCard = screen.getByTestId('booking-hover-card');
    expect(hoverCard.className).toContain('pointer-events-none');

    // Clicar no bloco mesmo com hover ativo abre o drawer e fecha o hover card
    fireEvent.click(specBlock);
    expect(screen.getByTestId('booking-details-drawer')).toBeTruthy();
    expect(screen.queryByTestId('booking-hover-card')).toBeNull();
  });

  it('8. Bloco de "Vaga reservada para oferta" abre o drawer específico com contagem regressiva, próximo da fila e ações', () => {
    render(
      <ResourceTimelineMatrix
        token="tok"
        workspaceId="ws-1"
        timeline={SAMPLE_TIMELINE}
        selectedDate="2026-11-12"
        onDateChange={vi.fn()}
        procedures={[SAMPLE_PROCEDURE]}
        bookings={[SAMPLE_BOOKING]}
        resourcesCatalog={SAMPLE_RESOURCES}
        waitlist={SAMPLE_WAITLIST}
        role="OWNER"
        onRefresh={vi.fn(async () => {})}
      />,
    );

    const offerBlock = screen.getByTestId('offer-hold-block-wl-offer-1');
    fireEvent.click(offerBlock);

    const drawer = screen.getByTestId('booking-details-drawer');
    expect(drawer.textContent).toContain('Vaga reservada para oferta');
    expect(drawer.textContent).toContain('Beatriz Nogueira');
    expect(drawer.textContent).toContain('Marcos Tavares');
    expect(screen.getByRole('button', { name: /Confirmar reserva agora/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Passar ao próximo/i })).toBeTruthy();
  });

  it('9. Botão proeminente "Registrar falta" no rodapé do drawer abre confirmação e executa no-show retendo 100% do sinal', async () => {
    vi.useRealTimers();
    const updatedBooking: BookingDto = {
      ...SAMPLE_BOOKING,
      status: 'NO_SHOW',
      retainedCents: 20000,
    };
    globalThis.fetch = vi.fn(async (url: any) => {
      if (String(url).includes('/no-show')) {
        return new Response(JSON.stringify(updatedBooking), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(SAMPLE_BOOKING), { status: 200 });
    });
    const onOptimisticStatusUpdate = vi.fn();

    render(
      <ResourceTimelineMatrix
        token="tok"
        workspaceId="ws-1"
        timeline={SAMPLE_TIMELINE}
        selectedDate="2026-11-12"
        onDateChange={vi.fn()}
        procedures={[SAMPLE_PROCEDURE]}
        bookings={[SAMPLE_BOOKING]}
        resourcesCatalog={SAMPLE_RESOURCES}
        role="COORDINATOR"
        onOptimisticStatusUpdate={onOptimisticStatusUpdate}
        onRefresh={vi.fn(async () => {})}
      />,
    );

    // Abre o drawer clicando no bloco
    fireEvent.click(screen.getByTestId('booking-block-booking-roberto-1-res-spec-1'));

    // Botão destacado de Registrar Falta está visível diretamente no rodapé
    const noShowBtn = screen.getByTestId('drawer-noshow-btn');
    expect(noShowBtn).toBeTruthy();
    expect(noShowBtn.textContent).toContain('Registrar falta');

    fireEvent.click(noShowBtn);

    // Diálogo com aviso de retenção de 100% do sinal
    const dialog = screen.getByTestId('drawer-confirm-dialog');
    expect(dialog.textContent).toContain('100% do sinal');
    expect(dialog.textContent).toMatch(/200,00/);

    // Confirma falta
    const confirmBtn = screen.getByTestId('drawer-confirm-destructive-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onOptimisticStatusUpdate).toHaveBeenCalledWith(
        'booking-roberto-1',
        'NO_SHOW',
        updatedBooking,
      );
    });
  });

  it('10. Botão "Reagendar" no drawer está ativo para reservas confirmadas e abre modal de reagendamento', async () => {
    vi.useRealTimers();
    render(
      <ResourceTimelineMatrix
        token="tok"
        workspaceId="ws-1"
        timeline={SAMPLE_TIMELINE}
        selectedDate="2026-11-12"
        onDateChange={vi.fn()}
        procedures={[SAMPLE_PROCEDURE]}
        bookings={[SAMPLE_BOOKING]}
        resourcesCatalog={SAMPLE_RESOURCES}
        role="COORDINATOR"
        onRefresh={vi.fn(async () => {})}
      />,
    );

    fireEvent.click(screen.getByTestId('booking-block-booking-roberto-1-res-spec-1'));

    const rescheduleBtn = screen.getByTestId('drawer-reschedule-btn');
    expect(rescheduleBtn).toBeTruthy();
    expect(rescheduleBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(rescheduleBtn);

    // Modal de reagendamento aberto com dados do paciente e procedimento
    expect(screen.getByTestId('reschedule-modal')).toBeTruthy();
    expect(screen.getByText(/Reagendar atendimento/i)).toBeTruthy();
    expect(screen.getAllByText('Roberto Almeida').length).toBeGreaterThan(0);
  });

  it('11. Menu de contexto (botão direito) no card da grade exibe ações rápidas diretas', async () => {
    vi.useRealTimers();
    render(
      <ResourceTimelineMatrix
        token="tok"
        workspaceId="ws-1"
        timeline={SAMPLE_TIMELINE}
        selectedDate="2026-11-12"
        onDateChange={vi.fn()}
        procedures={[SAMPLE_PROCEDURE]}
        bookings={[SAMPLE_BOOKING]}
        resourcesCatalog={SAMPLE_RESOURCES}
        role="COORDINATOR"
        onRefresh={vi.fn(async () => {})}
      />,
    );

    const block = screen.getByTestId('booking-block-booking-roberto-1-res-spec-1');
    fireEvent.contextMenu(block, { clientX: 200, clientY: 200 });

    // Menu de contexto flutuante na grade
    const menu = screen.getByTestId('grid-context-menu');
    expect(menu).toBeTruthy();
    expect(screen.getByTestId('context-menu-checkin')).toBeTruthy();
    expect(screen.getByTestId('context-menu-reschedule')).toBeTruthy();
    expect(screen.getByTestId('context-menu-noshow')).toBeTruthy();
    expect(screen.getByTestId('context-menu-view-details')).toBeTruthy();
  });
});
