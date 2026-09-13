import {createInterface} from "node:readline/promises";
import {StringDecoder} from "node:string_decoder";

import type {StaffProvisioningTerminal} from "../../src/features/staff-authentication/presentation/cli/staff-provisioning-cli";

export class StaffProvisioningAbortedError extends Error {
  readonly name = "StaffProvisioningAbortedError";

  constructor() { super("Staff provisioning was aborted."); }
}

type HiddenInput = Readonly<{
  isTTY?: boolean;
  isRaw?: boolean;
  isPaused(): boolean;
  setRawMode(mode: boolean): void;
  resume(): void;
  pause(): void;
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  off(event: "data", listener: (chunk: Buffer | string) => void): unknown;
}>;

type HiddenOutput = Readonly<{
  isTTY?: boolean;
  write(chunk: string): unknown;
}>;

export async function readHiddenTerminalInput(input: HiddenInput, output: HiddenOutput, prompt: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) throw new Error("Interactive TTY input is required.");
  const wasRaw = input.isRaw === true;
  const wasPaused = input.isPaused();
  const characters: string[] = [];
  const decoder = new StringDecoder("utf8");
  let escapeSequence: "none" | "start" | "control" = "none";
  let listener: ((chunk: Buffer | string) => void) | undefined;

  output.write(prompt);
  try {
    if (!wasRaw) input.setRawMode(true);
    const result = new Promise<string>((resolve, reject) => {
      listener = (chunk) => {
        const text = Buffer.isBuffer(chunk) ? decoder.write(chunk) : chunk;
        for (const character of text) {
          if (escapeSequence === "start") {
            escapeSequence = character === "[" || character === "O" ? "control" : "none";
            continue;
          }
          if (escapeSequence === "control") {
            if (/^[\u0040-\u007E]$/u.test(character)) escapeSequence = "none";
            continue;
          }
          if (character === "\r" || character === "\n") {
            resolve(characters.join(""));
            return;
          }
          if (character === "\u0003" || character === "\u0004") {
            reject(new StaffProvisioningAbortedError());
            return;
          }
          if (character === "\b" || character === "\u007F") {
            characters.pop();
            continue;
          }
          if (character === "\u001B") {
            escapeSequence = "start";
            continue;
          }
          if (/^[\u0000-\u001F]$/u.test(character)) continue;
          characters.push(character);
        }
      };
      input.on("data", listener);
    });
    if (wasPaused) input.resume();
    return await result;
  } finally {
    if (listener) input.off("data", listener);
    if (!wasRaw) input.setRawMode(false);
    if (wasPaused) input.pause();
    output.write("\n");
  }
}

export class NodeStaffProvisioningTerminal implements StaffProvisioningTerminal {
  constructor(
    private readonly input: NodeJS.ReadStream = process.stdin,
    private readonly output: NodeJS.WriteStream = process.stdout,
    private readonly errorOutput: NodeJS.WriteStream = process.stderr,
  ) {}

  isInteractive(): boolean {
    return this.input.isTTY === true && this.output.isTTY === true;
  }

  async ask(prompt: string): Promise<string> {
    const reader = createInterface({input: this.input, output: this.output, terminal: true});
    try { return await reader.question(prompt); }
    finally { reader.close(); }
  }

  askSecret(prompt: string): Promise<string> {
    return readHiddenTerminalInput(this.input, this.output, prompt);
  }

  write(message: string): void { this.output.write(message); }
  writeError(message: string): void { this.errorOutput.write(message); }
}
