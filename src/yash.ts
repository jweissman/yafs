import { connect } from "./yash/connect";
import { print } from "./yash/output";
import { cliOptions } from "./yash/cliOptions";
import { setupRepl } from "./yash/repl";
import type { Repl } from "./yash/repl";
import { replLoop } from "./yash/replLoop";
import type { ExecutionResult } from "./types/ExecutionResult";

const options = cliOptions();
const connection = await connect(options.local, {
  host: options.host,
  port: options.port,
});
const { client, server: serverName } = connection;

try {
  if (options.command) {
    await runOnce(client, options.command, options.json);
  } else {
    await runInteractive(
      client,
      options.promptTemplate,
      serverName,
      options.historyPath,
    );
  }
} finally {
  await client.close();
}

type Client = Repl["client"];

async function runOnce(client: Client, command: string, json: boolean) {
  const result = await client.execute(command);
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  printResult(result);
}

function printResult(result: ExecutionResult) {
  print(result.stdout);
  if (result.stderr) {
    console.error(result.stderr);
  }
  process.exitCode = result.status;
}

async function runInteractive(
  client: Client,
  promptTemplate: string,
  serverName: string,
  historyPath: string,
) {
  const repl = await setupRepl(client, promptTemplate, serverName, historyPath);
  await replLoop(repl);
  repl.readline.close();
}
