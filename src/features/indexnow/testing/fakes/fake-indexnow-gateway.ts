import type {
  IndexNowGateway,
  IndexNowGatewayRequest,
  IndexNowReceipt,
} from "@/features/indexnow/application/ports/indexnow-gateway";

export class FakeIndexNowGateway implements IndexNowGateway {
  readonly requests: IndexNowGatewayRequest[] = [];

  constructor(private readonly receipt: IndexNowReceipt = "submitted") {}

  async submit(request: IndexNowGatewayRequest): Promise<IndexNowReceipt> {
    this.requests.push(request);
    return this.receipt;
  }
}
