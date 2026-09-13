import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import type {ListTeamInquiriesInput} from "@/features/inquiries/application/dto/team-operations-dto";
import type {
  GetTeamInquiryDetailResult,
  ListAssignableTeamMembersResult,
  ListTeamInquiriesResult,
} from "@/features/inquiries/application/results/team-operations-results";
import {inquiryStatuses, type InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";

type StaffSessionResolver = Readonly<{
  execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>;
}>;

type TeamOperationsAuthorization = Readonly<{
  mayViewInquiries(principal: StaffPrincipal): boolean;
}>;

type StaffTeamOperationsAccess = Readonly<{
  resolveSession: StaffSessionResolver;
  authorization: TeamOperationsAuthorization;
}>;

type TeamOperationsReads = Readonly<{
  listInquiries: Readonly<{execute(input?: ListTeamInquiriesInput): Promise<ListTeamInquiriesResult>}>;
  getInquiryDetail: Readonly<{execute(input: Readonly<{inquiryId: string}>): Promise<GetTeamInquiryDetailResult>}>;
  listAssignableTeamMembers: Readonly<{execute(): Promise<ListAssignableTeamMembersResult>}>;
}>;

type Environment = Readonly<{NODE_ENV?: string}>;
type StaffTeamOperationsHttpOptions = Readonly<{environment?: Environment}>;
type RouteContext = Readonly<{params: Promise<Readonly<{inquiryId: string}>>}>;

type Authorized = Readonly<{status: "authorized"}>;
type Rejected = Readonly<{status: "rejected"; response: Response}>;

type ErrorCode = "forbidden" | "invalid_request" | "not_found" | "service_unavailable" | "unauthorized";

const supportedListParameters = new Set(["assignedTeamMemberId", "cursor", "limit", "status", "unassigned"]);

function json(body: Readonly<Record<string, unknown>>, status: number): Response {
  return Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
}

function failure(code: ErrorCode, status: number, field?: string): Response {
  return json({status: "error", code, ...(field ? {field} : {})}, status);
}

async function authorize(
  request: Request,
  getAccess: () => StaffTeamOperationsAccess,
  options: StaffTeamOperationsHttpOptions,
): Promise<Authorized | Rejected> {
  const credential = readStaffSessionCookie(request, options.environment);
  if (!credential) return {status: "rejected", response: failure("unauthorized", 401)};

  let access: StaffTeamOperationsAccess;
  let result: ResolveStaffSessionResult;
  try {
    access = getAccess();
    result = await access.resolveSession.execute({sessionCredential: credential});
  } catch {
    return {status: "rejected", response: failure("service_unavailable", 503)};
  }

  if (result.status === "unauthorized") {
    return {status: "rejected", response: failure("unauthorized", 401)};
  }
  if (result.status !== "authenticated") {
    return {status: "rejected", response: failure("service_unavailable", 503)};
  }

  try {
    if (!access.authorization.mayViewInquiries(result.principal)) {
      return {status: "rejected", response: failure("forbidden", 403)};
    }
  } catch {
    return {status: "rejected", response: failure("service_unavailable", 503)};
  }

  return {status: "authorized"};
}

function singleParameter(searchParams: URLSearchParams, name: string): string | undefined | null {
  const values = searchParams.getAll(name);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : null;
}

function parseStatus(value: string): InquiryStatus | null {
  return inquiryStatuses.find((status) => status === value) ?? null;
}

type ParsedListQuery = Readonly<{status: "success"; input: ListTeamInquiriesInput}> | Readonly<{
  status: "failure";
  field: string;
}>;

function parseListQuery(request: Request): ParsedListQuery {
  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(request.url).searchParams;
  } catch {
    return {status: "failure", field: "query"};
  }

  for (const name of searchParams.keys()) {
    if (!supportedListParameters.has(name)) return {status: "failure", field: name};
  }

  const status = singleParameter(searchParams, "status");
  const assignedTeamMemberId = singleParameter(searchParams, "assignedTeamMemberId");
  const unassigned = singleParameter(searchParams, "unassigned");
  const cursor = singleParameter(searchParams, "cursor");
  const limit = singleParameter(searchParams, "limit");

  if (status === null) return {status: "failure", field: "status"};
  if (assignedTeamMemberId === null) return {status: "failure", field: "assignedTeamMemberId"};
  if (unassigned === null) return {status: "failure", field: "unassigned"};
  if (cursor === null) return {status: "failure", field: "cursor"};
  if (limit === null) return {status: "failure", field: "limit"};

  const parsedStatus = status === undefined ? undefined : parseStatus(status);
  if (parsedStatus === null) return {status: "failure", field: "status"};
  if (assignedTeamMemberId !== undefined && assignedTeamMemberId.length === 0) {
    return {status: "failure", field: "assignedTeamMemberId"};
  }
  if (unassigned !== undefined && unassigned !== "true") {
    return {status: "failure", field: "unassigned"};
  }
  if (assignedTeamMemberId !== undefined && unassigned === "true") {
    return {status: "failure", field: "assignment"};
  }
  if (cursor !== undefined && cursor.length === 0) return {status: "failure", field: "cursor"};
  if (limit !== undefined && !/^[1-9][0-9]*$/u.test(limit)) return {status: "failure", field: "limit"};

  const pageSize = limit === undefined ? undefined : Number(limit);
  return {
    status: "success",
    input: {
      ...(parsedStatus === undefined ? {} : {status: parsedStatus}),
      ...(cursor === undefined ? {} : {cursor}),
      ...(pageSize === undefined ? {} : {pageSize}),
      ...(assignedTeamMemberId !== undefined
        ? {assignment: {type: "assigned" as const, teamMemberId: assignedTeamMemberId}}
        : unassigned === "true"
          ? {assignment: {type: "unassigned" as const}}
          : {}),
    },
  };
}

function rejectsQueryParameters(request: Request): boolean {
  try {
    return new URL(request.url).search.length > 0;
  } catch {
    return true;
  }
}

export function createStaffInquiryListRequestHandler(
  getAccess: () => StaffTeamOperationsAccess,
  getOperations: () => TeamOperationsReads,
  options: StaffTeamOperationsHttpOptions = {},
) {
  return async function handle(request: Request): Promise<Response> {
    const access = await authorize(request, getAccess, options);
    if (access.status === "rejected") return access.response;

    const parsed = parseListQuery(request);
    if (parsed.status === "failure") return failure("invalid_request", 400, parsed.field);

    let result: ListTeamInquiriesResult;
    try {
      result = await getOperations().listInquiries.execute(parsed.input);
    } catch {
      return failure("service_unavailable", 503);
    }
    if (result.status === "validation_failed") return failure("invalid_request", 400, result.field);
    if (result.status !== "found") return failure("service_unavailable", 503);
    return json({status: result.status, inquiries: result.inquiries, nextCursor: result.nextCursor}, 200);
  };
}

export function createStaffInquiryDetailRequestHandler(
  getAccess: () => StaffTeamOperationsAccess,
  getOperations: () => TeamOperationsReads,
  options: StaffTeamOperationsHttpOptions = {},
) {
  return async function handle(request: Request, context: RouteContext): Promise<Response> {
    const access = await authorize(request, getAccess, options);
    if (access.status === "rejected") return access.response;
    if (rejectsQueryParameters(request)) return failure("invalid_request", 400, "query");

    let inquiryId: string;
    try {
      inquiryId = (await context.params).inquiryId;
    } catch {
      return failure("invalid_request", 400, "inquiryId");
    }

    let result: GetTeamInquiryDetailResult;
    try {
      result = await getOperations().getInquiryDetail.execute({inquiryId});
    } catch {
      return failure("service_unavailable", 503);
    }
    if (result.status === "validation_failed") return failure("invalid_request", 400, "inquiryId");
    if (result.status === "inquiry_not_found") return failure("not_found", 404);
    if (result.status !== "found") return failure("service_unavailable", 503);
    return json({status: result.status, detail: result.detail}, 200);
  };
}

export function createStaffTeamMembersRequestHandler(
  getAccess: () => StaffTeamOperationsAccess,
  getOperations: () => TeamOperationsReads,
  options: StaffTeamOperationsHttpOptions = {},
) {
  return async function handle(request: Request): Promise<Response> {
    const access = await authorize(request, getAccess, options);
    if (access.status === "rejected") return access.response;
    if (rejectsQueryParameters(request)) return failure("invalid_request", 400, "query");

    let result: ListAssignableTeamMembersResult;
    try {
      result = await getOperations().listAssignableTeamMembers.execute();
    } catch {
      return failure("service_unavailable", 503);
    }
    if (result.status !== "found") return failure("service_unavailable", 503);
    return json({status: result.status, teamMembers: result.teamMembers}, 200);
  };
}
