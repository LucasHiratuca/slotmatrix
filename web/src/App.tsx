import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiHttpError,
  apiRequest,
  BookableResourceDto,
  BookingDto,
  KpiSummaryDto,
  resolveWorkspaceQuota,
  ServiceProcedureDto,
  TimelineMatrixResponse,
  WaitlistEntryDto,
  WorkspaceOverview,
  WorkspaceSummary,
} from './api';
import { ResourceTimelineMatrix } from './ResourceTimelineMatrix';
import {
  AgendaPreviewPrototypes,
  AgendaPreviewVariant,
} from './AgendaPreviewPrototypes';
import { SmartBookingWizard } from './SmartBookingWizard';
import { WaitlistLiveRoom } from './WaitlistLiveRoom';
import { BillingView } from './BillingView';
import { PublicBookingPage } from './PublicBookingPage';
import { OverviewView } from './OverviewView';
import { ResourcesView } from './ResourcesView';
import { ProceduresView } from './ProceduresView';
import { AuditView, AuditEntryItem } from './AuditView';
import { LoginView } from './LoginView';
import { ResetPasswordView } from './ResetPasswordView';
import { ErrorBoundary } from './ErrorBoundary';
import { ProfileModal } from './ProfileModal';
import { Avatar } from './ui/Primitives';
import {
  formatApiError,
  formatIsoDateInClinicTz,
  formatPlanShort,
  formatRole,
  formatSubscriptionStatus,
  getTodayClinicIsoDate,
  resolveUserProfile,
} from './labels';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Box,
  Building2,
  Calendar,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  User,
  X,
} from 'lucide-react';

export type ActivePage =
  | 'overview'
  | 'agenda'
  | 'bookings'
  | 'waitlist'
  | 'resources'
  | 'procedures'
  | 'billing'
  | 'audit';

export const App: React.FC = () => {
  const initialSlugMatch = window.location.pathname.match(/^\/book\/([^/]+)/);
  const [publicPortalSlug, setPublicPortalSlug] = useState<string | null>(
    initialSlugMatch ? initialSlugMatch[1] : null,
  );

  const initialPreviewMatch = window.location.pathname.match(
    /^\/__preview\/agenda-([abc])/i,
  );
  const [previewAgendaVariant, setPreviewAgendaVariant] =
    useState<AgendaPreviewVariant | null>(
      initialPreviewMatch
        ? (initialPreviewMatch[1].toLowerCase() as AgendaPreviewVariant)
        : null,
    );

  const initialResetToken =
    window.location.pathname.startsWith('/reset-password')
      ? new URLSearchParams(window.location.search).get('token')
      : null;
  const [resetPasswordToken, setResetPasswordToken] = useState<string | null>(initialResetToken);

  // Tema Claro como padrão ("Calor Clínico"), persistido em localStorage
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('slotmatrix_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('slotmatrix_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(() =>
    localStorage.getItem('slotmatrix_user_email'),
  );
  const [currentUserName, setCurrentUserName] = useState<string | null>(() =>
    localStorage.getItem('slotmatrix_user_name'),
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(() =>
    localStorage.getItem('slotmatrix_user_id'),
  );
  const [currentUserBio, setCurrentUserBio] = useState<string>(() =>
    localStorage.getItem('slotmatrix_user_bio') || '',
  );
  const [currentUserPhotoUrl, setCurrentUserPhotoUrl] = useState<string | null>(() =>
    localStorage.getItem('slotmatrix_user_photo_url'),
  );
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() =>
    localStorage.getItem('slotmatrix_workspace_id'),
  );

  const isExplicitDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  const [email, setEmail] = useState(() =>
    isExplicitDemoMode ? 'owner@vitascan.test' : '',
  );
  const [password, setPassword] = useState(() =>
    isExplicitDemoMode ? 'Passw0rd!' : '',
  );
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [activePage, setActivePage] = useState<ActivePage>('agenda');
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getTodayClinicIsoDate(),
  );

  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [kpis, setKpis] = useState<KpiSummaryDto | null>(null);
  const [timeline, setTimeline] = useState<TimelineMatrixResponse | null>(null);
  const [procedures, setProcedures] = useState<ServiceProcedureDto[]>([]);
  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntryDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntryItem[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date>(() => new Date());

  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState<boolean>(() =>
    Boolean(localStorage.getItem('slotmatrix_workspace_id')),
  );
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);

  const [openNewBookingOnNavigate, setOpenNewBookingOnNavigate] = useState(false);
  const [prefillBookingHour, setPrefillBookingHour] = useState<number | null>(null);
  const [prefillProcedureId, setPrefillProcedureId] = useState<string | null>(null);
  const [prefillClientName, setPrefillClientName] = useState<string | null>(null);
  const [prefillClientEmail, setPrefillClientEmail] = useState<string | null>(null);

  const handleOptimisticBookingUpdate = useCallback(
    (bookingId: string, newStatus: BookingDto['status'], updatedBooking?: BookingDto) => {
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId
            ? updatedBooking
              ? { ...b, ...updatedBooking }
              : { ...b, status: newStatus }
            : b,
        ),
      );
      setTimeline((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          resources: prev.resources.map((row) => ({
            ...row,
            allocations:
              newStatus === 'CANCELLED'
                ? row.allocations.filter((a) => a.bookingId !== bookingId)
                : row.allocations.map((a) =>
                    a.bookingId === bookingId ? { ...a, bookingStatus: newStatus } : a,
                  ),
          })),
        };
      });
    },
    [],
  );

  const [copiedPortalLink, setCopiedPortalLink] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = useCallback((reasonMessage?: string) => {
    localStorage.removeItem('slotmatrix_token');
    localStorage.removeItem('slotmatrix_workspace_id');
    localStorage.removeItem('slotmatrix_user_email');
    localStorage.removeItem('slotmatrix_user_name');
    localStorage.removeItem('slotmatrix_user_id');
    localStorage.removeItem('slotmatrix_user_bio');
    localStorage.removeItem('slotmatrix_user_photo_url');
    void apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAuthenticated(false);
    setCurrentUserEmail(null);
    setCurrentUserName(null);
    setCurrentUserId(null);
    setCurrentUserBio('');
    setCurrentUserPhotoUrl(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setOverview(null);
    setKpis(null);
    setTimeline(null);
    setProcedures([]);
    setBookings([]);
    setWaitlist([]);
    setAuditLogs([]);
    setIsLoadingWorkspace(false);
    setWorkspaceLoadError(null);
    if (typeof reasonMessage === 'string' && reasonMessage) {
      setLoginError(reasonMessage);
    }
  }, []);

  const handleLogin = async (loginEmail: string, loginPass: string) => {
    setLoginError(null);
    setWorkspaceLoadError(null);
    setIsLoggingIn(true);
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
      const wsList = Array.isArray(res.workspaces) ? res.workspaces : [];
      const preferred =
        wsList.find((w) => w.slug === 'vitascan-diagnosticos') ??
        wsList.find((w) => w.slug === 'estudio-aura') ??
        wsList[0];

      // Segurança: JWT é mantido exclusivamente em cookie HttpOnly (não em localStorage)
      localStorage.removeItem('slotmatrix_token');
      localStorage.setItem('slotmatrix_user_email', res.email ?? loginEmail);
      if (res.name) {
        localStorage.setItem('slotmatrix_user_name', res.name);
      }
      if ((res as any).userId) {
        setCurrentUserId((res as any).userId);
        localStorage.setItem('slotmatrix_user_id', (res as any).userId);
      }
      void apiRequest<{ bio?: string; photoUrl?: string | null; userId?: string }>('/auth/session')
        .then((s) => {
          if (s?.bio) {
            setCurrentUserBio(s.bio);
            localStorage.setItem('slotmatrix_user_bio', s.bio);
          }
          if (s?.photoUrl) {
            const p = `${s.photoUrl}?v=${Date.now()}`;
            setCurrentUserPhotoUrl(p);
            localStorage.setItem('slotmatrix_user_photo_url', p);
          }
          if (s?.userId) {
            setCurrentUserId(s.userId);
            localStorage.setItem('slotmatrix_user_id', s.userId);
          }
        })
        .catch(() => undefined);
      setOverview(null);
      setIsLoadingWorkspace(true);
      setAuthenticated(true);
      setCurrentUserEmail(res.email ?? loginEmail);
      setCurrentUserName(res.name ?? null);
      setWorkspaces(wsList);

      if (preferred) {
        localStorage.setItem('slotmatrix_workspace_id', preferred.id);
        setActiveWorkspaceId(preferred.id);
      } else {
        localStorage.removeItem('slotmatrix_workspace_id');
        setActiveWorkspaceId(null);
        setIsLoadingWorkspace(false);
        setWorkspaceLoadError('Nenhuma clínica foi encontrada para esta conta.');
      }
    } catch (err: any) {
      setIsLoadingWorkspace(false);
      setLoginError(formatApiError(err.message ?? 'Falha na autenticação'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (data: {
    name: string;
    email: string;
    password: string;
    workspaceName: string;
  }) => {
    setLoginError(null);
    setWorkspaceLoadError(null);
    setIsLoggingIn(true);
    try {
      const res = await apiRequest<{
        token: string;
        userId: string;
        workspaceId: string;
        email?: string;
        name?: string;
        workspaces?: WorkspaceSummary[];
      }>('/auth/register', {
        method: 'POST',
        body: data,
      });

      let wsList = Array.isArray(res.workspaces) ? res.workspaces : [];
      if (wsList.length === 0 && res.workspaceId) {
        wsList = [
          {
            id: res.workspaceId,
            name: data.workspaceName,
            slug: data.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            plan: 'STARTER',
            role: 'OWNER',
            subscriptionStatus: 'TRIALING',
          },
        ];
      }
      const preferred = wsList[0];

      // Segurança: JWT é mantido exclusivamente em cookie HttpOnly (não em localStorage)
      localStorage.removeItem('slotmatrix_token');
      localStorage.setItem('slotmatrix_user_email', res.email ?? data.email);
      if (res.name ?? data.name) {
        localStorage.setItem('slotmatrix_user_name', res.name ?? data.name);
      }
      if (res.userId) {
        setCurrentUserId(res.userId);
        localStorage.setItem('slotmatrix_user_id', res.userId);
      }

      setOverview(null);
      setIsLoadingWorkspace(true);
      setAuthenticated(true);
      setCurrentUserEmail(res.email ?? data.email);
      setCurrentUserName(res.name ?? data.name);
      setWorkspaces(wsList);

      if (preferred) {
        localStorage.setItem('slotmatrix_workspace_id', preferred.id);
        setActiveWorkspaceId(preferred.id);
      } else if (res.workspaceId) {
        localStorage.setItem('slotmatrix_workspace_id', res.workspaceId);
        setActiveWorkspaceId(res.workspaceId);
      } else {
        localStorage.removeItem('slotmatrix_workspace_id');
        setActiveWorkspaceId(null);
        setIsLoadingWorkspace(false);
        setWorkspaceLoadError('Nenhuma clínica foi encontrada para esta conta.');
      }
    } catch (err: any) {
      setIsLoadingWorkspace(false);
      const errMsg = formatApiError(err.message ?? 'Falha no cadastro');
      setLoginError(errMsg);
      throw new Error(errMsg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPassword = async (forgotEmail: string) => {
    return apiRequest<{
      message: string;
      resetUrl?: string;
      delivered?: boolean;
      error?: string;
      note?: string;
    }>('/auth/forgot-password', {
      method: 'POST',
      body: { email: forgotEmail },
    });
  };

  const refreshWorkspaceData = useCallback(
    async (silent = false) => {
      if (!authenticated) return;
      if (!silent) {
        setIsLoadingWorkspace(true);
      }
      setWorkspaceLoadError(null);

      try {
        const wsList = await apiRequest<WorkspaceSummary[]>('/me/workspaces');
        if (!Array.isArray(wsList) || wsList.length === 0) {
          handleLogout(
            'Sua sessão expirou ou não possui clínicas ativas. Entre novamente.',
          );
          return;
        }
        setWorkspaces(wsList);

        let targetWorkspaceId = activeWorkspaceId;
        if (!targetWorkspaceId || !wsList.some((w) => w.id === targetWorkspaceId)) {
          targetWorkspaceId = wsList[0].id;
          localStorage.setItem('slotmatrix_workspace_id', targetWorkspaceId);
          setActiveWorkspaceId(targetWorkspaceId);
        }

        const [ov, kpiData, tlData, procs, bks, wl] = await Promise.all([
          apiRequest<WorkspaceOverview>('/workspace', {
            workspaceId: targetWorkspaceId,
          }),
          apiRequest<KpiSummaryDto>('/dashboard/kpis', {
            workspaceId: targetWorkspaceId,
          }),
          apiRequest<TimelineMatrixResponse>(`/timeline?date=${selectedDate}`, {
            workspaceId: targetWorkspaceId,
          }),
          apiRequest<ServiceProcedureDto[]>('/procedures', {
            workspaceId: targetWorkspaceId,
          }),
          apiRequest<BookingDto[]>('/bookings', {
            workspaceId: targetWorkspaceId,
          }),
          apiRequest<WaitlistEntryDto[]>('/waitlist', {
            workspaceId: targetWorkspaceId,
          }),
        ]);

        setOverview(ov);
        setKpis(kpiData);
        setTimeline(tlData);
        setProcedures(Array.isArray(procs) ? procs : []);
        setBookings(Array.isArray(bks) ? bks : []);
        setWaitlist(Array.isArray(wl) ? wl : []);
        setLastUpdatedAt(new Date());

        if (
          Array.isArray(bks) &&
          bks.length > 0 &&
          Array.isArray(tlData?.resources) &&
          tlData.resources.every((r) => !r.allocations || r.allocations.length === 0)
        ) {
          const firstBookingDate = bks[0]?.startAt
            ? formatIsoDateInClinicTz(bks[0].startAt)
            : '';
          if (firstBookingDate && firstBookingDate !== selectedDate) {
            setSelectedDate(firstBookingDate);
          }
        }

        if (ov?.role === 'OWNER' || ov?.role === 'ADMIN') {
          const logs = await apiRequest<AuditEntryItem[]>('/audit-logs', {
            workspaceId: targetWorkspaceId,
          }).catch(() => []);
          setAuditLogs(Array.isArray(logs) ? logs : []);
        } else {
          setAuditLogs([]);
        }
      } catch (err: unknown) {
        if (err instanceof ApiHttpError && err.status === 401) {
          handleLogout('Sua sessão expirou. Por favor, entre novamente.');
          return;
        }
        const message =
          err instanceof ApiHttpError
            ? formatApiError(err.message, err.code)
            : 'Não foi possível carregar os dados da clínica. Verifique sua conexão e tente novamente.';
        setWorkspaceLoadError(message);
      } finally {
        setIsLoadingWorkspace(false);
      }
    },
    [authenticated, activeWorkspaceId, selectedDate, handleLogout],
  );

  useEffect(() => {
    let cancelled = false;
    localStorage.removeItem('slotmatrix_token');
    (async () => {
      try {
        const session = await apiRequest<{
          authenticated: boolean;
          userId?: string;
          email?: string;
          name?: string;
          bio?: string;
          photoUrl?: string | null;
          workspaces?: WorkspaceSummary[];
        }>('/auth/session');
        if (cancelled) return;
        if (session?.authenticated) {
          const wsList = Array.isArray(session.workspaces) ? session.workspaces : [];
          setAuthenticated(true);
          if (session.userId) {
            setCurrentUserId(session.userId);
            localStorage.setItem('slotmatrix_user_id', session.userId);
          }
          if (session.email) {
            setCurrentUserEmail(session.email);
            localStorage.setItem('slotmatrix_user_email', session.email);
          }
          if (session.name) {
            setCurrentUserName(session.name);
            localStorage.setItem('slotmatrix_user_name', session.name);
          }
          if (session.bio !== undefined) {
            setCurrentUserBio(session.bio || '');
            localStorage.setItem('slotmatrix_user_bio', session.bio || '');
          }
          if (session.photoUrl !== undefined) {
            const initialPhoto = session.photoUrl ? `${session.photoUrl}?v=${Date.now()}` : null;
            setCurrentUserPhotoUrl(initialPhoto);
            if (initialPhoto) {
              localStorage.setItem('slotmatrix_user_photo_url', initialPhoto);
            } else {
              localStorage.removeItem('slotmatrix_user_photo_url');
            }
          }
          setWorkspaces(wsList);
          const storedWs = localStorage.getItem('slotmatrix_workspace_id');
          const preferred =
            (storedWs && wsList.find((w) => w.id === storedWs)) ??
            wsList.find((w) => w.slug === 'vitascan-diagnosticos') ??
            wsList.find((w) => w.slug === 'estudio-aura') ??
            wsList[0];
          if (preferred) {
            setActiveWorkspaceId(preferred.id);
            localStorage.setItem('slotmatrix_workspace_id', preferred.id);
          }
        } else {
          setAuthenticated(false);
          setIsLoadingWorkspace(false);
        }
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
          setIsLoadingWorkspace(false);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authenticated) {
      void refreshWorkspaceData(false);
    } else if (!isCheckingSession && previewAgendaVariant && isExplicitDemoMode && !isLoggingIn) {
      // Auto-autentica apenas em rotas de preview E quando VITE_DEMO_MODE=true
      void handleLogin('owner@vitascan.test', 'Passw0rd!');
    }
  }, [authenticated, isCheckingSession, refreshWorkspaceData, previewAgendaVariant, isExplicitDemoMode]);

  const [autoRefreshPaused, setAutoRefreshPaused] = useState<boolean>(false);

  useEffect(() => {
    if (!authenticated || !overview || autoRefreshPaused) return;
    const timer = window.setInterval(() => {
      void refreshWorkspaceData(true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [authenticated, overview, autoRefreshPaused, refreshWorkspaceData]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const quotaInfo = resolveWorkspaceQuota(overview);
  const maxRes = quotaInfo.maxActiveResources;
  const activeRes = quotaInfo.activeResources;
  const isAtQuotaLimit = quotaInfo.isAtQuotaLimit;

  const resourcesList: BookableResourceDto[] = useMemo(() => {
    if (!timeline?.resources) return [];
    return timeline.resources.map((r) => r.resource);
  }, [timeline]);

  const boundaryContext = {
    route: publicPortalSlug ? `/book/${publicPortalSlug}` : `/#${activePage}`,
    userEmail: currentUserEmail,
    workspaceId: activeWorkspaceId,
    plan: overview ? quotaInfo.plan : null,
  };

  const handleCopyPortalLink = async () => {
    if (!overview) return;
    const url = `${window.location.origin}/book/${overview.slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback silencioso
    }
    setCopiedPortalLink(true);
    window.setTimeout(() => setCopiedPortalLink(false), 2000);
  };

  if (publicPortalSlug) {
    return (
      <ErrorBoundary
        scope="section"
        sectionTitle="Portal de agendamento online"
        context={boundaryContext}
        onRetry={() => setPublicPortalSlug(publicPortalSlug)}
        onLogout={() => {
          window.history.pushState({}, '', '/');
          setPublicPortalSlug(null);
          handleLogout();
        }}
      >
        <PublicBookingPage
          slug={publicPortalSlug}
          onBackToApp={() => {
            window.history.pushState({}, '', '/');
            setPublicPortalSlug(null);
          }}
        />
      </ErrorBoundary>
    );
  }

  // Etapa 1.5: Tela de Redefinição de Senha
  if (resetPasswordToken) {
    return (
      <ResetPasswordView
        token={resetPasswordToken}
        onSuccess={() => {
          setResetPasswordToken(null);
          window.history.replaceState({}, '', '/');
        }}
        onCancel={() => {
          setResetPasswordToken(null);
          window.history.replaceState({}, '', '/');
        }}
        isDark={theme === 'dark'}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // Etapa 2: Tela de Login Split 44/56 ("Calor Clínico")
  if (!authenticated && !(isCheckingSession && isLoadingWorkspace)) {
    return (
      <LoginView
        email={email}
        password={password}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
        onRegister={handleRegister}
        onForgotPassword={handleForgotPassword}
        isLoggingIn={isLoggingIn}
        loginError={loginError}
        isDark={theme === 'dark'}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // Estado de erro ao carregar dados da clínica
  if (!overview && workspaceLoadError && !isLoadingWorkspace) {
    return (
      <div
        data-testid="workspace-load-error"
        className="min-h-screen bg-canvas text-ink-primary flex items-center justify-center p-6"
      >
        <div className="max-w-md w-full bg-surface border border-border-subtle rounded-2xl p-6 space-y-5 shadow-lg">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[var(--status-pending-bg)] border border-[var(--status-pending-border)] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-[var(--status-pending-text)]" />
            </div>
            <div className="space-y-1">
              <h1 className="text-[16px] font-semibold text-ink-primary">
                Não foi possível carregar os dados da clínica
              </h1>
              <p className="text-[13px] text-ink-secondary leading-relaxed">
                {workspaceLoadError}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void refreshWorkspaceData(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold bg-brand hover:bg-brand-hover text-brand-contrast transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => handleLogout()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium bg-sunken hover:bg-border-subtle text-ink-primary border border-border-subtle transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Skeleton explícito com a forma do layout enquanto sessão, clínica e limites carregam
  if (!overview) {
    return (
      <div
        data-testid="workspace-loading-skeleton"
        className="min-h-screen bg-canvas text-ink-primary flex flex-col"
      >
        <header className="h-14 border-b border-border-subtle bg-surface px-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-brand/20 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-brand animate-spin" />
            </div>
            <div className="h-4 w-44 bg-sunken rounded animate-pulse" />
          </div>
          <div className="h-8 w-36 bg-sunken rounded-lg animate-pulse" />
        </header>

        <div className="flex-1 flex">
          <aside className="hidden lg:block w-60 border-r border-border-subtle bg-surface p-4 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-8 bg-sunken rounded-lg animate-pulse" />
            ))}
          </aside>
          <main className="flex-1 p-6 space-y-5">
            <div className="flex items-center gap-2 text-[13px] text-ink-secondary">
              <Loader2 className="w-4 h-4 text-brand animate-spin" />
              <span>Carregando clínica, plano e limites de recursos...</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-surface border border-border-subtle rounded-xl p-5 space-y-2.5"
                >
                  <div className="h-3.5 w-28 bg-sunken rounded animate-pulse" />
                  <div className="h-7 w-20 bg-sunken rounded animate-pulse" />
                  <div className="h-3 w-36 bg-sunken rounded animate-pulse" />
                </div>
              ))}
            </div>
            <div className="bg-surface border border-border-subtle rounded-xl h-96 animate-pulse" />
          </main>
        </div>
      </div>
    );
  }

  const canManageResources =
    overview.role === 'OWNER' ||
    overview.role === 'ADMIN' ||
    overview.role === 'COORDINATOR';
  const canViewAdminPages =
    overview.role === 'OWNER' || overview.role === 'ADMIN';

  const pendingDepositsCount = bookings.filter(
    (b) => b.status === 'PENDING_DEPOSIT',
  ).length;
  const activeOffersCount = waitlist.filter((w) => w.status === 'OFFERED').length;
  const totalNotifications = pendingDepositsCount + activeOffersCount;

  const userProfile = resolveUserProfile(
    currentUserEmail,
    currentUserName,
    overview.role,
  );

  // Sidebar agrupada por intenção; badges apenas quando exigem ação; sem contador em Auditoria
  const navGroups: {
    groupTitle: string | null;
    items: {
      id: ActivePage;
      label: string;
      icon: React.ReactNode;
      actionBadge?: number;
      hasUrgentDot?: boolean;
      visible: boolean;
    }[];
  }[] = [
    {
      groupTitle: null,
      items: [
        {
          id: 'overview',
          label: 'Visão geral',
          icon: <LayoutDashboard className="w-4 h-4 shrink-0" strokeWidth={1.6} />,
          visible: true,
        },
      ],
    },
    {
      groupTitle: 'Operação',
      items: [
        {
          id: 'agenda',
          label: 'Agenda',
          icon: <Calendar className="w-4 h-4 shrink-0" strokeWidth={1.6} />,
          visible: true,
        },
        {
          id: 'bookings',
          label: 'Reservas',
          icon: <CalendarCheck className="w-4 h-4 shrink-0" strokeWidth={1.6} />,
          actionBadge: pendingDepositsCount > 0 ? pendingDepositsCount : undefined,
          visible: true,
        },
        {
          id: 'waitlist',
          label: 'Lista de espera',
          icon: <Clock className="w-4 h-4 shrink-0" strokeWidth={1.6} />,
          actionBadge: activeOffersCount > 0 ? activeOffersCount : undefined,
          hasUrgentDot: activeOffersCount > 0,
          visible: true,
        },
      ],
    },
    {
      groupTitle: 'Cadastros',
      items: [
        {
          id: 'resources',
          label: 'Recursos',
          icon: <Box className="w-4 h-4 shrink-0" strokeWidth={1.6} />,
          visible: true,
        },
        {
          id: 'procedures',
          label: 'Procedimentos',
          icon: <BookOpen className="w-4 h-4 shrink-0" strokeWidth={1.6} />,
          visible: true,
        },
      ],
    },
    {
      groupTitle: 'Clínica',
      items: [
        {
          id: 'billing',
          label: 'Plano e cobrança',
          icon: <CreditCard className="w-4 h-4 shrink-0" strokeWidth={1.6} />,
          visible: canViewAdminPages,
        },
        {
          id: 'audit',
          label: 'Auditoria',
          icon: <ShieldCheck className="w-4 h-4 shrink-0" strokeWidth={1.6} />,
          visible: canViewAdminPages,
        },
      ],
    },
  ];

  const allVisibleNavItems = navGroups
    .flatMap((g) => g.items)
    .filter((i) => i.visible);

  const planUsagePercent =
    maxRes !== null && maxRes > 0
      ? Math.min(100, Math.round((activeRes / maxRes) * 100))
      : 25;

  return (
    <div className="min-h-screen w-full overflow-x-hidden flex flex-col bg-canvas text-ink-primary">
      {/* Header de 56px (h-14) colado às bordas sem cortar o botão Sair */}
      <header className="w-full border-b border-border-subtle bg-surface shrink-0 z-30">
        <div className="w-full h-14 px-4 sm:px-5 flex items-center justify-between gap-3">
          {/* Esquerda: Marca + Seletor de Clínica */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div
                aria-hidden="true"
                className="w-7 h-7 rounded-lg bg-[var(--btn-primary-bg)] text-white flex items-center justify-center shadow-xs"
              >
                <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="3" width="9" height="3" rx="1.5" fill="currentColor" />
                  <rect x="2" y="7.5" width="9" height="3" rx="1.5" fill="currentColor" />
                  <rect x="12" y="7.5" width="4" height="3" rx="1" fill="currentColor" fillOpacity="0.45" />
                  <rect x="2" y="12" width="9" height="3" rx="1.5" fill="currentColor" />
                  <line x1="5.5" y1="4.5" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              <span className="text-[15px] font-semibold text-ink-primary">
                SlotMatrix
              </span>
            </div>

            <span className="text-border-strong shrink-0">/</span>

            <div className="flex items-center gap-1.5 bg-canvas border border-border-subtle rounded-lg px-2 sm:px-2.5 py-1 min-w-0">
              <Building2 className="w-3.5 h-3.5 text-brand shrink-0 hidden sm:block" strokeWidth={1.6} />
              <select
                aria-label="Selecionar clínica"
                value={activeWorkspaceId ?? ''}
                onChange={(e) => {
                  localStorage.setItem('slotmatrix_workspace_id', e.target.value);
                  setActiveWorkspaceId(e.target.value);
                }}
                className="max-w-[105px] sm:max-w-[240px] bg-transparent text-[12px] sm:text-[13px] font-medium text-ink-primary focus:outline-none cursor-pointer truncate"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id} className="bg-surface text-ink-primary">
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Direita: Busca (Ctrl+K), Notificações, Tema e Menu da Pessoa Logada */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden sm:inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-canvas hover:bg-sunken border border-border-subtle text-[13px] text-ink-secondary hover:text-ink-primary transition"
            >
              <Search className="w-3.5 h-3.5" strokeWidth={1.6} />
              <span>Buscar página ou recurso...</span>
              <kbd className="px-1.5 py-0.5 text-[11px] rounded bg-surface border border-border-subtle text-ink-muted tabular-nums">
                Ctrl+K
              </kbd>
            </button>

            {/* Notificações Operacionais */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((prev) => !prev);
                  setUserMenuOpen(false);
                }}
                aria-label="Notificações operacionais"
                className="relative p-2 rounded-lg bg-canvas hover:bg-sunken border border-border-subtle text-ink-secondary hover:text-ink-primary transition"
              >
                <Bell className="w-4 h-4" strokeWidth={1.6} />
                {totalNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--status-pending-border)] text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                    {totalNotifications}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-elevated border border-border-subtle rounded-xl shadow-xl p-3 space-y-2 z-50">
                  <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                    <span className="text-[13px] font-semibold text-ink-primary">
                      Atenção operacional
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      className="text-ink-muted hover:text-ink-primary"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {activeOffersCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setActivePage('waitlist');
                        setNotificationsOpen(false);
                      }}
                      className="w-full text-left p-2.5 rounded-lg bg-[var(--status-pending-bg)] border border-[var(--status-pending-border)] text-[13px] text-[var(--status-pending-text)]"
                    >
                      <strong>{activeOffersCount} vaga em oferta</strong> aguardando resposta na Lista de espera.
                    </button>
                  )}
                  {pendingDepositsCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setActivePage('bookings');
                        setNotificationsOpen(false);
                      }}
                      className="w-full text-left p-2.5 rounded-lg bg-brand-tint text-[13px] text-brand-tint-text"
                    >
                      <strong>{pendingDepositsCount} reserva(s)</strong> aguardando confirmação de sinal.
                    </button>
                  )}
                  {totalNotifications === 0 && (
                    <div className="py-4 text-center text-[13px] text-ink-secondary">
                      Nenhuma pendência operacional no momento.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Alternar Tema Claro / Escuro */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              className="p-2 rounded-lg bg-canvas hover:bg-sunken border border-border-subtle text-ink-secondary hover:text-ink-primary transition"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" strokeWidth={1.6} />
              ) : (
                <Moon className="w-4 h-4 text-ink-secondary" strokeWidth={1.6} />
              )}
            </button>

            {/* Menu do Usuário: Avatar + Nome + Papel (nunca o e-mail como título) */}
            <div className="relative flex items-center gap-1.5 pl-2 border-l border-border-subtle shrink-0">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen((prev) => !prev);
                  setNotificationsOpen(false);
                }}
                className="inline-flex items-center gap-2.5 px-2.5 py-1 rounded-lg bg-canvas hover:bg-sunken border border-border-subtle transition"
              >
                <Avatar name={userProfile.fullName} size="xs" src={currentUserPhotoUrl} />
                <div className="text-left hidden md:block">
                  <div className="text-[13px] font-semibold text-ink-primary leading-tight">
                    {userProfile.fullName}
                  </div>
                  <div className="text-[12px] text-ink-secondary leading-tight">
                    {userProfile.roleLabel}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-ink-muted" />
              </button>

              <button
                type="button"
                onClick={() => handleLogout()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium hover:bg-sunken text-ink-secondary hover:text-ink-primary transition shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.6} />
                <span>Sair</span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-11 w-64 bg-elevated border border-border-subtle rounded-xl shadow-xl p-3 space-y-2 z-50 animate-fade-in">
                  <div className="flex items-center gap-2.5 px-2 py-1.5 border-b border-border-subtle">
                    <Avatar name={userProfile.fullName} size="sm" src={currentUserPhotoUrl} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-ink-primary truncate">
                        {userProfile.fullName}
                      </div>
                      <div className="text-[12px] text-ink-secondary truncate">
                        {formatRole(overview.role)}
                      </div>
                      {currentUserEmail && (
                        <div className="text-[12px] text-ink-muted truncate">
                          {currentUserEmail}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      setIsProfileModalOpen(true);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-sunken text-[13px] text-ink-primary flex items-center gap-2 font-medium transition"
                  >
                    <User className="w-3.5 h-3.5 text-ink-secondary" />
                    <span>Meu Perfil</span>
                  </button>
                  <div className="my-1 border-t border-border-subtle" />
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-sunken text-[13px] text-[var(--status-error-text)] flex items-center gap-2 font-medium transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair da conta</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Banner de alerta quando assinatura está pendente ou cancelada */}
      {!overview.entitlements.subscriptionHealthy && (
        <div className="bg-[var(--status-error-bg)] border-b border-[var(--status-error-border)] px-6 py-2.5">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-[13px] text-[var(--status-error-text)]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>
                  Assinatura com status {formatSubscriptionStatus(quotaInfo.status)}:
                </strong>{' '}
                O cadastro de novos recursos e agendamentos está temporariamente bloqueado. Regularize em Plano e cobrança.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('billing')}
              className="px-3 py-1 rounded-lg bg-[var(--status-error-border)] text-white text-[13px] font-semibold shrink-0"
            >
              Regularizar assinatura
            </button>
          </div>
        </div>
      )}

      {/* Shell principal: Sidebar colada à esquerda + Conteúdo */}
      <div className="flex-1 flex flex-col lg:flex-row w-full">
        <aside className="w-full lg:w-60 border-b lg:border-b-0 lg:border-r border-border-subtle bg-surface flex flex-col justify-between shrink-0 p-3 gap-5">
          <nav aria-label="Navegação principal" className="space-y-4">
            {navGroups.map((group, gIdx) => {
              const visibleItems = group.items.filter((i) => i.visible);
              if (visibleItems.length === 0) return null;
              return (
                <div key={gIdx} className="space-y-1">
                  {group.groupTitle && (
                    <div className="px-3 pb-1 text-[12px] font-medium text-ink-muted">
                      {group.groupTitle}
                    </div>
                  )}
                  {visibleItems.map((item) => {
                    const isActive = activePage === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-nav-item="true"
                        onMouseUp={(e) => e.currentTarget.blur()}
                        onClick={() => setActivePage(item.id)}
                        className={`relative w-full flex items-center justify-between px-3 py-2 rounded-lg text-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 transition ${
                          isActive
                            ? 'bg-brand-tint text-brand-tint-text font-semibold'
                            : 'text-ink-secondary hover:bg-sunken hover:text-ink-primary font-normal'
                        }`}
                      >
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-brand"
                          />
                        )}
                        <span className="flex items-center gap-2.5">
                          {item.icon}
                          <span>{item.label}</span>
                        </span>
                        {item.actionBadge !== undefined && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] rounded-full font-semibold tabular-nums bg-[var(--status-pending-bg)] text-[var(--status-pending-text)] border border-[var(--status-pending-border)]">
                            {item.hasUrgentDot && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-pending-dot)]" />
                            )}
                            {item.actionBadge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          {/* Rodapé da Sidebar: Bloco do Plano + Linha compacta do Portal Online */}
          <div className="space-y-2.5 pt-3 border-t border-border-subtle">
            <div
              data-testid="plan-usage-bar"
              className={`rounded-xl border p-3 space-y-2 ${
                isAtQuotaLimit
                  ? 'bg-[var(--status-pending-bg)] border-[var(--status-pending-border)]'
                  : 'bg-canvas border-border-subtle'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="font-semibold text-ink-primary tabular-nums">
                  {maxRes !== null
                    ? `Plano ${formatPlanShort(quotaInfo.plan)} · ${activeRes} de ${maxRes} recursos`
                    : `Plano ${formatPlanShort(quotaInfo.plan)} · ${activeRes} recursos ativos`}
                </span>
              </div>

              <div className="w-full h-1.5 rounded-full bg-sunken overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isAtQuotaLimit
                      ? 'bg-[var(--status-pending-border)]'
                      : 'bg-brand'
                  }`}
                  style={{ width: `${planUsagePercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[12px] text-ink-secondary">
                <span>{formatSubscriptionStatus(quotaInfo.status)}</span>
                {canViewAdminPages && (
                  <button
                    type="button"
                    onClick={() => setActivePage('billing')}
                    className="text-brand hover:underline font-medium"
                  >
                    {isAtQuotaLimit ? 'Fazer upgrade' : 'Gerenciar plano'}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg hover:bg-sunken transition">
              <button
                type="button"
                title="Abrir portal de agendamento online"
                onClick={() => {
                  window.history.pushState({}, '', `/book/${overview.slug}`);
                  setPublicPortalSlug(overview.slug);
                }}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-secondary hover:text-ink-primary transition min-w-0 truncate"
              >
                <ExternalLink className="w-3.5 h-3.5 text-brand shrink-0" strokeWidth={1.6} />
                <span className="truncate">Portal online</span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopyPortalLink()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-canvas hover:bg-surface border border-border-subtle text-[12px] font-medium text-ink-secondary hover:text-ink-primary transition shrink-0"
              >
                {copiedPortalLink ? (
                  <>
                    <Check className="w-3 h-3 text-[var(--status-confirmed-border)]" />
                    <span className="text-[var(--status-confirmed-text)]">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-ink-muted" />
                    <span>Copiar link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>

        {/* Área de conteúdo principal */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-5">
          {activePage === 'overview' && (
            <ErrorBoundary
              scope="section"
              sectionTitle="Visão geral"
              context={boundaryContext}
              onRetry={() => void refreshWorkspaceData(false)}
              onLogout={() => handleLogout()}
            >
              <OverviewView
                kpis={kpis}
                bookings={bookings}
                waitlist={waitlist}
                activeResources={activeRes}
                maxActiveResources={maxRes}
                isAtQuotaLimit={isAtQuotaLimit}
                plan={quotaInfo.plan}
                onNavigate={(page) => setActivePage(page)}
                onOpenNewBooking={() => {
                  setOpenNewBookingOnNavigate(true);
                  setActivePage('bookings');
                }}
              />
            </ErrorBoundary>
          )}

          {activePage === 'agenda' && activeWorkspaceId && (
            <ErrorBoundary
              scope="section"
              sectionTitle="Agenda"
              context={boundaryContext}
              onRetry={() => void refreshWorkspaceData(false)}
              onLogout={() => handleLogout()}
            >
              {previewAgendaVariant ? (
                <AgendaPreviewPrototypes
                  variant={previewAgendaVariant}
                  onChangeVariant={(v) => {
                    setPreviewAgendaVariant(v);
                    window.history.pushState({}, '', `/__preview/agenda-${v}`);
                  }}
                  timeline={timeline}
                  bookings={bookings}
                  procedures={procedures}
                  kpis={kpis}
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                  onRefresh={() => refreshWorkspaceData(false)}
                  onQuickSchedule={(prefill) => {
                    if (prefill?.hour !== undefined) {
                      setPrefillBookingHour(prefill.hour);
                    }
                    setPreviewAgendaVariant(null);
                    setOpenNewBookingOnNavigate(true);
                    setActivePage('bookings');
                  }}
                />
              ) : (
                <ResourceTimelineMatrix
                  token=""
                  workspaceId={activeWorkspaceId}
                  timeline={timeline}
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                  procedures={procedures}
                  bookings={bookings}
                  resourcesCatalog={resourcesList}
                  auditLogs={auditLogs}
                  waitlist={waitlist}
                  role={overview.role}
                  onOptimisticStatusUpdate={handleOptimisticBookingUpdate}
                  onRefresh={() => refreshWorkspaceData(false)}
                  kpis={kpis}
                  lastUpdatedAt={lastUpdatedAt}
                  onQuickSchedule={(prefill) => {
                    if (prefill?.hour !== undefined) {
                      setPrefillBookingHour(prefill.hour);
                    }
                    if (prefill?.procedureId) {
                      setPrefillProcedureId(prefill.procedureId);
                    }
                    if (prefill?.clientName) {
                      setPrefillClientName(prefill.clientName);
                    }
                    if (prefill?.clientEmail) {
                      setPrefillClientEmail(prefill.clientEmail);
                    }
                    setOpenNewBookingOnNavigate(true);
                    setActivePage('bookings');
                  }}
                  onNavigateToWaitlist={() => setActivePage('waitlist')}
                  onPauseAutoRefresh={setAutoRefreshPaused}
                />
              )}
            </ErrorBoundary>
          )}

          {activePage === 'bookings' && activeWorkspaceId && (
            <ErrorBoundary
              scope="section"
              sectionTitle="Reservas"
              context={boundaryContext}
              onRetry={() => void refreshWorkspaceData(false)}
              onLogout={() => handleLogout()}
            >
              <SmartBookingWizard
                token=""
                workspaceId={activeWorkspaceId}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                procedures={procedures}
                bookings={bookings}
                resourcesCatalog={resourcesList}
                auditLogs={auditLogs}
                role={overview.role}
                onOptimisticStatusUpdate={handleOptimisticBookingUpdate}
                onRefresh={() => refreshWorkspaceData(false)}
                initialOpenNewBooking={openNewBookingOnNavigate}
                initialPrefillHour={prefillBookingHour}
                initialProcedureId={prefillProcedureId}
                initialClientName={prefillClientName}
                initialClientEmail={prefillClientEmail}
                onConsumePrefill={() => {
                  setOpenNewBookingOnNavigate(false);
                  setPrefillBookingHour(null);
                  setPrefillProcedureId(null);
                  setPrefillClientName(null);
                  setPrefillClientEmail(null);
                }}
              />
            </ErrorBoundary>
          )}

          {activePage === 'waitlist' && activeWorkspaceId && (
            <ErrorBoundary
              scope="section"
              sectionTitle="Lista de espera"
              context={boundaryContext}
              onRetry={() => void refreshWorkspaceData(false)}
              onLogout={() => handleLogout()}
            >
              <WaitlistLiveRoom
                token=""
                workspaceId={activeWorkspaceId}
                selectedDate={selectedDate}
                procedures={procedures}
                waitlist={waitlist}
                onRefresh={() => refreshWorkspaceData(false)}
              />
            </ErrorBoundary>
          )}

          {activePage === 'resources' && activeWorkspaceId && (
            <ErrorBoundary
              scope="section"
              sectionTitle="Recursos"
              context={boundaryContext}
              onRetry={() => void refreshWorkspaceData(false)}
              onLogout={() => handleLogout()}
            >
              <ResourcesView
                token=""
                workspaceId={activeWorkspaceId}
                resources={resourcesList}
                activeResources={activeRes}
                maxActiveResources={maxRes}
                isAtQuotaLimit={isAtQuotaLimit}
                plan={quotaInfo.plan}
                canManageResources={canManageResources}
                onRefresh={() => refreshWorkspaceData(false)}
                onNavigateToBilling={() => setActivePage('billing')}
              />
            </ErrorBoundary>
          )}

          {activePage === 'procedures' && (
            <ErrorBoundary
              scope="section"
              sectionTitle="Procedimentos"
              context={boundaryContext}
              onRetry={() => void refreshWorkspaceData(false)}
              onLogout={() => handleLogout()}
            >
              <ProceduresView
                procedures={procedures}
                workspaceId={activeWorkspaceId ?? ''}
                token=""
                plan={overview?.subscription?.plan ?? 'STARTER'}
                securityDepositEnabled={overview?.entitlements?.securityDepositEnabled ?? false}
                canManageProcedures={canManageResources}
                onRefresh={() => refreshWorkspaceData(false)}
                onScheduleProcedure={(procedureId) => {
                  setPrefillProcedureId(procedureId);
                  setOpenNewBookingOnNavigate(true);
                  setActivePage('bookings');
                }}
              />
            </ErrorBoundary>
          )}

          {activePage === 'billing' && activeWorkspaceId && (
            <ErrorBoundary
              scope="section"
              sectionTitle="Plano e cobrança"
              context={boundaryContext}
              onRetry={() => void refreshWorkspaceData(false)}
              onLogout={() => handleLogout()}
            >
              <BillingView
                token=""
                workspaceId={activeWorkspaceId}
                overview={overview}
                onRefresh={() => refreshWorkspaceData(false)}
              />
            </ErrorBoundary>
          )}

          {activePage === 'audit' && (
            <ErrorBoundary
              scope="section"
              sectionTitle="Auditoria"
              context={boundaryContext}
              onRetry={() => void refreshWorkspaceData(false)}
              onLogout={() => handleLogout()}
            >
              <AuditView logs={auditLogs} role={overview.role} />
            </ErrorBoundary>
          )}
        </main>
      </div>

      {/* Modal de Busca Rápida (Command Palette) */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20 p-4"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-elevated border border-border-subtle rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-subtle">
              <Search className="w-4 h-4 text-brand" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ir para página, recurso ou procedimento..."
                className="flex-1 bg-transparent text-[14px] text-ink-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="text-ink-muted hover:text-ink-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-2 space-y-1">
              {allVisibleNavItems
                .filter((item) =>
                  item.label.toLowerCase().includes(searchQuery.toLowerCase()),
                )
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActivePage(item.id);
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-sunken text-[13px] text-ink-primary"
                  >
                    <span className="flex items-center gap-2">
                      {item.icon}
                      <span>Ir para {item.label}</span>
                    </span>
                    <span className="text-ink-muted">Página</span>
                  </button>
                ))}
              {resourcesList
                .filter((r) =>
                  r.name.toLowerCase().includes(searchQuery.toLowerCase()),
                )
                .slice(0, 5)
                .map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setActivePage('resources');
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-sunken text-[13px] text-ink-primary"
                  >
                    <span>{r.name}</span>
                    <span className="text-ink-muted">Recurso</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {isProfileModalOpen && (
        <ProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          userId={currentUserId || ''}
          userName={userProfile.fullName}
          userEmail={currentUserEmail || ''}
          userRole={userProfile.roleLabel}
          workspaceName={overview?.name}
          initialBio={currentUserBio}
          initialPhotoUrl={currentUserPhotoUrl}
          onProfileUpdated={(newBio, newPhotoUrl) => {
            setCurrentUserBio(newBio);
            localStorage.setItem('slotmatrix_user_bio', newBio);
            if (newPhotoUrl) {
              setCurrentUserPhotoUrl(newPhotoUrl);
              localStorage.setItem('slotmatrix_user_photo_url', newPhotoUrl);
            }
          }}
        />
      )}
    </div>
  );
};
