# Task 0076: Windows ACL Synchronize Normalization

## Status and activation boundary

Task 0076 is a repository-only correction to the Windows durable-write helper's exact ACL expectation model. It does not configure or mutate a Windows host, VPS, Production, Staging, database, backup, deployed service, key, Scheduled Task, firewall, SSH configuration, or active durability configuration.

Phase C2 remains canonical `{"schemaVersion":1,"state":"unconfigured"}`. Changed-fingerprint Production promotion therefore continues to fail closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`. Live activation may resume only after this correction is reviewed and merged and the exact reviewed helper bytes are installed through a separately approved procedure.

## Observed mismatch

Approved activation preparation inspected the intended fixed ACL roots on the actual Windows backup host. The logical ACL contract was correct, and the roots were protected, canonical, owned by BUILTIN\Administrators, Allow-only, free of unexpected inherited ACEs, and limited to the intended trustee set. Windows ACL enumeration represented the backup-account Allow rights as:

| Logical permission | Logical enum | Enumerated Windows Allow mask |
| --- | ---: | ---: |
| ReadAndExecute | 131241 | 1179817 (`ReadAndExecute | Synchronize`) |
| Modify | 197055 | 1245631 (`Modify | Synchronize`) |

The helper previously stored the unnormalized logical enum in `New-ExpectedAccessRule` and later compared it numerically with the enumerated ACE. That made a correct Windows Allow ACE fail the otherwise exact comparison. `FullControl` already contains `Synchronize`, so its mask remains unchanged by normalization.

The logical root policy remains unchanged:

- `E:\yolpol-backups`: inheritable FullControl for SYSTEM and BUILTIN\Administrators; non-inheriting ReadAndExecute for `yolpol-backup`;
- `E:\yolpol-backups\production`: inheritable FullControl for SYSTEM and BUILTIN\Administrators; inheritable Modify for `yolpol-backup`;
- `E:\yolpol-backups\durable`: inheritable FullControl for SYSTEM and BUILTIN\Administrators; inheritable ReadAndExecute for `yolpol-backup`;
- `E:\yolpol-backups\durability-receipts`: inheritable FullControl for SYSTEM and BUILTIN\Administrators; inheritable ReadAndExecute for `yolpol-backup`.

## Exact canonical contract

`New-ExpectedAccessRule` is the single construction boundary for every expected filesystem access rule. All of its call sites describe Allow expectations, and `Assert-CanonicalAcl` independently rejects any actual ACE whose access-control type is not Allow. The constructor now canonicalizes requested logical rights by adding `FileSystemRights.Synchronize` before storing the expected numeric mask.

This is exact normalization, not subset matching. `Assert-CanonicalAcl` still requires:

- the actual and expected ACE counts to be identical;
- every actual ACE to be Allow;
- exact SID and normalized numeric-rights equality;
- exact inheritance flags, propagation flags, and `IsInherited` state;
- a protected, canonical DACL when protection is required;
- an owner of SYSTEM or BUILTIN\Administrators.

An ACE with an extra unapproved right, an ACE missing `Synchronize`, an unexpected or duplicate trustee, a deny ACE, or any inheritance-shape change still fails closed. The normalization applies consistently to explicit root rules, protected helper directory/file rules, and inherited durable directory/file rules. It does not special-case the backup account and does not change the logical ACL policy.

## Repository proof and remaining work

Static tests retain the exact-count, Allow-only, trustee, numeric equality, inheritance, protection, canonicality, and owner contracts and reject subset-style comparison. A Windows-only in-memory test invokes the repository helper's expectation constructor and uses .NET `FileSystemAccessRule` objects to prove the canonical ReadAndExecute, Modify, and FullControl masks; explicit and inherited directory/file shapes; rejection of an extra right; rejection of a missing `Synchronize`; and the Allow-only boundary. It does not create a directory, apply an ACL, or require administrative privileges.

Task 0076 performs no live acceptance. Phase C2 still requires the separately approved provisioning and validation work documented by Tasks 0072 through 0075, including installation of the reviewed helper, fixed Windows roots and ACLs, LocalSystem task, CNG authority, SFTP and host trust, VPS verification key, network controls, native durable flush, real backup/readback/restore tests, and Production-gate acceptance.
