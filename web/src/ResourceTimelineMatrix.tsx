import React, { useState } from 'react';
import {
  ApiHttpError,
  apiRequest,
  BookableResourceDto,
  formatMoneyBRL,
  ServiceProcedureDto,
  TimelineMatrixResponse,
} from './api';
import {
  Activity,
  AlertTriangle,
  Box,
  Clock,
  Layers,
  Plus,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Wrench,
} from 'lucide-react';

interface Props {
  token: string;
  workspaceId: string;
  timeline: TimelineMatrixResponse | null;
  selectedDate: string;
  onDateChange: (date: string) => void;
  procedures: ServiceProcedureDto[];
  onRefresh: () => Promise<void>;
}

const CATEGORY_META: Record<
  'SPECIALIST' | 'ROOM' | 'EQUIPMENT',
  { label: string; badgeClass: string; icon: React.ReactNode }
> = {
  SPECIALIST: {
    label: 'SPECIALIST (Especialista)',
    badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    icon: <Stethoscope className="w-4 h-4 text-indigo-400" />,
  },
  ROOM: {
    label: 'ROOM (Sala Física + Turnaround Estéril)',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    icon: <Box className="w-4 h-4 text-emerald-400" />,
  },
  EQUIPMENT: {
    label: 'EQUIPMENT (Equipamento Escasso)',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    icon: <Wrench className="w-4 h-4 text-cyan-400" />,
  },
};

function getTimelinePositionPercent(iso: string): number {
  const d = new Date(iso);
  const minutesFrom07 = (d.getUTCHours() - 7) * 60 + d.getUTCMinutes();
  const totalWindowMinutes = 13 * 60; // 07:00 to 20:00 UTC (780 min)
  return Math.max(0, Math.min(100, (minutesFrom07 / totalWindowMinutes) * 100));
}

function getDurationWidthPercent(startIso: string, endIso: string): number {
  const diffMin = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
  const totalWindowMinutes = 13 * 60;
  return Math.max(1.2, Math.min(100, (diffMin / totalWindowMinutes) * 100));
}

export const ResourceTimelineMatrix: React.FC<Props> = ({
  token,
  workspaceId,
  timeline,
  selectedDate,
  onDateChange,
  procedures,
  onRefresh,
}) => {
  const [showAddResource, setShowAddResource] = useState(false);
  const [resName, setResName] = useState('');
  const [resCategory, setResCategory] = useState<'SPECIALIST' | 'ROOM' | 'EQUIPMENT'>('EQUIPMENT');
  const [resCaps, setResCaps] = useState('DOPPLER_VASCULAR, USG_DOPPLER_HD');
  const [errorBanner, setErrorBanner] = useState<{ status: number; code: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSubmitting(true);
    try {
      await apiRequest<BookableResourceDto>('/resources', {
        method: 'POST',
        token,
        workspaceId,
        body: {
          name: resName,
          category: resCategory,
          capabilities: resCaps
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      setResName('');
      setShowAddResource(false);
      await onRefresh();
    } catch (err) {
      if (err instanceof ApiHttpError) {
        setErrorBanner({ status: err.status, code: err.code, message: err.message });
      } else {
        setErrorBanner({ status: 500, code: 'ERROR', message: String(err) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-xl p-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            Matriz de Alocação Simultânea &amp; Turnaround Assimétrico
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Visualize o bloqueio simultâneo de <span className="text-indigo-300 font-medium">SPECIALIST</span> +{' '}
            <span className="text-emerald-300 font-medium">ROOM</span> +{' '}
            <span className="text-cyan-300 font-medium">EQUIPMENT</span> e a janela extra de{' '}
            <span className="text-amber-300 font-medium">Esterilização / Turnaround Buffer</span> pós-procedimento.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
            <Clock className="w-4 h-4 text-slate-400" />
            <label className="text-xs text-slate-400">Data UTC:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent text-xs font-mono text-white focus:outline-none"
            />
          </div>

          <button
            onClick={() => {
              setErrorBanner(null);
              setShowAddResource((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition"
          >
            <Plus className="w-4 h-4" />
            Novo BookableResource
          </button>
        </div>
      </div>

      {/* Domain Error Alert (e.g., HTTP 402 QuotaExceededError on Estúdio Aura 5/5) */}
      {errorBanner && (
        <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                HTTP {errorBanner.status} — {errorBanner.code}
              </span>
              <span className="text-sm font-semibold text-rose-200">
                Regra de Domínio / Entitlement Bloqueou a Operação
              </span>
            </div>
            <p className="text-xs text-rose-300/90 mt-1">{errorBanner.message}</p>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-xs text-rose-300 hover:text-white px-2 py-1"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Quick Form to Create BookableResource (great to test 5/5 STARTER Quota!) */}
      {showAddResource && (
        <form
          onSubmit={handleCreateResource}
          className="bg-slate-900 border border-indigo-500/40 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-300">
              Cadastrar Recurso Alocável (Testa CanRegisterResourceSpecification &amp; PlanQuota)
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nome do Recurso</label>
              <input
                type="text"
                required
                placeholder="Ex: Ultrassom Portátil #03"
                value={resName}
                onChange={(e) => setResName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Categoria</label>
              <select
                value={resCategory}
                onChange={(e) => setResCategory(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="SPECIALIST">SPECIALIST (Profissional)</option>
                <option value="ROOM">ROOM (Sala / Box Físico)</option>
                <option value="EQUIPMENT">EQUIPMENT (Equipamento)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Capabilities (Tags separadas por vírgula)</label>
              <input
                type="text"
                value={resCaps}
                onChange={(e) => setResCaps(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddResource(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {submitting ? 'Validando Quota...' : 'Salvar Recurso'}
            </button>
          </div>
        </form>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 px-4 py-2.5 bg-slate-900/60 border border-slate-800/80 rounded-lg text-xs">
        <span className="font-semibold text-slate-300">Legenda da Grade (07:00 — 20:00 UTC):</span>
        <span className="inline-flex items-center gap-2 text-slate-300">
          <span className="w-3.5 h-3.5 rounded bg-indigo-600 border border-indigo-400 inline-block" />
          Janela de Atendimento (<code className="text-indigo-300">serviceSlot</code>)
        </span>
        <span className="inline-flex items-center gap-2 text-amber-300">
          <span className="w-5 h-3.5 rounded bg-buffer-stripes border border-amber-500/60 inline-block" />
          Turnaround / Esterilização Obrigatória (<code className="text-amber-300">cleanupMinutes</code>)
        </span>
        <span className="inline-flex items-center gap-2 text-fuchsia-300">
          <span className="w-3.5 h-3.5 rounded bg-fuchsia-600/40 border border-fuchsia-400 border-dashed inline-block" />
          Reserva Temporária de Oferta Ativa (<code className="text-fuchsia-300">SlotOffer Hold</code>)
        </span>
      </div>

      {/* Visual Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Time ruler header */}
        <div className="grid grid-cols-12 border-b border-slate-800 bg-slate-950/70">
          <div className="col-span-4 px-4 py-2.5 text-xs font-semibold text-slate-400 border-r border-slate-800">
            Recurso Alocável / Competências
          </div>
          <div className="col-span-8 relative h-9 flex items-center">
            {hours.map((h) => {
              const leftPct = ((h - 7) / 13) * 100;
              return (
                <div
                  key={h}
                  style={{ left: `${leftPct}%` }}
                  className="absolute top-0 bottom-0 border-l border-slate-800/70 pl-1 flex items-center text-[10px] font-mono text-slate-500"
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows grouped by resource */}
        <div className="divide-y divide-slate-800/70">
          {timeline?.resources.map(({ resource, allocations, waitlistOfferHolds }) => {
            const meta = CATEGORY_META[resource.category];
            return (
              <div key={resource.id} className="grid grid-cols-12 hover:bg-slate-800/20 transition">
                {/* Resource column */}
                <div className="col-span-4 p-3.5 border-r border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {meta.icon}
                      <span className="text-sm font-medium text-white">{resource.name}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${meta.badgeClass}`}>
                        {resource.category}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-mono rounded ${
                          resource.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {resource.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {resource.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-950 text-slate-400 border border-slate-800 rounded"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Horizontal timeline bar */}
                <div className="col-span-8 relative min-h-[78px] bg-slate-950/30">
                  {/* Hour grid lines */}
                  {hours.map((h) => {
                    const leftPct = ((h - 7) / 13) * 100;
                    return (
                      <div
                        key={h}
                        style={{ left: `${leftPct}%` }}
                        className="absolute top-0 bottom-0 border-l border-slate-800/40 pointer-events-none"
                      />
                    );
                  })}

                  {/* Active Bookings + Asymmetric Prep & Cleanup Buffers */}
                  {allocations.map((alloc) => {
                    const serviceLeft = getTimelinePositionPercent(alloc.serviceStartAt);
                    const serviceWidth = getDurationWidthPercent(alloc.serviceStartAt, alloc.serviceEndAt);

                    const hasCleanup = alloc.cleanupMinutes > 0;
                    const cleanupLeft = getTimelinePositionPercent(alloc.serviceEndAt);
                    const cleanupWidth = hasCleanup
                      ? getDurationWidthPercent(alloc.serviceEndAt, alloc.effectiveEndAt)
                      : 0;

                    const startLabel = alloc.serviceStartAt.slice(11, 16);
                    const endLabel = alloc.serviceEndAt.slice(11, 16);
                    const effEndLabel = alloc.effectiveEndAt.slice(11, 16);

                    return (
                      <React.Fragment key={`${alloc.bookingId}-${resource.id}`}>
                        {/* Main Service Window */}
                        <div
                          style={{ left: `${serviceLeft}%`, width: `${serviceWidth}%` }}
                          title={`${alloc.procedureName} | Paciente: ${alloc.clientName} (${startLabel} - ${endLabel} UTC)`}
                          className="absolute top-2.5 bottom-2.5 rounded-l-md bg-indigo-600/90 border border-indigo-400 px-2 py-1 overflow-hidden shadow-md flex flex-col justify-center z-10"
                        >
                          <div className="text-[11px] font-semibold text-white truncate">
                            {alloc.clientName}
                          </div>
                          <div className="text-[10px] text-indigo-100 font-mono truncate">
                            {startLabel}–{endLabel} • {alloc.procedureName}
                          </div>
                        </div>

                        {/* Asymmetric Turnaround / Sterilization Buffer Window */}
                        {hasCleanup && (
                          <div
                            style={{ left: `${cleanupLeft}%`, width: `${cleanupWidth}%` }}
                            title={`Turnaround / Esterilização (+${alloc.cleanupMinutes}min) até ${effEndLabel} UTC`}
                            className="absolute top-2.5 bottom-2.5 rounded-r-md bg-buffer-stripes border border-l-0 border-amber-500/80 px-1.5 flex items-center justify-center z-10"
                          >
                            <span className="text-[10px] font-mono font-bold text-amber-300 truncate">
                              +{alloc.cleanupMinutes}m Esteril.
                            </span>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Active Waitlist SlotOffer Holds */}
                  {waitlistOfferHolds.map((hold) => {
                    const left = getTimelinePositionPercent(hold.offeredStartAt);
                    const width = getDurationWidthPercent(hold.offeredStartAt, hold.offeredEndAt);
                    return (
                      <div
                        key={hold.waitlistEntryId}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`SlotOffer Ativa para ${hold.clientName} (expira às ${hold.expiresAt.slice(11, 16)} UTC)`}
                        className="absolute top-2 bottom-2 rounded-md bg-fuchsia-600/30 border-2 border-dashed border-fuchsia-400 px-2 flex flex-col justify-center z-20 animate-pulse"
                      >
                        <span className="text-[10px] font-bold text-fuchsia-200 truncate">
                          OFERTA WAITLIST: {hold.clientName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Procedure Catalog Summary with Asymmetric Turnaround Rules */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          Catálogo de Procedimentos Complexos (<code className="text-indigo-300">ServiceProcedures</code>) &amp;
          Requisitos Multi-Recurso
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {procedures.map((proc) => (
            <div
              key={proc.id}
              className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{proc.name}</span>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {formatMoneyBRL(proc.priceCents)}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-3">
                  <span>Duração Atendimento: {proc.durationMinutes} min</span>
                  <span>•</span>
                  <span className="text-amber-300 font-medium">
                    Sinal Anti-No-Show (SecurityDeposit): {formatMoneyBRL(proc.depositCents)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-800/80 pt-2.5">
                <div className="text-[11px] font-semibold text-slate-400">
                  Alocação Simultânea Obrigatória + TurnaroundBuffers:
                </div>
                {proc.requirements.map((req, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800/70"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-indigo-300">{req.category}</span>
                      <span className="text-slate-400 text-[11px]">
                        [{req.requiredCapabilities.join(', ')}]
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                        req.cleanupMinutes > 0
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'text-slate-500'
                      }`}
                    >
                      prep: {req.prepMinutes}m | esteril.: +{req.cleanupMinutes}m
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
