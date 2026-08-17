import { AbsolutePath } from "../../core/AbsolutePath";
import { CtlHandler } from "../../protocol/CtlDispatch";
import { MountManager } from "../../mounts/MountManager";
import { AgentConfig, PreparedMountRecord } from "../../mounts/types";
import { quarantineInfo, validAgentConfig } from "./AgentConfigValidation";

type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void;
type UnregisterCtl = (path: AbsolutePath) => void;
type Paths = Set<AbsolutePath>;
type Invoke = (
  mountId: string,
  personaName: string,
  payload: string,
) => Promise<void>;

export class AgentRegistration {
  private registered = new Set<AbsolutePath>();
  private quarantined = new Set<string>();

  constructor(
    private readonly mounts: MountManager,
    private readonly registerCtl: RegisterCtl,
    private readonly unregisterCtl: UnregisterCtl,
    private readonly invoke: Invoke,
  ) {}

  close() {
    this.registered.forEach((path) => {
      this.unregisterCtl(path);
    });
    this.registered.clear();
  }

  sync() {
    const paths = new Set<AbsolutePath>();
    this.registerAll(paths);
    this.unregisterMissing(paths);
    this.registered = paths;
  }

  private registerAll(paths: Paths) {
    this.mounts.mounts().forEach((record) => {
      this.registerAgent(record, paths);
    });
  }

  private unregisterMissing(paths: Paths) {
    this.registered.forEach((path) => {
      if (!paths.has(path)) {
        this.unregisterCtl(path);
      }
    });
  }

  private registerAgent(record: PreparedMountRecord, paths: Paths) {
    if (record.provider === "agent") {
      this.registerAgentRecord(record, paths);
    }
  }

  private registerAgentRecord(record: PreparedMountRecord, paths: Paths) {
    const config = validAgentConfig(record.config);
    if (config) {
      this.registerValid(record, config, paths);
      return;
    }
    this.registerInvalid(record);
  }

  private registerValid(
    record: PreparedMountRecord,
    config: AgentConfig,
    paths: Paths,
  ) {
    this.quarantined.delete(record.id);
    Object.keys(config.personas).forEach((name) => {
      this.registerPersona(record, name, paths);
    });
  }

  private registerInvalid(record: PreparedMountRecord) {
    if (this.quarantined.has(record.id)) {
      return;
    }
    this.quarantined.add(record.id);
    this.mounts.audit(record, quarantineInfo(record.id));
  }

  private registerPersona(
    record: PreparedMountRecord,
    name: string,
    paths: Paths,
  ) {
    const path = `${record.path}/${name}/ctl` as AbsolutePath;
    this.registerCtl(path, (payload) => this.invoke(record.id, name, payload));
    paths.add(path);
  }
}
