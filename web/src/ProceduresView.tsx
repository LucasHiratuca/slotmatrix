import React from 'react';
import { ServiceProcedureDto } from './api';
import {
  formatCapability,
  formatCurrencyBRL,
  formatDepositWithPercentage,
  formatPercentBR,
  formatResourceCategory,
} from './labels';
import { Box, CalendarPlus, Clock, ShieldCheck, Stethoscope, Wrench } from 'lucide-react';

interface ProceduresViewProps {
  procedures: ServiceProcedureDto[];
  onScheduleProcedure?: (procedureId: string) => void;
}

const CATEGORY_STYLE: Record<
  'SPECIALIST' | 'ROOM' | 'EQUIPMENT',
  {
    icon: React.ReactNode;
    barClass: string;
    prepClass: string;
    cleanupClass: string;
    textClass: string;
  }
> = {
  SPECIALIST: {
    icon: <Stethoscope className="w-3.5 h-3.5 text-[var(--res-specialist-text)]" />,
    barClass: 'bg-[var(--res-specialist-bar)] border-[var(--res-specialist-border)]',
    prepClass: 'bg-[var(--res-specialist-bg)] border-[var(--res-specialist-border)]',
    cleanupClass: 'bg-cleanup-stripes border-[var(--cleanup-border)]',
    textClass: 'text-[var(--res-specialist-text)]',
  },
  ROOM: {
    icon: <Box className="w-3.5 h-3.5 text-[var(--res-room-text)]" />,
    barClass: 'bg-[var(--res-room-bar)] border-[var(--res-room-border)]',
    prepClass: 'bg-[var(--res-room-bg)] border-[var(--res-room-border)]',
    cleanupClass: 'bg-cleanup-stripes border-[var(--cleanup-border)]',
    textClass: 'text-[var(--res-room-text)]',
  },
  EQUIPMENT: {
    icon: <Wrench className="w-3.5 h-3.5 text-[var(--res-equipment-text)]" />,
    barClass: 'bg-[var(--res-equipment-bar)] border-[var(--res-equipment-border)]',
    prepClass: 'bg-[var(--res-equipment-bg)] border-[var(--res-equipment-border)]',
    cleanupClass: 'bg-cleanup-stripes border-[var(--cleanup-border)]',
    textClass: 'text-[var(--res-equipment-text)]',
  },
};

export const ProceduresView: React.FC<ProceduresViewProps> = ({ procedures, onScheduleProcedure }) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink-primary">Procedimentos</h1>
          <p className="text-xs text-ink-secondary mt-0.5">
            Catálogo de procedimentos clínicos, valores, sinal de reserva e recursos exigidos simultaneamente.
          </p>
        </div>
      </div>

      {procedures.length === 0 ? (
        <div className="bg-surface border border-border-subtle rounded-xl p-8 text-center text-xs text-ink-secondary">
          Nenhum procedimento cadastrado nesta clínica.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {procedures.map((proc) => {
            const maxPrep = Math.max(0, ...proc.requirements.map((r) => r.prepMinutes));
            const maxCleanup = Math.max(0, ...proc.requirements.map((r) => r.cleanupMinutes));
            const totalAxisMinutes = Math.max(1, maxPrep + proc.durationMinutes + maxCleanup);

            return (
              <article
                key={proc.id}
                className="bg-surface border border-border-subtle rounded-xl p-5 flex flex-col justify-between gap-5 shadow-xs"
              >
                {/* Cabeçalho do procedimento */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-ink-primary">{proc.name}</h2>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-ink-secondary tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-ink-muted" />
                          Atendimento: {proc.durationMinutes} min
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-ink-primary">
                          <ShieldCheck className="w-3.5 h-3.5 text-brand" />
                          Sinal de reserva: {formatDepositWithPercentage(proc.depositCents, proc.priceCents)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-base font-bold text-ink-primary">
                        {formatCurrencyBRL(proc.priceCents)}
                      </div>
                      <div className="text-xs text-ink-secondary">Valor total</div>
                    </div>
                  </div>

                  <p className="text-xs text-ink-secondary tabular-nums">
                    Política de cancelamento: reembolso integral até {proc.cancellationPolicy.fullRefundThresholdHours}h
                    antes; retenção de {formatPercentBR(proc.cancellationPolicy.partialRetentionPercent)} entre{' '}
                    {proc.cancellationPolicy.partialRefundThresholdHours}h e{' '}
                    {proc.cancellationPolicy.fullRefundThresholdHours}h antes do atendimento.
                  </p>
                </div>

                {/* Mini linha do tempo dos recursos exigidos */}
                <div className="space-y-3 border-t border-border-subtle pt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-ink-primary">
                      Ocupação simultânea de recursos por atendimento
                    </span>
                    <span className="text-ink-secondary tabular-nums">
                      Janela total: {totalAxisMinutes} min
                    </span>
                  </div>

                  <div className="space-y-3">
                    {proc.requirements.map((req, idx) => {
                      const style = CATEGORY_STYLE[req.category];
                      const categoryLabel = formatResourceCategory(req.category);
                      const leftSpacerPct = ((maxPrep - req.prepMinutes) / totalAxisMinutes) * 100;
                      const prepPct = (req.prepMinutes / totalAxisMinutes) * 100;
                      const servicePct = (proc.durationMinutes / totalAxisMinutes) * 100;
                      const cleanupPct = (req.cleanupMinutes / totalAxisMinutes) * 100;

                      const timeParts: string[] = [];
                      if (req.prepMinutes > 0) timeParts.push(`${req.prepMinutes} min preparo`);
                      timeParts.push(`${proc.durationMinutes} min atendimento`);
                      if (req.cleanupMinutes > 0) timeParts.push(`${req.cleanupMinutes} min limpeza`);

                      return (
                        <div
                          key={`${req.category}-${idx}`}
                          className="bg-canvas border border-border-subtle rounded-lg p-3 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              {style.icon}
                              <span className="font-medium text-ink-primary">{categoryLabel}</span>
                              <div className="flex flex-wrap items-center gap-1">
                                {req.requiredCapabilities.map((cap) => (
                                  <span
                                    key={cap}
                                    className="px-2 py-0.5 rounded bg-surface border border-border-subtle text-ink-secondary text-xs"
                                  >
                                    {formatCapability(cap)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <span className="text-ink-secondary tabular-nums">
                              {categoryLabel}: {timeParts.join(' · ')}
                            </span>
                          </div>

                          {/* Barra proporcional: Preparo | Atendimento | Limpeza */}
                          <div className="w-full h-5 bg-sunken rounded-md overflow-hidden flex items-stretch border border-border-subtle">
                            {leftSpacerPct > 0 && <div style={{ width: `${leftSpacerPct}%` }} />}
                            {req.prepMinutes > 0 && (
                              <div
                                style={{ width: `${prepPct}%` }}
                                title={`Preparo: ${req.prepMinutes} min`}
                                className={`h-full border-r ${style.prepClass} flex items-center justify-center text-xs text-ink-primary tabular-nums px-1 overflow-hidden`}
                              >
                                {req.prepMinutes}m
                              </div>
                            )}
                            <div
                              style={{ width: `${servicePct}%` }}
                              title={`Atendimento: ${proc.durationMinutes} min`}
                              className={`h-full ${style.barClass} flex items-center justify-center text-xs font-medium text-white tabular-nums px-2 overflow-hidden`}
                            >
                              Atendimento ({proc.durationMinutes} min)
                            </div>
                            {req.cleanupMinutes > 0 && (
                              <div
                                style={{ width: `${cleanupPct}%` }}
                                title={`Limpeza e esterilização: ${req.cleanupMinutes} min`}
                                className={`h-full border-l ${style.cleanupClass} flex items-center justify-center text-xs text-ink-secondary tabular-nums px-1.5 overflow-hidden whitespace-nowrap`}
                              >
                                {cleanupPct >= 22 ? `Limpeza ${req.cleanupMinutes}m` : `+${req.cleanupMinutes}m`}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {onScheduleProcedure && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => onScheduleProcedure(proc.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-canvas hover:bg-sunken text-ink-primary border border-border-subtle transition"
                    >
                      <CalendarPlus className="w-3.5 h-3.5 text-brand" />
                      Agendar este procedimento
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
