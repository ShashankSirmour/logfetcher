import {
  QuickPickItem,
  window,
  ExtensionContext,
  workspace,
  ProgressLocation,
} from "vscode";

import * as Client from "ssh2-sftp-client";

import * as fs from "fs";
import * as fse from "fs-extra";
import MultiStepInput from "../helper/MultiStepInput";

export async function lastLogFetcher(context: ExtensionContext) {
  interface ServerState {
    title: string;
    ip: string;
    userId: string;
    password: string;
    path: string;
    filename: QuickPickItem;
  }

  async function collectInputs() {
    const state = {} as Partial<ServerState>;
    await MultiStepInput.run((input) => inputUserPassword(input, state));
    state.ip = context.globalState.get("state.ip");
    state.path = context.globalState.get("state.path");
    state.userId = context.globalState.get("state.userId");
    state.filename = context.globalState.get("state.filename");
    console.log(state);
    return state as ServerState;
  }

  const title = "Log Getter";

  async function inputUserPassword(
    input: MultiStepInput,
    state: Partial<ServerState>
  ) {
    state.password = await input.showInputBox({
      title,
      step: 1,
      totalSteps: 1,
      password: true,
      value: typeof state.password === "string" ? state.password : "",
      prompt: "Enter User password",
      validate: validateIp,
      shouldResume: shouldResume,
    });
  }

  function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((resolve, reject) => {
      // noop
    });
  }

  async function validateIp(ip: string) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return ip === "invalid" ? "Invalid" : undefined;
  }

  const fetchLastFile = async () => {
    // user and server related input
    const state = await collectInputs();

    const sftp = new Client();

    try {
      if (!(state.ip && state.password && state.userId && state.path)) {
        throw new Error("invalid input");
      }

      await sftp.connect({
        host: state.ip,
        port: 22,
        username: state.userId,
        password: state.password,
      });

      //----------------------all input available------------------
      const fileName = state.filename.label;

      if (!fileName) {
        throw new Error("Invalid Data");
      }

      const remoteFilePath = state.path + fileName;

      await fse.outputFile("/temp/" + fileName, "");

      const stream = await sftp.get(remoteFilePath);

      const file = "C://temp//" + fileName;

      await window.withProgress(
        {
          location: ProgressLocation.Window,
          cancellable: false,
          title: "Fetching log",
        },
        async (progress) => {
          progress.report({ increment: 0 });
          await fs.writeFile(file, stream, (err) => {
            if (err) console.log(err);
            workspace.openTextDocument(file).then((doc) => {
              window.showTextDocument(doc);
              window.showInformationMessage(`Log successfully fetched`);
            });
          });
          progress.report({ increment: 100 });
        }
      );
    } catch (error) {
      window.showErrorMessage(`Error fetching log`);
    }

    try {
      sftp.end();
    } catch (error) {
      window.showErrorMessage(`Error getting connection`);
    }
  };

  await fetchLastFile();
}
