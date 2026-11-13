import { AuthTokenService, Clock, PasswordHasher, UnitOfWork } from './shared/application/ports';
import { InProcessEventDispatcher } from './shared/application/InProcessEventDispatcher';
import { WorkspaceReadService } from './shared/application/WorkspaceReadService';
import { IAuditLogRepository, IEmailGateway, IUserRepository } from './tenancy/application/ports';
import { IWorkspaceRepository } from './tenancy/domain/repositories/IWorkspaceRepository';
import { ISubscriptionRepository } from './billing/domain/repositories/ISubscriptionRepository';
import { IBookableResourceRepository } from './catalog/domain/repositories/IBookableResourceRepository';
import { IServiceProcedureRepository } from './catalog/domain/repositories/IServiceProcedureRepository';
import { IBookingRepository } from './scheduling/domain/repositories/IBookingRepository';
import { IWaitlistRepository } from './scheduling/domain/repositories/IWaitlistRepository';
import { INotificationGateway, IWebhookChannelRepository } from './scheduling/application/ports';
import { IProcessedWebhookStore } from './billing/application/ports';
import { SubscriptionEntitlementPolicy } from './billing/application/SubscriptionEntitlementPolicy';
import { ProcessBillingWebhookUseCase } from './billing/application/ProcessBillingWebhookUseCase';
import { BillingWebhookAcl } from './billing/infrastructure/BillingWebhookAcl';
import { StripeBillingGateway } from './billing/infrastructure/stripe-client';
import {
  BootstrapWorkspaceOnSignupUseCase,
  ChangeMemberRoleUseCase,
  InviteWorkspaceMemberUseCase,
  LoginUseCase,
  RemoveWorkspaceMemberUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
} from './tenancy/application/use-cases';
import { AUDITED_EVENTS, OnDomainEventAuditHandler } from './tenancy/application/audit-handler';
import {
  CreateBookableResourceUseCase,
  CreateServiceProcedureUseCase,
  SetResourceMaintenanceBlockUseCase,
} from './catalog/application/use-cases';
import {
  CancelBookingUseCase,
  CheckInBookingUseCase,
  ClaimWaitlistOfferUseCase,
  CompleteBookingUseCase,
  ConfirmBookingDepositUseCase,
  CreateWebhookChannelUseCase,
  ExpireWaitlistOfferUseCase,
  JoinWaitlistUseCase,
  RecordBookingNoShowUseCase,
  ScheduleMultiResourceBookingUseCase,
} from './scheduling/application/use-cases';
import {
  OnBookingCancelledMatchWaitlistHandler,
  OnSubscriptionPlanChangedHandler,
  OnWaitlistOfferExpiredCascadeHandler,
} from './scheduling/application/event-handlers';
import {
  FindAvailableProcedureSlotsQuery,
  GetPublicBookingCatalogBySlugQuery,
  GetResourceTimelineMatrixQuery,
  GetWorkspaceSchedulingKpisQuery,
} from './scheduling/application/queries';

export interface Infrastructure {
  uow: UnitOfWork;
  clock: Clock;
  users: IUserRepository;
  workspaces: IWorkspaceRepository;
  subscriptions: ISubscriptionRepository;
  resources: IBookableResourceRepository;
  procedures: IServiceProcedureRepository;
  bookings: IBookingRepository;
  waitlist: IWaitlistRepository;
  webhookChannels: IWebhookChannelRepository;
  auditLogs: IAuditLogRepository;
  processedWebhooks: IProcessedWebhookStore;
  notifications: INotificationGateway;
  hasher: PasswordHasher;
  tokens: AuthTokenService;
  emails: IEmailGateway;
}

export interface AppConfig {
  billingWebhookSecret: string;
  selfBaseUrl?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  appPublicUrl?: string;
  isProduction?: boolean;
  enableBillingSimulator?: boolean;
  enableApiDocs?: boolean;
  corsOrigins?: string[];
}

export function buildContainer(infra: Infrastructure, config: AppConfig) {
  const dispatcher = new InProcessEventDispatcher();
  const entitlements = new SubscriptionEntitlementPolicy(infra.subscriptions);
  const base = { uow: infra.uow, dispatcher, clock: infra.clock };

  const tenancy = {
    register: new BootstrapWorkspaceOnSignupUseCase({
      ...base,
      users: infra.users,
      workspaces: infra.workspaces,
      subscriptions: infra.subscriptions,
      hasher: infra.hasher,
      tokens: infra.tokens,
    }),
    login: new LoginUseCase({ users: infra.users, hasher: infra.hasher, tokens: infra.tokens }),
    forgotPassword: new RequestPasswordResetUseCase({
      users: infra.users,
      emails: infra.emails,
      clock: infra.clock,
      appBaseUrl: config.appPublicUrl ?? config.selfBaseUrl,
    }),
    resetPassword: new ResetPasswordUseCase({
      users: infra.users,
      hasher: infra.hasher,
      clock: infra.clock,
    }),
    invite: new InviteWorkspaceMemberUseCase({ ...base, users: infra.users, workspaces: infra.workspaces }),
    changeRole: new ChangeMemberRoleUseCase({ ...base, workspaces: infra.workspaces }),
    removeMember: new RemoveWorkspaceMemberUseCase({ ...base, workspaces: infra.workspaces }),
  };

  const catalogDeps = { ...base, resources: infra.resources, procedures: infra.procedures, entitlements };
  const catalog = {
    createResource: new CreateBookableResourceUseCase(catalogDeps),
    setMaintenance: new SetResourceMaintenanceBlockUseCase(catalogDeps),
    createProcedure: new CreateServiceProcedureUseCase(catalogDeps),
  };

  const schedDeps = {
    ...base,
    resources: infra.resources,
    procedures: infra.procedures,
    bookings: infra.bookings,
    waitlist: infra.waitlist,
    webhookChannels: infra.webhookChannels,
    entitlements,
  };

  const scheduling = {
    scheduleBooking: new ScheduleMultiResourceBookingUseCase(schedDeps),
    confirmDeposit: new ConfirmBookingDepositUseCase(schedDeps),
    checkIn: new CheckInBookingUseCase(schedDeps),
    complete: new CompleteBookingUseCase(schedDeps),
    cancelBooking: new CancelBookingUseCase(schedDeps),
    recordNoShow: new RecordBookingNoShowUseCase(schedDeps),
    joinWaitlist: new JoinWaitlistUseCase(schedDeps),
    claimWaitlistOffer: new ClaimWaitlistOfferUseCase(schedDeps),
    expireWaitlistOffer: new ExpireWaitlistOfferUseCase(schedDeps),
    createWebhookChannel: new CreateWebhookChannelUseCase(schedDeps),
  };

  const qDeps = {
    resources: infra.resources,
    procedures: infra.procedures,
    bookings: infra.bookings,
    waitlist: infra.waitlist,
    workspaces: infra.workspaces,
    entitlements,
    clock: infra.clock,
  };

  const queries = {
    availableSlots: new FindAvailableProcedureSlotsQuery(qDeps),
    resourceTimeline: new GetResourceTimelineMatrixQuery(qDeps),
    kpis: new GetWorkspaceSchedulingKpisQuery(qDeps),
    publicBookingPortal: new GetPublicBookingCatalogBySlugQuery(qDeps),
    workspace: new WorkspaceReadService({
      workspaces: infra.workspaces,
      users: infra.users,
      subscriptions: infra.subscriptions,
      resources: infra.resources,
      entitlements,
      clock: infra.clock,
    }),
  };

  const acl = new BillingWebhookAcl(config.billingWebhookSecret);
  const billing = {
    processWebhook: new ProcessBillingWebhookUseCase({ ...base, subscriptions: infra.subscriptions, processed: infra.processedWebhooks }),
  };

  // Event Handlers
  const matchDeps = { ...schedDeps, notifications: infra.notifications };
  dispatcher.register('BookingCancelled', new OnBookingCancelledMatchWaitlistHandler(matchDeps));
  dispatcher.register('WaitlistOfferExpired', new OnWaitlistOfferExpiredCascadeHandler(matchDeps));
  dispatcher.register('SubscriptionPlanChanged', new OnSubscriptionPlanChangedHandler({ resources: infra.resources, entitlements, uow: infra.uow }));

  const audit = new OnDomainEventAuditHandler({ audit: infra.auditLogs });
  for (const name of AUDITED_EVENTS) dispatcher.register(name, audit);

  const stripeGateway = new StripeBillingGateway(config.stripeSecretKey, config.stripeWebhookSecret);

  return { infra, config, dispatcher, entitlements, tenancy, catalog, scheduling, queries, billing, acl, stripeGateway };
}

export type Container = ReturnType<typeof buildContainer>;
