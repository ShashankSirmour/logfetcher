/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  QuickPickItem,
  window,
  Disposable,
  CancellationToken,
  QuickInputButton,
  QuickInput,
  ExtensionContext,
  QuickInputButtons,
  Uri,
  ProgressLocation,
} from "vscode";

import * as Client from "ssh2-sftp-client";

import * as fs from "fs";
/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 *
 * This first part uses the helper class `MultiStepInput` that wraps the API for the multi-step case.
 */
export async function multiStepInput(context: ExtensionContext) {
  class MyButton implements QuickInputButton {
    constructor(
      public iconPath: { light: Uri; dark: Uri },
      public tooltip: string
    ) {}
  }

  const createResourceGroupButton = new MyButton(
    {
      dark: Uri.file(context.asAbsolutePath("resources/dark/add.svg")),
      light: Uri.file(context.asAbsolutePath("resources/light/add.svg")),
    },
    "Create Resource Group"
  );

  const resourceGroups: QuickPickItem[] = [
    "vscode-data-function",
    "vscode-appservice-microservices",
    "vscode-appservice-monitor",
    "vscode-appservice-preview",
    "vscode-appservice-prod",
  ].map((label) => ({ label }));

  interface State {
    title: string;
    step: number;
    totalSteps: number;
    resourceGroup: QuickPickItem | string;
    name: string;
    runtime: QuickPickItem;
  }

  interface ServerState {
    title: string;
    step: number;
    totalSteps: number;
    ip: string;
    userId: string;
    password: string;
    path: string;
    filename: string;
  }

  async function collectInputs() {
    const state = {} as Partial<ServerState>;
    await MultiStepInput.run((input) => inputServerIp(input, state));
    return state as ServerState;
  }

  const title = "Log Getter";

  async function inputServerIp(
    input: MultiStepInput,
    state: Partial<ServerState>
  ) {
    state.ip = await input.showInputBox({
      title,
      step: 1,
      totalSteps: 4,
      value: typeof state.ip === "string" ? state.ip : "",
      prompt: "Enter IP Address For Log File",
      validate: validateIp,
      shouldResume: shouldResume,
    });
    return (input: MultiStepInput) => inputUserId(input, state);
  }

  async function inputUserId(
    input: MultiStepInput,
    state: Partial<ServerState>
  ) {
    state.userId = await input.showInputBox({
      title,
      step: 2,
      totalSteps: 4,
      value: typeof state.userId === "string" ? state.userId : "",
      prompt: "Enter User Id",
      validate: validateIp,
      shouldResume: shouldResume,
    });
    return (input: MultiStepInput) => inputUserPassword(input, state);
  }

  async function inputUserPassword(
    input: MultiStepInput,
    state: Partial<ServerState>
  ) {
    state.password = await input.showInputBox({
      title,
      step: 3,
      totalSteps: 4,
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
      totalSteps: 4,
      value: typeof state.path === "string" ? state.path : "",
      prompt: "Enter User Password",
      validate: validateIp,
      shouldResume: shouldResume,
    });
    return (input: MultiStepInput) => inputUserFilename(input, state);
  }

  async function inputUserFilename(
    input: MultiStepInput,
    state: Partial<ServerState>
  ) {
    state.path = await input.showInputBox({
      title,
      step: 2,
      totalSteps: 4,
      value: typeof state.path === "string" ? state.path : "",
      prompt: "Enter User Filename",
      validate: validateIp,
      shouldResume: shouldResume,
    });
  }
  // async function pickResourceGroup(input: MultiStepInput, state: Partial<State>) {
  // 	const pick = await input.showQuickPick({
  // 		title,
  // 		step: 1,
  // 		totalSteps: 3,
  // 		placeholder: 'Pick a resource group',
  // 		items: resourceGroups,
  // 		activeItem: typeof state.resourceGroup !== 'string' ? state.resourceGroup : undefined,
  // 		buttons: [createResourceGroupButton],
  // 		shouldResume: shouldResume
  // 	});
  // 	if (pick instanceof MyButton) {
  // 		return (input: MultiStepInput) => inputResourceGroupName(input, state);
  // 	}
  // 	state.resourceGroup = pick;
  // 	return (input: MultiStepInput) => inputName(input, state);
  // }

  //   async function inputResourceGroupName(
  //     input: MultiStepInput,
  //     state: Partial<State>
  //   ) {
  //     state.resourceGroup = await input.showInputBox({
  //       title,
  //       step: 2,
  //       totalSteps: 4,
  //       value: typeof state.resourceGroup === "string" ? state.resourceGroup : "",
  //       prompt: "Choose a unique name for the resource group",
  //       validate: validateNameIsUnique,
  //       shouldResume: shouldResume,
  //     });
  //     return (input: MultiStepInput) => inputName(input, state);
  //   }

  //   async function inputName(input: MultiStepInput, state: Partial<State>) {
  //     const additionalSteps = typeof state.resourceGroup === "string" ? 1 : 0;
  //     // TODO: Remember current value when navigating back.
  //     state.name = await input.showInputBox({
  //       title,
  //       step: 2 + additionalSteps,
  //       totalSteps: 3 + additionalSteps,
  //       value: state.name || "",
  //       prompt: "Choose a unique name for the Application Service",
  //       validate: validateNameIsUnique,
  //       shouldResume: shouldResume,
  //     });
  //     return (input: MultiStepInput) => pickRuntime(input, state);
  //   }

  //   async function pickRuntime(input: MultiStepInput, state: Partial<State>) {
  //     const additionalSteps = typeof state.resourceGroup === "string" ? 1 : 0;
  //     const runtimes = await getAvailableRuntimes(
  //       state.resourceGroup!,
  //       undefined /* TODO: token */
  //     );
  //     // TODO: Remember currently active item when navigating back.
  //     state.runtime = await input.showQuickPick({
  //       title,
  //       step: 3 + additionalSteps,
  //       totalSteps: 3 + additionalSteps,
  //       placeholder: "Pick a runtime",
  //       items: runtimes,
  //       activeItem: state.runtime,
  //       shouldResume: shouldResume,
  //     });
  //   }

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

  //   async function validateNameIsUnique(name: string) {
  //     // ...validate...
  //     await new Promise((resolve) => setTimeout(resolve, 1000));
  //     return name === "vscode" ? "Name not unique" : undefined;
  //   }

  //   async function getAvailableRuntimes(
  //     resourceGroup: QuickPickItem | string,
  //     token?: CancellationToken
  //   ): Promise<QuickPickItem[]> {
  //     // ...retrieve...
  //     await new Promise((resolve) => setTimeout(resolve, 1000));
  //     return ["Node 8.9", "Node 6.11", "Node 4.5"].map((label) => ({ label }));
  //   }

  const state = await collectInputs();

  async (state: ServerState) => {
    const sftp = new Client();
    sftp
      .connect({
        host: "remote_server_iṕ",
        port: 22,
        username: "username",
        password: "password",
      })
      .then(() => {
        const remoteFilePath = "/" + "filename";
        sftp.get(remoteFilePath).then((stream) => {
          const file = "./ftp/" + "file";
          fs.writeFile(file, stream, (err) => {
            if (err) console.log(err);
          });
          sftp.end();
        });
      })
      .catch((err) => {
        console.log(err, "catch error");
      });
  };

  window.withProgress(
    {
      location: ProgressLocation.Window,
      cancellable: false,
      title: "downloading log file",
    },
    async (progress) => {
      progress.report({ increment: 0 });

      await wait(10000);

      progress.report({ increment: 100 });
    }
  );

  function wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  window.showInformationMessage(`downloading log`);
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
