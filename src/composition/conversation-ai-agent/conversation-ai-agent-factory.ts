import type {ExecuteAiProviderRequest} from "@/features/ai-provider-gateway/application/use-cases/execute-ai-provider-request";
import {CodeOwnedConversationAgentToolRegistry} from "@/features/conversation-ai-agent/application/services/code-owned-conversation-agent-tool-registry";
import {GenerateConversationAgentResponse} from "@/features/conversation-ai-agent/application/use-cases/generate-conversation-agent-response";
import {ProductRepositoryConversationAgentCatalog} from "@/features/conversation-ai-agent/infrastructure/repositories/product-repository-conversation-agent-catalog";
import {StaticConversationAgentKnowledgeRepository} from "@/features/conversation-ai-agent/infrastructure/repositories/static-conversation-agent-knowledge-repository";
import {StaticProductRepository} from "@/features/products/infrastructure/repositories/static-product-repository";

export function createConversationAiAgent(gateway: ExecuteAiProviderRequest) {
  const knowledge = new StaticConversationAgentKnowledgeRepository();
  const products = new ProductRepositoryConversationAgentCatalog(new StaticProductRepository());
  const tools = new CodeOwnedConversationAgentToolRegistry(products, knowledge);
  return new GenerateConversationAgentResponse(gateway, tools, knowledge, {now: () => new Date()});
}
