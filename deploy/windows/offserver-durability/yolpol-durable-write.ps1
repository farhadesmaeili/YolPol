#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ChrootRoot = 'E:\yolpol-backups'
$ProductionRoot = 'E:\yolpol-backups\production'
$DurableRoot = 'E:\yolpol-backups\durable'
$ReceiptRoot = 'E:\yolpol-backups\durability-receipts'
$InstalledHelperPath = 'C:\ProgramData\YOLPOL\offserver-durability\yolpol-durable-write.ps1'
$BackupAccountName = 'yolpol-backup'
$BackupIdPattern = '^yolpol-production-[0-9]{8}T[0-9]{6}Z(?:-[0-9a-f]{7,64})?$'
$DurabilityConfirmation = 'windows-flushfilebuffers-volume-v1'
$MaximumProductionDirectories = 128
$MaximumEntriesPerBackupDirectory = 4
$MaximumReceiptBytes = 4096
$BufferSize = 1MB

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class YolpolWindowsDurabilityNative
{
    private const uint GENERIC_READ = 0x80000000;
    private const uint GENERIC_WRITE = 0x40000000;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint OPEN_EXISTING = 3;
    private const uint CREATE_NEW = 1;
    private const uint FILE_ATTRIBUTE_NORMAL = 0x00000080;
    private const uint FILE_ATTRIBUTE_DIRECTORY = 0x00000010;
    private const uint FILE_ATTRIBUTE_REPARSE_POINT = 0x00000400;
    private const uint FILE_FLAG_WRITE_THROUGH = 0x80000000;
    private const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
    private const uint FILE_FLAG_SEQUENTIAL_SCAN = 0x08000000;
    private const uint MOVEFILE_WRITE_THROUGH = 0x00000008;
    private const uint FILE_NAME_NORMALIZED = 0x00000000;
    private const uint VOLUME_NAME_DOS = 0x00000000;
    private const int MAXIMUM_FINAL_PATH = 32768;
    private const int MAX_PREFERRED_LENGTH = -1;
    private const int LG_INCLUDE_INDIRECT = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct BY_HANDLE_FILE_INFORMATION
    {
        internal uint FileAttributes;
        internal System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
        internal System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
        internal System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
        internal uint VolumeSerialNumber;
        internal uint FileSizeHigh;
        internal uint FileSizeLow;
        internal uint NumberOfLinks;
        internal uint FileIndexHigh;
        internal uint FileIndexLow;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LOCALGROUP_USERS_INFO_0
    {
        internal IntPtr Name;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        IntPtr securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateDirectoryW(string path, IntPtr securityAttributes);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool MoveFileExW(string existingPath, string newPath, uint flags);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FlushFileBuffers(SafeFileHandle handle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(
        SafeFileHandle handle,
        out BY_HANDLE_FILE_INFORMATION information);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandleW(
        SafeFileHandle handle,
        StringBuilder path,
        uint pathLength,
        uint flags);

    [DllImport("Netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int NetUserGetLocalGroups(
        string serverName,
        string userName,
        int level,
        int flags,
        out IntPtr buffer,
        int preferredMaximumLength,
        out int entriesRead,
        out int totalEntries);

    [DllImport("Netapi32.dll")]
    private static extern int NetApiBufferFree(IntPtr buffer);

    private static Win32Exception Error(string operation, int error)
    {
        return new Win32Exception(error, operation + " failed");
    }

    public static FileStream OpenPlainRead(string path, int bufferSize)
    {
        SafeFileHandle handle = CreateFileW(
            path,
            GENERIC_READ,
            FILE_SHARE_READ,
            IntPtr.Zero,
            OPEN_EXISTING,
            FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_SEQUENTIAL_SCAN,
            IntPtr.Zero);
        if (handle.IsInvalid)
        {
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw Error("Open source", error);
        }

        BY_HANDLE_FILE_INFORMATION information;
        if (!GetFileInformationByHandle(handle, out information))
        {
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw Error("Inspect source", error);
        }
        if ((information.FileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)) != 0)
        {
            handle.Dispose();
            throw new IOException("Source is not a plain regular file");
        }
        if (information.NumberOfLinks != 1)
        {
            handle.Dispose();
            throw new IOException("Opened file must have exactly one hard link");
        }

        string expectedDosPath = Path.GetFullPath(path);
        if (!string.Equals(expectedDosPath, path, StringComparison.OrdinalIgnoreCase))
        {
            handle.Dispose();
            throw new IOException("Expected path is not canonical");
        }
        StringBuilder resolvedPath = new StringBuilder(MAXIMUM_FINAL_PATH);
        uint resolvedLength = GetFinalPathNameByHandleW(
            handle,
            resolvedPath,
            (uint)resolvedPath.Capacity,
            FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
        if (resolvedLength == 0 || resolvedLength >= (uint)resolvedPath.Capacity)
        {
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw Error("Resolve opened path", error);
        }
        string expectedResolvedPath = @"\\?\" + expectedDosPath;
        if (!string.Equals(resolvedPath.ToString(), expectedResolvedPath, StringComparison.OrdinalIgnoreCase))
        {
            handle.Dispose();
            throw new IOException("Opened file resolved outside its exact expected path");
        }
        return new FileStream(handle, FileAccess.Read, bufferSize, false);
    }

    public static string[] GetLocalGroupNames(string userName)
    {
        IntPtr buffer = IntPtr.Zero;
        int entriesRead;
        int totalEntries;
        int status = NetUserGetLocalGroups(
            null,
            userName,
            0,
            LG_INCLUDE_INDIRECT,
            out buffer,
            MAX_PREFERRED_LENGTH,
            out entriesRead,
            out totalEntries);
        try
        {
            if (status != 0)
            {
                throw new Win32Exception(status, "Resolve local group membership failed");
            }
            string[] names = new string[entriesRead];
            int structureSize = Marshal.SizeOf(typeof(LOCALGROUP_USERS_INFO_0));
            for (int index = 0; index < entriesRead; index++)
            {
                IntPtr item = IntPtr.Add(buffer, index * structureSize);
                LOCALGROUP_USERS_INFO_0 information =
                    (LOCALGROUP_USERS_INFO_0)Marshal.PtrToStructure(
                        item,
                        typeof(LOCALGROUP_USERS_INFO_0));
                names[index] = Marshal.PtrToStringUni(information.Name);
            }
            return names;
        }
        finally
        {
            if (buffer != IntPtr.Zero)
            {
                NetApiBufferFree(buffer);
            }
        }
    }

    public static FileStream CreateNewWriteThrough(string path, int bufferSize)
    {
        SafeFileHandle handle = CreateFileW(
            path,
            GENERIC_WRITE,
            0,
            IntPtr.Zero,
            CREATE_NEW,
            FILE_ATTRIBUTE_NORMAL | FILE_FLAG_WRITE_THROUGH | FILE_FLAG_SEQUENTIAL_SCAN,
            IntPtr.Zero);
        if (handle.IsInvalid)
        {
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw Error("Create destination", error);
        }
        return new FileStream(handle, FileAccess.Write, bufferSize, false);
    }

    public static void CreateDirectoryExclusive(string path)
    {
        if (!CreateDirectoryW(path, IntPtr.Zero))
        {
            throw Error("Create durable directory", Marshal.GetLastWin32Error());
        }
    }

    public static void MoveNewNoReplace(string existingPath, string newPath)
    {
        // WRITE_THROUGH is defensive here. The later fixed-volume flush is the
        // durability boundary; this same-volume rename only publishes a new name.
        if (!MoveFileExW(existingPath, newPath, MOVEFILE_WRITE_THROUGH))
        {
            throw Error("Publish immutable file", Marshal.GetLastWin32Error());
        }
    }

    public static void FlushFixedVolume()
    {
        using (SafeFileHandle handle = CreateFileW(
            @"\\.\E:",
            GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            IntPtr.Zero,
            OPEN_EXISTING,
            FILE_FLAG_WRITE_THROUGH,
            IntPtr.Zero))
        {
            if (handle.IsInvalid)
            {
                throw Error("Open fixed volume", Marshal.GetLastWin32Error());
            }
            if (!FlushFileBuffers(handle))
            {
                throw Error("Flush fixed volume", Marshal.GetLastWin32Error());
            }
        }
    }
}
'@

function Test-ReparsePoint {
    param([System.IO.FileSystemInfo]$Item)

    return (($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
}

function Assert-PlainDirectory {
    param(
        [string]$Path,
        [string]$Label
    )

    $item = [System.IO.DirectoryInfo]::new($Path)
    if (-not $item.Exists -or (Test-ReparsePoint $item)) {
        throw "$Label is not a plain directory"
    }
    if ([System.IO.Path]::GetFullPath($item.FullName) -cne $Path) {
        throw "$Label path is not canonical"
    }
    return $item
}

function Resolve-ExactLocalAccountSid {
    param([string]$AccountName)

    $qualifiedName = "$env:COMPUTERNAME\$AccountName"
    try {
        $account = [System.Security.Principal.NTAccount]::new($qualifiedName)
        $sid = [System.Security.Principal.SecurityIdentifier]$account.Translate(
            [System.Security.Principal.SecurityIdentifier]
        )
        $roundTrip = [System.Security.Principal.NTAccount]$sid.Translate(
            [System.Security.Principal.NTAccount]
        )
    }
    catch {
        throw "The fixed local account '$qualifiedName' cannot be resolved"
    }
    if (-not [string]::Equals(
        $roundTrip.Value,
        $qualifiedName,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        throw "The fixed local account '$qualifiedName' did not resolve exactly"
    }
    return $sid
}

function New-ExpectedAccessRule {
    param(
        [System.Security.Principal.SecurityIdentifier]$Sid,
        [System.Security.AccessControl.FileSystemRights]$Rights,
        [System.Security.AccessControl.InheritanceFlags]$InheritanceFlags,
        [bool]$IsInherited = $false
    )

    return [pscustomobject]@{
        Sid = $Sid.Value
        Rights = [Int64]$Rights
        InheritanceFlags = [int]$InheritanceFlags
        PropagationFlags = [int][System.Security.AccessControl.PropagationFlags]::None
        IsInherited = $IsInherited
    }
}

function Assert-CanonicalAcl {
    param(
        [string]$Path,
        [bool]$Directory,
        [object[]]$ExpectedRules,
        [System.Security.Principal.SecurityIdentifier]$SystemSid,
        [System.Security.Principal.SecurityIdentifier]$AdministratorsSid,
        [string]$Label,
        [bool]$RequireProtected = $true
    )

    if ($Directory) {
        $security = [System.IO.Directory]::GetAccessControl(
            $Path,
            [System.Security.AccessControl.AccessControlSections]::Access -bor
                [System.Security.AccessControl.AccessControlSections]::Owner
        )
    }
    else {
        $security = [System.IO.File]::GetAccessControl(
            $Path,
            [System.Security.AccessControl.AccessControlSections]::Access -bor
                [System.Security.AccessControl.AccessControlSections]::Owner
        )
    }
    if ($security.AreAccessRulesProtected -ne $RequireProtected) {
        throw "$Label DACL protection state is not the fixed contract"
    }
    if (-not $security.AreAccessRulesCanonical) {
        throw "$Label DACL is not canonical"
    }

    $owner = $security.GetOwner([System.Security.Principal.SecurityIdentifier])
    if ($owner.Value -cne $SystemSid.Value -and $owner.Value -cne $AdministratorsSid.Value) {
        throw "$Label owner is not SYSTEM or BUILTIN\Administrators"
    }

    $actualRules = @($security.GetAccessRules(
        $true,
        $true,
        [System.Security.Principal.SecurityIdentifier]
    ))
    if ($actualRules.Count -ne $ExpectedRules.Count) {
        throw "$Label DACL contains a missing or unexpected trustee"
    }
    $unmatchedRules = [System.Collections.Generic.List[object]]::new()
    foreach ($expectedRule in $ExpectedRules) {
        $unmatchedRules.Add($expectedRule)
    }
    foreach ($rule in $actualRules) {
        if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
            throw "$Label DACL contains a deny access rule"
        }
        $match = $null
        foreach ($expectedRule in $unmatchedRules) {
            if (
                $rule.IdentityReference.Value -ceq $expectedRule.Sid -and
                [Int64]$rule.FileSystemRights -eq $expectedRule.Rights -and
                [int]$rule.InheritanceFlags -eq $expectedRule.InheritanceFlags -and
                [int]$rule.PropagationFlags -eq $expectedRule.PropagationFlags -and
                $rule.IsInherited -eq $expectedRule.IsInherited
            ) {
                $match = $expectedRule
                break
            }
        }
        if ($null -eq $match) {
            throw "$Label DACL contains an unexpected mutation trustee, rights, or inheritance shape"
        }
        $null = $unmatchedRules.Remove($match)
    }
    if ($unmatchedRules.Count -ne 0) {
        throw "$Label DACL is missing a required SYSTEM, Administrators, or backup-account rule"
    }
}

function Assert-WindowsTrustBoundary {
    $systemSid = [System.Security.Principal.SecurityIdentifier]::new(
        [System.Security.Principal.WellKnownSidType]::LocalSystemSid,
        $null
    )
    $administratorsSid = [System.Security.Principal.SecurityIdentifier]::new(
        [System.Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid,
        $null
    )
    $usersSid = [System.Security.Principal.SecurityIdentifier]::new(
        [System.Security.Principal.WellKnownSidType]::BuiltinUsersSid,
        $null
    )
    $backupSid = Resolve-ExactLocalAccountSid $BackupAccountName
    if ($backupSid.Value -ceq $systemSid.Value -or $backupSid.Value -ceq $administratorsSid.Value) {
        throw 'The backup account resolves to a privileged identity'
    }

    $qualifiedBackupName = "$env:COMPUTERNAME\$BackupAccountName"
    try {
        $usersAccount = [System.Security.Principal.NTAccount]$usersSid.Translate(
            [System.Security.Principal.NTAccount]
        )
    }
    catch {
        throw 'BUILTIN\Users cannot be resolved from its well-known SID'
    }
    $accountSeparator = $usersAccount.Value.IndexOf('\')
    if ($accountSeparator -le 0 -or $accountSeparator -eq ($usersAccount.Value.Length - 1)) {
        throw 'BUILTIN\Users resolved to an invalid account name'
    }
    $expectedUsersGroupName = $usersAccount.Value.Substring($accountSeparator + 1)
    $localGroupNames = @(
        [YolpolWindowsDurabilityNative]::GetLocalGroupNames($qualifiedBackupName)
    )
    if (
        $localGroupNames.Count -ne 1 -or
        -not [string]::Equals(
            $localGroupNames[0],
            $expectedUsersGroupName,
            [System.StringComparison]::OrdinalIgnoreCase
        )
    ) {
        throw 'The backup account must belong only to BUILTIN\Users'
    }

    $inheritChildren = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
        [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    $noInheritance = [System.Security.AccessControl.InheritanceFlags]::None
    $fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl
    $modify = [System.Security.AccessControl.FileSystemRights]::Modify
    $readAndExecute = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
    $systemFull = New-ExpectedAccessRule $systemSid $fullControl $inheritChildren
    $administratorsFull = New-ExpectedAccessRule $administratorsSid $fullControl $inheritChildren
    $backupReadRoot = New-ExpectedAccessRule $backupSid $readAndExecute $noInheritance
    $backupModifyTree = New-ExpectedAccessRule $backupSid $modify $inheritChildren
    $backupReadTree = New-ExpectedAccessRule $backupSid $readAndExecute $inheritChildren

    $chroot = Assert-PlainDirectory $ChrootRoot 'SFTP chroot root'
    $production = Assert-PlainDirectory $ProductionRoot 'Production ingress root'
    $null = Assert-PlainDirectory $DurableRoot 'Durable store root'
    $null = Assert-PlainDirectory $ReceiptRoot 'Durability receipt root'
    Assert-CanonicalAcl $ChrootRoot $true @($systemFull, $administratorsFull, $backupReadRoot) `
        $systemSid $administratorsSid 'SFTP chroot root'
    Assert-CanonicalAcl $ProductionRoot $true @($systemFull, $administratorsFull, $backupModifyTree) `
        $systemSid $administratorsSid 'Production ingress root'
    Assert-CanonicalAcl $DurableRoot $true @($systemFull, $administratorsFull, $backupReadTree) `
        $systemSid $administratorsSid 'Durable store root'
    Assert-CanonicalAcl $ReceiptRoot $true @($systemFull, $administratorsFull, $backupReadTree) `
        $systemSid $administratorsSid 'Durability receipt root'

    if (-not [string]::Equals(
        [System.IO.Path]::GetFullPath($PSCommandPath),
        $InstalledHelperPath,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        throw 'The helper is not running from its fixed protected installation path'
    }
    $helperDirectoryPath = [System.IO.Path]::GetDirectoryName($InstalledHelperPath)
    $null = Assert-PlainDirectory $helperDirectoryPath 'Installed helper directory'
    $helperFile = [System.IO.FileInfo]::new($InstalledHelperPath)
    if (-not $helperFile.Exists -or (Test-ReparsePoint $helperFile)) {
        throw 'The installed helper is not a plain file'
    }
    $helperHandle = [YolpolWindowsDurabilityNative]::OpenPlainRead($InstalledHelperPath, $BufferSize)
    $helperHandle.Dispose()
    $systemFullDirectory = New-ExpectedAccessRule $systemSid $fullControl $inheritChildren
    $administratorsFullDirectory = New-ExpectedAccessRule $administratorsSid $fullControl $inheritChildren
    $systemFullFile = New-ExpectedAccessRule $systemSid $fullControl $noInheritance
    $administratorsFullFile = New-ExpectedAccessRule $administratorsSid $fullControl $noInheritance
    Assert-CanonicalAcl $helperDirectoryPath $true @($systemFullDirectory, $administratorsFullDirectory) `
        $systemSid $administratorsSid 'Installed helper directory'
    Assert-CanonicalAcl $InstalledHelperPath $false @($systemFullFile, $administratorsFullFile) `
        $systemSid $administratorsSid 'Installed helper file'

    $systemInheritedDirectory = New-ExpectedAccessRule $systemSid $fullControl $inheritChildren $true
    $administratorsInheritedDirectory = New-ExpectedAccessRule `
        $administratorsSid $fullControl $inheritChildren $true
    $backupInheritedDirectory = New-ExpectedAccessRule $backupSid $readAndExecute $inheritChildren $true
    $systemInheritedFile = New-ExpectedAccessRule $systemSid $fullControl $noInheritance $true
    $administratorsInheritedFile = New-ExpectedAccessRule `
        $administratorsSid $fullControl $noInheritance $true
    $backupInheritedFile = New-ExpectedAccessRule $backupSid $readAndExecute $noInheritance $true

    return [pscustomobject]@{
        Production = $production
        SystemSid = $systemSid
        AdministratorsSid = $administratorsSid
        DurableDirectoryRules = @(
            $systemInheritedDirectory,
            $administratorsInheritedDirectory,
            $backupInheritedDirectory
        )
        DurableFileRules = @($systemInheritedFile, $administratorsInheritedFile, $backupInheritedFile)
    }
}

function Get-BoundedEntries {
    param(
        [System.IO.DirectoryInfo]$Directory,
        [int]$Maximum,
        [string]$Label
    )

    $entries = [System.Collections.Generic.List[System.IO.FileSystemInfo]]::new()
    $enumerator = $Directory.EnumerateFileSystemInfos().GetEnumerator()
    try {
        while ($enumerator.MoveNext()) {
            if ($entries.Count -ge $Maximum) {
                throw "$Label exceeds its bounded entry limit"
            }
            $entries.Add($enumerator.Current)
        }
    }
    finally {
        $enumerator.Dispose()
    }
    return $entries.ToArray()
}

function Get-StreamDigest {
    param([System.IO.Stream]$Stream)

    $hash = [System.Security.Cryptography.SHA256]::Create()
    $buffer = [byte[]]::new($BufferSize)
    [Int64]$size = 0
    try {
        while (($count = $Stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $size += $count
            $null = $hash.TransformBlock($buffer, 0, $count, $buffer, 0)
        }
        $null = $hash.TransformFinalBlock([byte[]]::new(0), 0, 0)
        return [pscustomobject]@{
            Sha256 = ([System.BitConverter]::ToString($hash.Hash)).Replace('-', '').ToLowerInvariant()
            Size = $size
        }
    }
    finally {
        $hash.Dispose()
    }
}

function Copy-DurableFile {
    param(
        [string]$SourcePath,
        [string]$PartialPath
    )

    $source = [YolpolWindowsDurabilityNative]::OpenPlainRead($SourcePath, $BufferSize)
    try {
        $destination = [YolpolWindowsDurabilityNative]::CreateNewWriteThrough($PartialPath, $BufferSize)
        $hash = [System.Security.Cryptography.SHA256]::Create()
        $buffer = [byte[]]::new($BufferSize)
        [Int64]$size = 0
        try {
            while (($count = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $destination.Write($buffer, 0, $count)
                $size += $count
                $null = $hash.TransformBlock($buffer, 0, $count, $buffer, 0)
            }
            $null = $hash.TransformFinalBlock([byte[]]::new(0), 0, 0)
            $destination.Flush($true)
            return [pscustomobject]@{
                Sha256 = ([System.BitConverter]::ToString($hash.Hash)).Replace('-', '').ToLowerInvariant()
                Size = $size
            }
        }
        finally {
            $hash.Dispose()
            $destination.Dispose()
        }
    }
    finally {
        $source.Dispose()
    }
}

function Get-PlainFileDigest {
    param([string]$Path)

    $stream = [YolpolWindowsDurabilityNative]::OpenPlainRead($Path, $BufferSize)
    try {
        return Get-StreamDigest $stream
    }
    finally {
        $stream.Dispose()
    }
}

function Write-ReceiptPartial {
    param(
        [string]$Path,
        [byte[]]$Content
    )

    if ($Content.Length -gt $MaximumReceiptBytes) {
        throw 'Receipt exceeds its bounded size'
    }
    $stream = [YolpolWindowsDurabilityNative]::CreateNewWriteThrough($Path, $BufferSize)
    try {
        $stream.Write($Content, 0, $Content.Length)
        $stream.Flush($true)
    }
    finally {
        $stream.Dispose()
    }
}

function Get-CanonicalReceiptBytes {
    param(
        [string]$BackupId,
        [object]$Artifact,
        [object]$Manifest
    )

    $remoteObjectSetId = "windows-sftp-v1:/durable/$BackupId"
    $receiptJson = '{"artifactSha256":"' + $Artifact.Sha256 +
        '","artifactSize":' + $Artifact.Size.ToString([System.Globalization.CultureInfo]::InvariantCulture) +
        ',"backupId":"' + $BackupId +
        '","durabilityConfirmation":"' + $DurabilityConfirmation +
        '","manifestSha256":"' + $Manifest.Sha256 +
        '","manifestSize":' + $Manifest.Size.ToString([System.Globalization.CultureInfo]::InvariantCulture) +
        ',"remoteObjectSetId":"' + $remoteObjectSetId +
        '","schemaVersion":1}' + "`n"
    $content = [System.Text.UTF8Encoding]::new($false).GetBytes($receiptJson)
    if ($content.Length -gt $MaximumReceiptBytes) {
        throw 'Receipt exceeds its bounded size'
    }
    return $content
}

function Read-PlainBoundedBytes {
    param(
        [string]$Path,
        [int]$Maximum
    )

    $stream = [YolpolWindowsDurabilityNative]::OpenPlainRead($Path, $BufferSize)
    $memory = [System.IO.MemoryStream]::new()
    $buffer = [byte[]]::new($Maximum + 1)
    try {
        while (($count = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            if (($memory.Length + $count) -gt $Maximum) {
                throw 'Bounded file exceeds its maximum size'
            }
            $memory.Write($buffer, 0, $count)
        }
        return $memory.ToArray()
    }
    finally {
        $memory.Dispose()
        $stream.Dispose()
    }
}

function Assert-EqualBytes {
    param(
        [byte[]]$Expected,
        [byte[]]$Actual
    )

    if ($Expected.Length -ne $Actual.Length) {
        throw 'Existing completed receipt mismatch'
    }
    for ($index = 0; $index -lt $Expected.Length; $index++) {
        if ($Expected[$index] -ne $Actual[$index]) {
            throw 'Existing completed receipt mismatch'
        }
    }
}

$drive = [System.IO.DriveInfo]::new('E')
if (-not $drive.IsReady -or $drive.DriveType -ne [System.IO.DriveType]::Fixed -or $drive.DriveFormat -cne 'NTFS') {
    throw 'The fixed E: NTFS volume contract is not satisfied'
}

$trust = Assert-WindowsTrustBoundary
$production = $trust.Production

$productionEntries = Get-BoundedEntries $production $MaximumProductionDirectories 'Production ingress root'
foreach ($entry in ($productionEntries | Sort-Object -Property Name)) {
    if ($entry -isnot [System.IO.DirectoryInfo] -or (Test-ReparsePoint $entry)) {
        throw 'Production ingress contains a non-directory or reparse-point entry'
    }
    $backupId = $entry.Name
    if ($backupId -cnotmatch $BackupIdPattern) {
        throw 'Production ingress contains an invalid backup identity'
    }

    $artifactName = "$backupId.dump.age"
    $manifestName = "$backupId.manifest.json"
    $artifactPartialName = "$artifactName.partial"
    $manifestPartialName = "$manifestName.partial"
    $allowedNames = @($artifactName, $manifestName, $artifactPartialName, $manifestPartialName)
    $pairEntries = Get-BoundedEntries $entry $MaximumEntriesPerBackupDirectory 'Production backup directory'
    foreach ($pairEntry in $pairEntries) {
        if ((Test-ReparsePoint $pairEntry) -or $pairEntry -isnot [System.IO.FileInfo] -or $allowedNames -cnotcontains $pairEntry.Name) {
            throw 'Production backup directory contains an unexpected entry'
        }
    }

    $artifactSource = [System.IO.Path]::Combine($ProductionRoot, $backupId, $artifactName)
    $manifestSource = [System.IO.Path]::Combine($ProductionRoot, $backupId, $manifestName)
    $artifactPartialSource = [System.IO.Path]::Combine($ProductionRoot, $backupId, $artifactPartialName)
    $manifestPartialSource = [System.IO.Path]::Combine($ProductionRoot, $backupId, $manifestPartialName)
    $durableDirectory = [System.IO.Path]::Combine($DurableRoot, $backupId)
    $receiptFinal = [System.IO.Path]::Combine($ReceiptRoot, "$backupId.json")
    $receiptPartial = "$receiptFinal.partial"

    if ([System.IO.File]::Exists($receiptPartial) -or [System.IO.Directory]::Exists($receiptPartial)) {
        throw 'A durability receipt partial collision requires manual review'
    }
    if ([System.IO.File]::Exists($receiptFinal)) {
        $existingReceipt = [System.IO.FileInfo]::new($receiptFinal)
        if ((Test-ReparsePoint $existingReceipt) -or $existingReceipt.Length -le 0 -or $existingReceipt.Length -gt $MaximumReceiptBytes) {
            throw 'An existing durability receipt is invalid'
        }
        Assert-CanonicalAcl -Path $receiptFinal -Directory $false `
            -ExpectedRules $trust.DurableFileRules -SystemSid $trust.SystemSid `
            -AdministratorsSid $trust.AdministratorsSid -Label 'Existing durability receipt' `
            -RequireProtected $false
        $existingDurable = Assert-PlainDirectory $durableDirectory 'Existing durable backup directory'
        Assert-CanonicalAcl -Path $durableDirectory -Directory $true `
            -ExpectedRules $trust.DurableDirectoryRules -SystemSid $trust.SystemSid `
            -AdministratorsSid $trust.AdministratorsSid -Label 'Existing durable backup directory' `
            -RequireProtected $false
        $existingEntries = Get-BoundedEntries $existingDurable 2 'Existing durable backup directory'
        if ($existingEntries.Count -ne 2) {
            throw 'Existing durable backup directory is incomplete'
        }
        foreach ($existingEntry in $existingEntries) {
            if (
                (Test-ReparsePoint $existingEntry) -or
                $existingEntry -isnot [System.IO.FileInfo] -or
                @($artifactName, $manifestName) -cnotcontains $existingEntry.Name
            ) {
                throw 'Existing durable backup directory contains an unexpected entry'
            }
            Assert-CanonicalAcl -Path $existingEntry.FullName -Directory $false `
                -ExpectedRules $trust.DurableFileRules -SystemSid $trust.SystemSid `
                -AdministratorsSid $trust.AdministratorsSid -Label 'Existing durable backup file' `
                -RequireProtected $false
        }
        $existingArtifact = Get-PlainFileDigest ([System.IO.Path]::Combine($durableDirectory, $artifactName))
        $existingManifest = Get-PlainFileDigest ([System.IO.Path]::Combine($durableDirectory, $manifestName))
        $expectedReceipt = Get-CanonicalReceiptBytes $backupId $existingArtifact $existingManifest
        $actualReceipt = Read-PlainBoundedBytes $receiptFinal $MaximumReceiptBytes
        Assert-EqualBytes $expectedReceipt $actualReceipt
        continue
    }
    if ([System.IO.Directory]::Exists($durableDirectory) -or [System.IO.File]::Exists($durableDirectory)) {
        throw 'A durable backup directory collision requires manual review'
    }

    $artifactComplete = [System.IO.File]::Exists($artifactSource)
    $manifestComplete = [System.IO.File]::Exists($manifestSource)
    if (-not ($artifactComplete -and $manifestComplete)) {
        continue
    }
    if ([System.IO.File]::Exists($artifactPartialSource) -or [System.IO.File]::Exists($manifestPartialSource) -or $pairEntries.Count -ne 2) {
        throw 'A complete Production backup pair has conflicting entries'
    }

    [YolpolWindowsDurabilityNative]::CreateDirectoryExclusive($durableDirectory)
    $null = Assert-PlainDirectory $durableDirectory 'New durable backup directory'
    Assert-CanonicalAcl -Path $durableDirectory -Directory $true `
        -ExpectedRules $trust.DurableDirectoryRules -SystemSid $trust.SystemSid `
        -AdministratorsSid $trust.AdministratorsSid -Label 'New durable backup directory' `
        -RequireProtected $false
    $artifactFinal = [System.IO.Path]::Combine($durableDirectory, $artifactName)
    $manifestFinal = [System.IO.Path]::Combine($durableDirectory, $manifestName)
    $artifactPartial = "$artifactFinal.partial"
    $manifestPartial = "$manifestFinal.partial"

    $artifactWritten = Copy-DurableFile $artifactSource $artifactPartial
    $manifestWritten = Copy-DurableFile $manifestSource $manifestPartial
    if ($artifactWritten.Size -le 0 -or $manifestWritten.Size -le 0 -or $manifestWritten.Size -gt 65536) {
        throw 'Durable backup pair size is invalid'
    }
    Assert-CanonicalAcl -Path $artifactPartial -Directory $false `
        -ExpectedRules $trust.DurableFileRules -SystemSid $trust.SystemSid `
        -AdministratorsSid $trust.AdministratorsSid -Label 'Durable artifact partial' `
        -RequireProtected $false
    Assert-CanonicalAcl -Path $manifestPartial -Directory $false `
        -ExpectedRules $trust.DurableFileRules -SystemSid $trust.SystemSid `
        -AdministratorsSid $trust.AdministratorsSid -Label 'Durable manifest partial' `
        -RequireProtected $false

    [YolpolWindowsDurabilityNative]::MoveNewNoReplace($artifactPartial, $artifactFinal)
    [YolpolWindowsDurabilityNative]::MoveNewNoReplace($manifestPartial, $manifestFinal)

    $artifactVerified = Get-PlainFileDigest $artifactFinal
    $manifestVerified = Get-PlainFileDigest $manifestFinal
    if ($artifactVerified.Size -ne $artifactWritten.Size -or $artifactVerified.Sha256 -cne $artifactWritten.Sha256) {
        throw 'Final durable artifact verification failed'
    }
    if ($manifestVerified.Size -ne $manifestWritten.Size -or $manifestVerified.Sha256 -cne $manifestWritten.Sha256) {
        throw 'Final durable manifest verification failed'
    }

    [YolpolWindowsDurabilityNative]::FlushFixedVolume()

    $receiptBytes = Get-CanonicalReceiptBytes $backupId $artifactVerified $manifestVerified
    Write-ReceiptPartial $receiptPartial $receiptBytes
    Assert-CanonicalAcl -Path $receiptPartial -Directory $false `
        -ExpectedRules $trust.DurableFileRules -SystemSid $trust.SystemSid `
        -AdministratorsSid $trust.AdministratorsSid -Label 'Durability receipt partial' `
        -RequireProtected $false
    [YolpolWindowsDurabilityNative]::MoveNewNoReplace($receiptPartial, $receiptFinal)
}
