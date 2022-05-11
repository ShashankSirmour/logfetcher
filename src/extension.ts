import { commands, ExtensionContext } from "vscode";
import { lastLogFetcher } from "./command/lastLogFetcher";
import { logFetcher } from "./command/logFetcher";

export function activate(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand("logfetcher.fetchFile", async () => {
      logFetcher(context);
    })
  );

  context.subscriptions.push(
    commands.registerCommand("logfetcher.lastFile", async () => {
      lastLogFetcher(context);
    })
  );
}
