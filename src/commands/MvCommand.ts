import { CommandContext } from "./CommandContext";
import { copy } from "./CpCommand";

export class MvCommand {
  readonly name = "mv";
  readonly synopsis = "mv SOURCE DEST";
  readonly access = "mutate" as const;
  constructor() {}
  execute(context: CommandContext, args: string[]) {
    const source = context.resolve(context.required(this.name, args, 0));
    const dest = context.resolve(context.required(this.name, args, 1));
    // Composed as copy-then-remove (not a single rename primitive) so it
    // reuses cp's already-checked write path and rm's already-checked
    // write-guard rather than a third, separately-tested mutation. If the
    // source is read-only (a provider mount), neither half lands -- a
    // command's queued operations are validated as one batch before any
    // of them apply, so this fails atomically rather than leaving a
    // partial copy behind.
    copy({ context, source, dest, recursive: true });
    context.removeTree(source);
    return "";
  }
}
