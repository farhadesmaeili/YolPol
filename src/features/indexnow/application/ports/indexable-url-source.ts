export interface IndexableUrlSource {
  listIndexableUrls(): Promise<readonly string[]>;
}
