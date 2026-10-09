// Disposable-only verifier for the pinned n8n server API, not a workflow node.
import {randomBytes} from "node:crypto";
import {readFileSync} from "node:fs";

let stage = "disposable_guard";
try {
  if (process.env.ACQUISITION_DISPOSABLE_TEST !== "true" || readFileSync("/disposable-task0082", "utf8").trim() !== "task0082-tmpfs") throw new Error("Disposable marker absent");
  stage = "owner_setup";
  const base = "http://127.0.0.1:5678/rest";
  const setup = await fetch(`${base}/owner/setup`, {
    method: "POST", signal: AbortSignal.timeout(10000),
    headers: {"content-type": "application/json", origin: "http://localhost:5678"},
    body: JSON.stringify({email: "owner@acquisition.test", firstName: "Synthetic", lastName: "Owner", password: `Aa1!${randomBytes(24).toString("hex")}`}),
  });
  if (!setup.ok) throw new Error("Setup rejected");
  const cookie = setup.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Session absent");
  const headers = {cookie, "content-type": "application/json", origin: "http://localhost:5678"};
  const path = `${base}/workflows/AcquisitionFoundation0082`;
  stage = "inactive_workflow";
  const workflow = await fetch(path, {headers, signal: AbortSignal.timeout(5000)});
  if (!workflow.ok || (await workflow.json()).data.active !== false) throw new Error("Workflow is not inactive");
  stage = "manual_run";
  const response = await fetch(`${path}/run`, {method: "POST", headers, signal: AbortSignal.timeout(10000), body: JSON.stringify({triggerToStartFrom: {name: "Manual Trigger"}})});
  if (!response.ok || typeof (await response.json()).data.executionId !== "string") throw new Error("Manual run rejected");
  console.info("Disposable authenticated n8n manual run accepted; persistence verification follows.");
} catch {
  console.error(`Disposable n8n server verification failed: ${stage}`);
  process.exitCode = 1;
}
