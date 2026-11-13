import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiHttpError,
  apiRequest,
  BookableResourceDto,
  BookingDto,
  ServiceProcedureDto,
  WaitlistEntryDto,
} from './api';
import { AuditEntryItem } from './AuditView';
import { RescheduleModal } from './RescheduleModal';
import {
  cleanPersonName,
  formatApiError,
  formatAuditAction,
  formatBookingStatus,
  formatCapability,
  formatCurrencyBRL,
  formatDateBR,
  formatDateTimeBR,
  formatDepositStatus,
  formatResourceCategory,
  formatTimeBR,
} from './labels';
import { Avatar, BookingStatusBadge, ResourceTile } from './ui/Primitives';
import {
  AlertCircle,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Info,
  Loader2,
  Lock,
  Mail,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';

export interface TimelineBookingFallback {
  bookingId: string;
  clientName: string;
  procedureName: string;
  bookingStatus: string;
  serviceStartAt: string;
  serviceEndAt: string;
  resources: {
    id: string;
    name: string;
    category: 'SPECIALIST' | 'ROOM' | 'EQUIPMENT';
    prepMinutes?: number;
    cleanupMinutes: number;
    effectiveStartAt?: string;
    effectiveEndAt?: string;
  }[];
}

export interface WaitlistOfferHoldSelection {
  waitlistEntryId: string;
  clientName: string;
  offeredStartAt: string;
  offeredEndAt: string;
  expiresAt: string;
  resourceId: string;
  resourceName: string;
}

interface BookingDetailsDrawerProps {
  open: boolean;
  bookingId: string | null;
  focusedResourceId?: string | null;
  bookings: BookingDto[];
  fallbackBooking?: TimelineBookingFallback | null;
  procedures: ServiceProcedureDto[];
  resourcesCatalog?: BookableResourceDto[];
  auditLogs?: AuditEntryItem[];
  role?: 'OWNER' | 'ADMIN' | 'COORDINATOR' | 'SPECIALIST' | null;
  token: string;
  workspaceId: string;
  onClose: () => void;
  onOptimisticStatusUpdate?: (bookingId: string, newStatus: BookingDto['status'], updatedBooking?: BookingDto) => void;
  onRefresh: () => Promise<void>;
  onToast?: (message: string, type?: 'success' | 'error') => void;
  onCancelAndRecreate?: (prefill: {
    procedureId: string;
    clientName: string;
    clientEmail: string;
    hour: number;
  }) => void;
  // Modo alternativo: Drawer de Vaga Reservada para Oferta (Lista de Espera)
  offerHold?: WaitlistOfferHoldSelection | null;
  waitlistEntries?: WaitlistEntryDto[];
  onNavigateToWaitlist?: () => void;
}

export const BookingDetailsDrawer: React.FC<BookingDetailsDrawerProps> = ({
  open,
  bookingId,
  focusedResourceId,
  bookings,
  fallbackBooking,
  procedures,
  resourcesCatalog = [],
  auditLogs = [],
  role,
  token,
  workspaceId,
  onClose,
  onOptimisticStatusUpdate,
  onRefresh,
  onToast,
  onCancelAndRecreate,
  offerHold = null,
  waitlistEntries = [],
  onNavigateToWaitlist,
}) => {
  const [fetchedBooking, setFetchedBooking] = useState<BookingDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [policyExpanded, setPolicyExpanded] = useState<boolean>(false);
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);
  const [confirmDialog, setConfirmDialog] = useState<
    null | { type: 'cancel' | 'no-show' | 'cancel-recreate' }
  >(null);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Gestos de arrasto para fechar no mobile (Bottom Sheet)
  const touchStartYRef = useRef<number | null>(null);
  const [sheetTranslateY, setSheetTranslateY] = useState<number>(0);

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  const isSpecialistReadOnly = role === 'SPECIALIST';

  // Encontrar reserva na lista em memória ou buscar via GET /api/bookings/:id
  const bookingFromList = useMemo(
    () => (bookingId ? bookings.find((b) => b.id === bookingId) ?? null : null),
    [bookings, bookingId],
  );

  const activeBookingDto = bookingFromList ?? fetchedBooking;

  const fetchSingleBooking = async (id: string) => {
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const data = await apiRequest<BookingDto>(`/bookings/${id}`, {
        token,
        workspaceId,
      });
      setFetchedBooking(data);
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : 'Não foi possível carregar os detalhes completos desta reserva.';
      setDetailError(msg);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    setMenuOpen(false);
    setConfirmDialog(null);
    setActionError(null);
    setPolicyExpanded(false);
    setSheetTranslateY(0);
    if (!open) return;

    if (bookingId && !bookingFromList) {
      void fetchSingleBooking(bookingId);
    } else {
      setFetchedBooking(null);
      setDetailError(null);
    }
  }, [open, bookingId, bookingFromList?.id]);

  // Foco acessível ao abrir e fechar com ESC
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 40);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (confirmDialog) {
          setConfirmDialog(null);
        } else if (menuOpen) {
          setMenuOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, confirmDialog, menuOpen, onClose]);

  // Fechar menu "⋯" ao clicar fora
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  // Relógio para contagem regressiva quando em modo oferta da Lista de Espera
  useEffect(() => {
    if (!open || !offerHold) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, offerHold]);

  // =========================================================================
  // DADOS CONSOLIDADOS DA RESERVA (calculados antes dos returns condicionais)
  // =========================================================================
  const clientName = cleanPersonName(
    activeBookingDto?.clientName ?? fallbackBooking?.clientName ?? 'Paciente',
  );
  const procedureName =
    activeBookingDto?.procedureName ??
    fallbackBooking?.procedureName ??
    'Procedimento clínico';
  const status = (activeBookingDto?.status ??
    fallbackBooking?.bookingStatus ??
    'CONFIRMED') as BookingDto['status'];
  const startAt =
    activeBookingDto?.startAt ?? fallbackBooking?.serviceStartAt ?? '';
  const endAt = activeBookingDto?.endAt ?? fallbackBooking?.serviceEndAt ?? '';

  const matchedProcedure = procedures.find(
    (p) =>
      (activeBookingDto && p.id === activeBookingDto.procedureId) ||
      p.name === procedureName,
  );

  const priceCents =
    activeBookingDto?.priceCents ?? matchedProcedure?.priceCents ?? 80000;
  const depositCents =
    activeBookingDto?.depositCents ?? matchedProcedure?.depositCents ?? 20000;
  const depositPct =
    priceCents > 0 ? Math.round((depositCents / priceCents) * 100) : 25;
  const depositStatusRaw =
    activeBookingDto?.depositStatus ??
    (status === 'PENDING_DEPOSIT' ? 'PENDING' : 'PAID');
  const retainedCents = activeBookingDto?.retainedCents ?? 0;
  const refundedCents = activeBookingDto?.refundedCents ?? 0;

  const partialRetentionPct =
    matchedProcedure?.cancellationPolicy?.partialRetentionPercent ?? 50;
  const estimatedCancelRetainedCents = Math.round(
    (depositCents * partialRetentionPct) / 100,
  );

  // Lista unificada das 3 alocações com prepMinutes e cleanupMinutes
  const unifiedAllocations = useMemo(() => {
    const rawList = activeBookingDto?.allocations?.length
      ? activeBookingDto.allocations.map((a) => ({
          resourceId: a.resourceId,
          resourceName: a.resourceName,
          category: a.category,
          serviceStartAt: a.serviceStartAt,
          serviceEndAt: a.serviceEndAt,
          prepMinutes: a.prepMinutes ?? 0,
          cleanupMinutes: a.cleanupMinutes ?? 0,
          effectiveStartAt: a.effectiveStartAt,
          effectiveEndAt: a.effectiveEndAt,
        }))
      : (fallbackBooking?.resources ?? []).map((r) => {
          const req = matchedProcedure?.requirements.find(
            (reqItem) => reqItem.category === r.category,
          );
          return {
            resourceId: r.id,
            resourceName: r.name,
            category: r.category,
            serviceStartAt: fallbackBooking?.serviceStartAt ?? startAt,
            serviceEndAt: fallbackBooking?.serviceEndAt ?? endAt,
            prepMinutes: r.prepMinutes ?? req?.prepMinutes ?? 0,
            cleanupMinutes: r.cleanupMinutes ?? req?.cleanupMinutes ?? 0,
            effectiveStartAt:
              r.effectiveStartAt ?? fallbackBooking?.serviceStartAt ?? startAt,
            effectiveEndAt:
              r.effectiveEndAt ?? fallbackBooking?.serviceEndAt ?? endAt,
          };
        });

    const order: Record<'SPECIALIST' | 'ROOM' | 'EQUIPMENT', number> = {
      SPECIALIST: 1,
      ROOM: 2,
      EQUIPMENT: 3,
    };
    return [...rawList].sort((a, b) => order[a.category] - order[b.category]);
  }, [activeBookingDto, fallbackBooking, matchedProcedure, startAt, endAt]);

  const serviceDurationMinutes = useMemo(() => {
    if (!startAt || !endAt) return matchedProcedure?.durationMinutes ?? 40;
    return Math.max(
      10,
      Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000),
    );
  }, [startAt, endAt, matchedProcedure]);

  const maxTotalSpanMinutes = useMemo(() => {
    if (unifiedAllocations.length === 0) return serviceDurationMinutes;
    return Math.max(
      ...unifiedAllocations.map(
        (a) => a.prepMinutes + serviceDurationMinutes + a.cleanupMinutes,
      ),
      serviceDurationMinutes,
    );
  }, [unifiedAllocations, serviceDurationMinutes]);

  // Filtrar eventos de auditoria relacionados a esta reserva (se a API entregou para OWNER/ADMIN)
  const bookingAuditEvents = useMemo(() => {
    if (!bookingId || !auditLogs || auditLogs.length === 0) return [];
    return auditLogs.filter((log) => {
      if (log.resourceId === bookingId) return true;
      const meta = log.metadata ?? {};
      return meta.bookingId === bookingId || meta.id === bookingId;
    });
  }, [bookingId, auditLogs]);

  if (!open) return null;

  // =========================================================================
  // MODO OFERTA DA LISTA DE ESPERA ("Vaga reservada para oferta")
  // =========================================================================
  if (offerHold && !bookingId) {
    const matchedEntry = waitlistEntries.find(
      (w) => w.id === offerHold.waitlistEntryId,
    );
    const proc = procedures.find((p) => p.id === matchedEntry?.procedureId);
    const nextCandidates = waitlistEntries.filter(
      (w) =>
        w.status === 'WAITING' &&
        (!matchedEntry || w.procedureId === matchedEntry.procedureId),
    );
    const nextCandidate = nextCandidates[0] ?? null;

    const remainingMs = Math.max(
      0,
      new Date(offerHold.expiresAt).getTime() - nowTick,
    );
    const remMin = Math.floor(remainingMs / 60000);
    const remSec = Math.floor((remainingMs % 60000) / 1000);
    const countdownStr = `${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;

    const handleClaimOffer = async () => {
      if (isSpecialistReadOnly) return;
      setActionLoading('claim');
      setActionError(null);
      try {
        await apiRequest(`/waitlist/${offerHold.waitlistEntryId}/claim`, {
          method: 'POST',
          token,
          workspaceId,
        });
        onToast?.(
          `Oferta de ${cleanPersonName(offerHold.clientName)} convertida em reserva confirmada.`,
          'success',
        );
        await onRefresh();
        onClose();
      } catch (err) {
        const msg =
          err instanceof ApiHttpError
            ? formatApiError(err.message, err.code)
            : formatApiError(String(err));
        setActionError(msg);
      } finally {
        setActionLoading(null);
      }
    };

    const handleCascadeNext = async () => {
      if (isSpecialistReadOnly) return;
      setActionLoading('expire');
      setActionError(null);
      try {
        await apiRequest(`/waitlist/${offerHold.waitlistEntryId}/expire-offer`, {
          method: 'POST',
          token,
          workspaceId,
        });
        onToast?.(
          nextCandidate
            ? `Oferta repassada para ${cleanPersonName(nextCandidate.clientName)}.`
            : 'Oferta encerrada e horário liberado.',
          'success',
        );
        await onRefresh();
        onClose();
      } catch (err) {
        const msg =
          err instanceof ApiHttpError
            ? formatApiError(err.message, err.code)
            : formatApiError(String(err));
        setActionError(msg);
      } finally {
        setActionLoading(null);
      }
    };

    return (
      <div
        className="fixed inset-0 z-50 bg-black/35 flex items-end md:items-stretch justify-end"
        onClick={onClose}
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={`Vaga reservada para oferta de ${cleanPersonName(offerHold.clientName)}`}
          data-testid="booking-details-drawer"
          onClick={(e) => e.stopPropagation()}
          className="w-full md:w-[430px] max-h-[85vh] md:max-h-none md:h-full bg-surface border-t md:border-t-0 md:border-l border-border-subtle rounded-t-2xl md:rounded-none shadow-2xl flex flex-col justify-between overflow-hidden"
        >
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="md:hidden flex justify-center pb-1">
              <div className="w-10 h-1.5 rounded-full bg-border-strong" />
            </div>
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={cleanPersonName(offerHold.clientName)} size="md" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-ink-primary">
                      {cleanPersonName(offerHold.clientName)}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-tint text-brand border border-brand/30">
                      Vaga reservada para oferta
                    </span>
                  </div>
                  <p className="text-xs text-ink-secondary mt-0.5 tabular-nums">
                    {proc?.name ?? 'Procedimento clínico'} ·{' '}
                    {formatDateBR(offerHold.offeredStartAt)} ·{' '}
                    {formatTimeBR(offerHold.offeredStartAt)} a{' '}
                    {formatTimeBR(offerHold.offeredEndAt)}
                  </p>
                </div>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                aria-label="Fechar detalhes da oferta"
                className="p-2 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-sunken transition min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-brand-tint/60 border border-brand/30 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-brand inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  Tempo restante para resposta
                </span>
                <span className="text-base font-semibold text-ink-primary tabular-nums">
                  {countdownStr}
                </span>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed">
                O horário das{' '}
                <strong className="text-ink-primary">
                  {formatTimeBR(offerHold.offeredStartAt)}
                </strong>{' '}
                está bloqueado temporariamente para este paciente (expira às{' '}
                {formatTimeBR(offerHold.expiresAt)}).
              </p>
              {nextCandidate && (
                <div className="pt-2 border-t border-brand/20 text-xs text-ink-secondary">
                  Cascata automática: se expirar, a vaga será oferecida para{' '}
                  <strong className="text-ink-primary">
                    {cleanPersonName(nextCandidate.clientName)}
                  </strong>
                  .
                </div>
              )}
            </div>

            {actionError && (
              <div className="p-3 rounded-lg bg-[var(--status-noshow-bg)] border border-[var(--status-noshow-border)] text-xs text-[var(--status-noshow-text)]">
                {actionError}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border-subtle bg-canvas flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={isSpecialistReadOnly || actionLoading !== null}
              title={
                isSpecialistReadOnly
                  ? 'Somente a coordenação altera reservas'
                  : undefined
              }
              onClick={() => void handleClaimOffer()}
              className="flex-1 min-h-[44px] px-4 py-2 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 text-white text-xs font-semibold transition"
            >
              {actionLoading === 'claim'
                ? 'Confirmando...'
                : 'Confirmar reserva agora'}
            </button>
            <button
              type="button"
              disabled={isSpecialistReadOnly || actionLoading !== null}
              title={
                isSpecialistReadOnly
                  ? 'Somente a coordenação altera reservas'
                  : undefined
              }
              onClick={() => void handleCascadeNext()}
              className="min-h-[44px] px-3.5 py-2 rounded-lg bg-surface hover:bg-sunken border border-border-subtle disabled:opacity-50 text-xs font-medium text-ink-primary transition"
            >
              Passar ao próximo
            </button>
            {onNavigateToWaitlist && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToWaitlist();
                }}
                className="w-full text-center text-xs font-medium text-brand hover:underline pt-1"
              >
                Abrir na Lista de espera →
              </button>
            )}
          </div>
        </aside>
      </div>
    );
  }

  // Handler de ações do ciclo de vida com atualização otimista e rollback
  const executeLifecycleAction = async (
    action: 'confirm-deposit' | 'check-in' | 'complete' | 'cancel' | 'no-show',
    recreateAfterCancel = false,
  ) => {
    const targetId = activeBookingDto?.id ?? bookingId;
    if (!targetId || isSpecialistReadOnly) return;

    setActionLoading(action);
    setActionError(null);

    const previousStatus = status;
    const optimisticNextStatus: Record<typeof action, BookingDto['status']> = {
      'confirm-deposit': 'CONFIRMED',
      'check-in': 'CHECKED_IN',
      complete: 'COMPLETED',
      cancel: 'CANCELLED',
      'no-show': 'NO_SHOW',
    };

    // Atualização otimista imediata na Agenda/Lista
    onOptimisticStatusUpdate?.(targetId, optimisticNextStatus[action]);

    try {
      const updated = await apiRequest<BookingDto>(
        `/bookings/${targetId}/${action}`,
        {
          method: 'POST',
          token,
          workspaceId,
          body:
            action === 'cancel'
              ? {
                  reason:
                    'Cancelamento realizado no painel da Agenda — vaga disponibilizada para a lista de espera',
                }
              : {},
        },
      );
      setFetchedBooking(updated);
      onOptimisticStatusUpdate?.(targetId, updated.status, updated);
      setConfirmDialog(null);
      setMenuOpen(false);

      const toastMessages: Record<typeof action, string> = {
        'confirm-deposit': `Sinal de ${clientName} confirmado.`,
        'check-in': `Chegada de ${clientName} registrada.`,
        complete: `Atendimento de ${clientName} concluído.`,
        cancel: `Reserva de ${clientName} cancelada e vaga oferecida à fila.`,
        'no-show': `Falta de ${clientName} registrada.`,
      };
      onToast?.(toastMessages[action], 'success');
      void onRefresh();

      if (recreateAfterCancel && onCancelAndRecreate) {
        const startHour = startAt
          ? Number(formatTimeBR(startAt).split(':')[0]) || 9
          : 9;
        onClose();
        onCancelAndRecreate({
          procedureId:
            updated.procedureId || matchedProcedure?.id || procedures[0]?.id || '',
          clientName,
          clientEmail: updated.clientEmail || 'paciente@clinica.test',
          hour: startHour,
        });
      }
    } catch (err) {
      // Rollback otimista
      onOptimisticStatusUpdate?.(targetId, previousStatus);
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : formatApiError(String(err));
      setActionError(msg);
      onToast?.(msg, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyEmail = async (emailStr: string) => {
    try {
      await navigator.clipboard.writeText(emailStr);
      setCopiedEmail(true);
      window.setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      // ignore
    }
  };

  // Ação primária contextual única conforme status atual
  const primaryContextualAction: {
    action: 'confirm-deposit' | 'check-in' | 'complete';
    label: string;
  } | null =
    status === 'PENDING_DEPOSIT'
      ? { action: 'confirm-deposit', label: 'Confirmar sinal' }
      : status === 'CONFIRMED'
      ? { action: 'check-in', label: 'Registrar chegada' }
      : status === 'CHECKED_IN'
      ? { action: 'complete', label: 'Concluir atendimento' }
      : null;

  const canCancelOrNoShow =
    status === 'PENDING_DEPOSIT' ||
    status === 'CONFIRMED' ||
    status === 'CHECKED_IN';

  const canReschedule =
    !isSpecialistReadOnly &&
    (status === 'CONFIRMED' || status === 'PENDING_DEPOSIT');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/35 flex items-end md:items-stretch justify-end"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes da reserva de ${clientName}`}
        data-testid="booking-details-drawer"
        onClick={(e) => e.stopPropagation()}
        style={
          sheetTranslateY > 0
            ? { transform: `translateY(${sheetTranslateY}px)` }
            : undefined
        }
        onTouchStart={(e) => {
          touchStartYRef.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(e) => {
          if (touchStartYRef.current === null) return;
          const delta = (e.touches[0]?.clientY ?? 0) - touchStartYRef.current;
          if (delta > 0) setSheetTranslateY(delta);
        }}
        onTouchEnd={() => {
          if (sheetTranslateY > 90) {
            onClose();
          } else {
            setSheetTranslateY(0);
          }
          touchStartYRef.current = null;
        }}
        className="relative w-full md:w-[440px] max-h-[85vh] md:max-h-none md:h-full bg-surface border-t md:border-t-0 md:border-l border-border-subtle rounded-t-2xl md:rounded-none shadow-2xl flex flex-col justify-between overflow-hidden transition-transform"
      >
        {/* Alça de arrasto do Bottom Sheet no mobile */}
        <div
          className="md:hidden pt-2.5 pb-1 flex justify-center cursor-grab"
          onClick={onClose}
          title="Arraste ou toque para fechar"
        >
          <div className="w-10 h-1.5 rounded-full bg-border-strong" />
        </div>

        {/* 1. CABEÇALHO STICKY */}
        <div className="px-5 py-4 border-b border-border-subtle bg-surface flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <Avatar name={clientName} size="md" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  data-testid="drawer-patient-name"
                  className="text-base font-semibold text-ink-primary break-words"
                >
                  {clientName}
                </h2>
                <BookingStatusBadge status={status} />
              </div>
              <p className="text-xs text-ink-secondary mt-1 break-words">
                <span className="font-medium text-ink-primary">{procedureName}</span>
                {startAt && endAt && (
                  <span className="tabular-nums">
                    {' '}
                    · {formatDateBR(startAt)} · {formatTimeBR(startAt)} a{' '}
                    {formatTimeBR(endAt)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes da reserva"
            data-testid="drawer-close-button"
            className="p-2 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-sunken transition shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CORPO ROLÁVEL DO DRAWER */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Estado de Carregamento (Skeleton com a forma do conteúdo) */}
          {loadingDetail && !activeBookingDto && !fallbackBooking && (
            <div
              data-testid="drawer-loading-skeleton"
              className="space-y-4 animate-pulse"
            >
              <div className="h-4 w-40 bg-sunken rounded" />
              <div className="space-y-2">
                <div className="h-16 bg-sunken rounded-xl" />
                <div className="h-16 bg-sunken rounded-xl" />
                <div className="h-16 bg-sunken rounded-xl" />
              </div>
              <div className="h-20 bg-sunken rounded-xl" />
            </div>
          )}

          {/* Estado de Erro com botão "Tentar de novo" */}
          {detailError && !activeBookingDto && !fallbackBooking && (
            <div className="p-4 rounded-xl bg-[var(--status-noshow-bg)] border border-[var(--status-noshow-border)] space-y-3 text-xs">
              <div className="flex items-center gap-2 font-semibold text-[var(--status-noshow-text)]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{detailError}</span>
              </div>
              {bookingId && (
                <button
                  type="button"
                  onClick={() => void fetchSingleBooking(bookingId)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-ink-primary font-medium"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tentar de novo</span>
                </button>
              )}
            </div>
          )}

          {/* Aviso de RBAC quando Especialista está visualizando */}
          {isSpecialistReadOnly && (
            <div
              data-testid="drawer-specialist-readonly-banner"
              className="p-3 rounded-xl bg-canvas border border-border-subtle flex items-center gap-2.5 text-xs text-ink-secondary"
            >
              <Lock className="w-4 h-4 text-ink-muted shrink-0" />
              <span>
                Somente a coordenação altera reservas. Você está no modo de
                consulta da grade clínica.
              </span>
            </div>
          )}

          {actionError && (
            <div className="p-3 rounded-xl bg-[var(--status-noshow-bg)] border border-[var(--status-noshow-border)] flex items-center justify-between gap-2 text-xs text-[var(--status-noshow-text)]">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="underline font-medium shrink-0"
              >
                Fechar
              </button>
            </div>
          )}

          {/* 2. RECURSOS RESERVADOS (3 linhas com nome completo sem truncar + mini barra preparo | atendimento | limpeza) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <h3 className="font-semibold text-ink-primary">
                Recursos reservados ({unifiedAllocations.length})
              </h3>
              <span className="text-ink-secondary tabular-nums">
                Atendimento {serviceDurationMinutes} min
              </span>
            </div>

            <div className="space-y-2.5">
              {unifiedAllocations.map((alloc) => {
                const catalogRes = resourcesCatalog.find(
                  (r) => r.id === alloc.resourceId,
                );
                const roleOrCap = catalogRes?.capabilities?.[0]
                  ? formatCapability(catalogRes.capabilities[0])
                  : formatResourceCategory(alloc.category);
                const isFocusedLane = focusedResourceId === alloc.resourceId;

                const prepPct = Math.round(
                  (alloc.prepMinutes / maxTotalSpanMinutes) * 100,
                );
                const servicePct = Math.max(
                  20,
                  Math.round((serviceDurationMinutes / maxTotalSpanMinutes) * 100),
                );
                const cleanupPct = Math.round(
                  (alloc.cleanupMinutes / maxTotalSpanMinutes) * 100,
                );

                const barColorClass =
                  alloc.category === 'SPECIALIST'
                    ? 'bg-[var(--res-specialist-bar)]'
                    : alloc.category === 'ROOM'
                    ? 'bg-[var(--res-room-bar)]'
                    : 'bg-[var(--res-equipment-bar)]';

                return (
                  <div
                    key={alloc.resourceId}
                    data-testid={`drawer-resource-${alloc.category.toLowerCase()}`}
                    className={`p-3 rounded-xl border transition space-y-2 ${
                      isFocusedLane
                        ? 'bg-brand-tint/40 border-brand/50'
                        : 'bg-canvas border-border-subtle'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <ResourceTile
                          name={alloc.resourceName}
                          category={alloc.category}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-ink-primary break-words leading-snug">
                            {alloc.resourceName}
                          </div>
                          <div className="text-[11px] text-ink-secondary mt-0.5 tabular-nums">
                            {formatResourceCategory(alloc.category)} ({roleOrCap}) ·{' '}
                            {formatTimeBR(alloc.serviceStartAt)} a{' '}
                            {formatTimeBR(alloc.serviceEndAt)}
                            {alloc.prepMinutes > 0 &&
                              ` · preparo ${alloc.prepMinutes} min`}
                            {alloc.cleanupMinutes > 0
                              ? ` · limpeza ${alloc.cleanupMinutes} min`
                              : ' · liberação imediata'}
                          </div>
                        </div>
                      </div>

                      {isFocusedLane && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface border border-brand/40 text-brand shrink-0">
                          Raia clicada
                        </span>
                      )}
                    </div>

                    {/* Mini barra preparo | atendimento | limpeza sobre eixo comum */}
                    <div className="space-y-1">
                      <div className="h-2.5 w-full rounded-md bg-sunken overflow-hidden flex">
                        {alloc.prepMinutes > 0 && (
                          <div
                            style={{ width: `${Math.max(8, prepPct)}%` }}
                            title={`Preparo: ${alloc.prepMinutes} min`}
                            className="h-full bg-amber-500/40 border-r border-surface"
                          />
                        )}
                        <div
                          style={{ width: `${servicePct}%` }}
                          title={`Atendimento: ${serviceDurationMinutes} min`}
                          className={`h-full ${barColorClass}`}
                        />
                        {alloc.cleanupMinutes > 0 && (
                          <div
                            style={{ width: `${Math.max(10, cleanupPct)}%` }}
                            title={`Limpeza e esterilização: ${alloc.cleanupMinutes} min`}
                            className="h-full bg-cleanup-stripes border-l border-[var(--cleanup-border)]"
                          />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-ink-muted tabular-nums">
                        <span>
                          Início {formatTimeBR(alloc.effectiveStartAt || alloc.serviceStartAt)}
                        </span>
                        <span>
                          {alloc.cleanupMinutes > 0
                            ? `Liberado às ${formatTimeBR(alloc.effectiveEndAt)} (+${alloc.cleanupMinutes} min limpeza)`
                            : `Liberado às ${formatTimeBR(alloc.serviceEndAt)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. SINAL DE RESERVA & POLÍTICA DE CANCELAMENTO RECOLHIDA */}
          <section className="rounded-xl bg-canvas border border-border-subtle p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink-primary inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
                Sinal de reserva ({depositPct}%)
              </span>
              <div className="flex items-center gap-2 tabular-nums">
                <span className="font-semibold text-ink-primary">
                  {formatCurrencyBRL(depositCents)}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-surface border border-border-subtle text-[11px] font-medium text-ink-secondary">
                  {formatDepositStatus(depositStatusRaw)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-ink-secondary tabular-nums">
              <span>Valor total do procedimento: {formatCurrencyBRL(priceCents)}</span>
              {retainedCents > 0 && (
                <span>Retido: {formatCurrencyBRL(retainedCents)}</span>
              )}
              {refundedCents > 0 && (
                <span>Reembolsado: {formatCurrencyBRL(refundedCents)}</span>
              )}
            </div>

            <div className="pt-1 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setPolicyExpanded((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-medium text-brand hover:underline py-0.5"
              >
                <span>Ver política de cancelamento e retenção</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    policyExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {policyExpanded && (
                <div className="mt-2 p-2.5 rounded-lg bg-surface border border-border-subtle text-[11px] text-ink-secondary space-y-1 leading-relaxed">
                  <div>
                    • Cancelamento com mais de{' '}
                    <strong>
                      {matchedProcedure?.cancellationPolicy
                        ?.fullRefundThresholdHours ?? 24}
                      h
                    </strong>{' '}
                    de antecedência: reembolso integral do sinal (
                    {formatCurrencyBRL(depositCents)}).
                  </div>
                  <div>
                    • Cancelamento entre{' '}
                    <strong>
                      {matchedProcedure?.cancellationPolicy
                        ?.partialRefundThresholdHours ?? 6}
                      h e{' '}
                      {matchedProcedure?.cancellationPolicy
                        ?.fullRefundThresholdHours ?? 24}
                      h
                    </strong>
                    : retenção de{' '}
                    <strong>{partialRetentionPct}% do sinal</strong> (
                    {formatCurrencyBRL(estimatedCancelRetainedCents)}).
                  </div>
                  <div>
                    • Falta sem aviso prévio: retenção de{' '}
                    <strong>100% do sinal</strong> (
                    {formatCurrencyBRL(depositCents)}).
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 4. CONTATO DO PACIENTE E OBSERVAÇÕES */}
          <section className="rounded-xl bg-canvas border border-border-subtle p-3.5 space-y-2.5 text-xs">
            <div className="font-semibold text-ink-primary">
              Contato do paciente e observações
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-ink-secondary min-w-0">
                <Mail className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                <span className="break-all">
                  {activeBookingDto?.clientEmail || 'E-mail registrado no agendamento'}
                </span>
              </div>
              {activeBookingDto?.clientEmail && (
                <button
                  type="button"
                  onClick={() => void handleCopyEmail(activeBookingDto.clientEmail)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface border border-border-subtle text-[11px] font-medium text-ink-secondary hover:text-ink-primary shrink-0"
                >
                  {copiedEmail ? (
                    <>
                      <Check className="w-3 h-3 text-[var(--status-confirmed-border)]" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {activeBookingDto?.originWaitlistEntryId && (
              <div className="text-[11px] text-brand font-medium flex items-center gap-1.5 pt-1 border-t border-border-subtle">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Horário recuperado automaticamente pela Lista de espera.
                </span>
              </div>
            )}

            {activeBookingDto?.cancellationReason && (
              <div className="text-[11px] text-ink-secondary pt-1 border-t border-border-subtle">
                <strong>Motivo do cancelamento:</strong>{' '}
                {activeBookingDto.cancellationReason}
              </div>
            )}
          </section>

          {/* 5. HISTÓRICO CURTO (quando disponível na auditoria ou criado em) */}
          {(activeBookingDto?.createdAt || bookingAuditEvents.length > 0) && (
            <section className="rounded-xl bg-canvas border border-border-subtle p-3.5 space-y-2 text-xs">
              <div className="font-semibold text-ink-primary">
                Histórico da reserva
              </div>
              <div className="space-y-1.5 text-[11px] text-ink-secondary tabular-nums">
                {activeBookingDto?.createdAt && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-ink-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                      Reserva registrada com 3 recursos
                    </span>
                    <span>{formatDateTimeBR(activeBookingDto.createdAt)}</span>
                  </div>
                )}
                {bookingAuditEvents.slice(0, 4).map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1.5 text-ink-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                      {formatAuditAction(ev.action)}
                    </span>
                    <span>{formatDateTimeBR(ev.occurredAt)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 6. RODAPÉ FIXO DE AÇÕES (1 ação primária contextual + Reagendar explicado + menu "⋯"; oculto para Especialista) */}
        <div className="p-4 border-t border-border-subtle bg-canvas shrink-0">
          {isSpecialistReadOnly ? (
            <div className="flex items-center gap-2 text-xs text-ink-secondary py-1">
              <Lock className="w-3.5 h-3.5 text-ink-muted shrink-0" />
              <span>Somente a coordenação altera reservas.</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              {primaryContextualAction ? (
                <button
                  type="button"
                  data-testid="drawer-primary-action"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    void executeLifecycleAction(primaryContextualAction.action)
                  }
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition shadow-xs flex items-center justify-center gap-1.5"
                >
                  {actionLoading === primaryContextualAction.action ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Atualizando...</span>
                    </>
                  ) : (
                    <span>{primaryContextualAction.label}</span>
                  )}
                </button>
              ) : (
                <div className="flex-1 text-xs text-ink-secondary py-2">
                  Reserva em estado final ({formatBookingStatus(status)}).
                </div>
              )}

              {/* Botão de Reagendar horário funcional */}
              <button
                type="button"
                disabled={!canReschedule || actionLoading !== null}
                data-testid="drawer-reschedule-btn"
                onClick={() => setRescheduleModalOpen(true)}
                title={
                  canReschedule
                    ? 'Reagendar para novo horário mantendo os 3 recursos simultâneos'
                    : 'Reagendamento disponível apenas para reservas confirmadas ou aguardando sinal.'
                }
                className="min-h-[44px] px-3.5 py-2 rounded-lg bg-surface hover:bg-sunken border border-border-subtle text-xs font-semibold text-ink-primary disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0 flex items-center gap-1.5 shadow-2xs"
              >
                <Calendar className="w-3.5 h-3.5 text-brand" />
                <span>Reagendar</span>
              </button>

              {/* Botão destacado de Registrar falta (No-Show) */}
              {canCancelOrNoShow && (
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  data-testid="drawer-noshow-btn"
                  onClick={() => setConfirmDialog({ type: 'no-show' })}
                  title="Registrar falta (No-Show) do paciente com retenção do sinal"
                  className="min-h-[44px] px-3.5 py-2 rounded-lg bg-[var(--status-noshow-bg)] hover:bg-[var(--status-noshow-border)]/20 border border-[var(--status-noshow-border)] text-xs font-semibold text-[var(--status-noshow-text)] transition shrink-0 flex items-center gap-1.5 shadow-2xs"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Registrar falta</span>
                </button>
              )}

              {/* Menu "⋯" com ações secundárias / destrutivas */}
              {canCancelOrNoShow && (
                <div ref={menuContainerRef} className="relative shrink-0">
                  <button
                    type="button"
                    data-testid="drawer-more-menu-btn"
                    title="Mais ações da reserva"
                    aria-label="Mais ações da reserva"
                    onClick={() => setMenuOpen((v) => !v)}
                    className="min-w-[44px] min-h-[44px] p-2 rounded-lg bg-surface hover:bg-sunken border border-border-subtle text-ink-secondary hover:text-ink-primary transition flex items-center justify-center"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 bottom-full mb-2 w-64 bg-elevated border border-border-strong rounded-xl shadow-xl p-1.5 z-50 space-y-1 text-xs"
                    >
                      {canReschedule && (
                        <button
                          type="button"
                          role="menuitem"
                          data-testid="drawer-menu-reschedule"
                          onClick={() => {
                            setMenuOpen(false);
                            setRescheduleModalOpen(true);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-sunken text-ink-primary font-medium flex items-center gap-2"
                        >
                          <Calendar className="w-3.5 h-3.5 text-brand shrink-0" />
                          <span>Reagendar horário...</span>
                        </button>
                      )}

                      {onCancelAndRecreate && (
                        <button
                          type="button"
                          role="menuitem"
                          data-testid="drawer-menu-cancel-recreate"
                          onClick={() => {
                            setMenuOpen(false);
                            setConfirmDialog({ type: 'cancel-recreate' });
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-sunken text-ink-primary font-medium flex items-center gap-2"
                        >
                          <CalendarPlus className="w-3.5 h-3.5 text-brand shrink-0" />
                          <span>Cancelar e criar nova reserva</span>
                        </button>
                      )}

                      <button
                        type="button"
                        role="menuitem"
                        data-testid="drawer-menu-no-show"
                        onClick={() => {
                          setMenuOpen(false);
                          setConfirmDialog({ type: 'no-show' });
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-sunken text-[var(--status-noshow-text)] font-semibold flex items-center gap-2"
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-[var(--status-noshow-text)] shrink-0" />
                        <span>Registrar falta</span>
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        data-testid="drawer-menu-cancel"
                        onClick={() => {
                          setMenuOpen(false);
                          setConfirmDialog({ type: 'cancel' });
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-sunken text-ink-secondary hover:text-ink-primary font-medium flex items-center gap-2"
                      >
                        <X className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                        <span>Cancelar e oferecer vaga</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal de Confirmação Sobreposto com Foco e Visibilidade Imediata */}
        {confirmDialog && (
          <div
            className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setConfirmDialog(null)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label="Confirmação de ação na reserva"
              data-testid="drawer-confirm-dialog"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-surface border border-border-strong shadow-2xl p-5 space-y-3.5 text-xs animate-in zoom-in-95 duration-150"
            >
              <div className="flex items-center gap-2.5 font-bold text-ink-primary text-sm">
                <AlertCircle className="w-5 h-5 text-[var(--status-noshow-text)] shrink-0" />
                <span>
                  {confirmDialog.type === 'no-show'
                    ? `Registrar falta de ${clientName}?`
                    : confirmDialog.type === 'cancel-recreate'
                    ? `Cancelar e criar nova reserva?`
                    : `Cancelar a reserva de ${clientName}?`}
                </span>
              </div>

              <p className="text-ink-secondary leading-relaxed">
                {confirmDialog.type === 'no-show' ? (
                  <>
                    O paciente será marcado como{' '}
                    <strong className="text-ink-primary">Não compareceu</strong> e{' '}
                    <strong className="text-ink-primary">
                      100% do sinal ({formatCurrencyBRL(depositCents)})
                    </strong>{' '}
                    será retido conforme a política da clínica.
                  </>
                ) : (
                  <>
                    A vaga será oferecida ao próximo da lista e{' '}
                    <strong className="text-ink-primary">
                      {partialRetentionPct}% do sinal (
                      {formatCurrencyBRL(estimatedCancelRetainedCents)})
                    </strong>{' '}
                    será retido.
                    {confirmDialog.type === 'cancel-recreate' &&
                      ' Em seguida, abriremos o novo agendamento já preenchido com este paciente e procedimento.'}
                  </>
                )}
              </p>

              {actionError && (
                <div className="p-2.5 rounded-lg bg-[var(--status-error-bg)] border border-[var(--status-error-border)] text-[var(--status-error-text)] text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-surface hover:bg-sunken border border-border-subtle text-ink-primary font-semibold transition"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  data-testid="drawer-confirm-destructive-btn"
                  onClick={() =>
                    void executeLifecycleAction(
                      confirmDialog.type === 'no-show' ? 'no-show' : 'cancel',
                      confirmDialog.type === 'cancel-recreate',
                    )
                  }
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--status-error-border)] hover:opacity-95 text-white font-semibold shadow-xs flex items-center gap-1.5 transition"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Processando...</span>
                    </>
                  ) : confirmDialog.type === 'no-show' ? (
                    'Registrar falta'
                  ) : confirmDialog.type === 'cancel-recreate' ? (
                    'Cancelar e criar nova'
                  ) : (
                    'Cancelar reserva'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Modal interativo de Reagendamento com alocação simultânea de 3 recursos */}
      {rescheduleModalOpen && (activeBookingDto || fallbackBooking) && (
        <RescheduleModal
          open={rescheduleModalOpen}
          booking={
            activeBookingDto ?? {
              id: fallbackBooking!.bookingId,
              clientName: fallbackBooking!.clientName,
              procedureName: fallbackBooking!.procedureName,
              procedureId: matchedProcedure?.id,
              serviceStartAt: fallbackBooking!.serviceStartAt,
              serviceEndAt: fallbackBooking!.serviceEndAt,
            }
          }
          procedures={procedures}
          token={token}
          workspaceId={workspaceId}
          onClose={() => setRescheduleModalOpen(false)}
          onSuccess={(updated) => {
            setFetchedBooking(updated);
            onOptimisticStatusUpdate?.(updated.id, updated.status, updated);
            onToast?.(
              `Reserva de ${clientName} reagendada com sucesso com especialista, sala e equipamento garantidos!`,
              'success',
            );
            void onRefresh();
            setRescheduleModalOpen(false);
          }}
          onToast={onToast}
        />
      )}
    </div>
  );
};
