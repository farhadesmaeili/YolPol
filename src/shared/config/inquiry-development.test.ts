import {describe, expect, it} from "vitest";

import {getApprovedDevelopmentOrigins, getDevelopmentOrigin, parseDevelopmentOrigin} from "@/shared/config/inquiry-development";

describe("development Origin configuration", () => {
  it.each([
    ["http://localhost:3000", {host: "localhost", origin: "http://localhost:3000"}],
    ["http://192.168.1.100:3000/", {host: "192.168.1.100", origin: "http://192.168.1.100:3000"}],
    ["https://dev.yolpol.test:3443", {host: "dev.yolpol.test", origin: "https://dev.yolpol.test:3443"}],
  ])("normalizes valid origin %s", (value, expected) => {
    expect(parseDevelopmentOrigin(value)).toEqual(expected);
  });

  it.each([undefined, "", "   "])("treats unset value %# as absent", (value) => {
    expect(parseDevelopmentOrigin(value)).toBeUndefined();
  });

  it.each([
    ["malformed URL", "not a URL"],
    ["credentials", "http://user:password@192.168.1.100:3000"],
    ["path", "http://192.168.1.100:3000/staff"],
    ["query", "http://192.168.1.100:3000?locale=en"],
    ["empty query", "http://192.168.1.100:3000?"],
    ["fragment", "http://192.168.1.100:3000#staff"],
    ["empty fragment", "http://192.168.1.100:3000#"],
    ["unsupported scheme", "ftp://192.168.1.100:3000"],
  ])("rejects an origin with %s", (_case, value) => {
    expect(() => parseDevelopmentOrigin(value)).toThrowError(/YOLPOL_DEV_ORIGIN/u);
  });

  it("reads the optional value only in development", () => {
    const configured = {NODE_ENV: "development", YOLPOL_DEV_ORIGIN: "http://192.168.1.100:3000"};
    expect(getDevelopmentOrigin(configured)).toEqual({host: "192.168.1.100", origin: "http://192.168.1.100:3000"});
    expect([...getApprovedDevelopmentOrigins(configured)]).toEqual(["http://192.168.1.100:3000"]);
    expect(getDevelopmentOrigin({NODE_ENV: "development"})).toBeUndefined();
  });

  it.each(["production", "test", undefined])("does not evaluate development configuration in NODE_ENV=%s", (NODE_ENV) => {
    const environment = {NODE_ENV, YOLPOL_DEV_ORIGIN: "malformed URL"};
    expect(getDevelopmentOrigin(environment)).toBeUndefined();
    expect([...getApprovedDevelopmentOrigins(environment)]).toEqual([]);
  });
});
