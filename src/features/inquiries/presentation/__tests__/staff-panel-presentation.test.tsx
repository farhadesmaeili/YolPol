import {readFileSync} from "node:fs";
import {join} from "node:path";
import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeAll, describe, expect, it, vi} from "vitest";

import type {TeamInquiryDetailDto, TeamInquiryListItemDto} from "@/features/inquiries/application/dto/team-operations-dto";
import {parseStaffInquiryFilters, serializeStaffInquiryFilters, unassignedFilterValue} from "@/features/inquiries/presentation/parsers/staff-inquiry-filters";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";

function translatedValue(path: string): string {
  let value: unknown = enMessages.Staff;
  for (const segment of path.split(".")) {
    value = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[segment] : undefined;
  }
  return typeof value === "string" ? value : path;
}

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Readonly<Record<string, string>>) => {
    let text = translatedValue(key);
    for (const [name, value] of Object.entries(values ?? {})) text = text.replace(`{${name}}`, value);
    return text;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: Readonly<{children: ReactNode; href: string}>) => <a href={href} {...props}>{children}</a>,
  useRouter: () => ({replace: vi.fn(), refresh: vi.fn()}),
}));

let StaffInquiryDetail: typeof import("@/features/inquiries/presentation/components/staff/staff-inquiry-detail").StaffInquiryDetail;
let StaffInquiryList: typeof import("@/features/inquiries/presentation/components/staff/staff-inquiry-list").StaffInquiryList;

beforeAll(async () => {
  ({StaffInquiryDetail} = await import("@/features/inquiries/presentation/components/staff/staff-inquiry-detail"));
  ({StaffInquiryList} = await import("@/features/inquiries/presentation/components/staff/staff-inquiry-list"));
});

const listItem: TeamInquiryListItemDto = Object.freeze({
  id: "inquiry-safe-1",
  status: "WAITING_FOR_TEAM",
  createdAt: "2026-08-26T08:00:00.000Z",
  updatedAt: "2026-08-26T08:30:00.000Z",
  customerDisplayName: "<script>alert('customer')</script>",
  company: "Buyer & Co",
  origin: {country: "TR", city: "Istanbul"},
  destination: {country: "IR", city: "Tehran"},
  assignment: null,
  items: [{productId: "product-1", sku: "SKU-1", productName: "Bottle", quantity: 2, unit: "pallets" as const}],
  conversationActivity: {messageCount: 1, latestMessage: {senderType: "CUSTOMER" as const, channel: "WEBSITE" as const, createdAt: "2026-08-26T08:05:00.000Z"}},
});

const detail: TeamInquiryDetailDto = Object.freeze({
  inquiry: {
    id: listItem.id,
    status: listItem.status,
    createdAt: listItem.createdAt,
    updatedAt: listItem.updatedAt,
    contact: {fullName: listItem.customerDisplayName, company: listItem.company, email: "buyer@example.test", phone: "+905551234567", whatsappPhone: null, telegramUsername: "@buyer", preferredMethods: ["email", "telegram"]},
    location: listItem.origin,
    destination: listItem.destination,
    message: "<img src=x onerror=alert(1)>",
    items: listItem.items,
  },
  assignment: null,
  workflowHistory: [{id: "event-1", inquiryId: listItem.id, type: "INQUIRY_CREATED", previousValue: null, newValue: "NEW", actorReference: null, occurredAt: listItem.createdAt}],
  conversationMessages: [{id: "message-1", senderType: "CUSTOMER", channel: "WEBSITE", actorReference: null, body: "<script>message()</script>", createdAt: listItem.createdAt}],
});

describe("Staff Inquiry filters", () => {
  const members = new Set(["member-1"]);

  it("serializes supported status, assignment, and opaque cursor filters", () => {
    const parsed = parseStaffInquiryFilters({status: "NEW", assignment: "member-1", cursor: "opaque~cursor"}, members);
    expect(parsed).toMatchObject({invalid: false, input: {status: "NEW", assignment: {type: "assigned", teamMemberId: "member-1"}, cursor: "opaque~cursor"}});
    expect(serializeStaffInquiryFilters(parsed, "next~cursor")).toBe("/staff/inquiries?status=NEW&assignment=member-1&cursor=next%7Ecursor");
  });

  it("supports unassigned and safely ignores invalid or duplicate filters", () => {
    expect(parseStaffInquiryFilters({assignment: unassignedFilterValue}, members).input).toEqual({assignment: {type: "unassigned"}});
    expect(parseStaffInquiryFilters({status: "INVALID", assignment: "unknown", extra: "value"}, members)).toMatchObject({invalid: true, status: "", assignment: "", input: {}});
    expect(parseStaffInquiryFilters({status: ["NEW", "CLOSED"]}, members).invalid).toBe(true);
  });
});

describe("Staff Inquiry presentation", () => {
  it("renders a populated responsive queue with localized status and forward keyset navigation", async () => {
    const filters = parseStaffInquiryFilters({status: "WAITING_FOR_TEAM"}, new Set());
    const html = renderToStaticMarkup(await StaffInquiryList({locale: "en", filters, inquiries: [listItem], nextCursor: "next-cursor", teamMembers: []}));
    expect(html).toContain("Waiting for team");
    expect(html).toContain("Read-only Inquiry queue");
    expect(html).toContain("/staff/inquiries/inquiry-safe-1");
    expect(html).toContain("cursor=next-cursor");
    expect(html).toContain("md:hidden");
    expect(html).toContain("&lt;script&gt;alert(&#x27;customer&#x27;)&lt;/script&gt;");
  });

  it("renders detail text safely with items, workflow, conversation, and empty assignment", async () => {
    const html = renderToStaticMarkup(await StaffInquiryDetail({detail, locale: "en"}));
    expect(html).toContain("Products / Inquiry items");
    expect(html).toContain("Workflow history");
    expect(html).toContain("Conversation messages");
    expect(html).toContain("Unassigned");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;message()&lt;/script&gt;");
    expect(html).not.toMatch(/internalUnitPrice|internalTotalPrice|tokenLookup|verificationDigest/u);
  });

  it("renders localized empty queue and empty conversation states", async () => {
    const filters = parseStaffInquiryFilters({}, new Set());
    const emptyList = renderToStaticMarkup(await StaffInquiryList({locale: "en", filters, inquiries: [], nextCursor: null, teamMembers: []}));
    const emptyDetail = renderToStaticMarkup(await StaffInquiryDetail({...{detail: {...detail, workflowHistory: [], conversationMessages: []}}, locale: "en"}));
    expect(emptyList).toContain("No Inquiries");
    expect(emptyDetail).toContain("No workflow events");
    expect(emptyDetail).toContain("No conversation messages");
  });

  it("contains no unrelated mutations, unsafe HTML rendering, prices, or credential fields", () => {
    const directory = join(process.cwd(), "src", "features", "inquiries", "presentation", "components", "staff");
    const source = ["staff-dashboard.tsx", "staff-inquiry-list.tsx", "staff-inquiry-detail.tsx", "staff-team-members.tsx"]
      .map((file) => readFileSync(join(directory, file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/dangerouslySetInnerHTML|internalUnitPrice|internalTotalPrice|accessToken|lookupDigest|verificationDigest/u);
    expect(source).not.toMatch(/change status|assign inquiry|unassign inquiry/iu);
  });
});

function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, item]) => leafKeys(item, prefix ? `${prefix}.${key}` : key));
}

describe("Staff translation parity", () => {
  it.each([["tr", trMessages.Staff], ["fa", faMessages.Staff], ["ar", arMessages.Staff]] as const)("matches every English Staff key in %s", (_locale, messages) => {
    expect(leafKeys(messages).sort()).toEqual(leafKeys(enMessages.Staff).sort());
  });
});
