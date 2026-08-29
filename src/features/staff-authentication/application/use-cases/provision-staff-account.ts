import type {PasswordHasher, StaffClock} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {StaffAccountIdGenerator, StaffProvisioningRepository} from "@/features/staff-authentication/application/ports/staff-provisioning-ports";
import type {ProvisionStaffAccountResult, StaffProvisioningValidationField} from "@/features/staff-authentication/application/results/staff-provisioning-results";
import {StaffAccount} from "@/features/staff-authentication/domain/entities/staff-account";
import {parseStaffRole, type StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffAccountReference} from "@/features/staff-authentication/domain/value-objects/staff-account-reference";
import {StaffDisplayName} from "@/features/staff-authentication/domain/value-objects/staff-display-name";
import {StaffEmail} from "@/features/staff-authentication/domain/value-objects/staff-email";
import {StaffPassword} from "@/features/staff-authentication/domain/value-objects/staff-password";

export type ProvisionStaffAccountInput = Readonly<{
  teamMemberId: unknown;
  displayName: unknown;
  email: unknown;
  role: unknown;
  password: unknown;
}>;

type ValidatedProvisioningInput = Readonly<{
  teamMemberId: string;
  displayName: string;
  normalizedEmail: string;
  role: StaffRole;
  password: string;
}>;

type ValidationResult = Readonly<{input: ValidatedProvisioningInput}> | Readonly<{field: StaffProvisioningValidationField}>;

function validate(input: ProvisionStaffAccountInput): ValidationResult {
  let teamMemberId: string;
  try { teamMemberId = StaffAccountReference.create(input.teamMemberId).value; }
  catch { return {field: "team_member_id"}; }

  let displayName: string;
  try { displayName = StaffDisplayName.create(input.displayName).value; }
  catch { return {field: "display_name"}; }

  let normalizedEmail: string;
  try { normalizedEmail = StaffEmail.create(input.email).value; }
  catch { return {field: "email"}; }

  let role: StaffRole;
  try { role = parseStaffRole(input.role); }
  catch { return {field: "role"}; }
  if (role === "SUPER_ADMIN" || role === "VIEWER") return {field: "role"};

  let password: string;
  try { password = StaffPassword.create(input.password).value; }
  catch { return {field: "password"}; }

  return {input: Object.freeze({teamMemberId, displayName, normalizedEmail, role, password})};
}

function validClockValue(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export class ProvisionStaffAccount {
  constructor(
    private readonly repository: StaffProvisioningRepository,
    private readonly passwords: PasswordHasher,
    private readonly accountIds: StaffAccountIdGenerator,
    private readonly clock: StaffClock,
  ) {}

  async execute(input: ProvisionStaffAccountInput): Promise<ProvisionStaffAccountResult> {
    const validation = validate(input);
    if ("field" in validation) return {status: "validation_failed", field: validation.field};
    const values = validation.input;

    let passwordHash: string;
    try { passwordHash = await this.passwords.hash(values.password); }
    catch { return {status: "dependency_failed"}; }

    let account: StaffAccount;
    try {
      const now = this.clock.now();
      if (!validClockValue(now)) return {status: "dependency_failed"};
      account = StaffAccount.create({
        id: this.accountIds.generate(),
        teamMemberId: values.teamMemberId,
        normalizedEmail: values.normalizedEmail,
        passwordHash,
        role: values.role,
        createdAt: now,
      });
    } catch { return {status: "dependency_failed"}; }

    let result: Awaited<ReturnType<StaffProvisioningRepository["provision"]>>;
    try { result = await this.repository.provision({teamMember: {id: values.teamMemberId, displayName: values.displayName}, account}); }
    catch { return {status: "persistence_failed"}; }

    if (result.status !== "provisioned") return result;
    return {
      status: "provisioned",
      teamMemberCreated: result.teamMemberCreated,
      teamMemberId: values.teamMemberId,
      displayName: values.displayName,
      normalizedEmail: values.normalizedEmail,
      role: values.role,
    };
  }
}
