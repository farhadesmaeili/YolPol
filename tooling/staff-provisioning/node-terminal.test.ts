import {PassThrough} from "node:stream";
import {describe, expect, it, vi} from "vitest";

import {readHiddenTerminalInput, StaffProvisioningAbortedError} from "./node-terminal";

function createTerminalStreams() {
  const input = new PassThrough() as PassThrough & {isTTY: boolean; isRaw: boolean; setRawMode(mode: boolean): void};
  input.isTTY = true;
  input.isRaw = false;
  const rawModes: boolean[] = [];
  input.setRawMode = vi.fn((mode: boolean) => { input.isRaw = mode; rawModes.push(mode); });
  const output = new PassThrough() as PassThrough & {isTTY: boolean};
  output.isTTY = true;
  let visible = "";
  output.on("data", (chunk: Buffer) => { visible += chunk.toString("utf8"); });
  return {input, output, rawModes, visible: () => visible};
}

describe("hidden terminal input", () => {
  it("handles Backspace without echoing characters and restores raw and paused state", async () => {
    const terminal = createTerminalStreams();
    terminal.input.pause();
    const result = readHiddenTerminalInput(terminal.input, terminal.output, "Password: ");
    terminal.input.write("secrex\b t\r".replace(" ", ""));
    await expect(result).resolves.toBe("secret");
    expect(terminal.rawModes).toEqual([true, false]);
    expect(terminal.input.isPaused()).toBe(true);
    expect(terminal.visible()).toBe("Password: \n");
  });

  it("restores terminal state after Ctrl+C and returns a dedicated abort", async () => {
    const terminal = createTerminalStreams();
    const result = readHiddenTerminalInput(terminal.input, terminal.output, "Password: ");
    terminal.input.write("secret\u0003");
    await expect(result).rejects.toBeInstanceOf(StaffProvisioningAbortedError);
    expect(terminal.rawModes).toEqual([true, false]);
    expect(terminal.visible()).not.toContain("secret");
  });
});
