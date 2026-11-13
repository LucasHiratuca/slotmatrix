import React from 'react';
import {
  BookingDto,
  KpiSummaryDto,
  PlanCode,
  WaitlistEntryDto,
} from './api';
import {
  cleanPersonName,
  formatBookingStatus,
  formatCurrencyBRL,
  formatDateBR,
  formatPercentBR,
  formatPlanName,
  formatTimeBR,
} from './labels';
import {
  AlertCircle,
  ArrowRight,
  Box,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Stethoscope,
  Wrench,
} from 'lucide-react';

interface OverviewProps {
  kpis: KpiSummaryDto | null;
  bookings: BookingDto[];
  waitlist: WaitlistEntryDto[];
  activeResources: number;
  maxActiveResources: number | null;
  isAtQuotaLimit: boolean;
  plan: PlanCode;
  onNavigate: (page: 'agenda' | 'bookings' | 'waitlist' | 'resources' | 'procedures' | 'billing') => void;
  onOpenNewBooking: () => void;
}

export const OverviewView: React.FC<OverviewProps> = ({
  kpis,
  bookings,
  waitlist,
  activeResources,
  maxActiveResources,
  isAtQuotaLimit,
  plan,
  onNavigate,
  onOpenNewBooking,
}) => {
  const specUtil = kpis?.utilizationByCategory?.SPECIALIST?.utilizationPercent ?? 0;
  const specCount = kpis?.utilizationByCategory?.SPECIALIST?.activeResources ?? 0;
  const specMinutes = kpis?.utilizationByCategory?.SPECIALIST?.occupiedMinutes ?? 0;

  const roomUtil = kpis?.utilizationByCategory?.ROOM?.utilizationPercent ?? 0;
  const roomCount = kpis?.utilizationByCategory?.ROOM?.activeResources ?? 0;
  const roomMinutes = kpis?.utilizationByCategory?.ROOM?.occupiedMinutes ?? 0;

  const equipUtil = kpis?.utilizationByCategory?.EQUIPMENT?.utilizationPercent ?? 0;
  const equipCount = kpis?.utilizationByCategory?.EQUIPMENT?.activeResources ?? 0;
  const equipMinutes = kpis?.utilizationByCategory?.EQUIPMENT?.occupiedMinutes ?? 0;

  const pendingDepositBookings = bookings.filter((b) => b.status === 'PENDING_DEPOSIT');
  const activeOffers = waitlist.filter((w) => w.status === 'OFFERED');
  const upcomingConfirmed = bookings
    .filter((b) => b.status === 'CONFIRMED' || b.status === 'CHECKED_IN')
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Cabeçalho da página */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink-primary">Visão geral</h1>
          <p className="text-xs text-ink-secondary mt-0.5">
            Acompanhe a ocupação por tipo de recurso, os indicadores operacionais e as próximas ações da clínica.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('agenda')}
            className="px-3.5 py-2 rounded-lg text-xs font-medium bg-surface hover:bg-sunken text-ink-primary border border-border-subtle transition"
          >
            Abrir agenda
          </button>
          <button
            type="button"
            onClick={onOpenNewBooking}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white transition shadow-xs"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Novo agendamento
          </button>
        </div>
      </div>

      {/* Medidores de ocupação separados por tipo de recurso */}
      <section aria-label="Ocupação por tipo de recurso" className="bg-surface border border-border-subtle rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-ink-primary">Taxa de ocupação por tipo de recurso</h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              Proporção da capacidade diária alocada em atendimentos, preparo e limpeza.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Especialistas */}
          <div className="bg-canvas border border-border-subtle rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-ink-primary">
                <Stethoscope className="w-4 h-4 text-[var(--res-specialist-text)]" />
                Especialistas
              </span>
              <span className="text-lg font-bold text-ink-primary tabular-nums">{formatPercentBR(specUtil)}</span>
            </div>
            <div className="w-full h-2 bg-sunken rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--res-specialist-bar)] rounded-full transition-all"
                style={{ width: `${Math.max(specUtil > 0 ? 4 : 0, Math.min(100, specUtil))}%` }}
              />
            </div>
            <p className="text-xs text-ink-secondary tabular-nums">
              {specCount} ativo(s) · {specMinutes} min em atendimento
            </p>
          </div>

          {/* Salas (taupe/ocre mineral — sem colisão com o verde de Confirmada) */}
          <div className="bg-canvas border border-border-subtle rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-ink-primary">
                <Box className="w-4 h-4 text-[var(--res-room-text)]" />
                Salas
              </span>
              <span className="text-lg font-bold text-ink-primary tabular-nums">{formatPercentBR(roomUtil)}</span>
            </div>
            <div className="w-full h-2 bg-sunken rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--res-room-bar)] rounded-full transition-all"
                style={{ width: `${Math.max(roomUtil > 0 ? 4 : 0, Math.min(100, roomUtil))}%` }}
              />
            </div>
            <p className="text-xs text-ink-secondary tabular-nums">
              {roomCount} ativa(s) · {roomMinutes} min (inclui limpeza e esterilização)
            </p>
          </div>

          {/* Equipamentos */}
          <div className="bg-canvas border border-border-subtle rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-ink-primary">
                <Wrench className="w-4 h-4 text-[var(--res-equipment-text)]" />
                Equipamentos
              </span>
              <span className="text-lg font-bold text-ink-primary tabular-nums">{formatPercentBR(equipUtil)}</span>
            </div>
            <div className="w-full h-2 bg-sunken rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--res-equipment-bar)] rounded-full transition-all"
                style={{ width: `${Math.max(equipUtil > 0 ? 4 : 0, Math.min(100, equipUtil))}%` }}
              />
            </div>
            <p className="text-xs text-ink-secondary tabular-nums">
              {equipCount} ativo(s) · {equipMinutes} min alocados
            </p>
          </div>
        </div>
      </section>

      {/* Indicadores operacionais e financeiros */}
      <section aria-label="Indicadores operacionais e financeiros" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface border border-border-subtle rounded-xl p-5 space-y-1.5 shadow-xs">
          <div className="text-xs font-medium text-ink-secondary">Taxa de faltas</div>
          <div className="text-2xl font-bold text-ink-primary tabular-nums">
            {formatPercentBR(kpis?.noShowRatePercent ?? 0)}
          </div>
          <p className="text-xs text-ink-secondary tabular-nums">
            {kpis?.noShowCount ?? 0} falta(s) em {kpis?.confirmedOrCompletedBookings ?? 0} reservas ativas ou concluídas
          </p>
        </div>

        <div className="bg-surface border border-border-subtle rounded-xl p-5 space-y-1.5 shadow-xs">
          <div className="text-xs font-medium text-ink-secondary">Receita protegida por sinais</div>
          <div className="text-2xl font-bold text-ink-primary tabular-nums">
            {formatCurrencyBRL(kpis?.protectedRevenueCents ?? 0)}
          </div>
          <p className="text-xs text-ink-secondary">
            Valor retido em cancelamentos fora do prazo e faltas
          </p>
        </div>

        <div className="bg-surface border border-border-subtle rounded-xl p-5 space-y-1.5 shadow-xs">
          <div className="text-xs font-medium text-ink-secondary">Receita recuperada pela lista de espera</div>
          <div className="text-2xl font-bold text-ink-primary tabular-nums">
            {formatCurrencyBRL(kpis?.waitlistRecoveredRevenueCents ?? 0)}
          </div>
          <p className="text-xs text-ink-secondary tabular-nums">
            {kpis?.waitlistRecoveredBookings ?? 0} vaga(s) preenchida(s) · {kpis?.waitingInQueue ?? 0} aguardando na fila
          </p>
        </div>
      </section>

      {/* Alertas e Próximas Ações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-surface border border-border-subtle rounded-xl p-5 space-y-3 shadow-xs">
          <h2 className="text-sm font-semibold text-ink-primary">Alertas e ações pendentes</h2>

          <div className="space-y-2.5">
            {isAtQuotaLimit && (
              <div className="p-3.5 rounded-lg bg-[var(--status-pending-bg)] border border-[var(--status-pending-border)] flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-[var(--status-pending-text)] shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-semibold text-ink-primary">
                      Limite de recursos atingido ({activeResources} de {maxActiveResources})
                    </div>
                    <div className="text-ink-secondary mt-0.5">
                      O {formatPlanName(plan)} atingiu a capacidade máxima de recursos ativos.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('billing')}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface hover:bg-sunken text-[var(--status-pending-text)] border border-[var(--status-pending-border)] transition"
                >
                  Fazer upgrade
                </button>
              </div>
            )}

            {activeOffers.length > 0 && (
              <div className="p-3.5 rounded-lg bg-[var(--brand-subtle)] border border-brand/30 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-semibold text-ink-primary tabular-nums">
                      {activeOffers.length} vaga(s) reservada(s) aguardando resposta
                    </div>
                    <div className="text-ink-secondary mt-0.5">
                      Há pacientes na lista de espera com oferta ativa para horários liberados.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('waitlist')}
                  className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white transition"
                >
                  Ver fila
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {pendingDepositBookings.length > 0 && (
              <div className="p-3.5 rounded-lg bg-canvas border border-border-subtle flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-[var(--status-pending-text)] shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-semibold text-ink-primary tabular-nums">
                      {pendingDepositBookings.length} reserva(s) aguardando confirmação de sinal
                    </div>
                    <div className="text-ink-secondary mt-0.5">
                      Confirme o recebimento do sinal para garantir o bloqueio definitivo dos recursos.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('bookings')}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-sunken text-ink-primary border border-border-subtle transition"
                >
                  Revisar
                </button>
              </div>
            )}

            {!isAtQuotaLimit && activeOffers.length === 0 && pendingDepositBookings.length === 0 && (
              <div className="p-4 rounded-lg bg-canvas border border-border-subtle flex items-center gap-2.5 text-xs text-ink-secondary">
                <CheckCircle2 className="w-4 h-4 text-[var(--status-confirmed-text)] shrink-0" />
                <span>Operação em dia. Não há bloqueios de limite nem ofertas pendentes no momento.</span>
              </div>
            )}
          </div>
        </section>

        {/* Próximos agendamentos confirmados */}
        <section className="bg-surface border border-border-subtle rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-primary">Próximos atendimentos confirmados</h2>
            <button
              type="button"
              onClick={() => onNavigate('bookings')}
              className="text-xs text-brand hover:underline font-medium"
            >
              Ver todas as reservas
            </button>
          </div>

          {upcomingConfirmed.length === 0 ? (
            <div className="p-4 rounded-lg bg-canvas border border-border-subtle text-xs text-ink-secondary">
              Nenhum atendimento confirmado para os próximos horários.
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {upcomingConfirmed.map((b) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-ink-primary">{cleanPersonName(b.clientName)}</div>
                    <div className="text-ink-secondary">{b.procedureName}</div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
                    <div className="font-medium text-ink-primary">
                      {formatDateBR(b.startAt)} · {formatTimeBR(b.startAt)}–{formatTimeBR(b.endAt)}
                    </div>
                    <div className="text-[var(--status-confirmed-text)] font-medium">{formatBookingStatus(b.status)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
