import {
  QuickPickItem,
  window,
  Disposable,
  QuickInputButton,
  QuickInput,
  ExtensionContext,
  QuickInputButtons,
  workspace,
} from "vscode";

import * as Client from "ssh2-sftp-client";

import * as fs from "fs";
import * as fse from "fs-extra";

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
      step: 3,
      totalSteps: 5,
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

  await fetchLastFile();
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
