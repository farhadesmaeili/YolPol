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

function getPowerShellFunction(name: string): string {
  const match = helper.match(new RegExp(`^function ${name} \\{[\\s\\S]*?^\\}`, "mu"));

  expect(match, `${name} function not found`).not.toBeNull();
  return match?.[0] ?? "";
}

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
    expect(helper).toContain("$MaximumProductionDirectories = 128");
    expect(helper).toContain("$MaximumEntriesPerBackupDirectory = 4");
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
    expect(helper).toContain("$parsedReceipt = Read-CanonicalReceipt $actualReceipt $backupId");
  });

  it("keeps completed history metadata-bounded while authenticating its exact receipt bindings", () => {
    const receiptBranchStart = helper.indexOf("if ($receiptExists)");
    const receiptBranchEnd = helper.indexOf(
      "if ([System.IO.Directory]::Exists($durableDirectory)",
      receiptBranchStart,
    );
    const receiptBranch = helper.slice(receiptBranchStart, receiptBranchEnd);
    const receiptParser = getPowerShellFunction("Read-CanonicalReceipt");
    const lengthReader = getPowerShellFunction("Get-PlainFileLength");
    const signatureVerification = receiptBranch.indexOf(
      "VerifyReceipt($existingSigningMessage, $actualSignature)",
    );
    const strictParsing = receiptBranch.indexOf("Read-CanonicalReceipt $actualReceipt $backupId");
    const artifactLength = receiptBranch.indexOf("$existingArtifactLength = Get-PlainFileLength");

    expect(receiptBranchStart).toBeGreaterThanOrEqual(0);
    expect(receiptBranchEnd).toBeGreaterThan(receiptBranchStart);
    expect(receiptBranch).not.toMatch(/Get-PlainFileDigest|Get-StreamDigest/u);
    expect(signatureVerification).toBeGreaterThanOrEqual(0);
    expect(strictParsing).toBeGreaterThan(signatureVerification);
    expect(artifactLength).toBeGreaterThan(strictParsing);
    expect(receiptBranch).toContain("$existingManifestLength = Get-PlainFileLength");
    expect(receiptBranch).toContain("$parsedReceipt.Artifact.Size");
    expect(receiptBranch).toContain("$parsedReceipt.Manifest.Size");
    expect(receiptBranch).toContain("Assert-CanonicalAcl -Path $existingEntry.FullName");
    expect(lengthReader).toContain("OpenPlainRead($Path, $BufferSize)");
    expect(lengthReader).toContain("return [Int64]$stream.Length");
    expect(lengthReader).not.toMatch(/\$stream\.Read\(|Get-StreamDigest|SHA256|TransformBlock/u);

    expect(receiptParser).toContain("[System.Text.UTF8Encoding]::new($false, $true)");
    expect(receiptParser).toContain("[0-9a-f]{64}");
    expect(receiptParser).toContain('"schemaVersion":1\\}\\n\\z');
    expect(receiptParser).toContain("[System.Globalization.NumberStyles]::None");
    expect(receiptParser).toContain("$manifestSize -gt 65536");
    expect(receiptParser).toContain("windows-sftp-v1:/durable/$BackupId");
    expect(receiptParser).toContain("Assert-EqualBytes $expectedReceipt $ReceiptBytes");
    expect(receiptParser).not.toContain("ConvertFrom-Json");
  });

  it("classifies the full bounded scan before selecting at most one pending pair", () => {
    const trustCheck = helper.indexOf("$trust = Assert-WindowsTrustBoundary");
    const productionScan = helper.indexOf("$productionEntries = Get-BoundedEntries");
    const pendingCollection = helper.indexOf("$pendingBackups.Add(");
    const pendingSelection = helper.indexOf("$pendingBackup = Select-SinglePendingBackup");
    const durableCreation = helper.indexOf("CreateDirectoryExclusive($durableDirectory)");
    const selector = getPowerShellFunction("Select-SinglePendingBackup");

    expect(productionScan).toBeGreaterThan(trustCheck);
    expect(pendingCollection).toBeGreaterThan(productionScan);
    expect(pendingSelection).toBeGreaterThan(pendingCollection);
    expect(durableCreation).toBeGreaterThan(pendingSelection);
    expect(selector).toContain("$PendingBackups.Count -gt 1");
    expect(selector).toContain(
      "Multiple complete unreceipted Production backup pairs require manual review",
    );
    expect(selector).toContain("return $PendingBackups[0]");
  });

  windowsIt("selects zero or one pending pair and rejects a multiple-pair backlog", () => {
    const command = String.raw`
$content = Get-Content -LiteralPath $env:YOLPOL_TEST_HELPER_PATH -Raw
$functionMatch = [regex]::Match(
  $content,
  '(?ms)^function Select-SinglePendingBackup \{.*?^\}')
if (-not $functionMatch.Success) { throw 'Select-SinglePendingBackup function not found' }
. ([scriptblock]::Create($functionMatch.Value))
$empty = [System.Collections.ArrayList]::new()
if ($null -ne (Select-SinglePendingBackup $empty)) { throw 'Empty selection was not null' }
$one = [System.Collections.ArrayList]::new()
$expected = [pscustomobject]@{ BackupId = 'one' }
$null = $one.Add($expected)
if ((Select-SinglePendingBackup $one).BackupId -cne 'one') { throw 'Single selection changed' }
$multiple = [System.Collections.ArrayList]::new()
$null = $multiple.Add($expected)
$null = $multiple.Add([pscustomobject]@{ BackupId = 'two' })
$rejected = $false
try { $null = Select-SinglePendingBackup $multiple } catch { $rejected = $true }
if (-not $rejected) { throw 'Multiple pending pairs were accepted' }
`;
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

  windowsIt("strictly parses only the exact bounded canonical receipt schema", () => {
    const command = String.raw`
$content = Get-Content -LiteralPath $env:YOLPOL_TEST_HELPER_PATH -Raw
foreach ($name in @('Assert-EqualBytes', 'Get-CanonicalReceiptBytes', 'Read-CanonicalReceipt')) {
  $functionMatch = [regex]::Match($content, "(?ms)^function $name \{.*?^\}")
  if (-not $functionMatch.Success) { throw "$name function not found" }
  . ([scriptblock]::Create($functionMatch.Value))
}
$MaximumReceiptBytes = 4096
$DurabilityConfirmation = 'windows-flushfilebuffers-volume-v1'
$backupId = 'yolpol-production-20261004T170000Z-c2a0077b'
$receiptText = '{"artifactSha256":"' + ('a' * 64) +
  '","artifactSize":1073741824,"backupId":"' + $backupId +
  '","durabilityConfirmation":"windows-flushfilebuffers-volume-v1","manifestSha256":"' +
  ('b' * 64) +
  '","manifestSize":104,"remoteObjectSetId":"windows-sftp-v1:/durable/' + $backupId +
  '","schemaVersion":1}' + [char]10
$utf8 = [System.Text.UTF8Encoding]::new($false)
$valid = $utf8.GetBytes($receiptText)
$parsed = Read-CanonicalReceipt $valid $backupId
if ($parsed.Artifact.Size -ne 1073741824 -or $parsed.Manifest.Size -ne 104) {
  throw 'Canonical receipt sizes changed'
}
function Assert-Rejected([byte[]] $Bytes, [string] $ExpectedBackupId, [string] $Label) {
  $rejected = $false
  try { $null = Read-CanonicalReceipt $Bytes $ExpectedBackupId } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label was accepted" }
}
Assert-Rejected ($utf8.GetBytes($receiptText.Replace(',"schemaVersion":1}', ',"extra":1,"schemaVersion":1}'))) $backupId 'Unknown field'
Assert-Rejected ($utf8.GetBytes($receiptText.Replace(('a' * 64), ('A' * 64)))) $backupId 'Uppercase hash'
Assert-Rejected ($utf8.GetBytes($receiptText.Replace('"artifactSize":1073741824', '"artifactSize":0'))) $backupId 'Zero artifact'
Assert-Rejected ($utf8.GetBytes($receiptText.Replace('"manifestSize":104', '"manifestSize":65537'))) $backupId 'Oversized manifest'
Assert-Rejected $valid 'yolpol-production-20261004T170000Z-deadbee' 'Wrong backup identity'
Assert-Rejected ([byte[]](0xC3, 0x28)) $backupId 'Invalid UTF-8'
`;
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

  it("normalizes expected Allow rights once and retains exact ACL matching", () => {
    const expectedRuleFactory = getPowerShellFunction("New-ExpectedAccessRule");
    const aclAssertion = getPowerShellFunction("Assert-CanonicalAcl");

    expect(expectedRuleFactory).toContain(
      "$normalizedRights = $Rights -bor\n        [System.Security.AccessControl.FileSystemRights]::Synchronize",
    );
    expect(expectedRuleFactory).toContain("Rights = [Int64]$normalizedRights");
    expect(expectedRuleFactory).not.toMatch(/-band|AccessControlType/iu);
    expect(aclAssertion).toContain("$actualRules.Count -ne $ExpectedRules.Count");
    expect(aclAssertion).toContain(
      "$rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow",
    );
    expect(aclAssertion).toContain(
      "[Int64]$rule.FileSystemRights -eq $expectedRule.Rights",
    );
    expect(aclAssertion).toContain("$rule.IdentityReference.Value -ceq $expectedRule.Sid");
    expect(aclAssertion).toContain(
      "[int]$rule.InheritanceFlags -eq $expectedRule.InheritanceFlags",
    );
    expect(aclAssertion).toContain(
      "[int]$rule.PropagationFlags -eq $expectedRule.PropagationFlags",
    );
    expect(aclAssertion).toContain("$rule.IsInherited -eq $expectedRule.IsInherited");
    expect(aclAssertion).not.toMatch(/FileSystemRights\s+-band|expectedRule\.Rights\s+-band/iu);
  });

  windowsIt("matches canonical Windows Allow ACE masks without filesystem mutation", () => {
    const command = String.raw`
$content = Get-Content -LiteralPath $env:YOLPOL_TEST_HELPER_PATH -Raw
$functionMatch = [regex]::Match(
  $content,
  '(?ms)^function New-ExpectedAccessRule \{.*?^\}')
if (-not $functionMatch.Success) { throw 'New-ExpectedAccessRule function not found' }
. ([scriptblock]::Create($functionMatch.Value))
function Assert-Equal($Actual, $Expected, [string] $Label) {
  if ($Actual -ne $Expected) {
    throw "$Label expected '$Expected' but received '$Actual'"
  }
}
function Assert-NotEqual($Actual, $Expected, [string] $Label) {
  if ($Actual -eq $Expected) {
    throw "$Label unexpectedly matched '$Expected'"
  }
}
$sid = [System.Security.Principal.SecurityIdentifier]::new(
  [System.Security.Principal.WellKnownSidType]::LocalSystemSid,
  $null)
$none = [System.Security.AccessControl.InheritanceFlags]::None
$inheritChildren = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
  [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
$propagationNone = [System.Security.AccessControl.PropagationFlags]::None
$allow = [System.Security.AccessControl.AccessControlType]::Allow
$deny = [System.Security.AccessControl.AccessControlType]::Deny
$synchronize = [System.Security.AccessControl.FileSystemRights]::Synchronize
$readAndExecute = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
$modify = [System.Security.AccessControl.FileSystemRights]::Modify
$fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl
$canonicalRead = [Int64]($readAndExecute -bor $synchronize)
$canonicalModify = [Int64]($modify -bor $synchronize)

$rootRead = New-ExpectedAccessRule $sid $readAndExecute $none
$treeModify = New-ExpectedAccessRule $sid $modify $inheritChildren
$treeRead = New-ExpectedAccessRule $sid $readAndExecute $inheritChildren
$inheritedDirectoryRead = New-ExpectedAccessRule $sid $readAndExecute $inheritChildren $true
$inheritedFileRead = New-ExpectedAccessRule $sid $readAndExecute $none $true
$full = New-ExpectedAccessRule $sid $fullControl $inheritChildren

Assert-Equal $rootRead.Rights 1179817 'ReadAndExecute canonical mask'
Assert-Equal $rootRead.Rights $canonicalRead 'ReadAndExecute Synchronize normalization'
Assert-Equal $treeModify.Rights 1245631 'Modify canonical mask'
Assert-Equal $treeModify.Rights $canonicalModify 'Modify Synchronize normalization'
Assert-Equal $full.Rights ([Int64]$fullControl) 'FullControl idempotence'
Assert-Equal $rootRead.InheritanceFlags ([int]$none) 'Root ReadAndExecute inheritance'
Assert-Equal $rootRead.IsInherited $false 'Root ReadAndExecute inherited state'
Assert-Equal $treeModify.InheritanceFlags ([int]$inheritChildren) 'Tree Modify inheritance'
Assert-Equal $treeModify.IsInherited $false 'Tree Modify inherited state'
Assert-Equal $treeRead.InheritanceFlags ([int]$inheritChildren) 'Tree ReadAndExecute inheritance'
Assert-Equal $treeRead.Rights $canonicalRead 'Tree ReadAndExecute mask'
Assert-Equal $inheritedDirectoryRead.InheritanceFlags ([int]$inheritChildren) 'Inherited directory inheritance'
Assert-Equal $inheritedDirectoryRead.IsInherited $true 'Inherited directory state'
Assert-Equal $inheritedFileRead.InheritanceFlags ([int]$none) 'Inherited file inheritance'
Assert-Equal $inheritedFileRead.IsInherited $true 'Inherited file state'

$rootAllowAce = [System.Security.AccessControl.FileSystemAccessRule]::new(
  $sid, $readAndExecute, $none, $propagationNone, $allow)
$modifyAllowAce = [System.Security.AccessControl.FileSystemAccessRule]::new(
  $sid, $modify, $inheritChildren, $propagationNone, $allow)
$readTreeAllowAce = [System.Security.AccessControl.FileSystemAccessRule]::new(
  $sid, $readAndExecute, $inheritChildren, $propagationNone, $allow)
Assert-Equal ([Int64]$rootAllowAce.FileSystemRights) $rootRead.Rights 'Root Allow ACE exact mask'
Assert-Equal ([Int64]$modifyAllowAce.FileSystemRights) $treeModify.Rights 'Modify Allow ACE exact mask'
Assert-Equal ([Int64]$readTreeAllowAce.FileSystemRights) $treeRead.Rights 'Read tree Allow ACE exact mask'

$extraRightAce = [System.Security.AccessControl.FileSystemAccessRule]::new(
  $sid,
  ($readAndExecute -bor [System.Security.AccessControl.FileSystemRights]::Write),
  $none,
  $propagationNone,
  $allow)
Assert-NotEqual ([Int64]$extraRightAce.FileSystemRights) $rootRead.Rights 'Additional right rejection'
Assert-NotEqual ([Int64]$readAndExecute) $rootRead.Rights 'Missing Synchronize rejection'
$denyAce = [System.Security.AccessControl.FileSystemAccessRule]::new(
  $sid, $readAndExecute, $none, $propagationNone, $deny)
Assert-NotEqual $denyAce.AccessControlType $allow 'Deny rejection'
Assert-Equal $rootAllowAce.AccessControlType $allow 'Allow contract'
Assert-Equal $rootRead.PropagationFlags ([int]$propagationNone) 'Propagation flags'
`;
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
