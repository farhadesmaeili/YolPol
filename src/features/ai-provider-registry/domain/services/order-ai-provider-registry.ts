export function compareAiRegistryPriority(left: Readonly<{priority: number; id: string}>, right: Readonly<{priority: number; id: string}>): number {
  return left.priority - right.priority || left.id.localeCompare(right.id, "en");
}
