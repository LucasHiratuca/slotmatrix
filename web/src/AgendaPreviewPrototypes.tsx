import React, { useMemo, useState } from 'react';
import {
  BookingDto,
  KpiSummaryDto,
  ServiceProcedureDto,
  TimelineMatrixResponse,
} from './api';
import {
  addDaysToIsoDate,
  cleanPersonName,
  formatBookingStatus,
  formatCapability,
  formatCurrencyBRL,
  formatDateBR,
  formatPercentBR,
  formatTimeBR,
  getClinicMinutesFromMidnight,
  getTodayClinicIsoDate,
  RESOURCE_CATEGORY_PLURAL_LABELS,
} from './labels';
import { Avatar, BookingStatusBadge, ResourceTile } from './ui/Primitives';
import {
  AlertCircle,
  Box,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Layers,
  Link2,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Rows3,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';

export type AgendaPreviewVariant = 'a' | 'b' | 'c';

interface Props {
  variant: AgendaPreviewVariant;
  onChangeVariant: (v: AgendaPreviewVariant) => void;
  timeline: TimelineMatrixResponse | null;
  bookings: BookingDto[];
  procedures: ServiceProcedureDto[];
  kpis: KpiSummaryDto | null;
  selectedDate: string;
  onDateChange: (d: string) => void;
  onRefresh: () => Promise<void>;
  onQuickSchedule?: (opts?: { resourceId?: string; hour?: number }) => void;
}

const START_HOUR = 7;
const END_HOUR = 20;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const BUSINESS_START = 8;
const BUSINESS_END = 18;

const ZOOM_STEPS = [
  { scale: 114, label: '85%' },
  { scale: 138, label: '100%' },
  { scale: 168, label: '120%' },
] as const;

function shortResourceLabel(name: string): string {
  if (name.includes('Camila')) return 'Dra. Camila';
  if (name.includes('Eduardo')) return 'Dr. Eduardo';
  if (name.includes('Estéril 01')) return 'Sala Estéril 01';
  if (name.includes('Avançada 02')) return 'Sala Imagem 02';
  if (name.includes('Logiq')) return 'USG GE #01';
  if (name.includes('Biolitec')) return 'Laser #02';
  return name.split('(')[0].trim();
}

function compactPatientName(fullName: string, widthPx: number): string {
  if (widthPx >= 118) return fullName;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

const CATEGORY_META: Record<
  'SPECIALIST' | 'ROOM' | 'EQUIPMENT',
  {
    pluralLabel: string;
    singularLabel: string;
    icon: React.ReactNode;
    accentText: string;
    barColor: string;
    pillBg: string;
  }
> = {
  SPECIALIST: {
    pluralLabel: RESOURCE_CATEGORY_PLURAL_LABELS.SPECIALIST,
    singularLabel: 'Especialista',
    icon: <Stethoscope className="w-3.5 h-3.5 text-[var(--res-specialist-text)] shrink-0" />,
    accentText: 'text-[var(--res-specialist-text)]',
    barColor: 'bg-[var(--res-specialist-bar)]',
    pillBg: 'bg-[var(--res-specialist-bg)] border-[var(--res-specialist-border)] text-[var(--res-specialist-text)]',
  },
  ROOM: {
    pluralLabel: RESOURCE_CATEGORY_PLURAL_LABELS.ROOM,
    singularLabel: 'Sala',
    icon: <Box className="w-3.5 h-3.5 text-[var(--res-room-text)] shrink-0" />,
    accentText: 'text-[var(--res-room-text)]',
    barColor: 'bg-[var(--res-room-bar)]',
    pillBg: 'bg-[var(--res-room-bg)] border-[var(--res-room-border)] text-[var(--res-room-text)]',
  },
  EQUIPMENT: {
    pluralLabel: RESOURCE_CATEGORY_PLURAL_LABELS.EQUIPMENT,
    singularLabel: 'Equipamento',
    icon: <Wrench className="w-3.5 h-3.5 text-[var(--res-equipment-text)] shrink-0" />,
    accentText: 'text-[var(--res-equipment-text)]',
    barColor: 'bg-[var(--res-equipment-bar)]',
    pillBg: 'bg-[var(--res-equipment-bg)] border-[var(--res-equipment-border)] text-[var(--res-equipment-text)]',
  },
};

function getBlockStatusVisual(status: string) {
  switch (status) {
    case 'CONFIRMED':
      return {
        blockClass:
          'bg-[var(--status-confirmed-bg)] border-[var(--status-confirmed-border)] text-[var(--status-confirmed-text)]',
        accentBar: 'bg-[var(--status-confirmed-dot)]',
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-confirmed-text)] shrink-0" />,
      };
    case 'PENDING_DEPOSIT':
      return {
        blockClass:
          'bg-[var(--status-pending-bg)] border-[var(--status-pending-border)] text-[var(--status-pending-text)]',
        accentBar: 'bg-[var(--status-pending-dot)]',
        icon: <Clock className="w-3.5 h-3.5 text-[var(--status-pending-text)] shrink-0" />,
      };
    case 'CHECKED_IN':
      return {
        blockClass:
          'bg-[var(--status-checkedin-bg)] border-[var(--status-checkedin-border)] text-[var(--status-checkedin-text)]',
        accentBar: 'bg-[var(--status-checkedin-dot)]',
        icon: <UserCheck className="w-3.5 h-3.5 text-[var(--status-checkedin-text)] shrink-0" />,
      };
    case 'NO_SHOW':
      return {
        blockClass:
          'bg-[var(--status-noshow-bg)] border-[var(--status-noshow-border)] text-[var(--status-noshow-text)]',
        accentBar: 'bg-[var(--status-noshow-dot)]',
        icon: <AlertCircle className="w-3.5 h-3.5 text-[var(--status-noshow-text)] shrink-0" />,
      };
    default:
      return {
        blockClass:
          'bg-[var(--status-completed-bg)] border-[var(--status-completed-border)] text-[var(--status-completed-text)]',
        accentBar: 'bg-[var(--status-completed-dot)]',
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-completed-text)] shrink-0" />,
      };
  }
}

export const AgendaPreviewPrototypes: React.FC<Props> = ({
  variant,
  onChangeVariant,
  timeline,
  bookings,
  procedures,
  kpis,
  selectedDate,
  onDateChange,
  onRefresh,
  onQuickSchedule,
}) => {
  const [zoomIndex, setZoomIndex] = useState<number>(variant === 'b' ? 0 : 1);
  const [denseMode, setDenseMode] = useState<boolean>(false);
  const [legendOpen, setLegendOpen] = useState<boolean>(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [categoryFilterC, setCategoryFilterC] = useState<'ALL' | 'SPECIALIST' | 'ROOM' | 'EQUIPMENT'>('ALL');
  const [isolatedBookingIdC, setIsolatedBookingIdC] = useState<string | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  const hourWidthPx = ZOOM_STEPS[zoomIndex].scale;
  const totalGridMinutes = (END_HOUR - START_HOUR) * 60;
  const totalGridWidthPx = HOURS.length * hourWidthPx;

  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Posicionar o início da visão em 08:00 (horário comercial)
    el.scrollLeft = Math.max(0, hourWidthPx - 12);
  }, [hourWidthPx, variant]);

  // Indexar todas as reservas do dia com suas 3 raias vinculadas
  const bookingMap = useMemo(() => {
    const map = new Map<
      string,
      {
        bookingId: string;
        clientName: string;
        procedureName: string;
        bookingStatus: string;
        serviceStartAt: string;
        serviceEndAt: string;
        depositRequiredCents: number;
        depositPaid: boolean;
        resources: {
          id: string;
          name: string;
          category: 'SPECIALIST' | 'ROOM' | 'EQUIPMENT';
          cleanupMinutes: number;
          releaseAt: string;
        }[];
      }
    >();

    for (const row of timeline?.resources ?? []) {
      for (const alloc of row.allocations) {
        const cleanName = cleanPersonName(alloc.clientName);
        const fullBooking = bookings.find((b) => b.id === alloc.bookingId);
        const proc = procedures.find((p) => p.name === alloc.procedureName);
        const depositCents = fullBooking?.depositCents ?? proc?.depositCents ?? 20000;

        const existing = map.get(alloc.bookingId);
        if (existing) {
          existing.resources.push({
            id: row.resource.id,
            name: row.resource.name,
            category: row.resource.category,
            cleanupMinutes: alloc.cleanupMinutes,
            releaseAt: alloc.effectiveEndAt,
          });
        } else {
          map.set(alloc.bookingId, {
            bookingId: alloc.bookingId,
            clientName: cleanName,
            procedureName: alloc.procedureName,
            bookingStatus: alloc.bookingStatus,
            serviceStartAt: alloc.serviceStartAt,
            serviceEndAt: alloc.serviceEndAt,
            depositRequiredCents: depositCents,
            depositPaid:
              fullBooking?.status !== 'PENDING_DEPOSIT' &&
              alloc.bookingStatus !== 'PENDING_DEPOSIT',
            resources: [
              {
                id: row.resource.id,
                name: row.resource.name,
                category: row.resource.category,
                cleanupMinutes: alloc.cleanupMinutes,
                releaseAt: alloc.effectiveEndAt,
              },
            ],
          });
        }
      }
    }
    return map;
  }, [timeline, bookings, procedures]);

  const sortedBookings = useMemo(
    () =>
      [...bookingMap.values()].sort(
        (a, b) => new Date(a.serviceStartAt).getTime() - new Date(b.serviceStartAt).getTime(),
      ),
    [bookingMap],
  );

  // Selecionar por padrão a primeira reserva para demonstrar o conector vertical nas 3 raias + drawer/inspector
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [hoveredBookingId, setHoveredBookingId] = useState<string | null>(null);
  const [drawerClosedManually, setDrawerClosedManually] = useState<boolean>(false);

  const effectiveSelectedId =
    selectedBookingId ?? (sortedBookings.length > 0 ? sortedBookings[0].bookingId : null);
  const activeBookingId = hoveredBookingId ?? effectiveSelectedId;
  const activeBooking = activeBookingId ? bookingMap.get(activeBookingId) ?? null : null;
  const drawerBooking = effectiveSelectedId ? bookingMap.get(effectiveSelectedId) ?? null : null;

  const minutesToLeftPx = (iso: string): number => {
    const min = getClinicMinutesFromMidnight(iso);
    const offsetMin = Math.max(0, Math.min(totalGridMinutes, min - START_HOUR * 60));
    return (offsetMin / 60) * hourWidthPx;
  };

  const durationToWidthPx = (startIso: string, endIso: string): number => {
    const diffMin = Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
    return Math.max(16, (diffMin / 60) * hourWidthPx);
  };

  const avgUtilization = useMemo(() => {
    if (!kpis?.utilizationByCategory) return 36.1;
    const vals = [
      kpis.utilizationByCategory.SPECIALIST?.utilizationPercent ?? 0,
      kpis.utilizationByCategory.ROOM?.utilizationPercent ?? 0,
      kpis.utilizationByCategory.EQUIPMENT?.utilizationPercent ?? 0,
    ];
    return Math.round(((vals[0] + vals[1] + vals[2]) / 3) * 10) / 10;
  }, [kpis]);

  // Calcular uso do dia por recurso individual (em minutos e % sobre 10h comerciais = 600min)
  const resourceDailyUsage = useMemo(() => {
    const usage = new Map<string, { totalMin: number; pct: number; label: string }>();
    for (const row of timeline?.resources ?? []) {
      let totalMin = 0;
      for (const alloc of row.allocations) {
        const start = new Date(alloc.serviceStartAt).getTime();
        const end = new Date(alloc.effectiveEndAt || alloc.serviceEndAt).getTime();
        totalMin += Math.max(0, Math.round((end - start) / 60000));
      }
      const pct = Math.min(100, Math.round((totalMin / 480) * 100));
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      const label = totalMin === 0 ? 'Livre hoje' : h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m} min`;
      usage.set(row.resource.id, { totalMin, pct, label });
    }
    return usage;
  }, [timeline]);

  const connectorLeftPx = activeBooking
    ? minutesToLeftPx(activeBooking.serviceStartAt) + 18
    : null;

  const isDrawerOpenInA = variant === 'a' && drawerBooking && !drawerClosedManually;

  // Filtragem de recursos para a Proposta C
  const visibleResourcesByCategory = (cat: 'SPECIALIST' | 'ROOM' | 'EQUIPMENT') => {
    if (variant === 'c' && categoryFilterC !== 'ALL' && categoryFilterC !== cat) {
      return [];
    }
    const rows = (timeline?.resources ?? []).filter((r) => r.resource.category === cat);
    if (variant === 'c' && isolatedBookingIdC) {
      const target = bookingMap.get(isolatedBookingIdC);
      if (target) {
        const ids = new Set(target.resources.map((r) => r.id));
        return rows.filter((r) => ids.has(r.resource.id));
      }
    }
    return rows;
  };

  return (
    <div className="flex flex-col gap-3 min-h-[calc(100vh-116px)]">
      {/* Barra de comparação das 3 propostas estáticas da Rodada 1 */}
      <div className="bg-[var(--accent-tint)] border border-brand/25 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-brand text-white font-semibold uppercase tracking-wider text-[10px]">
            Rodada 1 · Protótipo
          </span>
          <span className="font-medium text-ink-primary">
            Comparação estrutural da Agenda (dados reais da API VitaScan):
          </span>
        </div>
        <div className="inline-flex items-center gap-1 bg-surface border border-border-subtle rounded-lg p-0.5">
          {(
            [
              { id: 'a' as const, label: 'Proposta A · Full-Height + Drawer (Recomendada)' },
              { id: 'b' as const, label: 'Proposta B · Split Fixo 72/28' },
              { id: 'c' as const, label: 'Proposta C · Filtro + Faixa de Tríades' },
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeVariant(tab.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                variant === tab.id
                  ? 'bg-brand text-white shadow-2xs'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar Única da Agenda (52px) */}
      <div className="bg-surface border border-border-subtle rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Esquerda: Título + 3 indicadores leves em uma linha */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-base font-semibold text-ink-primary">Agenda</h1>
          <div className="hidden lg:flex items-center gap-2.5 text-xs text-ink-secondary border-l border-border-subtle pl-3 tabular-nums">
            <span>
              Ocupação <strong className="text-ink-primary">{formatPercentBR(avgUtilization)}</strong>
            </span>
            <span className="text-ink-muted">·</span>
            <span>
              Faltas <strong className="text-ink-primary">{formatPercentBR(kpis?.noShowRatePercent ?? 0)}</strong>
            </span>
            <span className="text-ink-muted">·</span>
            <span>
              Ofertas na fila <strong className="text-brand">{kpis?.activeWaitlistOffers ?? 1}</strong>
            </span>
          </div>

          {/* Na Proposta C: Segmented Control de categorias na própria barra */}
          {variant === 'c' && (
            <div className="inline-flex items-center bg-canvas border border-border-subtle rounded-lg p-0.5 text-xs ml-1">
              {(
                [
                  { id: 'ALL' as const, label: 'Todos (6)' },
                  { id: 'SPECIALIST' as const, label: 'Especialistas (2)' },
                  { id: 'ROOM' as const, label: 'Salas (2)' },
                  { id: 'EQUIPMENT' as const, label: 'Equipamentos (2)' },
                ]
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilterC(cat.id)}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    categoryFilterC === cat.id
                      ? 'bg-surface text-ink-primary shadow-2xs border border-border-subtle'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Direita: Seletor de Data, Zoom -/+, Densidade com ícone, Legenda em Popover e CTA único */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Navegação de Data */}
          <div className="inline-flex items-center bg-canvas border border-border-subtle rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onDateChange(getTodayClinicIsoDate())}
              className="px-2.5 py-1 text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-sunken rounded-md transition"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => onDateChange(addDaysToIsoDate(selectedDate, -1))}
              aria-label="Dia anterior"
              className="p-1 text-ink-secondary hover:text-ink-primary hover:bg-sunken rounded-md transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-ink-primary tabular-nums">
              <Calendar className="w-3.5 h-3.5 text-brand" />
              {formatDateBR(selectedDate)}
            </span>
            <button
              type="button"
              onClick={() => onDateChange(addDaysToIsoDate(selectedDate, 1))}
              aria-label="Próximo dia"
              className="p-1 text-ink-secondary hover:text-ink-primary hover:bg-sunken rounded-md transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Controle de Zoom (- / 100% / +) sem termo técnico "px" */}
          <div
            role="group"
            aria-label="Escala de horário"
            className="inline-flex items-center bg-canvas border border-border-subtle rounded-lg p-0.5 text-xs tabular-nums"
          >
            <button
              type="button"
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={zoomIndex === 0}
              aria-label="Reduzir escala de horário"
              className="p-1.5 text-ink-secondary hover:text-ink-primary disabled:opacity-40 rounded-md transition"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-medium text-ink-primary min-w-[44px] text-center">
              {ZOOM_STEPS[zoomIndex].label}
            </span>
            <button
              type="button"
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              aria-label="Ampliar escala de horário"
              className="p-1.5 text-ink-secondary hover:text-ink-primary disabled:opacity-40 rounded-md transition"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Densidade com ícone */}
          <button
            type="button"
            onClick={() => setDenseMode((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              denseMode
                ? 'bg-sunken text-ink-primary border-border-strong'
                : 'bg-canvas text-ink-secondary border-border-subtle hover:text-ink-primary'
            }`}
            title="Alternar altura das raias"
          >
            <Rows3 className="w-3.5 h-3.5 text-ink-muted" />
            <span>{denseMode ? 'Compacto' : 'Confortável'}</span>
          </button>

          {/* Legenda em Popover discreto */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setLegendOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-canvas text-ink-secondary hover:text-ink-primary border border-border-subtle transition"
            >
              <Info className="w-3.5 h-3.5 text-ink-muted" />
              <span>Legenda</span>
            </button>
            {legendOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-surface border border-border-strong rounded-xl shadow-lg p-3.5 z-50 space-y-2.5 text-xs">
                <div className="font-semibold text-ink-primary flex items-center justify-between">
                  <span>Status e blocos da matriz</span>
                  <button
                    type="button"
                    onClick={() => setLegendOpen(false)}
                    className="text-ink-muted hover:text-ink-primary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 text-ink-secondary">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[var(--status-confirmed-bg)] border border-[var(--status-confirmed-border)]" />
                    <span>Reserva confirmada</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[var(--status-pending-bg)] border border-[var(--status-pending-border)]" />
                    <span>Aguardando pagamento de sinal</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[var(--status-checkedin-bg)] border border-[var(--status-checkedin-border)]" />
                    <span>Paciente chegou (em atendimento)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-3 rounded-xs bg-cleanup-stripes border border-[var(--cleanup-border)]" />
                    <span>Limpeza e esterilização pós-exame</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-xs bg-[var(--accent-tint)] border border-dashed border-brand" />
                    <span>Vaga segurada para oferta da fila</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void onRefresh()}
            aria-label="Sincronizar agenda"
            className="p-1.5 rounded-lg bg-canvas border border-border-subtle text-ink-secondary hover:text-ink-primary transition"
            title="Sincronizar agora"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Único botão primário da página */}
          <button
            type="button"
            onClick={() => onQuickSchedule?.()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white transition shadow-xs"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span>Novo agendamento</span>
          </button>
        </div>
      </div>

      {/* PROPOSTA C: Faixa de Exames Acoplados (Tríades Atômicas) no Topo */}
      {variant === 'c' && (
        <div className="bg-surface border border-border-subtle rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-xs">
            <Layers className="w-4 h-4 text-brand shrink-0" />
            <span className="font-semibold text-ink-primary">
              Tríades do dia ({sortedBookings.length} exames multi-recurso):
            </span>
            <span className="text-ink-secondary">
              Clique em um exame para isolar apenas as 3 raias vinculadas a ele.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sortedBookings.map((b) => {
              const isIsolated = isolatedBookingIdC === b.bookingId;
              return (
                <button
                  key={b.bookingId}
                  type="button"
                  onClick={() => {
                    setSelectedBookingId(b.bookingId);
                    setIsolatedBookingIdC(isIsolated ? null : b.bookingId);
                  }}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition tabular-nums ${
                    isIsolated
                      ? 'bg-[var(--accent-tint)] border-brand text-ink-primary font-semibold shadow-2xs'
                      : 'bg-canvas border-border-subtle text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  <span className="font-semibold text-ink-primary">
                    {formatTimeBR(b.serviceStartAt)}
                  </span>
                  <span>{b.clientName}</span>
                  <span className="text-ink-muted">·</span>
                  <span className="inline-flex items-center gap-1">
                    {b.resources.map((r) => (
                      <span
                        key={r.id}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${CATEGORY_META[r.category].pillBg}`}
                      >
                        {shortResourceLabel(r.name)}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
            {isolatedBookingIdC && (
              <button
                type="button"
                onClick={() => setIsolatedBookingIdC(null)}
                className="text-xs font-medium text-brand hover:underline px-2"
              >
                Mostrar todos os 6 recursos
              </button>
            )}
          </div>
        </div>
      )}

      {/* Área Principal: Matriz Full-Height (+ Drawer Sob Demanda na A | + Coluna Direita Fixa na B) */}
      <div className="flex-1 flex items-stretch gap-3 min-h-[560px] relative">
        {/* Container da Matriz Horizontal */}
        <div
          className={`flex-1 bg-surface border border-border-subtle rounded-xl overflow-hidden shadow-xs flex flex-col ${
            variant === 'b' ? 'w-[72%]' : 'w-full'
          }`}
        >
          {/* Faixa sutil de feedback do vínculo atômico selecionado */}
          <div className="px-4 py-2 border-b border-border-subtle bg-canvas/70 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-brand shrink-0" />
              {activeBooking ? (
                <span className="text-ink-primary tabular-nums">
                  Vínculo atômico ativo: <strong>{activeBooking.clientName}</strong> ·{' '}
                  <span className="text-ink-secondary">{activeBooking.procedureName}</span> (
                  {formatTimeBR(activeBooking.serviceStartAt)}–{formatTimeBR(activeBooking.serviceEndAt)}) nas{' '}
                  <strong>{activeBooking.resources.length} raias</strong> destacadas
                </span>
              ) : (
                <span className="text-ink-secondary">
                  Clique em qualquer reserva para destacar as 3 raias vinculadas e inspecionar os tempos de limpeza.
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-ink-secondary">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--status-confirmed-dot)]" />
                Confirmada
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--status-pending-dot)]" />
                Aguardando sinal
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-2 rounded-xs bg-cleanup-stripes border border-[var(--cleanup-border)]" />
                Limpeza
              </span>
            </div>
          </div>

          {/* Scroll Horizontal da Grade */}
          <div ref={scrollContainerRef} className="flex-1 overflow-x-auto overflow-y-auto relative">
            <div
              style={{ minWidth: `${268 + totalGridWidthPx + 28}px` }}
              className="min-h-full flex flex-col justify-between relative"
            >
              <div>
                {/* Cabeçalho de Horas Sticky (07:00 a 20:00 sem cortar o último :00) */}
                <div className="flex border-b border-border-subtle bg-canvas sticky top-0 z-20">
                  <div className="w-[268px] shrink-0 px-4 py-2.5 text-xs font-semibold text-ink-primary border-r border-border-subtle bg-canvas sticky left-0 z-30 flex items-center justify-between">
                    <span>Recurso e ocupação hoje</span>
                    <span className="text-[11px] font-normal text-ink-muted">07h–20h</span>
                  </div>

                  <div
                    className="relative h-9 flex items-stretch pr-7"
                    style={{ width: `${totalGridWidthPx + 28}px` }}
                  >
                    {HOURS.map((h) => {
                      const isBusiness = h >= BUSINESS_START && h < BUSINESS_END;
                      return (
                        <div
                          key={h}
                          style={{ width: `${hourWidthPx}px` }}
                          className={`border-r border-border-subtle px-2 flex items-center justify-between text-xs font-medium tabular-nums shrink-0 relative ${
                            isBusiness
                              ? 'bg-surface text-ink-primary'
                              : 'bg-sunken/45 text-ink-muted'
                          }`}
                        >
                          <span>{String(h).padStart(2, '0')}:00</span>
                          {h === END_HOUR - 1 && (
                            <span className="absolute -right-6 text-[11px] text-ink-muted tabular-nums">
                              20:00
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Corpo das Raias com Conector Vertical Atômico Contínuo */}
                <div className="relative">
                  {/* Conector Vertical Atômico ligando Especialista + Sala + Equipamento */}
                  {connectorLeftPx !== null && (
                    <div
                      style={{ left: `${268 + connectorLeftPx}px` }}
                      aria-hidden="true"
                      className="absolute top-0 bottom-0 w-0.5 bg-brand z-10 pointer-events-none"
                    >
                      <div className="sticky top-2 -ml-[5px] w-3 h-3 rounded-full bg-brand ring-4 ring-brand/20" />
                    </div>
                  )}

                  {(['SPECIALIST', 'ROOM', 'EQUIPMENT'] as const).map((category) => {
                    const rows = visibleResourcesByCategory(category);
                    if (rows.length === 0) return null;
                    const meta = CATEGORY_META[category];
                    const isCollapsed = Boolean(collapsedCategories[category]);

                    return (
                      <div key={category} className="border-b border-border-subtle last:border-b-0">
                        {/* Cabeçalho do Grupo */}
                        <div className="flex bg-sunken/55 border-b border-border-subtle">
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedCategories((prev) => ({
                                ...prev,
                                [category]: !prev[category],
                              }))
                            }
                            className="w-[268px] shrink-0 px-4 py-2 text-left text-xs font-semibold flex items-center justify-between border-r border-border-subtle bg-canvas sticky left-0 z-20 hover:bg-sunken/70 transition"
                          >
                            <span className={`inline-flex items-center gap-2 ${meta.accentText}`}>
                              {meta.icon}
                              <span>{meta.pluralLabel}</span>
                              <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-surface border border-border-subtle text-ink-secondary tabular-nums">
                                {rows.length}
                              </span>
                            </span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 text-ink-muted transition-transform ${
                                isCollapsed ? '-rotate-90' : ''
                              }`}
                            />
                          </button>
                          <div
                            style={{ width: `${totalGridWidthPx + 28}px` }}
                            className="px-3 py-1.5 text-[11px] text-ink-muted flex items-center justify-end"
                          >
                            <span className="bg-surface/80 px-2 py-0.5 rounded border border-border-subtle">
                              {category === 'SPECIALIST'
                                ? 'Alocação direta sem buffer pós-atendimento'
                                : category === 'ROOM'
                                ? 'Buffer obrigatório de desinfecção após cada exame'
                                : 'Buffer de higienização de transdutor e calibração'}
                            </span>
                          </div>
                        </div>

                        {/* Raias Individuais */}
                        {!isCollapsed &&
                          rows.map((row) => {
                            const usage = resourceDailyUsage.get(row.resource.id) ?? {
                              totalMin: 0,
                              pct: 0,
                              label: 'Livre hoje',
                            };
                            const isLinkedToActive = Boolean(
                              activeBooking?.resources.some((r) => r.id === row.resource.id),
                            );
                            const rowHeight = denseMode ? 'h-14' : 'h-[72px]';

                            return (
                              <div
                                key={row.resource.id}
                                className={`flex border-b border-border-subtle/70 last:border-b-0 transition-colors ${
                                  isLinkedToActive ? 'bg-[var(--accent-tint)]/35' : 'bg-surface'
                                }`}
                              >
                                {/* Coluna Sticky do Recurso (sem truncar nome e com barra de uso do dia) */}
                                <div
                                  className={`w-[268px] shrink-0 px-3.5 py-2 border-r border-border-subtle sticky left-0 z-20 flex flex-col justify-center gap-1.5 transition-colors ${
                                    isLinkedToActive ? 'bg-[var(--accent-tint)]' : 'bg-surface'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <ResourceTile
                                        name={row.resource.name}
                                        category={row.resource.category}
                                        size="sm"
                                      />
                                      <div className="min-w-0">
                                        <div className="text-xs font-semibold text-ink-primary leading-tight">
                                          {row.resource.name}
                                        </div>
                                        <div className="text-[11px] text-ink-secondary truncate">
                                          {row.resource.capabilities
                                            .slice(0, 2)
                                            .map((c) => formatCapability(c))
                                            .join(' · ')}
                                        </div>
                                      </div>
                                    </div>
                                    {isLinkedToActive && (
                                      <span
                                        className="w-2.5 h-2.5 rounded-full bg-brand shrink-0 ring-4 ring-brand/20"
                                        title="Recurso vinculado à reserva selecionada"
                                      />
                                    )}
                                  </div>

                                  {/* Barra de ocupação do dia */}
                                  <div className="flex items-center gap-2 text-[11px] tabular-nums">
                                    <div className="flex-1 h-1.5 rounded-full bg-sunken overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${meta.barColor}`}
                                        style={{ width: `${Math.max(6, usage.pct)}%` }}
                                      />
                                    </div>
                                    <span className="text-ink-secondary font-medium shrink-0">
                                      {usage.label} · {usage.pct}%
                                    </span>
                                  </div>
                                </div>

                                {/* Grade Horária da Raia */}
                                <div
                                  className={`relative ${rowHeight} flex items-stretch pr-7`}
                                  style={{ width: `${totalGridWidthPx + 28}px` }}
                                >
                                  {/* Células de Hora Clicáveis para Agendamento Rápido */}
                                  {HOURS.map((h) => {
                                    const isBusiness = h >= BUSINESS_START && h < BUSINESS_END;
                                    return (
                                      <button
                                        key={h}
                                        type="button"
                                        onClick={() =>
                                          onQuickSchedule?.({
                                            resourceId: row.resource.id,
                                            hour: h,
                                          })
                                        }
                                        title={`Agendar às ${String(h).padStart(2, '0')}:00 com ${row.resource.name}`}
                                        style={{ width: `${hourWidthPx}px` }}
                                        className={`border-r border-border-subtle/60 h-full shrink-0 group relative transition text-left ${
                                          isBusiness
                                            ? 'bg-transparent hover:bg-[var(--accent-tint)]/40'
                                            : 'bg-sunken/30 hover:bg-sunken/60'
                                        }`}
                                      >
                                        <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-1 rounded-md border border-dashed border-brand/50 flex items-center justify-center text-[10px] font-medium text-brand bg-surface/90">
                                          + {String(h).padStart(2, '0')}:00
                                        </span>
                                      </button>
                                    );
                                  })}

                                  {/* Alocações da Raia (Paciente primeiro -> Procedimento/Horário + Cauda de Limpeza) */}
                                  {row.allocations.map((alloc) => {
                                    const startLeft = minutesToLeftPx(alloc.serviceStartAt);
                                    const serviceWidth = durationToWidthPx(
                                      alloc.serviceStartAt,
                                      alloc.serviceEndAt,
                                    );
                                    const cleanupWidth =
                                      alloc.cleanupMinutes > 0
                                        ? durationToWidthPx(alloc.serviceEndAt, alloc.effectiveEndAt)
                                        : 0;

                                    const visual = getBlockStatusVisual(alloc.bookingStatus);
                                    const isSelected = effectiveSelectedId === alloc.bookingId;
                                    const isHovered = hoveredBookingId === alloc.bookingId;
                                    const isDimmed =
                                      activeBookingId !== null &&
                                      activeBookingId !== alloc.bookingId;
                                    const cleanPatient = cleanPersonName(alloc.clientName);

                                    return (
                                      <div
                                        key={`${alloc.bookingId}-${row.resource.id}`}
                                        style={{ left: `${startLeft}px` }}
                                        className={`absolute top-1.5 bottom-1.5 flex items-stretch z-10 transition-all ${
                                          isDimmed ? 'opacity-45' : 'opacity-100'
                                        }`}
                                        onMouseEnter={() => setHoveredBookingId(alloc.bookingId)}
                                        onMouseLeave={() => setHoveredBookingId(null)}
                                      >
                                        {/* Bloco Principal de Atendimento */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedBookingId(alloc.bookingId);
                                            setDrawerClosedManually(false);
                                          }}
                                          style={{ width: `${Math.max(54, serviceWidth)}px` }}
                                          className={`h-full rounded-l-lg ${
                                            cleanupWidth === 0 ? 'rounded-r-lg' : ''
                                          } border px-1.5 py-1 text-left flex flex-col justify-center overflow-hidden shadow-2xs transition relative ${
                                            visual.blockClass
                                          } ${
                                            isSelected || isHovered
                                              ? 'ring-2 ring-brand shadow-sm z-20'
                                              : ''
                                          }`}
                                        >
                                          <div className="flex items-center gap-1 min-w-0">
                                            {visual.icon}
                                            <span className="text-[11px] font-semibold truncate leading-tight">
                                              {compactPatientName(cleanPatient, serviceWidth)}
                                            </span>
                                          </div>
                                          <div className="text-[10px] opacity-90 truncate leading-tight mt-0.5 tabular-nums">
                                            {formatTimeBR(alloc.serviceStartAt)}–
                                            {formatTimeBR(alloc.serviceEndAt)}
                                          </div>
                                        </button>

                                        {/* Cauda Hachurada Proporcional de Limpeza e Esterilização */}
                                        {cleanupWidth > 0 && (
                                          <div
                                            style={{ width: `${Math.max(28, cleanupWidth)}px` }}
                                            title={`Limpeza e esterilização: ${alloc.cleanupMinutes} min (${formatTimeBR(
                                              alloc.serviceEndAt,
                                            )}–${formatTimeBR(alloc.effectiveEndAt)})`}
                                            className="h-full rounded-r-lg border border-l-0 border-[var(--cleanup-border)] bg-cleanup-stripes px-1.5 flex items-center justify-center overflow-hidden select-none"
                                          >
                                            <span className="text-[10px] font-semibold text-[var(--cleanup-text)] whitespace-nowrap tabular-nums bg-surface/85 px-1 rounded">
                                              {cleanupWidth >= 52
                                                ? `Limpeza ${alloc.cleanupMinutes}m`
                                                : `+${alloc.cleanupMinutes}m`}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {/* Vagas seguradas para oferta da Lista de Espera */}
                                  {row.waitlistOfferHolds?.map((hold) => {
                                    const left = minutesToLeftPx(hold.offeredStartAt);
                                    const width = durationToWidthPx(
                                      hold.offeredStartAt,
                                      hold.offeredEndAt,
                                    );
                                    return (
                                      <div
                                        key={hold.waitlistEntryId}
                                        style={{
                                          left: `${left}px`,
                                          width: `${Math.max(64, width)}px`,
                                        }}
                                        className="absolute top-1.5 bottom-1.5 rounded-lg border border-dashed border-brand bg-[var(--accent-tint)]/90 px-2 py-1 flex flex-col justify-center z-10 overflow-hidden"
                                      >
                                        <span className="text-[11px] font-semibold text-brand truncate">
                                          Oferta: {cleanPersonName(hold.clientName)}
                                        </span>
                                        <span className="text-[10px] text-ink-secondary truncate tabular-nums">
                                          Segurada até {formatTimeBR(hold.expiresAt)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rodapé Integrado da Matriz (ocupa o fundo sem deixar buraco vazio) */}
              <div className="px-4 py-2.5 border-t border-border-subtle bg-canvas flex flex-wrap items-center justify-between gap-3 text-xs text-ink-secondary">
                <div className="flex flex-wrap items-center gap-4 tabular-nums">
                  <span>
                    <strong>{sortedBookings.length} reservas</strong> multi-recurso hoje
                  </span>
                  <span>·</span>
                  <span>
                    Horário comercial destacado: <strong>08:00 às 18:00</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Dica: clique em qualquer horário livre na grade para iniciar um agendamento naquela raia.
                  </span>
                </div>
                <span className="text-[11px] text-ink-muted">
                  Fuso da clínica: America/Sao_Paulo (BRT)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* PROPOSTA A: Drawer Inspector Lateral Sob Demanda (Overlay sobre a direita para a Matriz manter 100% da largura) */}
        {isDrawerOpenInA && drawerBooking && (
          <aside
            aria-label="Detalhes da reserva selecionada"
            className="w-[356px] absolute right-3 top-11 bottom-12 z-30 bg-surface/95 backdrop-blur-md border border-border-strong rounded-xl shadow-xl flex flex-col justify-between overflow-hidden"
          >
            <div className="p-4 space-y-4 overflow-y-auto">
              <div className="flex items-start justify-between gap-2 border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={drawerBooking.clientName} size="md" />
                  <div>
                    <h2 className="text-sm font-semibold text-ink-primary">
                      {drawerBooking.clientName}
                    </h2>
                    <p className="text-xs text-ink-secondary">{drawerBooking.procedureName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerClosedManually(true)}
                  aria-label="Fechar painel da reserva"
                  className="p-1 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-sunken transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Horário e Status */}
              <div className="flex items-center justify-between gap-2 bg-canvas border border-border-subtle rounded-lg px-3 py-2">
                <div className="text-xs tabular-nums">
                  <div className="text-ink-muted">Horário do exame</div>
                  <div className="font-semibold text-ink-primary">
                    {formatTimeBR(drawerBooking.serviceStartAt)} às{' '}
                    {formatTimeBR(drawerBooking.serviceEndAt)}
                  </div>
                </div>
                <BookingStatusBadge status={drawerBooking.bookingStatus} />
              </div>

              {/* Tríade de Recursos Alocados Atomicamente */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-primary">
                    3 recursos travados juntos
                  </span>
                  <span className="text-[11px] text-brand font-medium">Alocação atômica</span>
                </div>
                <div className="space-y-1.5 relative before:absolute before:left-4 before:top-4 before:bottom-4 before:w-0.5 before:bg-brand/30">
                  {drawerBooking.resources.map((res) => (
                    <div
                      key={res.id}
                      className="relative pl-8 pr-3 py-2 rounded-lg bg-canvas border border-border-subtle flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="absolute left-3 w-2.5 h-2.5 rounded-full bg-brand ring-2 ring-surface" />
                      <div className="min-w-0">
                        <div className="font-semibold text-ink-primary truncate">{res.name}</div>
                        <div className="text-[11px] text-ink-secondary">
                          {CATEGORY_META[res.category].singularLabel}
                        </div>
                      </div>
                      {res.cleanupMinutes > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-cleanup-stripes border border-[var(--cleanup-border)] text-[11px] font-semibold text-[var(--cleanup-text)] tabular-nums shrink-0">
                          +{res.cleanupMinutes} min limpeza
                        </span>
                      ) : (
                        <span className="text-[11px] text-ink-muted shrink-0">Liberação direta</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Proteção Anti-Falta (Sinal) */}
              <div className="rounded-lg bg-canvas border border-border-subtle p-3 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ink-secondary inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-brand" />
                    Sinal de reserva (25%)
                  </span>
                  <span className="font-semibold text-ink-primary tabular-nums">
                    {formatCurrencyBRL(drawerBooking.depositRequiredCents)}
                  </span>
                </div>
                <div className="text-[11px] text-ink-secondary">
                  {drawerBooking.depositPaid
                    ? 'Pagamento confirmado · Em caso de falta sem aviso, 50% ficam retidos.'
                    : 'Aguardando pagamento do sinal pelo paciente.'}
                </div>
              </div>
            </div>

            {/* Rodapé do Drawer: 1 única ação primária contextual + menu secundário */}
            <div className="p-3.5 border-t border-border-subtle bg-canvas flex items-center justify-between gap-2">
              <button
                type="button"
                className="flex-1 py-2 px-3 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-semibold transition shadow-xs"
              >
                {drawerBooking.bookingStatus === 'PENDING_DEPOSIT'
                  ? 'Confirmar pagamento do sinal'
                  : drawerBooking.bookingStatus === 'CONFIRMED'
                  ? 'Confirmar chegada do paciente'
                  : 'Concluir atendimento'}
              </button>
              <button
                type="button"
                title="Mais ações (Cancelar com oferta na fila, Marcar falta)"
                className="p-2 rounded-lg bg-surface border border-border-subtle text-ink-secondary hover:text-ink-primary transition"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </aside>
        )}

        {/* PROPOSTA B: Coluna Direita Fixa 28% (Painel do Turno + Reserva em Foco Permanente) */}
        {variant === 'b' && (
          <aside className="w-[332px] shrink-0 bg-surface border border-border-subtle rounded-xl shadow-xs flex flex-col justify-between overflow-hidden">
            <div className="p-3.5 space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
                <span className="text-xs font-semibold text-ink-primary">
                  Painel fixo do turno (28%)
                </span>
                <span className="text-[11px] text-ink-muted tabular-nums">Sempre aberto</span>
              </div>

              {drawerBooking && (
                <div className="rounded-xl bg-canvas border border-border-subtle p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-brand uppercase tracking-wider">
                      Reserva selecionada
                    </span>
                    <BookingStatusBadge status={drawerBooking.bookingStatus} />
                  </div>
                  <div className="text-sm font-semibold text-ink-primary">
                    {drawerBooking.clientName}
                  </div>
                  <div className="text-xs text-ink-secondary tabular-nums">
                    {formatTimeBR(drawerBooking.serviceStartAt)}–
                    {formatTimeBR(drawerBooking.serviceEndAt)} · {drawerBooking.procedureName}
                  </div>
                  <div className="space-y-1 pt-1">
                    {drawerBooking.resources.map((r) => (
                      <div
                        key={r.id}
                        className="text-[11px] flex items-center justify-between text-ink-secondary"
                      >
                        <span className="truncate font-medium text-ink-primary">{r.name}</span>
                        {r.cleanupMinutes > 0 && (
                          <span className="text-[10px] text-[var(--cleanup-text)] tabular-nums">
                            +{r.cleanupMinutes}m limpeza
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista de próximas chegadas do dia */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-ink-primary">
                  Fila cronológica do dia ({sortedBookings.length})
                </div>
                <div className="space-y-1.5">
                  {sortedBookings.map((b) => (
                    <button
                      key={b.bookingId}
                      type="button"
                      onClick={() => setSelectedBookingId(b.bookingId)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs transition ${
                        effectiveSelectedId === b.bookingId
                          ? 'bg-[var(--accent-tint)] border-brand'
                          : 'bg-canvas border-border-subtle hover:bg-sunken'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold text-ink-primary tabular-nums">
                        <span>{formatTimeBR(b.serviceStartAt)}</span>
                        <span className="text-[11px] font-normal text-ink-secondary">
                          {formatBookingStatus(b.bookingStatus)}
                        </span>
                      </div>
                      <div className="font-medium text-ink-primary mt-0.5">{b.clientName}</div>
                      <div className="text-[11px] text-ink-secondary truncate">
                        {b.procedureName}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
