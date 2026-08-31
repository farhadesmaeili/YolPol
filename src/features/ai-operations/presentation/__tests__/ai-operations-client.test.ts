import {describe, expect, it, vi} from "vitest";

import {updateAiOperationsPolicy} from "@/features/ai-operations/presentation/clients/ai-operations-client";
import {presentAiOperationsUpdate} from "@/features/ai-operations/presentation/state/ai-operations-update-state";

const input = {expectedVersion: 2, mode: "DISABLED" as const, businessTimeZone: "Asia/Tehran", humanGracePeriodSeconds: 900, scheduleWindows: []};

describe("AI Operations presentation client", () => {
  it("sends only the policy update contract and recognizes a successful response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({status: "updated", policy: {...input, version: 3, updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "staff:member-1"}}), {status: 200}));
    await expect(updateAiOperationsPolicy(fetcher, input)).resolves.toMatchObject({status: "updated", policy: {version: 3}});
    expect(fetcher).toHaveBeenCalledWith("/api/staff/ai-operations", {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)});
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).not.toHaveProperty("actorReference");
  });

  it.each([[409, "conflict"], [400, "invalid"], [403, "forbidden"], [429, "rate_limited"], [503, "failed"]] as const)("maps HTTP %s to %s", async (status, expected) => {
    await expect(updateAiOperationsPolicy(vi.fn().mockResolvedValue(new Response(null, {status})), input)).resolves.toEqual({status: expected});
  });

  it("refreshes after a successful optimistic update and keeps a stale conflict visible", () => {
    expect(presentAiOperationsUpdate({status: "updated", policy: {mode: "DISABLED", businessTimeZone: "Asia/Tehran", humanGracePeriodSeconds: 900, scheduleWindows: [], version: 3, updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "staff:member-1"}})).toEqual({notice: "saved", refresh: true});
    expect(presentAiOperationsUpdate({status: "conflict"})).toEqual({notice: "conflict", refresh: false});
  });
});
