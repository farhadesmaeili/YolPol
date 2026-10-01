import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const helper = readFileSync(
  resolve(repositoryRoot, "deploy/windows/offserver-durability/yolpol-durable-write.ps1"),
  "utf8",
);
const adapter = readFileSync(
  resolve(repositoryRoot, "deploy/operations/yolpol-offserver-durability.py"),
  "utf8",
);

describe("Windows durable-write helper repository contract", () => {
  it("uses only fixed roots, fixed identities, and a validated Production backup identity", () => {
    expect(helper).toContain("$ChrootRoot = 'E:\\yolpol-backups'");
    expect(helper).toContain("$ProductionRoot = 'E:\\yolpol-backups\\production'");
    expect(helper).toContain("$DurableRoot = 'E:\\yolpol-backups\\durable'");
    expect(helper).toContain("$ReceiptRoot = 'E:\\yolpol-backups\\durability-receipts'");
    expect(helper).toContain(
      "$InstalledHelperPath = 'C:\\ProgramData\\YOLPOL\\offserver-durability\\yolpol-durable-write.ps1'",
    );
    expect(helper).toContain("$BackupAccountName = 'yolpol-backup'");
    expect(helper).toContain(
      "$BackupIdPattern = '^yolpol-production-[0-9]{8}T[0-9]{6}Z(?:-[0-9a-f]{7,64})?$'",
    );
    expect(helper.slice(0, helper.indexOf("Add-Type"))).not.toMatch(/^\s*param\s*\(/mu);
    expect(helper).toContain("Get-BoundedEntries $production $MaximumProductionDirectories");
    expect(helper).toContain(
      "$allowedNames = @($artifactName, $manifestName, $artifactPartialName, $manifestPartialName)",
    );
  });

  it("pins every opened file handle to one exact canonical path with one hard link", () => {
    const hardLinkCheck = helper.indexOf("information.NumberOfLinks != 1");
    const finalPathCheck = helper.indexOf(
      "string.Equals(resolvedPath.ToString(), expectedResolvedPath, StringComparison.OrdinalIgnoreCase)",
    );
    const ordinaryFileReturn = helper.indexOf(
      "return new FileStream(handle, FileAccess.Read, bufferSize, false)",
    );

    expect(helper).toContain("GetFinalPathNameByHandleW");
    expect(helper).toContain("FILE_NAME_NORMALIZED | VOLUME_NAME_DOS");
    expect(hardLinkCheck).toBeGreaterThanOrEqual(0);
    expect(helper).toContain('string expectedResolvedPath = @"\\\\?\\" + expectedDosPath;');
    expect(finalPathCheck).toBeGreaterThan(hardLinkCheck);
    expect(ordinaryFileReturn).toBeGreaterThan(finalPathCheck);
    expect(helper).toContain("Opened file resolved outside its exact expected path");
    expect(helper).not.toMatch(/GetFinalPathNameByHandleW[\s\S]{0,600}(?:fallback|best effort)/iu);
  });

  it("uses exclusive streamed write-through files and rejects reparse points and collisions", () => {
    expect(helper).toContain("CREATE_NEW = 1");
    expect(helper).toContain("FILE_FLAG_WRITE_THROUGH");
    expect(helper).toContain("FILE_FLAG_OPEN_REPARSE_POINT");
    expect(helper).toContain("FILE_SHARE_READ");
    expect(helper).toContain("Source is not a plain regular file");
    expect(helper).toContain("CreateDirectoryExclusive");
    expect(helper).toContain("CreateNewWriteThrough");
    expect(helper).toContain("while (($count = $source.Read($buffer, 0, $buffer.Length)) -gt 0)");
    expect(helper).toContain("$destination.Flush($true)");
    expect(helper).toContain("partial collision requires manual review");
    expect(helper).toContain("durable backup directory collision requires manual review");
    expect(helper).toContain("$existingEntries = Get-BoundedEntries $existingDurable 2");
    expect(helper).toContain("Assert-EqualBytes $expectedReceipt $actualReceipt");
  });

  it("requires protected canonical ACLs before scanning or accepting an existing receipt", () => {
    const trustCheck = helper.indexOf("$trust = Assert-WindowsTrustBoundary");
    const productionScan = helper.indexOf("$productionEntries = Get-BoundedEntries");
    const existingReceipt = helper.indexOf("if ([System.IO.File]::Exists($receiptFinal))");

    expect(helper).toContain("AreAccessRulesProtected");
    expect(helper).toContain("AreAccessRulesCanonical");
    expect(helper).toContain("$rule.IsInherited");
    expect(helper).toMatch(/GetAccessRules\(\s*\$true,\s*\$true,/u);
    expect(helper).not.toMatch(/GetAccessRules\(\s*\$true,\s*\$false,/u);
    expect(helper).toContain("$security.AreAccessRulesProtected -ne $RequireProtected");
    expect(helper).toContain("$actualRules.Count -ne $ExpectedRules.Count");
    expect(helper).toContain("unexpected mutation trustee, rights, or inheritance shape");
    expect(helper).toContain("missing a required SYSTEM, Administrators, or backup-account rule");
    expect(helper).toContain(
      "$backupModifyTree = New-ExpectedAccessRule $backupSid $modify $inheritChildren",
    );
    expect(helper).toContain(
      "$backupReadTree = New-ExpectedAccessRule $backupSid $readAndExecute $inheritChildren",
    );
    expect(helper).toContain(
      "$backupReadRoot = New-ExpectedAccessRule $backupSid $readAndExecute $noInheritance",
    );
    expect(helper).toContain("GetLocalGroupNames($qualifiedBackupName)");
    expect(helper).toContain("[System.Security.Principal.WellKnownSidType]::BuiltinUsersSid");
    expect(helper).toContain("$usersSid.Translate(");
    expect(helper).toContain("$expectedUsersGroupName");
    expect(helper).toContain("$localGroupNames.Count -ne 1");
    expect(helper).toContain("[System.StringComparison]::OrdinalIgnoreCase");
    expect(helper).not.toContain('"$env:COMPUTERNAME\\$groupName"');
    expect(helper).toContain("must belong only to BUILTIN\\Users");
    expect(helper).toContain("cannot be resolved");
    expect(trustCheck).toBeGreaterThanOrEqual(0);
    expect(productionScan).toBeGreaterThan(trustCheck);
    expect(existingReceipt).toBeGreaterThan(productionScan);
  });

  it("rejects unsafe surviving leaf ACLs on existing and newly published durable state", () => {
    const receiptBranch = helper.indexOf("if ([System.IO.File]::Exists($receiptFinal))");
    const existingReceiptAcl = helper.indexOf(
      "-AdministratorsSid $trust.AdministratorsSid -Label 'Existing durability receipt'",
    );
    const existingReceiptRead = helper.indexOf("Read-PlainBoundedBytes $receiptFinal");
    const newArtifactAcl = helper.indexOf("-Label 'Durable artifact partial'");
    const artifactPublication = helper.indexOf("MoveNewNoReplace($artifactPartial, $artifactFinal)");
    const receiptPartialAcl = helper.indexOf("-Label 'Durability receipt partial'");
    const receiptPublication = helper.indexOf("MoveNewNoReplace($receiptPartial, $receiptFinal)");

    expect(helper).toContain("DurableDirectoryRules");
    expect(helper).toContain("DurableFileRules");
    expect(helper).toContain("$rule.IsInherited -eq $expectedRule.IsInherited");
    expect(receiptBranch).toBeGreaterThanOrEqual(0);
    expect(existingReceiptAcl).toBeGreaterThan(receiptBranch);
    expect(existingReceiptRead).toBeGreaterThan(existingReceiptAcl);
    expect(newArtifactAcl).toBeGreaterThan(existingReceiptRead);
    expect(artifactPublication).toBeGreaterThan(newArtifactAcl);
    expect(receiptPartialAcl).toBeGreaterThan(artifactPublication);
    expect(receiptPublication).toBeGreaterThan(receiptPartialAcl);
  });

  it("requires a protected fixed helper installation and exact local account identity", () => {
    expect(helper).toContain("Resolve-ExactLocalAccountSid $BackupAccountName");
    expect(helper).toContain("did not resolve exactly");
    expect(helper).toContain("The helper is not running from its fixed protected installation path");
    expect(helper).toContain("OpenPlainRead($InstalledHelperPath, $BufferSize)");
    expect(helper).toContain("Assert-CanonicalAcl $InstalledHelperPath $false");
    expect(helper).toContain("@($systemFullFile, $administratorsFullFile)");
  });

  it("publishes the fixed receipt only after destination verification and volume flush", () => {
    const artifactMove = helper.indexOf("MoveNewNoReplace($artifactPartial, $artifactFinal)");
    const manifestMove = helper.indexOf("MoveNewNoReplace($manifestPartial, $manifestFinal)");
    const finalVerification = helper.indexOf("$manifestVerified = Get-PlainFileDigest $manifestFinal");
    const volumeFlush = helper.indexOf("[YolpolWindowsDurabilityNative]::FlushFixedVolume()");
    const receiptBuild = helper.indexOf("$receiptBytes = Get-CanonicalReceiptBytes", volumeFlush);
    const receiptPartialWrite = helper.indexOf("Write-ReceiptPartial $receiptPartial $receiptBytes");
    const receiptPublication = helper.indexOf("MoveNewNoReplace($receiptPartial, $receiptFinal)");

    expect(artifactMove).toBeGreaterThanOrEqual(0);
    expect(manifestMove).toBeGreaterThan(artifactMove);
    expect(finalVerification).toBeGreaterThan(manifestMove);
    expect(volumeFlush).toBeGreaterThan(finalVerification);
    expect(receiptBuild).toBeGreaterThan(volumeFlush);
    expect(receiptPartialWrite).toBeGreaterThan(receiptBuild);
    expect(receiptPublication).toBeGreaterThan(receiptPartialWrite);
    expect(helper).toContain("windows-flushfilebuffers-volume-v1");
    expect(helper).toContain("windows-sftp-v1:/durable/$BackupId");
    expect(helper).toContain("[System.Text.UTF8Encoding]::new($false)");
    expect(helper).toContain("'\",\"schemaVersion\":1}' + \"`n\"");
    expect(helper).toContain("same-volume rename only publishes a new name");
  });

  it("keeps the unauthenticated Windows receipt path unable to publish positive evidence", () => {
    const receiptReadback = adapter.indexOf("_poll_windows_receipt(self.configuration, pair, temporary)");
    const durableReadback = adapter.indexOf("_sha256_file(manifest_readback) != pair.manifest_sha256");
    const trustFailure = adapter.indexOf("Windows receipt authentication is unavailable");

    expect(receiptReadback).toBeGreaterThanOrEqual(0);
    expect(durableReadback).toBeGreaterThan(receiptReadback);
    expect(trustFailure).toBeGreaterThan(durableReadback);
    expect(adapter.slice(receiptReadback, trustFailure)).not.toContain("durable_write_confirmed=True");
  });

  it("has no network, remote command, overwrite, delete, or cleanup path", () => {
    expect(helper).not.toMatch(/Invoke-Expression|Start-Process|Invoke-WebRequest|Invoke-RestMethod/iu);
    expect(helper).not.toMatch(/\b(?:scp|curl|wget|cmd\.exe|icacls)\b|System\.Net|Start-BitsTransfer/iu);
    expect(helper).not.toMatch(/Remove-Item|Delete\(|FileMode\.Create\b|MOVEFILE_REPLACE_EXISTING/iu);
    expect(helper).not.toContain("FILE_FLAG_NO_BUFFERING");
  });

  it("requires the fixed local NTFS volume and mandatory FlushFileBuffers", () => {
    expect(helper).toContain("[System.IO.DriveInfo]::new('E')");
    expect(helper).toContain("[System.IO.DriveType]::Fixed");
    expect(helper).toContain("$drive.DriveFormat -cne 'NTFS'");
    expect(helper).toContain('@"\\\\.\\E:"');
    expect(helper).toContain("if (!FlushFileBuffers(handle))");
    const flushStart = helper.indexOf("public static void FlushFixedVolume()");
    const volumeFlush = helper.slice(flushStart, helper.indexOf("\n    }\n}\n'@", flushStart));
    expect(volumeFlush).not.toMatch(/catch\s*\{/u);
  });
});
