import {
  QuickPickItem,
  window,
  ExtensionContext,
  ProgressLocation,
  workspace,
} from "vscode";
import * as Client from "ssh2-sftp-client";
import * as fs from "fs";
import * as fse from "fs-extra";
import MultiStepInput from "../helper/MultiStepInput";

export async function logFetcher(context: ExtensionContext) {
  interface ServerState {
    title: string;
    step: number;
    totalSteps: number;
    ip: string;
    userId: string;
    password: string;
    path: string;
    filename: QuickPickItem;
  }

  async function collectInputs() {
    const state = {} as Partial<ServerState>;
    await MultiStepInput.run((input) => inputServerIp(input, state));
    return state as ServerState;
  }

  async function collectLogFile(state: ServerState, files: string[]) {
    await MultiStepInput.run((input) => pickLogFile(input, state, files));
  }

  const title = "Log Getter";

  async function inputServerIp(
    input: MultiStepInput,
    state: Partial<ServerState>
  ) {
    state.ip = await input.showInputBox({
      title,
      step: 1,
      totalSteps: 5,
      value: typeof state.ip === "string" ? state.ip : "",
      prompt: "Enter IP Address For Log File",
      validate: validateIp,
      shouldResume: shouldResume,
    });
    context.globalState.update("state.ip", state.ip);
    return (input: MultiStepInput) => inputUserId(input, state);
  }

  async function inputUserId(
    input: MultiStepInput,
    state: Partial<ServerState>
  ) {
    state.userId = await input.showInputBox({
      title,
      step: 2,
      totalSteps: 5,
      value: typeof state.userId === "string" ? state.userId : "",
      prompt: "Enter User Id",
      validate: validateIp,
      shouldResume: shouldResume,
    });
    context.globalState.update("state.userId", state.userId);
    return (input: MultiStepInput) => inputUserPassword(input, state);
  }

  async function inputUserPassword(
    input: MultiStepInput,
    state: Partial<ServerState>
  ) {
    state.password = await input.showInputBox({
      title,
      step: 3,
      totalSteps: 5,
      password: true,
      value: typeof state.password === "string" ? state.password : "",
      prompt: "Enter User password",
      validate: validateIp,
      shouldResume: shouldResume,
    });
    return (input: MultiStepInput) => inputUserPath(input, state);
  }

  async function inputUserPath(
    input: MultiStepInput,
    state: Partial<ServerState>
  ) {
    state.path = await input.showInputBox({
      title,
      step: 4,
      totalSteps: 5,
      value: typeof state.path === "string" ? state.path : "",
      prompt: "Enter log path",
      validate: validateIp,
      shouldResume: shouldResume,
    });

    context.globalState.update("state.path", state.path);
  }

  async function pickLogFile(
    input: MultiStepInput,
    state: Partial<ServerState>,
    files: string[]
  ) {
    state.filename = await input.showQuickPick({
      title,
      step: 5,
      totalSteps: 5,
      placeholder: "Pick log file",
      items: files.map((label) => ({ label })),
      activeItem: state.filename,
      shouldResume: shouldResume,
    });
    context.globalState.update("state.filename", state.filename);
  }

  function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((resolve, reject) => {
      // noop
    });
  }

  async function validateIp(ip: string) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return ip === "invalid" ? "Invalid IP Address" : undefined;
  }

  const fetchFile = async () => {
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

      window.showInformationMessage(`fetching log file names`);
      await window.withProgress(
        {
          location: ProgressLocation.Window,
          cancellable: true,
          title: "fetching files",
        },
        async (progress) => {
          progress.report({ increment: 0 });
          const data: Client.FileInfo[] = await sftp.list(state.path, ".log$");
          const logFiles: string[] = data.map((d) => d.name);
          if (logFiles.length === 0) {
            throw new Error("No Log File Found");
          }
          await collectLogFile(state, logFiles);
          progress.report({ increment: 100 });
        }
      );

      //----------------------all input available------------------
      const fileName = state.filename.label;

      if (!fileName) {
        throw new Error("Invalid Data");
      }

      const remoteFilePath = state.path + fileName;

      await fse.outputFile("/temp/" + fileName, "fetching logs...");

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

  await fetchFile();
}
