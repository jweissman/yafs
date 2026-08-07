import { PreparedMountRecord } from "./types";

export class MountRefreshScheduler {
  private readonly running = new Set<string>();

  constructor(
    private readonly records: () => PreparedMountRecord[],
    private readonly refresh: (record: PreparedMountRecord) => Promise<void>,
    private readonly now = () => Date.now(),
  ) {}

  async tick() {
    await Promise.all(
      this.records()
        .filter((record) => this.due(record))
        .map((record) => this.run(record)),
    );
  }

  private due(record: PreparedMountRecord) {
    const interval = record.refreshIntervalMs;
    if (!interval || this.running.has(record.id)) {
      return false;
    }
    return (
      Date.parse(record.fetchedAt || record.activatedAt) + interval <=
      this.now()
    );
  }

  private async run(record: PreparedMountRecord) {
    this.running.add(record.id);
    try {
      await this.refresh(record);
    } finally {
      this.running.delete(record.id);
    }
  }
}
