import {
  QuickPickItem,
  window,
  Disposable,
  QuickInputButton,
  QuickInput,
  ExtensionContext,
  QuickInputButtons,
  ProgressLocation,
  workspace,
} from "vscode";

import * as Client from "ssh2-sftp-client";

import * as fs from "fs";
import * as fse from "fs-extra";

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

      window.showInformationMessage(`fetching log filenames`);
      await window.withProgress(
        {
          location: ProgressLocation.Window,
          cancellable: false,
          title: "fetching files",
        },
        async (progress) => {
          progress.report({ increment: 0 });
          const data: Client.FileInfo[] = await sftp.list(state.path, ".log$");
          const logFiles: string[] = data.map((d) => d.name);
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

      await fse.outputFile("/temp/" + fileName, "logs");

      const stream = await sftp.get(remoteFilePath);

      const file = "C://temp//" + fileName;
      fs.writeFile(file, stream, (err) => {
        if (err) console.log(err);
        workspace.openTextDocument(file).then((doc) => {
          window.showTextDocument(doc);
          window.showInformationMessage(`log successfully fetched`);
        });
      });
    } catch (error) {
      window.showErrorMessage(`error fetching log`);
    }

    sftp.end();
  };

  await fetchFile();
}

// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------

class InputFlowAction {
  static back = new InputFlowAction();
  static cancel = new InputFlowAction();
  static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters<T extends QuickPickItem> {
  title: string;
  step: number;
  totalSteps: number;
  items: T[];
  activeItem?: T;
  placeholder: string;
  buttons?: QuickInputButton[];
  shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
  title: string;
  step: number;
  totalSteps: number;
  value: string;
  password?: boolean;
  prompt: string;
  validate: (value: string) => Promise<string | undefined>;
  buttons?: QuickInputButton[];
  shouldResume: () => Thenable<boolean>;
}

class MultiStepInput {
  static async run<T>(start: InputStep) {
    const input = new MultiStepInput();
    return input.stepThrough(start);
  }

  private current?: QuickInput;
  private steps: InputStep[] = [];

  private async stepThrough<T>(start: InputStep) {
    let step: InputStep | void = start;
    while (step) {
      this.steps.push(step);
      if (this.current) {
        this.current.enabled = false;
        this.current.busy = true;
      }
      try {
        step = await step(this);
      } catch (err) {
        if (err === InputFlowAction.back) {
          this.steps.pop();
          step = this.steps.pop();
        } else if (err === InputFlowAction.resume) {
          step = this.steps.pop();
        } else if (err === InputFlowAction.cancel) {
          step = undefined;
        } else {
          throw err;
        }
      }
    }
    if (this.current) {
      this.current.dispose();
    }
  }

  async showQuickPick<
    T extends QuickPickItem,
    P extends QuickPickParameters<T>
  >({
    title,
    step,
    totalSteps,
    items,
    activeItem,
    placeholder,
    buttons,
    shouldResume,
  }: P) {
    const disposables: Disposable[] = [];
    try {
      return await new Promise<
        T | (P extends { buttons: (infer I)[] } ? I : never)
      >((resolve, reject) => {
        const input = window.createQuickPick<T>();
        input.title = title;
        input.step = step;
        input.totalSteps = totalSteps;
        input.placeholder = placeholder;
        input.items = items;
        if (activeItem) {
          input.activeItems = [activeItem];
        }
        input.buttons = [
          ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
          ...(buttons || []),
        ];
        disposables.push(
          input.onDidTriggerButton((item) => {
            if (item === QuickInputButtons.Back) {
              reject(InputFlowAction.back);
            } else {
              resolve(<any>item);
            }
          }),
          input.onDidChangeSelection((items) => resolve(items[0])),
          input.onDidHide(() => {
            (async () => {
              reject(
                shouldResume && (await shouldResume())
                  ? InputFlowAction.resume
                  : InputFlowAction.cancel
              );
            })().catch(reject);
          })
        );
        if (this.current) {
          this.current.dispose();
        }
        this.current = input;
        this.current.show();
      });
    } finally {
      disposables.forEach((d) => d.dispose());
    }
  }

  async showInputBox<P extends InputBoxParameters>({
    title,
    step,
    totalSteps,
    password,
    value,
    prompt,
    validate,
    buttons,
    shouldResume,
  }: P) {
    const disposables: Disposable[] = [];
    try {
      return await new Promise<
        string | (P extends { buttons: (infer I)[] } ? I : never)
      >((resolve, reject) => {
        const input = window.createInputBox();
        input.title = title;
        input.step = step;
        input.totalSteps = totalSteps;
        input.value = value || "";
        input.password = password || false;
        input.prompt = prompt;
        input.buttons = [
          ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
          ...(buttons || []),
        ];
        let validating = validate("");
        disposables.push(
          input.onDidTriggerButton((item) => {
            if (item === QuickInputButtons.Back) {
              reject(InputFlowAction.back);
            } else {
              resolve(<any>item);
            }
          }),
          input.onDidAccept(async () => {
            const value = input.value;
            input.enabled = false;
            input.busy = true;
            if (!(await validate(value))) {
              resolve(value);
            }
            input.enabled = true;
            input.busy = false;
          }),
          input.onDidChangeValue(async (text) => {
            const current = validate(text);
            validating = current;
            const validationMessage = await current;
            if (current === validating) {
              input.validationMessage = validationMessage;
            }
          }),
          input.onDidHide(() => {
            (async () => {
              reject(
                shouldResume && (await shouldResume())
                  ? InputFlowAction.resume
                  : InputFlowAction.cancel
              );
            })().catch(reject);
          })
        );
        if (this.current) {
          this.current.dispose();
        }
        this.current = input;
        this.current.show();
      });
    } finally {
      disposables.forEach((d) => d.dispose());
    }
  }
}