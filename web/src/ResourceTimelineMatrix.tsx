import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiHttpError,
  apiRequest,
  BookableResourceDto,
  BookingDto,
  KpiSummaryDto,
  ServiceProcedureDto,
  TimelineMatrixResponse,
  WaitlistEntryDto,
} from './api';
import { AuditEntryItem } from './AuditView';
import {
  BookingDetailsDrawer,
  TimelineBookingFallback,
  WaitlistOfferHoldSelection,
} from './BookingDetailsDrawer';
import { RescheduleModal } from './RescheduleModal';
import {
  addDaysToIsoDate,
  cleanPersonName,
  formatApiError,
  formatBookingStatus,
  formatCapability,
  formatDateBR,
  formatPercentBR,
  formatResourceCategory,
  formatResourceStatus,
  formatTimeBR,
  getClinicMinutesFromMidnight,
  getTodayClinicIsoDate,
  RESOURCE_CATEGORY_PLURAL_LABELS,
} from './labels';
import {
  AlertCircle,
  AlertTriangle,
  Box,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  Loader2,
  Minus,
  MoreVertical,
  Plus,
  RefreshCw,
  Rows3,
  Stethoscope,
  UserCheck,
  UserX,
  Wrench,
  X,
} from 'lucide-react';

interface Props {
  token: string;
  workspaceId: string;
  timeline: TimelineMatrixResponse | null;
  selectedDate: string;
  onDateChange: (date: string) => void;
  procedures: ServiceProcedureDto[];
  bookings?: BookingDto[];
  resourcesCatalog?: BookableResourceDto[];
  auditLogs?: AuditEntryItem[];
  waitlist?: WaitlistEntryDto[];
  role?: 'OWNER' | 'ADMIN' | 'COORDINATOR' | 'SPECIALIST' | null;
  onRefresh: () => Promise<void>;
  onOptimisticStatusUpdate?: (
    bookingId: string,
    newStatus: BookingDto['status'],
    updatedBooking?: BookingDto,
  ) => void;
  kpis?: KpiSummaryDto | null;
  lastUpdatedAt?: Date | null;
  onQuickSchedule?: (opts?: {
    resourceId?: string;
    hour?: number;
    procedureId?: string;
    clientName?: string;
    clientEmail?: string;
  }) => void;
  onNavigateToWaitlist?: () => void;
  onPauseAutoRefresh?: (paused: boolean) => void;
}

const START_HOUR = 7; // 07:00 America/Sao_Paulo
const END_HOUR = 20;  // 20:00 America/Sao_Paulo
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

const ZOOM_STEPS = [
  { px: 60 as const, percent: 50 },
  { px: 96 as const, percent: 75 },
  { px: 128 as const, percent: 100 },
];

const CATEGORY_LANE_META: Record<
  'SPECIALIST' | 'ROOM' | 'EQUIPMENT',
  {
    pluralLabel: string;
    icon: React.ReactNode;
    accentText: string;
    dotClass: string;
  }
> = {
  SPECIALIST: {
    pluralLabel: RESOURCE_CATEGORY_PLURAL_LABELS.SPECIALIST,
    icon: <Stethoscope className="w-4 h-4 text-[var(--res-specialist-text)] shrink-0" />,
    accentText: 'text-[var(--res-specialist-text)]',
    dotClass: 'bg-[var(--res-specialist-bar)]',
  },
  ROOM: {
    pluralLabel: RESOURCE_CATEGORY_PLURAL_LABELS.ROOM,
    icon: <Box className="w-4 h-4 text-[var(--res-room-text)] shrink-0" />,
    accentText: 'text-[var(--res-room-text)]',
    dotClass: 'bg-[var(--res-room-bar)]',
  },
  EQUIPMENT: {
    pluralLabel: RESOURCE_CATEGORY_PLURAL_LABELS.EQUIPMENT,
    icon: <Wrench className="w-4 h-4 text-[var(--res-equipment-text)] shrink-0" />,
    accentText: 'text-[var(--res-equipment-text)]',
    dotClass: 'bg-[var(--res-equipment-bar)]',
  },
};

function getBookingStatusStyle(status: string): {
  blockClass: string;
  badgeClass: string;
  icon: React.ReactNode;
} {
  switch (status) {
    case 'CONFIRMED':
      return {
        blockClass:
          'bg-[var(--status-confirmed-bg)] border-[var(--status-confirmed-border)] text-[var(--status-confirmed-text)]',
        badgeClass:
          'bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-text)] border-[var(--status-confirmed-border)]',
        icon: <CheckCircle2 className="w-3 h-3 text-[var(--status-confirmed-text)] shrink-0" />,
      };
    case 'PENDING_DEPOSIT':
      return {
        blockClass:
          'bg-[var(--status-pending-bg)] border-[var(--status-pending-border)] text-[var(--status-pending-text)]',
        badgeClass:
          'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)] border-[var(--status-pending-border)]',
        icon: <Clock className="w-3 h-3 text-[var(--status-pending-text)] shrink-0" />,
      };
    case 'CHECKED_IN':
      return {
        blockClass:
          'bg-[var(--status-checkedin-bg)] border-[var(--status-checkedin-border)] text-[var(--status-checkedin-text)]',
        badgeClass:
          'bg-[var(--status-checkedin-bg)] text-[var(--status-checkedin-text)] border-[var(--status-checkedin-border)]',
        icon: <UserCheck className="w-3 h-3 text-[var(--status-checkedin-text)] shrink-0" />,
      };
    case 'COMPLETED':
      return {
        blockClass:
          'bg-[var(--status-completed-bg)] border-[var(--status-completed-border)] text-[var(--status-completed-text)]',
        badgeClass:
          'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-[var(--status-completed-border)]',
        icon: <CheckCircle2 className="w-3 h-3 text-[var(--status-completed-text)] shrink-0" />,
      };
    case 'NO_SHOW':
      return {
        blockClass:
          'bg-[var(--status-noshow-bg)] border-[var(--status-noshow-border)] text-[var(--status-noshow-text)]',
        badgeClass:
          'bg-[var(--status-noshow-bg)] text-[var(--status-noshow-text)] border-[var(--status-noshow-border)]',
        icon: <AlertCircle className="w-3 h-3 text-[var(--status-noshow-text)] shrink-0" />,
      };
    default:
      return {
        blockClass: 'bg-sunken border-dashed border-border-strong text-ink-secondary',
        badgeClass: 'bg-sunken text-ink-secondary border-border-strong',
        icon: <Clock className="w-3 h-3 text-ink-muted shrink-0" />,
      };
  }
}

function formatBlockPatientLabel(fullName: string, widthPx: number): string {
  const clean = cleanPersonName(fullName);
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return clean;
  if (widthPx >= 132) return clean;
  const first = parts[0];
  const lastInitial = parts[parts.length - 1]?.[0]?.toUpperCase() ?? '';
  if (widthPx >= 72) {
    return lastInitial ? `${first} ${lastInitial}.` : first;
  }
  const initials = `${first[0] ?? ''}${lastInitial}`.toUpperCase();
  return initials || first;
}

function readReservaParamFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const val = new URLSearchParams(window.location.search).get('reserva');
  return val && val.trim() ? val.trim() : null;
}

function writeReservaParamToUrl(bookingId: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (bookingId) {
    url.searchParams.set('reserva', bookingId);
  } else {
    url.searchParams.delete('reserva');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export const ResourceTimelineMatrix: React.FC<Props> = ({
  token,
  workspaceId,
  timeline,
  selectedDate,
  onDateChange,
  procedures,
  bookings = [],
  resourcesCatalog = [],
  auditLogs = [],
  waitlist = [],
  role = null,
  onRefresh,
  onOptimisticStatusUpdate,
  kpis,
  lastUpdatedAt,
  onQuickSchedule,
  onNavigateToWaitlist,
  onPauseAutoRefresh,
}) => {
  // Zoom padrão 100% (128px/h) para que reservas de 25 a 45 min mostrem nome + horário sem precisar de hover
  const [hourWidthPx, setHourWidthPx] = useState<60 | 96 | 128>(128);
  const [denseRows, setDenseRows] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [hoveredBookingId, setHoveredBookingId] = useState<string | null>(null);
  const [activePopoverKey, setActivePopoverKey] = useState<string | null>(null);
  const [capPopoverResourceId, setCapPopoverResourceId] = useState<string | null>(null);
  const [minutesAgo, setMinutesAgo] = useState(0);

  // Estado de seleção persistente (clique / teclado / URL ?reserva=ID)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(() =>
    readReservaParamFromUrl(),
  );
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [selectedOfferHold, setSelectedOfferHold] = useState<WaitlistOfferHoldSelection | null>(
    null,
  );
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const hoverDelayTimerRef = useRef<number | null>(null);
  const lastFocusedBlockRef = useRef<HTMLButtonElement | null>(null);
  const blockButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const totalGridMinutes = (END_HOUR - START_HOUR) * 60;
  const totalGridWidthPx = HOURS.length * hourWidthPx;

  const currentZoomIndex = ZOOM_STEPS.findIndex((z) => z.px === hourWidthPx);
  const currentZoomPercent = ZOOM_STEPS[currentZoomIndex]?.percent ?? 100;

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  // Estados para Ações Rápidas Diretas e Menu de Contexto na Agenda
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    bookingId: string;
    clientName: string;
    procedureName: string;
    bookingStatus: string;
    serviceStartAt: string;
    serviceEndAt: string;
    resourceId: string;
  } | null>(null);

  const [rescheduleTargetBooking, setRescheduleTargetBooking] = useState<{
    id: string;
    clientName: string;
    procedureName: string;
    procedureId?: string;
    serviceStartAt: string;
    serviceEndAt: string;
  } | null>(null);

  const [noShowConfirmTarget, setNoShowConfirmTarget] = useState<{
    bookingId: string;
    clientName: string;
  } | null>(null);

  const [actionExecutingId, setActionExecutingId] = useState<string | null>(null);

  const isSpecialistReadOnly = role === 'SPECIALIST';

  useEffect(() => {
    if (!contextMenu) return;
    const handleCloseMenu = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleCloseMenu);
    window.addEventListener('contextmenu', handleCloseMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleCloseMenu);
      window.removeEventListener('contextmenu', handleCloseMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const executeQuickAction = async (
    bookingId: string,
    action: 'check-in' | 'complete' | 'confirm-deposit' | 'no-show',
    clientName: string,
  ) => {
    if (isSpecialistReadOnly) {
      showToast('Somente a coordenação pode alterar reservas.', 'error');
      return;
    }
    setActionExecutingId(bookingId);
    setContextMenu(null);

    const nextStatusMap: Record<typeof action, BookingDto['status']> = {
      'check-in': 'CHECKED_IN',
      complete: 'COMPLETED',
      'confirm-deposit': 'CONFIRMED',
      'no-show': 'NO_SHOW',
    };
    onOptimisticStatusUpdate?.(bookingId, nextStatusMap[action]);

    try {
      const updated = await apiRequest<BookingDto>(`/bookings/${bookingId}/${action}`, {
        method: 'POST',
        token,
        workspaceId,
      });
      onOptimisticStatusUpdate?.(bookingId, updated.status, updated);
      const toastMsgs: Record<typeof action, string> = {
        'check-in': `Chegada de ${clientName} registrada com sucesso.`,
        complete: `Atendimento de ${clientName} concluído com sucesso.`,
        'confirm-deposit': `Sinal de ${clientName} confirmado com sucesso.`,
        'no-show': `Falta de ${clientName} registrada. Sinal retido.`,
      };
      showToast(toastMsgs[action], 'success');
      await onRefresh();
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : 'Erro ao processar ação na reserva.';
      showToast(msg, 'error');
      await onRefresh();
    } finally {
      setActionExecutingId(null);
      setNoShowConfirmTarget(null);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Limpa timer de hover ao desmontar
  useEffect(() => {
    return () => {
      if (hoverDelayTimerRef.current !== null) {
        window.clearTimeout(hoverDelayTimerRef.current);
      }
    };
  }, []);

  // Sincroniza ?reserva=ID com popstate (botão voltar/avançar do navegador)
  useEffect(() => {
    const onPopState = () => {
      setSelectedBookingId(readReservaParamFromUrl());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Atalhos de teclado Alt+Seta Esquerda / Alt+Seta Direita para navegar entre datas
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        onDateChange(addDaysToIsoDate(selectedDate, -1));
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        onDateChange(addDaysToIsoDate(selectedDate, 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedDate, onDateChange]);

  // Contador "Atualizado há X min"
  useEffect(() => {
    const updateCounter = () => {
      if (!lastUpdatedAt) {
        setMinutesAgo(0);
        return;
      }
      const diff = Math.max(0, Math.floor((Date.now() - lastUpdatedAt.getTime()) / 60000));
      setMinutesAgo(diff);
    };
    updateCounter();
    const timer = window.setInterval(updateCounter, 15000);
    return () => window.clearInterval(timer);
  }, [lastUpdatedAt]);

  // Mapa de todas as alocações por bookingId para destacar o vínculo atômico entre as 3 raias
  const bookingAllocationsIndex = useMemo(() => {
    const map = new Map<string, TimelineBookingFallback>();

    for (const row of timeline?.resources ?? []) {
      for (const alloc of row.allocations) {
        const cleanClient = cleanPersonName(alloc.clientName);
        const existing = map.get(alloc.bookingId);
        if (existing) {
          existing.resources.push({
            id: row.resource.id,
            name: row.resource.name,
            category: row.resource.category,
            prepMinutes: alloc.prepMinutes,
            cleanupMinutes: alloc.cleanupMinutes,
            effectiveStartAt: alloc.effectiveStartAt,
            effectiveEndAt: alloc.effectiveEndAt,
          });
        } else {
          map.set(alloc.bookingId, {
            bookingId: alloc.bookingId,
            clientName: cleanClient,
            procedureName: alloc.procedureName,
            bookingStatus: alloc.bookingStatus,
            serviceStartAt: alloc.serviceStartAt,
            serviceEndAt: alloc.serviceEndAt,
            resources: [
              {
                id: row.resource.id,
                name: row.resource.name,
                category: row.resource.category,
                prepMinutes: alloc.prepMinutes,
                cleanupMinutes: alloc.cleanupMinutes,
                effectiveStartAt: alloc.effectiveStartAt,
                effectiveEndAt: alloc.effectiveEndAt,
              },
            ],
          });
        }
      }
    }
    return map;
  }, [timeline]);

  // Lista ordenada de chaves de blocos para navegação por setas do teclado
  const orderedBlockKeys = useMemo(() => {
    const keys: string[] = [];
    for (const category of ['SPECIALIST', 'ROOM', 'EQUIPMENT'] as const) {
      if (collapsedGroups[category]) continue;
      const rows = (timeline?.resources ?? []).filter((r) => r.resource.category === category);
      for (const row of rows) {
        const sortedAllocs = [...row.allocations].sort(
          (a, b) => new Date(a.serviceStartAt).getTime() - new Date(b.serviceStartAt).getTime(),
        );
        for (const alloc of sortedAllocs) {
          keys.push(`${alloc.bookingId}-${row.resource.id}`);
        }
      }
    }
    return keys;
  }, [timeline, collapsedGroups]);

  // Scroll inicial automático para a reserva selecionada na URL (?reserva=ID) ou primeira alocação do dia
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const selectedInTimeline = selectedBookingId
      ? bookingAllocationsIndex.get(selectedBookingId)
      : null;

    const allBookings = [...bookingAllocationsIndex.values()];
    let targetMinutes = 8 * 60; // 08:00 padrão

    if (selectedInTimeline) {
      targetMinutes = Math.max(
        START_HOUR * 60,
        getClinicMinutesFromMidnight(selectedInTimeline.serviceStartAt) - 30,
      );
    } else if (allBookings.length > 0) {
      const earliestMin = Math.min(
        ...allBookings.map((b) => getClinicMinutesFromMidnight(b.serviceStartAt)),
      );
      targetMinutes = Math.max(START_HOUR * 60, earliestMin - 30);
    } else if (selectedDate === getTodayClinicIsoDate()) {
      targetMinutes = Math.max(
        START_HOUR * 60,
        getClinicMinutesFromMidnight(new Date().toISOString()) - 60,
      );
    }
    const offsetMinutes = Math.max(0, targetMinutes - START_HOUR * 60);
    const targetLeftPx = (offsetMinutes / 60) * hourWidthPx;
    container.scrollLeft = Math.max(0, targetLeftPx - 24);
  }, [selectedDate, timeline?.date, hourWidthPx, bookingAllocationsIndex, selectedBookingId]);

  const minutesToLeftPx = (iso: string): number => {
    const min = getClinicMinutesFromMidnight(iso);
    const offsetMin = Math.max(0, Math.min(totalGridMinutes, min - START_HOUR * 60));
    return (offsetMin / 60) * hourWidthPx;
  };

  const durationToWidthPx = (startIso: string, endIso: string): number => {
    const diffMin = Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
    return Math.max(12, (diffMin / 60) * hourWidthPx);
  };

  const handleSelectBooking = useCallback(
    (bookingId: string, resourceId: string | null, triggerEl?: HTMLButtonElement | null) => {
      if (hoverDelayTimerRef.current !== null) {
        window.clearTimeout(hoverDelayTimerRef.current);
        hoverDelayTimerRef.current = null;
      }
      setActivePopoverKey(null);
      if (triggerEl) {
        lastFocusedBlockRef.current = triggerEl;
      }
      setSelectedOfferHold(null);
      setSelectedBookingId(bookingId);
      setSelectedResourceId(resourceId);
      writeReservaParamToUrl(bookingId);
    },
    [],
  );

  const handleSelectOfferHold = useCallback(
    (hold: WaitlistOfferHoldSelection, triggerEl?: HTMLButtonElement | null) => {
      if (hoverDelayTimerRef.current !== null) {
        window.clearTimeout(hoverDelayTimerRef.current);
        hoverDelayTimerRef.current = null;
      }
      setActivePopoverKey(null);
      if (triggerEl) {
        lastFocusedBlockRef.current = triggerEl;
      }
      setSelectedBookingId(null);
      setSelectedResourceId(hold.resourceId);
      setSelectedOfferHold(hold);
      writeReservaParamToUrl(null);
    },
    [],
  );

  const handleCloseDrawer = useCallback(() => {
    setSelectedBookingId(null);
    setSelectedResourceId(null);
    setSelectedOfferHold(null);
    writeReservaParamToUrl(null);
    const btnToFocus = lastFocusedBlockRef.current;
    if (btnToFocus && typeof btnToFocus.focus === 'function') {
      window.setTimeout(() => {
        btnToFocus.focus();
      }, 0);
    }
  }, []);

  const handleBlockMouseEnter = useCallback((bookingId: string, popoverKey: string) => {
    setHoveredBookingId(bookingId);
    if (hoverDelayTimerRef.current !== null) {
      window.clearTimeout(hoverDelayTimerRef.current);
    }
    hoverDelayTimerRef.current = window.setTimeout(() => {
      setActivePopoverKey(popoverKey);
    }, 150);
  }, []);

  const handleBlockMouseLeave = useCallback(() => {
    if (hoverDelayTimerRef.current !== null) {
      window.clearTimeout(hoverDelayTimerRef.current);
      hoverDelayTimerRef.current = null;
    }
    setHoveredBookingId(null);
    setActivePopoverKey(null);
  }, []);

  const handleBlockKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, currentKey: string) => {
      if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp'
      ) {
        e.preventDefault();
        const idx = orderedBlockKeys.indexOf(currentKey);
        if (idx === -1 || orderedBlockKeys.length === 0) return;
        const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
        const nextIdx = (idx + delta + orderedBlockKeys.length) % orderedBlockKeys.length;
        const nextKey = orderedBlockKeys[nextIdx];
        const nextEl = blockButtonRefs.current[nextKey];
        if (nextEl) {
          nextEl.focus();
        }
      }
    },
    [orderedBlockKeys],
  );

  // Posição da linha "Agora" quando a data selecionada é hoje
  const isToday = selectedDate === getTodayClinicIsoDate();
  const nowMinutes = getClinicMinutesFromMidnight(new Date().toISOString());
  const showNowLine = isToday && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60;
  const nowLeftPx = ((nowMinutes - START_HOUR * 60) / 60) * hourWidthPx;

  // Reserva ativa para destaque (hover tem prioridade visual temporária, seleção mantém fixo)
  const activeHighlightBookingId = hoveredBookingId ?? selectedBookingId;
  const activeHighlightBooking = activeHighlightBookingId
    ? bookingAllocationsIndex.get(activeHighlightBookingId) ?? null
    : null;
  const connectorLeftPx = activeHighlightBooking
    ? minutesToLeftPx(activeHighlightBooking.serviceStartAt) + 12
    : null;

  const selectedBookingFallback = selectedBookingId
    ? bookingAllocationsIndex.get(selectedBookingId) ?? null
    : null;

  // Indicadores operacionais enxutos do dia (máx. 3 indicadores na barra superior da agenda)
  const avgUtilization = useMemo(() => {
    if (!kpis?.utilizationByCategory) return 0;
    const vals = [
      kpis.utilizationByCategory.SPECIALIST?.utilizationPercent ?? 0,
      kpis.utilizationByCategory.ROOM?.utilizationPercent ?? 0,
      kpis.utilizationByCategory.EQUIPMENT?.utilizationPercent ?? 0,
    ];
    return Math.round(((vals[0] + vals[1] + vals[2]) / 3) * 10) / 10;
  }, [kpis]);

  const toggleGroup = (category: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const rowHeightClass = denseRows ? 'h-12' : 'h-14';
  const allBookingsList = useMemo(
    () =>
      [...bookingAllocationsIndex.values()].sort(
        (a, b) => new Date(a.serviceStartAt).getTime() - new Date(b.serviceStartAt).getTime(),
      ),
    [bookingAllocationsIndex],
  );

  const isDrawerOpen = Boolean(selectedBookingId || selectedOfferHold);

  return (
    <div className="space-y-4 relative">
      {/* Toast de feedback de ação otimista */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="agenda-toast"
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-2.5 text-xs font-semibold transition-all ${
            toast.type === 'success'
              ? 'bg-elevated border-[var(--status-confirmed-border)] text-ink-primary'
              : 'bg-elevated border-[var(--status-noshow-border)] text-[var(--status-noshow-text)]'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[var(--status-confirmed-text)] shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[var(--status-noshow-text)] shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Fechar notificação"
            className="p-0.5 rounded hover:bg-sunken text-ink-muted hover:text-ink-primary"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Faixa fina operacional do dia + Controles da Agenda */}
      <div className="bg-surface border border-border-subtle rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Esquerda: Título + 3 indicadores operacionais do dia */}
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-base font-semibold text-ink-primary">Agenda</h1>

          <div className="flex flex-wrap items-center gap-3 text-xs border-l border-border-subtle pl-4 tabular-nums">
            <span className="text-ink-secondary">
              Ocupação média: <strong className="text-ink-primary">{formatPercentBR(avgUtilization)}</strong>
            </span>
            <span className="text-ink-muted">·</span>
            <span className="text-ink-secondary">
              Taxa de faltas:{' '}
              <strong className="text-ink-primary">{formatPercentBR(kpis?.noShowRatePercent ?? 0)}</strong>
            </span>
            <span className="text-ink-muted">·</span>
            <span className="text-ink-secondary">
              Vagas em oferta: <strong className="text-ink-primary">{kpis?.activeWaitlistOffers ?? 0}</strong>
            </span>
          </div>
        </div>

        {/* Direita: Seletor de data (Hoje + setas), Zoom (− / Zoom 100% / +), Densidade e Status de atualização */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de data */}
          <div className="inline-flex items-center bg-canvas border border-border-subtle rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onDateChange(getTodayClinicIsoDate())}
              className="px-2.5 py-1 text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-sunken rounded-md transition"
              title="Ir para hoje"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => onDateChange(addDaysToIsoDate(selectedDate, -1))}
              aria-label="Dia anterior"
              title="Dia anterior (Alt + ←)"
              className="p-1 text-ink-secondary hover:text-ink-primary hover:bg-sunken rounded-md transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <label className="relative inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-ink-primary tabular-nums cursor-pointer">
              <Calendar className="w-3.5 h-3.5 text-brand" />
              <span>{formatDateBR(selectedDate)}</span>
              <input
                type="date"
                aria-label="Selecionar data da agenda"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) onDateChange(e.target.value);
                }}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={() => onDateChange(addDaysToIsoDate(selectedDate, 1))}
              aria-label="Próximo dia"
              title="Próximo dia (Alt + →)"
              className="p-1 text-ink-secondary hover:text-ink-primary hover:bg-sunken rounded-md transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Controle de Zoom (− / Zoom 100% / +) sem termos técnicos "px" */}
          <div
            role="group"
            aria-label="Escala de horário"
            className="hidden sm:inline-flex items-center gap-0.5 bg-canvas border border-border-subtle rounded-lg p-0.5 text-xs"
          >
            <button
              type="button"
              aria-label="Diminuir zoom"
              disabled={currentZoomIndex <= 0}
              onClick={() => {
                const prev = ZOOM_STEPS[Math.max(0, currentZoomIndex - 1)];
                if (prev) setHourWidthPx(prev.px);
              }}
              className="p-1 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-sunken disabled:opacity-40 transition"
              title="Diminuir zoom da grade"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setHourWidthPx(128)}
              className="px-2 py-0.5 rounded-md text-xs font-medium text-ink-primary tabular-nums hover:bg-sunken transition"
              title="Restaurar zoom padrão (100%)"
            >
              Zoom {currentZoomPercent}%
            </button>
            <button
              type="button"
              aria-label="Aumentar zoom"
              disabled={currentZoomIndex >= ZOOM_STEPS.length - 1}
              onClick={() => {
                const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, currentZoomIndex + 1)];
                if (next) setHourWidthPx(next.px);
              }}
              className="p-1 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-sunken disabled:opacity-40 transition"
              title="Aumentar zoom da grade"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Densidade com ícone (Confortável / Compacta) */}
          <button
            type="button"
            onClick={() => setDenseRows((v) => !v)}
            className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              denseRows
                ? 'bg-sunken text-ink-primary border-border-strong'
                : 'bg-canvas text-ink-secondary border-border-subtle hover:text-ink-primary'
            }`}
            title="Alternar altura das linhas"
          >
            <Rows3 className="w-3.5 h-3.5 text-ink-muted" />
            <span>{denseRows ? 'Compacta' : 'Confortável'}</span>
          </button>

          {/* Status de atualização automática */}
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-ink-secondary hover:text-ink-primary bg-canvas border border-border-subtle transition tabular-nums"
            title="Clique para sincronizar agora"
          >
            <RefreshCw className="w-3.5 h-3.5 text-ink-muted" />
            <span>
              {minutesAgo === 0 ? 'Atualizado há menos de 1 min' : `Atualizado há ${minutesAgo} min`}
            </span>
          </button>

          {onQuickSchedule && (
            <button
              type="button"
              onClick={() => onQuickSchedule()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white transition shadow-xs"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              Novo agendamento
            </button>
          )}
        </div>
      </div>

      {/* Legenda compacta e fixa + Chip curto de seleção à direita */}
      <div className="bg-surface border border-border-subtle rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-ink-secondary">
            <span className="w-3 h-3 rounded-xs bg-[var(--status-confirmed-bg)] border border-[var(--status-confirmed-border)] inline-block" />
            Confirmada
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink-secondary">
            <span className="w-3 h-3 rounded-xs bg-[var(--status-pending-bg)] border border-[var(--status-pending-border)] inline-block" />
            Aguardando sinal
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink-secondary">
            <span className="w-3 h-3 rounded-xs bg-[var(--status-checkedin-bg)] border border-[var(--status-checkedin-border)] inline-block" />
            Em atendimento
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink-secondary">
            <span className="w-4 h-3 rounded-xs bg-cleanup-stripes border border-[var(--cleanup-border)] inline-block" />
            Limpeza e esterilização
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink-secondary">
            <span className="w-3 h-3 rounded-xs bg-[var(--brand-subtle)] border border-dashed border-brand inline-block" />
            Vaga reservada para oferta
          </span>
        </div>

        <div className="text-xs text-ink-secondary flex items-center gap-1.5">
          {activeHighlightBooking ? (
            selectedBookingId ? (
              <button
                type="button"
                data-testid="active-selection-chip"
                onClick={handleCloseDrawer}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-tint text-brand-tint-text border border-brand/30 font-semibold tabular-nums hover:opacity-90 transition"
                title="Limpar seleção (Esc)"
              >
                <Link2 className="w-3 h-3 text-brand shrink-0" />
                <span>
                  {activeHighlightBooking.clientName} ·{' '}
                  {formatTimeBR(activeHighlightBooking.serviceStartAt)}
                </span>
                <X className="w-3 h-3 shrink-0" />
              </button>
            ) : (
              <span
                data-testid="active-selection-chip"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sunken text-ink-primary border border-border-subtle font-medium tabular-nums"
              >
                <Link2 className="w-3 h-3 text-brand shrink-0" />
                <span>
                  {activeHighlightBooking.clientName} ·{' '}
                  {formatTimeBR(activeHighlightBooking.serviceStartAt)}
                </span>
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 text-ink-secondary">
              <Link2 className="w-3.5 h-3.5 text-brand" />
              <span>Clique em uma reserva para ver detalhes ou editar</span>
            </span>
          )}
        </div>
      </div>

      {/* Visão Desktop / Tablet (>= 768px): Matriz Horizontal de Alocação */}
      <div className="hidden md:block bg-surface border border-border-subtle rounded-xl overflow-hidden shadow-xs">
        <div ref={scrollContainerRef} className="overflow-x-auto relative">
          <div style={{ minWidth: `${256 + totalGridWidthPx}px` }} className="relative">
            {/* Cabeçalho de Horas Sticky */}
            <div className="flex border-b border-border-subtle bg-canvas sticky top-0 z-20">
              <div className="w-64 shrink-0 px-4 py-2.5 text-xs font-semibold text-ink-primary border-r border-border-subtle bg-canvas sticky left-0 z-30 flex items-center justify-between">
                <span>Recursos</span>
                <span className="text-ink-muted font-normal">Horário local</span>
              </div>

              <div className="relative h-9 flex items-stretch" style={{ width: `${totalGridWidthPx}px` }}>
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{ width: `${hourWidthPx}px` }}
                    className="border-r border-grid-hour px-2 flex items-center text-xs font-medium text-ink-secondary tabular-nums shrink-0 relative"
                  >
                    <span>{String(h).padStart(2, '0')}:00</span>
                    {/* Subdivisões sutis de 15, 30 e 45 minutos no cabeçalho */}
                    <span className="absolute bottom-0 left-1/4 h-1.5 border-l border-grid-quarter" />
                    <span className="absolute bottom-0 left-2/4 h-2 border-l border-grid-half" />
                    <span className="absolute bottom-0 left-3/4 h-1.5 border-l border-grid-quarter" />
                  </div>
                ))}
              </div>
            </div>

            {/* Linha vertical de "Agora" */}
            {showNowLine && (
              <div
                aria-hidden="true"
                style={{ left: `${256 + nowLeftPx}px` }}
                className="absolute top-9 bottom-0 w-0.5 bg-brand z-15 pointer-events-none"
              >
                <span className="absolute -top-6 -left-6 px-1.5 py-0.5 rounded bg-[var(--btn-primary-bg)] text-white text-xs font-medium tabular-nums">
                  Agora
                </span>
              </div>
            )}

            {/* Raias agrupadas por tipo de recurso */}
            {(['SPECIALIST', 'ROOM', 'EQUIPMENT'] as const).map((category, categoryIdx) => {
              const groupRows = (timeline?.resources ?? []).filter(
                (r) => r.resource.category === category,
              );
              const meta = CATEGORY_LANE_META[category];
              const isCollapsed = Boolean(collapsedGroups[category]);

              return (
                <div key={category} className="border-b border-border-subtle last:border-b-0">
                  {/* Cabeçalho recolhível do grupo */}
                  <div className="flex bg-canvas border-b border-border-subtle relative z-15">
                    <button
                      type="button"
                      onClick={() => toggleGroup(category)}
                      className="w-64 shrink-0 px-3.5 py-2 text-left flex items-center justify-between border-r border-border-subtle bg-canvas sticky left-0 z-20 hover:bg-sunken transition"
                    >
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-ink-primary">
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-ink-muted transition-transform ${
                            isCollapsed ? '-rotate-90' : ''
                          }`}
                        />
                        {meta.icon}
                        <span>{meta.pluralLabel}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-sunken text-ink-secondary border border-border-subtle tabular-nums">
                        {groupRows.length}
                      </span>
                    </button>
                    <div style={{ width: `${totalGridWidthPx}px` }} className="bg-canvas/60" />
                  </div>

                  {/* Container das linhas do grupo (linha conectora vertical fica aqui dentro para nunca atravessar cabeçalhos de grupo) */}
                  {!isCollapsed && (
                    <div className="relative">
                      {connectorLeftPx !== null && groupRows.length > 0 && (
                        <div
                          aria-hidden="true"
                          data-testid={`connector-line-${category}`}
                          style={{ left: `${256 + connectorLeftPx}px` }}
                          className="absolute top-0 bottom-0 w-[1.5px] bg-brand z-[5] pointer-events-none"
                        />
                      )}

                      {groupRows.map(({ resource, allocations, waitlistOfferHolds }, rowIdx) => {
                        const primaryCap = resource.capabilities[0]
                          ? formatCapability(resource.capabilities[0])
                          : formatResourceCategory(resource.category);
                        const extraCapsCount = Math.max(0, resource.capabilities.length - 1);
                        const isCapPopoverOpen = capPopoverResourceId === resource.id;
                        const isTopRow = categoryIdx === 0 && rowIdx === 0;

                        return (
                          <div
                            key={resource.id}
                            className="flex border-b border-grid-row last:border-b-0 hover:bg-sunken/25 transition"
                          >
                            {/* Coluna fixa do Recurso (permite até 2 linhas para o nome + papel/categoria abaixo + popover +N) */}
                            <div
                              className={`w-64 shrink-0 px-3.5 ${rowHeightClass} border-r border-border-subtle bg-surface sticky left-0 z-20 flex items-center justify-between gap-2 relative`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start gap-2">
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 mt-1 ${meta.dotClass}`}
                                  />
                                  <span
                                    title={resource.name}
                                    className="text-xs font-medium text-ink-primary leading-tight line-clamp-2"
                                  >
                                    {resource.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 pl-4 text-[11px] text-ink-secondary truncate">
                                  <span>{formatResourceStatus(resource.status)}</span>
                                  <span>·</span>
                                  <span className="truncate">{primaryCap}</span>
                                </div>
                              </div>

                              {extraCapsCount > 0 && (
                                <div
                                  className="relative shrink-0"
                                  onMouseEnter={() => setCapPopoverResourceId(resource.id)}
                                  onMouseLeave={() => setCapPopoverResourceId(null)}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCapPopoverResourceId((prev) =>
                                        prev === resource.id ? null : resource.id,
                                      );
                                    }}
                                    onFocus={() => setCapPopoverResourceId(resource.id)}
                                    onBlur={() => setCapPopoverResourceId(null)}
                                    aria-label={`Ver todas as ${resource.capabilities.length} competências de ${resource.name}`}
                                    className="px-1.5 py-0.5 rounded text-xs font-medium bg-sunken hover:bg-border-subtle text-ink-secondary border border-border-subtle tabular-nums"
                                  >
                                    +{extraCapsCount}
                                  </button>

                                  {isCapPopoverOpen && (
                                    <div
                                      role="tooltip"
                                      className="absolute left-0 top-full mt-1 w-60 p-3 rounded-xl bg-elevated border border-border-strong shadow-xl z-40 space-y-1.5 pointer-events-none"
                                    >
                                      <div className="text-xs font-semibold text-ink-primary">
                                        Competências de {resource.name}
                                      </div>
                                      <div className="flex flex-wrap gap-1">
                                        {resource.capabilities.map((c) => (
                                          <span
                                            key={c}
                                            className="px-2 py-0.5 rounded bg-canvas border border-border-subtle text-xs text-ink-primary"
                                          >
                                            {formatCapability(c)}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Faixa de horários do recurso */}
                            <div
                              className={`relative ${rowHeightClass} bg-transparent`}
                              style={{ width: `${totalGridWidthPx}px` }}
                            >
                              {/* Células de hora + subdivisões sutis clicáveis para agendamento rápido */}
                              <div className="absolute inset-0 flex z-0">
                                {HOURS.map((h) => (
                                  <button
                                    key={h}
                                    type="button"
                                    onClick={() => {
                                      if (isDrawerOpen) {
                                        handleCloseDrawer();
                                      }
                                      onQuickSchedule?.({ resourceId: resource.id, hour: h });
                                    }}
                                    title={`Agendar às ${String(h).padStart(2, '0')}:00 (${resource.name})`}
                                    aria-label={`Agendar às ${String(h).padStart(2, '0')}:00 em ${resource.name}`}
                                    className="h-full border-r border-grid-hour hover:bg-brand-subtle/35 transition relative group shrink-0"
                                    style={{ width: `${hourWidthPx}px` }}
                                  >
                                    <span className="absolute inset-y-0 left-1/4 border-l border-grid-quarter pointer-events-none" />
                                    <span className="absolute inset-y-0 left-2/4 border-l border-grid-half pointer-events-none" />
                                    <span className="absolute inset-y-0 left-3/4 border-l border-grid-quarter pointer-events-none" />
                                  </button>
                                ))}
                              </div>

                              {/* Alocações de reservas + Buffer de limpeza */}
                              {allocations.map((alloc) => {
                                const cleanClient = cleanPersonName(alloc.clientName);
                                const serviceLeftPx = minutesToLeftPx(alloc.serviceStartAt);
                                const rawServiceWidthPx = durationToWidthPx(
                                  alloc.serviceStartAt,
                                  alloc.serviceEndAt,
                                );
                                // Largura mínima de 72px para que o nome do paciente apareça sempre primeiro
                                const serviceWidthPx = Math.max(72, rawServiceWidthPx);

                                const hasCleanup = alloc.cleanupMinutes > 0;
                                const rawCleanupLeftPx = minutesToLeftPx(alloc.serviceEndAt);
                                const cleanupLeftPx = Math.max(
                                  rawCleanupLeftPx,
                                  serviceLeftPx + serviceWidthPx,
                                );
                                const cleanupWidthPx = hasCleanup
                                  ? durationToWidthPx(alloc.serviceEndAt, alloc.effectiveEndAt)
                                  : 0;

                                const startLabel = formatTimeBR(alloc.serviceStartAt);
                                const endLabel = formatTimeBR(alloc.serviceEndAt);
                                const effEndLabel = formatTimeBR(alloc.effectiveEndAt);
                                const statusStyle = getBookingStatusStyle(alloc.bookingStatus);

                                const isSelected = selectedBookingId === alloc.bookingId;
                                const isHovered = hoveredBookingId === alloc.bookingId;
                                const isHighlighted = isSelected || isHovered;
                                const isDimmed =
                                  activeHighlightBookingId !== null &&
                                  activeHighlightBookingId !== alloc.bookingId;

                                const popoverKey = `${alloc.bookingId}-${resource.id}`;
                                const isPopoverOpen =
                                  activePopoverKey === popoverKey && !isSelected;
                                const linkedBooking = bookingAllocationsIndex.get(alloc.bookingId);

                                const patientLabel = formatBlockPatientLabel(
                                  cleanClient,
                                  serviceWidthPx,
                                );
                                const isWideForProcedure = serviceWidthPx >= 145;
                                const isNearRightEdge =
                                  serviceLeftPx > totalGridWidthPx - 340;

                                return (
                                  <React.Fragment key={popoverKey}>
                                    {/* Bloco Interativo de Atendimento (<button> focável, clicável e acessível) */}
                                    <button
                                      ref={(el) => {
                                        blockButtonRefs.current[popoverKey] = el;
                                      }}
                                      type="button"
                                      data-testid={`booking-block-${alloc.bookingId}-${resource.id}`}
                                      data-booking-block="true"
                                      data-booking-id={alloc.bookingId}
                                      data-resource-id={resource.id}
                                      aria-pressed={isSelected}
                                      aria-label={`${cleanClient}, ${alloc.procedureName}, ${startLabel} a ${endLabel}, ${formatBookingStatus(alloc.bookingStatus)}, ${resource.name}`}
                                      style={{
                                        left: `${serviceLeftPx}px`,
                                        width: `${serviceWidthPx}px`,
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectBooking(
                                          alloc.bookingId,
                                          resource.id,
                                          e.currentTarget,
                                        );
                                      }}
                                      onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setContextMenu({
                                          x: Math.min(e.clientX, window.innerWidth - 270),
                                          y: Math.min(e.clientY, window.innerHeight - 320),
                                          bookingId: alloc.bookingId,
                                          clientName: cleanClient,
                                          procedureName: alloc.procedureName,
                                          bookingStatus: alloc.bookingStatus,
                                          serviceStartAt: alloc.serviceStartAt,
                                          serviceEndAt: alloc.serviceEndAt,
                                          resourceId: resource.id,
                                        });
                                      }}
                                      onKeyDown={(e) => handleBlockKeyDown(e, popoverKey)}
                                      onMouseEnter={() =>
                                        handleBlockMouseEnter(alloc.bookingId, popoverKey)
                                      }
                                      onMouseLeave={handleBlockMouseLeave}
                                      onFocus={() => {
                                        setHoveredBookingId(alloc.bookingId);
                                      }}
                                      onBlur={() => {
                                        setHoveredBookingId(null);
                                        setActivePopoverKey(null);
                                      }}
                                      className={`group absolute top-1.5 bottom-1.5 min-w-[72px] ${
                                        hasCleanup && rawCleanupLeftPx >= serviceLeftPx + serviceWidthPx
                                          ? 'rounded-l-md'
                                          : 'rounded-md'
                                      } border px-1.5 flex flex-col justify-center text-left cursor-pointer transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-surface ${
                                        statusStyle.blockClass
                                      } ${
                                        isPopoverOpen
                                          ? 'ring-2 ring-brand/80 shadow-md z-50 scale-[1.01]'
                                          : isSelected
                                          ? 'ring-2 ring-brand shadow-lg z-30 scale-[1.01]'
                                          : isHovered
                                          ? 'ring-2 ring-brand/80 shadow-md z-20 scale-[1.01]'
                                          : isDimmed
                                          ? 'opacity-60 z-10'
                                          : 'z-10 shadow-2xs'
                                      }`}
                                    >
                                      {/* Nome do paciente SEMPRE primeiro (com trigger de ações rápidas no hover) */}
                                      <div className="flex items-center justify-between gap-1 min-w-0 w-full">
                                        <div className="flex items-center gap-1 min-w-0 flex-1">
                                          {serviceWidthPx >= 115 && statusStyle.icon}
                                          <span className="text-[11px] sm:text-xs font-semibold truncate">
                                            {patientLabel}
                                          </span>
                                        </div>
                                        {!isSpecialistReadOnly && (
                                          <span
                                            role="button"
                                            tabIndex={-1}
                                            data-testid={`quick-action-trigger-${alloc.bookingId}`}
                                            title="Ações rápidas da reserva"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              e.preventDefault();
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              setContextMenu({
                                                x: Math.min(rect.right, window.innerWidth - 270),
                                                y: Math.min(rect.bottom + 4, window.innerHeight - 320),
                                                bookingId: alloc.bookingId,
                                                clientName: cleanClient,
                                                procedureName: alloc.procedureName,
                                                bookingStatus: alloc.bookingStatus,
                                                serviceStartAt: alloc.serviceStartAt,
                                                serviceEndAt: alloc.serviceEndAt,
                                                resourceId: resource.id,
                                              });
                                            }}
                                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-black/15 dark:hover:bg-white/20 text-current transition shrink-0"
                                          >
                                            <MoreVertical className="w-3 h-3" />
                                          </span>
                                        )}
                                      </div>

                                      {/* Horário em segundo lugar (e procedimento quando largo) */}
                                      {!denseRows && (
                                        <div className="text-[11px] opacity-90 tabular-nums truncate w-full">
                                          {isWideForProcedure
                                            ? `${startLabel}–${endLabel} · ${alloc.procedureName}`
                                            : `${startLabel}–${endLabel}`}
                                        </div>
                                      )}

                                      {/* Hover Card de Prévia (280–340px, delay 150ms, sem truncar texto, pointer-events: none, sem cobrir cabeçalho de horas) */}
                                      {isPopoverOpen && (
                                        <div
                                          role="tooltip"
                                          data-testid="booking-hover-card"
                                          className={`absolute ${
                                            isNearRightEdge ? 'right-0' : 'left-0'
                                          } ${
                                            isTopRow ? 'top-full mt-2' : 'bottom-full mb-2'
                                          } w-[320px] p-3.5 rounded-xl bg-elevated border border-border-strong shadow-2xl z-50 text-left space-y-2.5 pointer-events-none whitespace-normal break-words`}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <div className="text-xs font-bold text-ink-primary">
                                                {cleanClient}
                                              </div>
                                              <div className="text-xs text-ink-secondary mt-0.5 leading-snug">
                                                {alloc.procedureName}
                                              </div>
                                            </div>
                                            <span
                                              className={`px-2 py-0.5 text-xs font-medium rounded border shrink-0 ${statusStyle.badgeClass}`}
                                            >
                                              {formatBookingStatus(alloc.bookingStatus)}
                                            </span>
                                          </div>

                                          <div className="text-xs text-ink-secondary tabular-nums space-y-1 border-t border-border-subtle pt-2">
                                            <div>
                                              Atendimento:{' '}
                                              <strong className="text-ink-primary">
                                                {startLabel} às {endLabel}
                                              </strong>
                                            </div>
                                            {hasCleanup && (
                                              <div className="text-ink-secondary">
                                                Limpeza e esterilização:{' '}
                                                <strong className="text-ink-primary">
                                                  +{alloc.cleanupMinutes} min
                                                </strong>{' '}
                                                (até {effEndLabel})
                                              </div>
                                            )}
                                          </div>

                                          {linkedBooking && linkedBooking.resources.length > 0 && (
                                            <div className="border-t border-border-subtle pt-2 space-y-1">
                                              <div className="text-xs font-medium text-brand flex items-center gap-1">
                                                <Link2 className="w-3 h-3 shrink-0" />
                                                <span>Recursos reservados juntos:</span>
                                              </div>
                                              {linkedBooking.resources.map((lr) => (
                                                <div
                                                  key={lr.id}
                                                  className="text-xs text-ink-secondary flex items-start justify-between gap-2"
                                                >
                                                  <span className="leading-snug">
                                                    {formatResourceCategory(lr.category)}: {lr.name}
                                                  </span>
                                                  {lr.cleanupMinutes > 0 && (
                                                    <span className="text-ink-muted tabular-nums shrink-0">
                                                      +{lr.cleanupMinutes} min limpeza
                                                    </span>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          <div className="border-t border-border-subtle pt-1.5 text-[11px] font-medium text-brand">
                                            Clique para abrir detalhes e ações da reserva
                                          </div>
                                        </div>
                                      )}
                                    </button>

                                    {/* Bloco de Limpeza e Esterilização (hachura neutra, clicável para abrir a mesma reserva) */}
                                    {hasCleanup && (
                                      <div
                                        style={{
                                          left: `${cleanupLeftPx}px`,
                                          width: `${cleanupWidthPx}px`,
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSelectBooking(alloc.bookingId, resource.id);
                                        }}
                                        onMouseEnter={() => setHoveredBookingId(alloc.bookingId)}
                                        onMouseLeave={() => setHoveredBookingId(null)}
                                        title={`Limpeza ${alloc.cleanupMinutes} min (até ${effEndLabel}) — clique para ver a reserva de ${cleanClient}`}
                                        className={`absolute top-1.5 bottom-1.5 rounded-r-md bg-cleanup-stripes border border-l-0 border-[var(--cleanup-border)] px-1.5 flex items-center justify-center cursor-pointer transition-opacity ${
                                          isHighlighted
                                            ? 'ring-1 ring-brand z-20'
                                            : isDimmed
                                            ? 'opacity-60 z-10'
                                            : 'z-10'
                                        }`}
                                      >
                                        {cleanupWidthPx >= 48 && (
                                          <span className="text-xs text-ink-secondary tabular-nums truncate">
                                            Limpeza {alloc.cleanupMinutes} min
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </React.Fragment>
                                );
                              })}

                              {/* Vagas reservadas para oferta ativa da lista de espera (clicáveis para abrir o Drawer da Oferta) */}
                              {waitlistOfferHolds.map((hold) => {
                                const leftPx = minutesToLeftPx(hold.offeredStartAt);
                                const widthPx = Math.max(
                                  72,
                                  durationToWidthPx(hold.offeredStartAt, hold.offeredEndAt),
                                );
                                const cleanHoldClient = cleanPersonName(hold.clientName);
                                const isHoldSelected =
                                  selectedOfferHold?.waitlistEntryId === hold.waitlistEntryId;

                                return (
                                  <button
                                    key={hold.waitlistEntryId}
                                    type="button"
                                    data-testid={`offer-hold-block-${hold.waitlistEntryId}`}
                                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectOfferHold(
                                        {
                                          waitlistEntryId: hold.waitlistEntryId,
                                          clientName: cleanHoldClient,
                                          offeredStartAt: hold.offeredStartAt,
                                          offeredEndAt: hold.offeredEndAt,
                                          expiresAt: hold.expiresAt,
                                          resourceId: resource.id,
                                          resourceName: resource.name,
                                        },
                                        e.currentTarget,
                                      );
                                    }}
                                    aria-label={`Vaga reservada para oferta de ${cleanHoldClient}, ${formatTimeBR(hold.offeredStartAt)} a ${formatTimeBR(hold.offeredEndAt)}, expira às ${formatTimeBR(hold.expiresAt)}`}
                                    title={`Vaga reservada para oferta: ${cleanHoldClient} (expira às ${formatTimeBR(hold.expiresAt)})`}
                                    className={`absolute top-1.5 bottom-1.5 min-w-[72px] rounded-md bg-[var(--brand-subtle)] border border-dashed border-brand px-2 flex items-center text-left cursor-pointer z-20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                                      isHoldSelected ? 'ring-2 ring-brand shadow-md z-30' : ''
                                    }`}
                                  >
                                    <span className="text-xs font-medium text-brand truncate">
                                      Oferta: {cleanHoldClient}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Visão Mobile e Tablet Estreito (< 768px): Linha do Tempo Vertical por Horário com alvos >= 44px */}
      <div className="md:hidden space-y-3">
        <div className="text-xs font-semibold text-ink-secondary px-1">
          Atendimentos do dia ({formatDateBR(selectedDate)})
        </div>
        {allBookingsList.length === 0 ? (
          <div className="bg-surface border border-border-subtle rounded-xl p-5 text-xs text-ink-secondary text-center">
            Nenhum atendimento alocado para esta data.
          </div>
        ) : (
          allBookingsList.map((b) => {
            const style = getBookingStatusStyle(b.bookingStatus);
            const isSelected = selectedBookingId === b.bookingId;
            return (
              <button
                key={b.bookingId}
                type="button"
                data-testid={`mobile-booking-block-${b.bookingId}`}
                onClick={(e) => handleSelectBooking(b.bookingId, b.resources[0]?.id ?? null, e.currentTarget)}
                aria-label={`${b.clientName}, ${b.procedureName}, ${formatTimeBR(b.serviceStartAt)} a ${formatTimeBR(b.serviceEndAt)}, ${formatBookingStatus(b.bookingStatus)}`}
                className={`w-full min-h-[44px] text-left bg-surface border rounded-xl p-4 space-y-2.5 shadow-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  isSelected
                    ? 'border-brand ring-2 ring-brand/40'
                    : 'border-border-subtle hover:border-border-strong'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-ink-primary">{b.clientName}</div>
                    <div className="text-xs font-bold text-brand tabular-nums mt-0.5">
                      {formatTimeBR(b.serviceStartAt)} – {formatTimeBR(b.serviceEndAt)}
                    </div>
                    <div className="text-xs text-ink-secondary mt-0.5">{b.procedureName}</div>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded border ${style.badgeClass}`}>
                    {formatBookingStatus(b.bookingStatus)}
                  </span>
                </div>

                <div className="border-t border-border-subtle pt-2 space-y-1">
                  {b.resources.map((r) => (
                    <div
                      key={r.id}
                      className="text-xs text-ink-secondary flex items-center justify-between"
                    >
                      <span>
                        {formatResourceCategory(r.category)}: {r.name}
                      </span>
                      {r.cleanupMinutes > 0 && (
                        <span className="text-ink-muted tabular-nums">
                          Limpeza {r.cleanupMinutes} min
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Drawer Lateral Compartilhado de Detalhes da Reserva (e Bottom Sheet em 390px) */}
      <BookingDetailsDrawer
        open={isDrawerOpen}
        bookingId={selectedBookingId}
        focusedResourceId={selectedResourceId}
        bookings={bookings}
        fallbackBooking={selectedBookingFallback}
        procedures={procedures}
        resourcesCatalog={resourcesCatalog}
        auditLogs={auditLogs}
        role={role}
        token={token}
        workspaceId={workspaceId}
        onClose={handleCloseDrawer}
        onOptimisticStatusUpdate={onOptimisticStatusUpdate}
        onRefresh={onRefresh}
        onToast={showToast}
        onCancelAndRecreate={(prefill) => {
          handleCloseDrawer();
          onQuickSchedule?.({
            procedureId: prefill.procedureId,
            clientName: prefill.clientName,
            clientEmail: prefill.clientEmail,
            hour: prefill.hour,
          });
        }}
        offerHold={selectedOfferHold}
        waitlistEntries={waitlist}
        onNavigateToWaitlist={onNavigateToWaitlist}
        onPauseAutoRefresh={onPauseAutoRefresh}
      />

      {/* Menu de Contexto Flutuante de Alta Eficiência na Agenda */}
      {contextMenu && (
        <div
          role="menu"
          data-testid="grid-context-menu"
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-64 bg-elevated border border-border-strong rounded-xl shadow-2xl p-1.5 space-y-1 text-xs animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-2 border-b border-border-subtle">
            <div className="font-semibold text-ink-primary truncate">
              {contextMenu.clientName}
            </div>
            <div className="text-[11px] text-ink-secondary truncate">
              {contextMenu.procedureName}
            </div>
            <div className="text-[10px] text-ink-muted mt-0.5 tabular-nums">
              {formatTimeBR(contextMenu.serviceStartAt)} – {formatTimeBR(contextMenu.serviceEndAt)}
            </div>
          </div>

          {/* Ações contextuais de ciclo de vida */}
          {contextMenu.bookingStatus === 'CONFIRMED' && (
            <button
              type="button"
              role="menuitem"
              data-testid="context-menu-checkin"
              onClick={() => executeQuickAction(contextMenu.bookingId, 'check-in', contextMenu.clientName)}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-sunken text-ink-primary font-medium flex items-center gap-2 text-xs transition"
            >
              <UserCheck className="w-3.5 h-3.5 text-brand shrink-0" />
              <span>Registrar chegada (Check-in)</span>
            </button>
          )}

          {contextMenu.bookingStatus === 'CHECKED_IN' && (
            <button
              type="button"
              role="menuitem"
              data-testid="context-menu-complete"
              onClick={() => executeQuickAction(contextMenu.bookingId, 'complete', contextMenu.clientName)}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-sunken text-ink-primary font-medium flex items-center gap-2 text-xs transition"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Concluir atendimento</span>
            </button>
          )}

          {contextMenu.bookingStatus === 'PENDING_DEPOSIT' && (
            <button
              type="button"
              role="menuitem"
              data-testid="context-menu-confirm-deposit"
              onClick={() => executeQuickAction(contextMenu.bookingId, 'confirm-deposit', contextMenu.clientName)}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-sunken text-ink-primary font-medium flex items-center gap-2 text-xs transition"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-brand shrink-0" />
              <span>Confirmar sinal recebido</span>
            </button>
          )}

          {/* Reagendar */}
          {(contextMenu.bookingStatus === 'CONFIRMED' || contextMenu.bookingStatus === 'PENDING_DEPOSIT') && (
            <button
              type="button"
              role="menuitem"
              data-testid="context-menu-reschedule"
              onClick={() => {
                const target = {
                  id: contextMenu.bookingId,
                  clientName: contextMenu.clientName,
                  procedureName: contextMenu.procedureName,
                  serviceStartAt: contextMenu.serviceStartAt,
                  serviceEndAt: contextMenu.serviceEndAt,
                };
                setContextMenu(null);
                setRescheduleTargetBooking(target);
              }}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-sunken text-ink-primary font-medium flex items-center gap-2 text-xs transition"
            >
              <Calendar className="w-3.5 h-3.5 text-brand shrink-0" />
              <span>Reagendar horário...</span>
            </button>
          )}

          {/* Registrar falta */}
          {(contextMenu.bookingStatus === 'CONFIRMED' || contextMenu.bookingStatus === 'PENDING_DEPOSIT' || contextMenu.bookingStatus === 'CHECKED_IN') && (
            <button
              type="button"
              role="menuitem"
              data-testid="context-menu-noshow"
              onClick={() => {
                setNoShowConfirmTarget({
                  bookingId: contextMenu.bookingId,
                  clientName: contextMenu.clientName,
                });
                setContextMenu(null);
              }}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-sunken text-[var(--status-noshow-text)] font-semibold flex items-center gap-2 text-xs transition"
            >
              <UserX className="w-3.5 h-3.5 text-[var(--status-noshow-text)] shrink-0" />
              <span>Registrar falta (No-Show)</span>
            </button>
          )}

          <div className="border-t border-border-subtle my-1" />

          {/* Ver detalhes completos */}
          <button
            type="button"
            role="menuitem"
            data-testid="context-menu-view-details"
            onClick={() => {
              handleSelectBooking(contextMenu.bookingId, contextMenu.resourceId);
              setContextMenu(null);
            }}
            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-sunken text-ink-secondary hover:text-ink-primary font-medium flex items-center gap-2 text-xs transition"
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Ver detalhes completos</span>
          </button>
        </div>
      )}

      {/* Diálogo de Confirmação Rápida de Falta com retenção de sinal */}
      {noShowConfirmTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setNoShowConfirmTarget(null)}
        >
          <div
            role="alertdialog"
            data-testid="grid-noshow-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-surface border border-border-strong shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2 text-[var(--status-noshow-text)] font-semibold text-base">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Registrar falta do paciente</span>
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Tem certeza que deseja registrar a falta de <strong>{noShowConfirmTarget.clientName}</strong>?
              O paciente será marcado como <strong>Não compareceu</strong> e o sinal será retido conforme as regras.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNoShowConfirmTarget(null)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-surface hover:bg-sunken border border-border-subtle text-xs text-ink-primary font-medium transition"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={actionExecutingId !== null}
                data-testid="grid-confirm-noshow-btn"
                onClick={() => executeQuickAction(noShowConfirmTarget.bookingId, 'no-show', noShowConfirmTarget.clientName)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--status-error-border)] hover:opacity-90 text-xs text-white font-semibold flex items-center gap-1.5 shadow-xs transition"
              >
                {actionExecutingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Confirmar falta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reagendamento acionado diretamente da grade */}
      {rescheduleTargetBooking && (
        <RescheduleModal
          open={true}
          booking={rescheduleTargetBooking}
          procedures={procedures}
          token={token}
          workspaceId={workspaceId}
          onClose={() => setRescheduleTargetBooking(null)}
          onSuccess={(updated) => {
            onOptimisticStatusUpdate?.(updated.id, updated.status, updated);
            showToast(`Reserva de ${rescheduleTargetBooking.clientName} reagendada com sucesso!`, 'success');
            void onRefresh();
            setRescheduleTargetBooking(null);
          }}
          onToast={showToast}
        />
      )}
    </div>
  );
};
