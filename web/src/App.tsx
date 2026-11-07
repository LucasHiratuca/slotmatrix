import React, { useCallback, useEffect, useState } from 'react';
import {
  apiRequest,
  BookingDto,
  formatMoneyBRL,
  KpiSummaryDto,
  ServiceProcedureDto,
  TimelineMatrixResponse,
  WaitlistEntryDto,
  WorkspaceOverview,
  WorkspaceSummary,
} from './api';
import { ResourceTimelineMatrix } from './ResourceTimelineMatrix';
import { SmartBookingWizard } from './SmartBookingWizard';
import { WaitlistLiveRoom } from './WaitlistLiveRoom';
import { BillingView } from './BillingView';
import { PublicBookingPage } from './PublicBookingPage';
import {
  Activity,
  Building2,
  CalendarRange,
  CreditCard,
  ExternalLink,
  Layers,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

type ActiveTab = 'timeline' | 'bookings' | 'waitlist' | 'billing' | 'audit' | 'public';

interface AuditEntryDto {
  id: string;
  tenantId: string;
  actorId: string | null;
  action: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export const App: React.FC = () => {
  // Check URL path for /book/:slug direct routing
  const initialSlugMatch = window.location.pathname.match(/^\/book\/([^/]+)/);
  const [publicPortalSlug, setPublicPortalSlug] = useState<string | null>(
    initialSlugMatch ? initialSlugMatch[1] : null,
  );

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('slotmatrix_token'));
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() =>
    localStorage.getItem('slotmatrix_workspace_id'),
  );

  const [email, setEmail] = useState('owner@vitascan.test');
  const [password, setPassword] = useState('Passw0rd!');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('timeline');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date(Date.now() + 86400_000);
    if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [kpis, setKpis] = useState<KpiSummaryDto | null>(null);
  const [timeline, setTimeline] = useState<TimelineMatrixResponse | null>(null);
  const [procedures, setProcedures] = useState<ServiceProcedureDto[]>([]);
  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntryDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntryDto[]>([]);

  const handleLogin = async (loginEmail: string, loginPass: string) => {
    setLoginError(null);
    try {
      const res = await apiRequest<{
        token: string;
        userId: string;
        email: string;
        name: string;
        workspaces: WorkspaceSummary[];
      }>('/auth/login', {
        method: 'POST',
        body: { email: loginEmail, password: loginPass },
      });
      localStorage.setItem('slotmatrix_token', res.token);
      setToken(res.token);
      setWorkspaces(res.workspaces);
      const preferred =
        res.workspaces.find((w) => w.slug === 'vitascan-diagnosticos') ??
        res.workspaces.find((w) => w.slug === 'estudio-aura') ??
        res.workspaces[0];
      if (preferred) {
        localStorage.setItem('slotmatrix_workspace_id', preferred.id);
        setActiveWorkspaceId(preferred.id);
      }
    } catch (err: any) {
      setLoginError(err.message ?? 'Falha na autenticação');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('slotmatrix_token');
    localStorage.removeItem('slotmatrix_workspace_id');
    setToken(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setOverview(null);
  };

  const refreshWorkspaceData = useCallback(async () => {
    if (!token || !activeWorkspaceId) return;
    try {
      const [wsList, ov, kpiData, tlData, procs, bks, wl] = await Promise.all([
        apiRequest<WorkspaceSummary[]>('/me/workspaces', { token }),
        apiRequest<WorkspaceOverview>('/workspace', { token, workspaceId: activeWorkspaceId }),
        apiRequest<KpiSummaryDto>('/dashboard/kpis', { token, workspaceId: activeWorkspaceId }),
        apiRequest<TimelineMatrixResponse>(`/timeline?date=${selectedDate}`, {
          token,
          workspaceId: activeWorkspaceId,
        }),
        apiRequest<ServiceProcedureDto[]>('/procedures', { token, workspaceId: activeWorkspaceId }),
        apiRequest<BookingDto[]>('/bookings', { token, workspaceId: activeWorkspaceId }),
        apiRequest<WaitlistEntryDto[]>('/waitlist', { token, workspaceId: activeWorkspaceId }),
      ]);
      setWorkspaces(wsList);
      setOverview(ov);
      setKpis(kpiData);
      setTimeline(tlData);
      setProcedures(procs);
      setBookings(bks);
      setWaitlist(wl);

      // Sync selectedDate to the first active booking's date if current selectedDate has no allocations yet
      if (bks.length > 0 && tlData.resources.every((r) => r.allocations.length === 0)) {
        const firstBookingDate = bks[0].startAt.slice(0, 10);
        if (firstBookingDate !== selectedDate) {
          setSelectedDate(firstBookingDate);
        }
      }

      if (ov.role === 'OWNER' || ov.role === 'ADMIN') {
        const logs = await apiRequest<AuditEntryDto[]>('/audit-logs', {
          token,
          workspaceId: activeWorkspaceId,
        }).catch(() => []);
        setAuditLogs(logs);
      }
    } catch {
      // If token expired, reset session
    }
  }, [token, activeWorkspaceId, selectedDate]);

  useEffect(() => {
    if (token && !activeWorkspaceId) {
      apiRequest<WorkspaceSummary[]>('/me/workspaces', { token })
        .then((list) => {
          setWorkspaces(list);
          if (list[0]) {
            setActiveWorkspaceId(list[0].id);
            localStorage.setItem('slotmatrix_workspace_id', list[0].id);
          }
        })
        .catch(() => handleLogout());
    }
  }, [token, activeWorkspaceId]);

  useEffect(() => {
    void refreshWorkspaceData();
  }, [refreshWorkspaceData]);

  if (publicPortalSlug) {
    return (
      <PublicBookingPage
        slug={publicPortalSlug}
        onBackToApp={() => {
          window.history.pushState({}, '', '/');
          setPublicPortalSlug(null);
        }}
      />
    );
  }

  // Login Screen with 1-Click Demo Persona Buttons
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
              <Layers className="w-3.5 h-3.5" />
              SlotMatrix B2B Multi-Tenant SaaS
            </div>
            <h1 className="text-xl font-bold text-white pt-1">
              Multi-Resource Scheduling, Anti-No-Show &amp; Smart Waitlist
            </h1>
            <p className="text-xs text-slate-400">
              Alocação atômica simultânea de Especialista + Sala + Equipamento com buffers assimétricos de
              esterilização.
            </p>
          </div>

          {loginError && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
              {loginError}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleLogin(email, password);
            }}
            className="space-y-3.5"
          >
            <div>
              <label className="block text-xs text-slate-400 mb-1">E-mail Corporativo</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition"
            >
              Entrar no Console SlotMatrix
            </button>
          </form>

          {/* 1-Click Seed Personas */}
          <div className="border-t border-slate-800 pt-4 space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Acesso Rápido às Credenciais do Seed (1-Click):
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => void handleLogin('owner@vitascan.test', 'Passw0rd!')}
                className="text-left p-2.5 rounded-lg bg-indigo-950/40 hover:bg-indigo-950/70 border border-indigo-500/40 transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-white">
                    VitaScan Diagnósticos (PRO ACTIVE — OWNER)
                  </div>
                  <div className="text-[11px] text-indigo-300 font-mono">
                    owner@vitascan.test • 6 Recursos, Buffers 20m &amp; 3 na Smart Waitlist
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-indigo-500 text-white">
                  PRO
                </span>
              </button>

              <button
                onClick={() => void handleLogin('owner@aura.test', 'Passw0rd!')}
                className="text-left p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800/70 border border-slate-800 transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-white">
                    Estúdio Aura (STARTER — Quota no Limite 5/5)
                  </div>
                  <div className="text-[11px] text-amber-300 font-mono">
                    owner@aura.test • Criar 6º recurso dispara HTTP 402 QuotaExceededError
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  5/5 QUOTA
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void handleLogin('coord@vitascan.test', 'Passw0rd!')}
                  className="text-left p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px]"
                >
                  <div className="font-semibold text-slate-200">Coordinator</div>
                  <div className="text-slate-400 font-mono truncate">coord@vitascan.test</div>
                </button>
                <button
                  onClick={() => void handleLogin('spec@vitascan.test', 'Passw0rd!')}
                  className="text-left p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px]"
                >
                  <div className="font-semibold text-slate-200">Specialist (RBAC)</div>
                  <div className="text-slate-400 font-mono truncate">spec@vitascan.test</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const maxRes = overview?.usage.maxActiveResources;
  const activeRes = overview?.usage.activeResources ?? 0;
  const isAtQuotaLimit = maxRes !== null && maxRes !== undefined && activeRes >= maxRes;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top SaaS Navigation Bar with Workspace Switcher, Plan Badge & Resource Quota Meter */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow">
                SM
              </div>
              <div>
                <div className="text-sm font-bold text-white leading-none">SlotMatrix</div>
                <div className="text-[10px] font-mono text-slate-400">Multi-Resource Scheduling</div>
              </div>
            </div>

            {/* Workspace Switcher */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <select
                value={activeWorkspaceId ?? ''}
                onChange={(e) => {
                  const id = e.target.value;
                  setActiveWorkspaceId(id);
                  localStorage.setItem('slotmatrix_workspace_id', id);
                }}
                className="bg-transparent text-xs font-semibold text-white focus:outline-none"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id} className="bg-slate-900 text-white">
                    {w.name} ({w.plan} • {w.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Plan & Role Badges */}
            {overview && (
              <div className="hidden md:flex items-center gap-2">
                <span className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  {overview.subscription.plan} ({overview.subscription.status})
                </span>
                <span className="px-2 py-1 text-[11px] font-mono rounded-md bg-slate-800 text-slate-300">
                  Role: {overview.role}
                </span>
                <span
                  className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-md border ${
                    isAtQuotaLimit
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  BookableResources: {activeRes}/{maxRes ?? '∞'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {overview?.entitlements.publicBookingPortalEnabled && (
              <button
                onClick={() => setPublicPortalSlug(overview.slug)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-950/70 hover:bg-indigo-900/70 text-indigo-200 border border-indigo-500/40 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Portal Público (/book/{overview.slug})
              </button>
            )}

            <button
              onClick={() => void refreshWorkspaceData()}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
              title="Atualizar dados"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800"
            >
              <LogOut className="w-3.5 h-3.5" />
              Trocar Conta
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl w-full mx-auto px-4 py-6 space-y-6 flex-1">
        {/* Top Operational & Financial KPIs */}
        {kpis && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Taxa de Ocupação (Spec / Room / Equip)</span>
                <Activity className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-lg font-bold text-white mt-2 font-mono">
                {kpis.utilizationByCategory.SPECIALIST?.utilizationPercent ?? 0}% /{' '}
                <span className="text-emerald-400">
                  {kpis.utilizationByCategory.ROOM?.utilizationPercent ?? 0}%
                </span>{' '}
                / {kpis.utilizationByCategory.EQUIPMENT?.utilizationPercent ?? 0}%
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Sala inclui minutos de Turnaround / Esterilização
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Taxa de No-Show Operacional</span>
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-xl font-bold text-white mt-2 font-mono">
                {kpis.noShowRatePercent}%{' '}
                <span className="text-xs font-normal text-slate-400">
                  ({kpis.noShowCount} de {kpis.confirmedOrCompletedBookings} reservas)
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Protegido por política de SecurityDeposit
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Receita Protegida por Sinal Retido</span>
                <ShieldCheck className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-amber-300 mt-2 font-mono">
                {formatMoneyBRL(kpis.protectedRevenueCents)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Retenção proporcional em cancelamentos tardios / No-Show
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Receita Recuperada via Smart Waitlist</span>
                <TrendingUp className="w-4 h-4 text-fuchsia-400" />
              </div>
              <div className="text-xl font-bold text-fuchsia-300 mt-2 font-mono">
                {formatMoneyBRL(kpis.waitlistRecoveredRevenueCents)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {kpis.waitlistRecoveredBookings} vaga(s) preenchida(s) • {kpis.waitingInQueue} aguardando na fila
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'timeline'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            1. Resource Timeline Matrix (Buffers)
          </button>

          <button
            onClick={() => setActiveTab('bookings')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'bookings'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <CalendarRange className="w-4 h-4" />
            2. Smart Booking Wizard &amp; Reservas ({bookings.length})
          </button>

          <button
            onClick={() => setActiveTab('waitlist')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'waitlist'
                ? 'bg-fuchsia-600 text-white shadow'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Zap className="w-4 h-4" />
            3. Smart Waitlist Live Room ({waitlist.length})
            {waitlist.some((w) => w.status === 'OFFERED') && (
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-white text-fuchsia-700 font-bold animate-bounce">
                OFERTA ATIVA!
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('billing')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'billing'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            4. Planos, Quotas &amp; Billing Webhook
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'audit'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            5. AuditLog Imutável ({auditLogs.length})
          </button>
        </div>

        {/* Active View */}
        {activeTab === 'timeline' && activeWorkspaceId && (
          <ResourceTimelineMatrix
            token={token}
            workspaceId={activeWorkspaceId}
            timeline={timeline}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            procedures={procedures}
            onRefresh={refreshWorkspaceData}
          />
        )}

        {activeTab === 'bookings' && activeWorkspaceId && (
          <SmartBookingWizard
            token={token}
            workspaceId={activeWorkspaceId}
            selectedDate={selectedDate}
            procedures={procedures}
            bookings={bookings}
            onRefresh={refreshWorkspaceData}
          />
        )}

        {activeTab === 'waitlist' && activeWorkspaceId && (
          <WaitlistLiveRoom
            token={token}
            workspaceId={activeWorkspaceId}
            selectedDate={selectedDate}
            procedures={procedures}
            waitlist={waitlist}
            onRefresh={refreshWorkspaceData}
          />
        )}

        {activeTab === 'billing' && activeWorkspaceId && (
          <BillingView
            token={token}
            workspaceId={activeWorkspaceId}
            overview={overview}
            onRefresh={refreshWorkspaceData}
          />
        )}

        {activeTab === 'audit' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">
              Trilha de Auditoria Imutável (<code>AuditLog</code> — Protegida por Triggers MySQL BEFORE UPDATE/DELETE)
            </h3>
            <div className="divide-y divide-slate-800 text-xs font-mono">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-indigo-300 font-bold">{log.action}</span>{' '}
                    <span className="text-slate-400">resource={log.resourceId ?? 'n/a'}</span>
                    <div className="text-[11px] text-slate-500 truncate max-w-2xl">
                      {JSON.stringify(log.metadata)}
                    </div>
                  </div>
                  <span className="text-slate-400 shrink-0">{log.occurredAt.slice(0, 19)}Z</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
