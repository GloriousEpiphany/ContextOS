// ============================================================================
// ContextPrompt AI v4.0 - Type Definitions
// ============================================================================

// ----------------------------------------------------------------------------
// Context Types
// ----------------------------------------------------------------------------

export interface CapturedContext {
  id: string;
  timestamp: string;
  title: string;
  url: string;
  selection: string;
  description: string;
  ogData: Record<string, string>;
  structuredData: Record<string, unknown>;
  mainContent: string;
  chatContent: string;
  isPrivateLink: boolean;
  platformName: string;
  captureDepth: CaptureDepth;
  notes: string;
  tags: string[];
  aiSummary: string;
}

export type CaptureDepth = 'light' | 'standard' | 'deep';

// ----------------------------------------------------------------------------
// Knowledge Graph Types
// ----------------------------------------------------------------------------

export interface KnowledgeNode {
  id?: number;
  contextId: string;
  title: string;
  summary: string;
  url: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessedAt: string;
}

export interface NodeEmbedding {
  id?: number;
  nodeId: number;
  vector: Float32Array;
  model: string;
  createdAt: string;
}

export interface NodeRelation {
  id?: number;
  sourceId: number;
  targetId: number;
  similarity: number;
  type: RelationType;
}

export type RelationType = 'semantic' | 'url_domain' | 'tag_overlap' | 'temporal';

// ----------------------------------------------------------------------------
// Settings Types
// ----------------------------------------------------------------------------

export type AIProvider = 'openai' | 'deepseek' | 'anthropic' | 'qwen' | 'custom';

export interface AIProviderConfig {
  name: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
}

export interface AppSettings {
  enableInjection: boolean;
  language: 'auto' | 'en' | 'zh';
  theme: 'system' | 'light' | 'dark';
  defaultTemplate: string;
  aiEnabled: boolean;
  aiProvider: AIProvider;
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  autoSummarize: boolean;
  captureDepth: CaptureDepth;
  autoCapture: boolean;
  autoCapturePatterns: string;
  // v4 new
  localAiEnabled: boolean;
  knowledgeGraphEnabled: boolean;
  maxKnowledgeNodes: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  enableInjection: true,
  language: 'auto',
  theme: 'system',
  defaultTemplate: 'default',
  aiEnabled: false,
  aiProvider: 'openai',
  aiApiKey: '',
  aiBaseUrl: '',
  aiModel: '',
  autoSummarize: false,
  captureDepth: 'standard',
  autoCapture: false,
  autoCapturePatterns: '',
  localAiEnabled: false,
  knowledgeGraphEnabled: false,
  maxKnowledgeNodes: 10000,
};

export const AI_PROVIDER_CONFIGS: Record<AIProvider, AIProviderConfig> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-sonnet-20241022'],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  qwen: {
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
    defaultModel: 'qwen-turbo',
  },
  custom: {
    name: 'Custom',
    baseUrl: '',
    models: [],
    defaultModel: '',
  },
};

// ----------------------------------------------------------------------------
// Message Types
// ----------------------------------------------------------------------------

export type MessageAction =
  | 'saveContext'
  | 'getLatestContext'
  | 'getAllContexts'
  | 'deleteContext'
  | 'clearAllContexts'
  | 'updateContext'
  | 'getSettings'
  | 'saveSettings'
  | 'getTemplates'
  | 'saveTemplate'
  | 'deleteTemplate'
  | 'summarizeWithAI'
  | 'summarizeContext'
  | 'analyzePromptQuality'
  | 'fuseContexts'
  | 'testAIConnection'
  | 'localSummarize'
  | 'savePromptHistory'
  | 'getPromptHistory'
  | 'clearPromptHistory'
  | 'toggleFavorite'
  | 'getFavorites'
  | 'exportData'
  | 'importData'
  | 'suggestTags'
  | 'openSidePanel'
  // v4 new
  | 'searchKnowledge'
  | 'addToKnowledge'
  | 'getRelatedNodes'
  | 'getKnowledgeGraphData'
  | 'getKnowledgeStats';

export interface ExtensionMessage {
  action: MessageAction;
  data?: unknown;
}

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
}

export interface PromptHistoryEntry {
  id: string;
  timestamp: string;
  prompt: string;
  template: string;
  contextTitle: string;
  favorite: boolean;
}

export interface PromptQualityAnalysis {
  clarity: number;
  specificity: number;
  completeness: number;
  overall: number;
  suggestions: string[];
  improvedPrompt: string;
}
