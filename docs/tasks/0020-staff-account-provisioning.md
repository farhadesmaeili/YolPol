# Staff Account Provisioning

## Boundary and purpose

YOLPOL deliberately has no public Staff registration, signup page, or account-creation HTTP endpoint. Staff Accounts are created only by a trusted server operator through the explicit interactive command:

```text
pnpm staff:provision
```

The command must run in a trusted server or operator terminal with access to the existing PostgreSQL configuration. It is never run during install, build, deployment, application startup, or migration. Development may use the repository's normal local environment files; production should supply its existing server `DATABASE_URL`. The command never displays that value.

`inquiry_team_members` remains the operational identity used by assignment and workflow history. `staff_accounts` remains the one-to-one authentication identity linked to that Team Member. Provisioning uses the Staff Authentication domain model, normalized `StaffEmail`, closed `ADMIN`/`SALES` roles, and the existing versioned `NodeScryptPasswordHasher`.

## Interactive password handling

The command accepts no command-line arguments. In particular, there is no `--password`, positional password, password environment variable, bootstrap-password setting, or configuration-file password. Standard input and output must both be interactive TTYs; pipes, redirected input, and CI invocation are refused before database composition.

The operator enters the password twice through hidden terminal input. Plaintext characters are not echoed or masked with a revealing length. The terminal adapter handles Enter, Backspace, Ctrl+C, and Ctrl+D. It records the previous raw/paused state and restores both in `finally`, including after abort or failure. The plaintext exists only in command/application memory until hashing and is never included in persistence DTOs, SQL, output, logs, errors, process arguments, or environment variables. JavaScript strings cannot be overwritten reliably, but local references are released immediately after the operation returns.

Staff passwords must be between 14 and 1,024 JavaScript string code units. This favors a sufficiently long password or passphrase without composition rules, does not truncate input, and remains within the existing hasher's accepted maximum. Provisioning does not change the existing scrypt parameters or stored format.

Before the database operation, the final confirmation shows only Team Member ID, normalized display name, normalized login email, and role. Confirmation defaults to no; declining performs no write and never invokes the provisioning use case.

## Transaction and conflict guarantees

The application use case validates all operator input, obtains a cryptographically random server-generated Staff Account ID, hashes the password through the existing hasher port, creates the existing Staff Account domain model, and passes only the linked Team Member identity plus hashed account to a dedicated persistence port. The CLI contains no database writes.

The PostgreSQL adapter performs the following inside one Drizzle transaction:

1. Insert the requested Team Member only when its ID does not already exist.
2. Lock and read the resulting Team Member.
3. Require the Team Member to be active and require the stored display name to match exactly.
4. Reject an existing account for the Team Member.
5. Reject an email already owned by any Staff Account.
6. Insert the Staff Account without an upsert or overwrite.

Every expected conflict aborts the transaction. Consequently, failure or conflict while creating the Staff Account also rolls back a newly inserted Team Member. Existing Team Members are never updated by provisioning. PostgreSQL's unique Team Member/account and normalized-email indexes remain the final concurrency guarantees; expected uniqueness races become safe conflict results. Unexpected database errors become the generic provisioning persistence failure and raw PostgreSQL details are not shown to the operator.

No migration is required. Provisioning uses `inquiry_team_members` and `staff_accounts` exactly as introduced by migrations `0006` and `0007`; historical migrations remain unchanged.

## Provisioning the first Admin and additional Staff

For the first Admin, enter the stable Team Member ID, display name, login email, `ADMIN`, and a new password/passphrase at the hidden prompts. If the Team Member does not exist, both records are created atomically. If it exists and is active with the exact supplied display name but has no account, only the Staff Account is added.

Use the same command for additional `ADMIN` or `SALES` Staff. Stop and review the operational data when the command reports an inactive Team Member, display-name conflict, existing account, or email conflict. Provisioning never reactivates, renames, reassigns, resets, or replaces an existing identity. Password changes and account lifecycle management require separately reviewed capabilities.
