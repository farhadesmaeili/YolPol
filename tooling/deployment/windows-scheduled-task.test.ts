import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

type XmlNode = {
  tag: string;
  attributes: Record<string, string>;
  text: string;
  children: XmlNode[];
};

type ParsedXml = {
  namespace: string;
  root: XmlNode;
};

const repositoryRoot = resolve(import.meta.dirname, "../..");
const taskPath = resolve(
  repositoryRoot,
  "deploy/windows/offserver-durability/yolpol-offserver-durability-task.xml",
);
const taskXml = readFileSync(taskPath, "utf8");
const windowsIt = process.platform === "win32" ? it : it.skip;
const helper = readFileSync(
  resolve(repositoryRoot, "deploy/windows/offserver-durability/yolpol-durable-write.ps1"),
  "utf8",
);
const adapter = readFileSync(
  resolve(repositoryRoot, "deploy/operations/yolpol-offserver-durability.py"),
  "utf8",
);
const deployWrapper = readFileSync(
  resolve(repositoryRoot, "deploy/operations/yolpol-deploy"),
  "utf8",
);
const internalWrapper = readFileSync(
  resolve(repositoryRoot, "deploy/operations/yolpol-deploy-internal"),
  "utf8",
);

const parser = String.raw`
import json
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()

def local_name(tag):
    return tag.rsplit("}", 1)[-1]

def serialize(element):
    return {
        "tag": local_name(element.tag),
        "attributes": element.attrib,
        "text": (element.text or "").strip(),
        "children": [serialize(child) for child in element],
    }

namespace = root.tag[1:].split("}", 1)[0] if root.tag.startswith("{") else ""
print(json.dumps({"namespace": namespace, "root": serialize(root)}))
`;
const parseResult = spawnSync("python", ["-c", parser, taskPath], {
  encoding: "utf8",
  timeout: 10_000,
});
if (parseResult.status !== 0) {
  throw new Error(parseResult.stderr || parseResult.stdout || "Scheduled Task XML parsing failed");
}
const parsed = JSON.parse(parseResult.stdout) as ParsedXml;

function children(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter((child) => child.tag === tag);
}

function onlyChild(node: XmlNode, tag: string): XmlNode {
  const matches = children(node, tag);
  expect(matches, `Expected one ${tag} child of ${node.tag}`).toHaveLength(1);
  return matches[0];
}

function descendants(node: XmlNode): XmlNode[] {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

describe("Windows Scheduled Task repository contract", () => {
  it("is well-formed canonical Task Scheduler XML with the fixed task identity", () => {
    expect(taskXml.startsWith('<Task version="1.3" ')).toBe(true);
    expect(taskXml).not.toMatch(/<\?xml|encoding\s*=/iu);
    expect(parsed.namespace).toBe("http://schemas.microsoft.com/windows/2004/02/mit/task");
    expect(parsed.root.tag).toBe("Task");
    expect(parsed.root.attributes).toEqual({version: "1.3"});

    const registration = onlyChild(parsed.root, "RegistrationInfo");
    expect(onlyChild(registration, "URI").text).toBe("\\YOLPOL-Offserver-Durability-v1");
    expect(onlyChild(registration, "Author").text).toBe("YOLPOL");
  });

  it("runs only the fixed helper as LocalSystem with no caller-controlled arguments", () => {
    const principals = onlyChild(parsed.root, "Principals");
    const principal = onlyChild(principals, "Principal");
    expect(principals.children).toHaveLength(1);
    expect(principal.attributes).toEqual({id: "LocalSystem"});
    expect(principal.children.map((node) => node.tag).sort()).toEqual(["RunLevel", "UserId"]);
    expect(onlyChild(principal, "UserId").text).toBe("S-1-5-18");
    expect(onlyChild(principal, "RunLevel").text).toBe("HighestAvailable");
    expect(children(principal, "LogonType")).toHaveLength(0);
    expect(taskXml).not.toContain("ServiceAccount");

    const actions = onlyChild(parsed.root, "Actions");
    const action = onlyChild(actions, "Exec");
    expect(actions.attributes).toEqual({Context: "LocalSystem"});
    expect(actions.children).toHaveLength(1);
    expect(onlyChild(action, "Command").text).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
    expect(onlyChild(action, "Arguments").text).toBe(
      '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\\ProgramData\\YOLPOL\\offserver-durability\\yolpol-durable-write.ps1"',
    );
    expect(onlyChild(action, "WorkingDirectory").text).toBe(
      "C:\\ProgramData\\YOLPOL\\offserver-durability",
    );
    expect(taskXml).not.toMatch(/<Password>|<GroupId>|%[^%]+%|\$env:|\$\{|\{\{/u);
    expect(helper.slice(0, helper.indexOf("Add-Type"))).not.toMatch(/^\s*param\s*\(/mu);
  });

  it("uses two deterministic one-minute time triggers offset by exactly 30 seconds", () => {
    const triggers = onlyChild(parsed.root, "Triggers");
    expect(triggers.children.map((trigger) => trigger.tag)).toEqual(["TimeTrigger", "TimeTrigger"]);
    expect(triggers.children.map((trigger) => trigger.attributes.id)).toEqual([
      "YolpolCadenceOnMinute",
      "YolpolCadenceHalfMinute",
    ]);

    const boundaries = triggers.children.map((trigger) => {
      expect(trigger.children.map((node) => node.tag)).toEqual([
        "Enabled",
        "StartBoundary",
        "Repetition",
      ]);
      expect(onlyChild(trigger, "Enabled").text).toBe("true");
      const repetition = onlyChild(trigger, "Repetition");
      expect(onlyChild(repetition, "Interval").text).toBe("PT1M");
      expect(onlyChild(repetition, "StopAtDurationEnd").text).toBe("false");
      expect(children(repetition, "Duration")).toHaveLength(0);
      return onlyChild(trigger, "StartBoundary").text;
    });

    expect(boundaries).toEqual(["2026-01-01T00:00:00", "2026-01-01T00:00:30"]);
    const offsets = boundaries
      .map((boundary) => Number.parseInt(boundary.slice(-2), 10))
      .sort((left, right) => left - right);
    const nominalGaps = [offsets[1] - offsets[0], 60 - offsets[1] + offsets[0]];
    expect(nominalGaps).toEqual([30, 30]);

    const triggerTags = descendants(triggers).map((node) => node.tag);
    expect(triggerTags).not.toEqual(expect.arrayContaining([
      "BootTrigger",
      "CalendarTrigger",
      "EventTrigger",
      "IdleTrigger",
      "LogonTrigger",
      "RandomDelay",
      "RegistrationTrigger",
      "SessionStateChangeTrigger",
    ]));
  });

  it("ignores overlapping starts and applies the fixed three-minute execution bound", () => {
    const settings = onlyChild(parsed.root, "Settings");
    expect(onlyChild(settings, "MultipleInstancesPolicy").text).toBe("IgnoreNew");
    expect(onlyChild(settings, "ExecutionTimeLimit").text).toBe("PT3M");
    expect(onlyChild(settings, "Enabled").text).toBe("true");
    expect(onlyChild(settings, "StartWhenAvailable").text).toBe("false");
    expect(onlyChild(settings, "RunOnlyIfNetworkAvailable").text).toBe("false");
    expect(children(settings, "NetworkSettings")).toHaveLength(0);
    expect(children(settings, "NetworkProfileName")).toHaveLength(0);
    expect(children(settings, "RestartOnFailure")).toHaveLength(0);
    expect(children(parsed.root, "Data")).toHaveLength(0);
  });

  it("retains the fixed Phase C2 deadline, polling, throttle, and artifact bounds", () => {
    expect(adapter).toMatch(/^MAX_ARTIFACT_BYTES = 1 \* 1024 \* 1024 \* 1024$/mu);
    expect(adapter).toMatch(/^SFTP_RECEIPT_POLL_TIMEOUT_SECONDS = 180$/mu);
    expect(adapter).toMatch(/^SFTP_RECEIPT_POLL_INTERVAL_SECONDS = 5$/mu);
    expect(adapter).toMatch(/^SFTP_RECEIPT_ATTEMPT_TIMEOUT_SECONDS = 15$/mu);
    expect(adapter).toMatch(/^SFTP_RECEIPT_MAX_ATTEMPTS = 37$/mu);
    expect(deployWrapper).toMatch(/^MIN_BACKUP_INTERVAL_SECONDS=900$/mu);
    expect(internalWrapper).toMatch(/^MIN_BACKUP_INTERVAL_SECONDS=900$/mu);
    expect(taskXml).not.toMatch(
      /SFTP_RECEIPT_|MIN_BACKUP_INTERVAL_SECONDS|MAX_ARTIFACT_BYTES|MaximumProductionDirectories/u,
    );
  });

  windowsIt("passes native Task Scheduler validate-only without registering a task", () => {
    const command = String.raw`
$ErrorActionPreference = 'Stop'
$taskPath = $env:YOLPOL_TEST_TASK_XML_PATH
$validationTaskName = 'YOLPOL-Task0078-Native-Validation-Only'
$validationTaskPath = "\$validationTaskName"
$taskValidateOnly = 1
$taskLogonServiceAccount = 5
$taskEnumHidden = 1

function Get-TaskNames($Folder) {
  $tasks = $Folder.GetTasks($taskEnumHidden)
  try {
    $names = @()
    for ($index = 1; $index -le $tasks.Count; $index++) {
      $names += $tasks.Item($index).Name
    }
    return $names
  }
  finally {
    if ($null -ne $tasks) {
      $null = [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($tasks)
    }
  }
}

function Get-FileSha256([string] $Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $hash = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '')
  }
  finally {
    $hash.Dispose()
    $stream.Dispose()
  }
}

$service = New-Object -ComObject 'Schedule.Service'
$rootFolder = $null
$validationResult = $null
try {
  $service.Connect()
  $rootFolder = $service.GetFolder('\')
  if (@(Get-TaskNames $rootFolder) -contains $validationTaskName) {
    throw 'The fixed validation-only task name already exists'
  }

  $hashBefore = Get-FileSha256 $taskPath
  $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
  $xml = [System.IO.File]::ReadAllText($taskPath, $strictUtf8)
  $validationResult = $rootFolder.RegisterTask(
    $validationTaskPath,
    $xml,
    $taskValidateOnly,
    'SYSTEM',
    $null,
    $taskLogonServiceAccount,
    $null
  )
  if (@(Get-TaskNames $rootFolder) -contains $validationTaskName) {
    throw 'TASK_VALIDATE_ONLY unexpectedly registered a task'
  }
  $hashAfter = Get-FileSha256 $taskPath
  if ($hashAfter -cne $hashBefore) {
    throw 'Native validation changed the canonical repository XML'
  }
  Write-Output 'TASK_SCHEDULER_NATIVE_SCHEMA_VALIDATION=PASS'
  Write-Output 'ValidationTaskExistsAfter=False'
}
finally {
  if ($null -ne $validationResult) {
    $null = [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($validationResult)
  }
  if ($null -ne $rootFolder) {
    $null = [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($rootFolder)
  }
  if ($null -ne $service) {
    $null = [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($service)
  }
}
`;
    const result = spawnSync(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          YOLPOL_TEST_TASK_XML_PATH: taskPath,
        },
        timeout: 20_000,
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("TASK_SCHEDULER_NATIVE_SCHEMA_VALIDATION=PASS");
    expect(result.stdout).toContain("ValidationTaskExistsAfter=False");
  });
});
