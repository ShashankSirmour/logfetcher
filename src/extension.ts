import { commands, ExtensionContext } from "vscode";
import { lastLogFetcher } from "./lastLogFetcher";
import { logFetcher } from "./logFetcher";

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
