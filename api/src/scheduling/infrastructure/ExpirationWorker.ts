import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Container } from '../../composition-root';

export const EXPIRATION_QUEUE_NAME = 'slotmatrix-expiration-sweeps';

export class ExpirationWorker {
  private readonly connection: IORedis;
  private readonly queue: Queue;
  private worker: Worker | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    redisUrl: string,
    private readonly container: Container,
    private readonly sweepIntervalMs = 15_000,
  ) {
    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(EXPIRATION_QUEUE_NAME, {
      connection: this.connection as any,
    });
  }

  public async start(): Promise<void> {
    this.worker = new Worker(
      EXPIRATION_QUEUE_NAME,
      async () => {
        await this.runSweepCycle();
      },
      {
        connection: this.connection as any,
        concurrency: 1,
      },
    );

    await this.enqueueSweep();
    this.timer = setInterval(() => {
      void this.enqueueSweep();
    }, this.sweepIntervalMs);
  }

  public async enqueueSweep(): Promise<void> {
    await this.queue.add(
      'sweep-expirations',
      { triggeredAt: new Date().toISOString() },
      {
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
  }

  public async runSweepCycle(): Promise<{
    expiredBookings: number;
    expiredWaitlistOffers: number;
  }> {
    const now = this.container.infra.clock.now();
    let expiredBookings = 0;
    let expiredWaitlistOffers = 0;

    // 1. Expire overdue PENDING_DEPOSIT bookings
    const overdueBookings = await this.container.infra.bookings.findExpiredPendingDepositsSystemWide(now, 100);
    for (const booking of overdueBookings) {
      await this.container.infra.uow.run(async () => {
        const fresh = await this.container.infra.bookings.findById(booking.tenantId.value, booking.id.value);
        if (!fresh || fresh.status !== 'PENDING_DEPOSIT') return;
        fresh.expireUnpaidDeposit(now);
        await this.container.infra.bookings.save(fresh);
        await this.container.dispatcher.dispatch(fresh.pullDomainEvents());
        expiredBookings++;
      });
    }

    // 2. Expire overdue SlotOffers on WaitlistEntries (triggers OnWaitlistOfferExpiredCascadeHandler!)
    const overdueOffers = await this.container.infra.waitlist.findExpiredOffersSystemWide(now, 100);
    for (const entry of overdueOffers) {
      await this.container.scheduling.expireWaitlistOffer.execute({
        tenantId: entry.tenantId.value,
        waitlistEntryId: entry.id.value,
      });
      expiredWaitlistOffers++;
    }

    return { expiredBookings, expiredWaitlistOffers };
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
    await this.connection.quit();
  }
}
