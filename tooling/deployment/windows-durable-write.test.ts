import {spawnSync} from "node:child_process";
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
const windowsIt = process.platform === "win32" ? it : it.skip;

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
    expect(helper).toContain("receipt signature partial collision requires manual review");
    expect(helper).toContain("receipt/signature orphan requires manual review");
    expect(helper).toContain("if ($receiptExists -ne $signatureExists)");
    expect(helper).toContain("durable backup directory collision requires manual review");
    expect(helper).toContain("$existingEntries = Get-BoundedEntries $existingDurable 2");
    expect(helper).toContain("Assert-EqualBytes $expectedReceipt $actualReceipt");
  });

  it("requires protected canonical ACLs before scanning or accepting an existing receipt", () => {
    const trustCheck = helper.indexOf("$trust = Assert-WindowsTrustBoundary");
    const productionScan = helper.indexOf("$productionEntries = Get-BoundedEntries");
    const existingReceipt = helper.indexOf("if ($receiptExists)");

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
    const receiptBranch = helper.indexOf("if ($receiptExists)");
    const existingReceiptAcl = helper.indexOf(
      "-AdministratorsSid $trust.AdministratorsSid -Label 'Existing durability receipt'",
    );
    const existingReceiptRead = helper.indexOf("Read-PlainBoundedBytes $receiptFinal");
    const existingSignatureAcl = helper.indexOf("-Label 'Existing durability receipt signature'");
    const existingSignatureVerify = helper.indexOf("VerifyReceipt($existingSigningMessage, $actualSignature)");
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
    expect(existingSignatureAcl).toBeGreaterThan(existingReceiptAcl);
    expect(existingSignatureVerify).toBeGreaterThan(existingReceiptRead);
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

  it("signs exact receipt bytes and publishes signature before the final receipt marker", () => {
    const artifactMove = helper.indexOf("MoveNewNoReplace($artifactPartial, $artifactFinal)");
    const manifestMove = helper.indexOf("MoveNewNoReplace($manifestPartial, $manifestFinal)");
    const finalVerification = helper.indexOf("$manifestVerified = Get-PlainFileDigest $manifestFinal");
    const volumeFlush = helper.indexOf("[YolpolWindowsDurabilityNative]::FlushFixedVolume()");
    const receiptBuild = helper.indexOf("$receiptBytes = Get-CanonicalReceiptBytes", volumeFlush);
    const signingMessage = helper.indexOf("$signingMessage = Get-ReceiptSigningMessage $receiptBytes");
    const signature = helper.indexOf("SignReceipt($signingMessage)");
    const signaturePartialWrite = helper.indexOf("Write-SignaturePartial $signaturePartial $signatureBytes");
    const receiptPartialWrite = helper.indexOf("Write-ReceiptPartial $receiptPartial $receiptBytes");
    const signaturePublication = helper.indexOf("MoveNewNoReplace($signaturePartial, $signatureFinal)");
    const receiptPublication = helper.indexOf("MoveNewNoReplace($receiptPartial, $receiptFinal)");

    expect(artifactMove).toBeGreaterThanOrEqual(0);
    expect(manifestMove).toBeGreaterThan(artifactMove);
    expect(finalVerification).toBeGreaterThan(manifestMove);
    expect(volumeFlush).toBeGreaterThan(finalVerification);
    expect(receiptBuild).toBeGreaterThan(volumeFlush);
    expect(signingMessage).toBeGreaterThan(receiptBuild);
    expect(signature).toBeGreaterThan(signingMessage);
    expect(signaturePartialWrite).toBeGreaterThan(signature);
    expect(helper).toMatch(/function Write-SignaturePartial[\s\S]*?CreateNewWriteThrough\(\$Path, \$BufferSize\)[\s\S]*?\$stream\.Flush\(\$true\)/u);
    expect(receiptPartialWrite).toBeGreaterThan(signaturePartialWrite);
    expect(signaturePublication).toBeGreaterThan(receiptPartialWrite);
    expect(receiptPublication).toBeGreaterThan(signaturePublication);
    expect(helper.slice(receiptPublication)).not.toMatch(/Get-PlainFileDigest|FlushFixedVolume|SignReceipt|Assert-CanonicalAcl/u);
    expect(helper).toContain("windows-flushfilebuffers-volume-v1");
    expect(helper).toContain("windows-sftp-v1:/durable/$BackupId");
    expect(helper).toContain("[System.Text.UTF8Encoding]::new($false)");
    expect(helper).toContain("'\",\"schemaVersion\":1}' + \"`n\"");
    expect(helper).toContain("same-volume rename only publishes a new name");
  });

  it("requires signature verification and final readback before positive confirmation", () => {
    const receiptReadback = adapter.indexOf("_poll_windows_receipt(");
    const signatureVerification = adapter.indexOf("_verify_windows_receipt_signature(");
    const durableReadback = adapter.indexOf("_sha256_file(manifest_readback) != pair.manifest_sha256");
    const positiveConfirmation = adapter.indexOf("durable_write_confirmed=True", durableReadback);

    expect(receiptReadback).toBeGreaterThanOrEqual(0);
    expect(signatureVerification).toBeGreaterThan(receiptReadback);
    expect(durableReadback).toBeGreaterThan(signatureVerification);
    expect(positiveConfirmation).toBeGreaterThan(durableReadback);
    expect(adapter).not.toContain("Windows receipt authentication is unavailable");
  });

  it("pins a LocalSystem-only non-exportable RSA-3072 CNG signing authority and RSA-PSS SHA-256", () => {
    expect(helper).toContain('RECEIPT_SIGNING_KEY_NAME = "YOLPOL-Offserver-Durability-Receipt-v1"');
    expect(helper).toContain('RECEIPT_SIGNING_PROVIDER = "Microsoft Software Key Storage Provider"');
    expect(helper).toContain("CngKeyOpenOptions.MachineKey");
    expect(helper).toContain("CngAlgorithm.Rsa.Algorithm");
    expect(helper).toContain("key.AlgorithmGroup.Equals(CngAlgorithmGroup.Rsa)");
    expect(helper).toContain("key.KeySize != RECEIPT_SIGNING_KEY_BITS");
    expect(helper).toContain("!key.IsMachineKey");
    expect(helper).toContain("key.IsEphemeral");
    expect(helper).toContain("key.KeyUsage != CngKeyUsages.Signing");
    expect(helper).toContain("key.ExportPolicy != CngExportPolicies.None");
    expect(helper).toContain("WellKnownSidType.LocalSystemSid");
    expect(helper).toContain("HashAlgorithmName.SHA256");
    expect(helper).toContain("RSASignaturePadding.Pss");
    expect(helper).toContain("signature.Length != RECEIPT_SIGNATURE_BYTES");
    expect(helper).toContain("$ReceiptSignatureBytes = 384");
    expect(helper).toContain("$ReceiptSigningDomain = 'YOLPOL-WINDOWS-DURABILITY-RECEIPT-V1'");
    expect(helper).toContain("$message[$domainBytes.Length] = 0");
    expect(helper).not.toMatch(/CngKey\.Create|New-SelfSignedCertificate|ExportSubjectPublicKeyInfo/iu);
  });

  it("retrieves and fail-closed validates the persisted CNG key security descriptor", () => {
    expect(helper).toContain('NCRYPT_SECURITY_DESCR_PROPERTY = "Security Descr"');
    expect(helper).toContain("OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION | NCRYPT_SILENT_FLAG");
    expect(helper.match(/NCryptGetProperty\(/gu)).toHaveLength(3);
    expect(helper).toContain("status != 0");
    expect(helper).toContain("RawSecurityDescriptor(securityDescriptor, 0)");
    expect(helper).toContain("CommonSecurityDescriptor(false, false, securityDescriptor, 0)");
    expect(helper).toContain("WellKnownSidType.LocalSystemSid");
    expect(helper).toContain("WellKnownSidType.BuiltinAdministratorsSid");
    expect(helper).toContain("!descriptor.Owner.Equals(localSystem)");
    expect(helper).toContain("ControlFlags.DiscretionaryAclPresent");
    expect(helper).toContain("descriptor.DiscretionaryAcl == null");
    expect(helper).toContain("ControlFlags.DiscretionaryAclProtected");
    expect(helper).toContain("!commonDescriptor.IsDiscretionaryAclCanonical");
    expect(helper).toContain("descriptor.DiscretionaryAcl.Count != 2");
    expect(helper).toContain("ace.AceQualifier != AceQualifier.AccessAllowed");
    expect(helper).toContain("ace.AceFlags != AceFlags.None");
    expect(helper).toContain("ace.AccessMask == 0");
    expect(helper).toContain("The receipt signing key DACL grants an unapproved SID");
    expect(helper).toContain(
      "ValidateReceiptSigningKeySecurityDescriptor(GetReceiptSigningKeySecurityDescriptor(key))",
    );
    expect(helper).not.toContain("NCryptSetProperty");
  });

  windowsIt("accepts only the synthetic LocalSystem/Administrators descriptor contract", () => {
    const command = String.raw`
$content = Get-Content -LiteralPath $env:YOLPOL_TEST_HELPER_PATH -Raw
$sourceMatch = [regex]::Match(
  $content,
  "Add-Type -TypeDefinition @'\r?\n(?<source>[\s\S]*?)\r?\n'@")
if (-not $sourceMatch.Success) { throw 'Embedded C# source not found' }
Add-Type -TypeDefinition $sourceMatch.Groups['source'].Value -ErrorAction Stop
function Convert-SddlToBytes([string] $Sddl) {
  $descriptor = [System.Security.AccessControl.RawSecurityDescriptor]::new($Sddl)
  $bytes = [byte[]]::new($descriptor.BinaryLength)
  $descriptor.GetBinaryForm($bytes, 0)
  return $bytes
}
[YolpolWindowsDurabilityNative]::ValidateReceiptSigningKeySecurityDescriptor(
  (Convert-SddlToBytes 'O:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)'))
$rejected = @(
  'O:SY',
  'O:BAD:P(A;;GA;;;SY)(A;;GA;;;BA)',
  'O:SYD:(A;;GA;;;SY)(A;;GA;;;BA)',
  'O:SYD:P(A;;GA;;;SY)(D;;GA;;;BA)',
  'O:SYD:P(A;;GA;;;BA)(A;ID;GA;;;SY)',
  'O:SYD:P(A;;GA;;;SY)(A;;GA;;;BU)',
  'O:SYD:P(A;;GA;;;SY)(A;;GA;;;WD)',
  'O:SYD:P(A;;GA;;;SY)(A;;GA;;;AU)',
  'O:SYD:P(A;;GA;;;SY)(A;;GA;;;S-1-5-21-1-2-3-1001)'
)
foreach ($sddl in $rejected) {
  $didReject = $false
  try {
    [YolpolWindowsDurabilityNative]::ValidateReceiptSigningKeySecurityDescriptor(
      (Convert-SddlToBytes $sddl))
  } catch {
    $didReject = $true
  }
  if (-not $didReject) { throw "Descriptor was unexpectedly accepted: $sddl" }
}`;
    const result = spawnSync(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          YOLPOL_TEST_HELPER_PATH: resolve(
            repositoryRoot,
            "deploy/windows/offserver-durability/yolpol-durable-write.ps1",
          ),
        },
        timeout: 20_000,
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
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
