// ─── User & Auth ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: string;
}

// ─── Theme ──────────────────────────────────────────────────────────────────

export type Theme = 'dark' | 'light';

// ─── Files & Attachments ─────────────────────────────────────────────────────

export type AttachmentType = 'image' | 'pdf' | 'text';

export interface FileAttachment {
  id: string;
  name: string;
  type: AttachmentType;
  mimeType: string;
  size: number;
  url: string;       // object URL or remote URL
  preview?: string;  // thumbnail URL
  dataUrl?: string;  // base64 data for LM Studio (images)
  textContent?: string;  // text content for text/pdf files
}

// ─── Tool Calls ──────────────────────────────────────────────────────────────

export type ToolCallStatus = 'pending' | 'running' | 'done' | 'error';
export type ToolCallType = 'vision_analysis' | 'document_analysis' | 'web_search' | 'deep_search' | 'webpage_fetch' | 'context_summarization';

export interface ToolCall {
  id: string;
  type: ToolCallType;
  status: ToolCallStatus;
  label: string;
  progress?: number; // 0-100
  startedAt?: string;
  completedAt?: string;
  duration?: number; // in ms
}

// ─── Research Questions ──────────────────────────────────────────────────────

export interface ResearchQuestion {
  id: string;
  question: string;
  type: 'yesno' | 'text' | 'select';
  required: boolean;
  options?: string[];
  placeholder?: string;
  answer?: string | boolean;
}

// ─── Web Search ──────────────────────────────────────────────────────────────

export interface WebSearchSource {
  title: string;
  url: string;
  content: string;
}

export interface WebSearchResult {
  query: string;
  sources: WebSearchSource[];
  summary?: string;
}

// ─── Deep Search ─────────────────────────────────────────────────────────────

export interface DeepSearchStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type SearchMode = 'none' | 'web' | 'deep';

export interface MessageActionSuggestion {
  id: string;
  label: string;
  description?: string;
  query: string;
  searchMode: SearchMode;
  type?: 'tool' | 'prompt'; // tool = search/webpage/etc, prompt = next prompt suggestions
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  statusText?: string;
  attachments?: FileAttachment[];
  toolCalls?: ToolCall[];
  webSearchResult?: WebSearchResult;
  deepSearchSteps?: DeepSearchStep[];
  searchMode?: SearchMode;
  createdAt: string;
  isStreaming?: boolean;
  responseTime?: number;    // in ms
  tokensPerSecond?: number;
  modelName?: string;
  lmResponseId?: string;
  reasoning?: string;
  reasoningExpanded?: boolean;
  reasoningTime?: number;    // in ms
  actionSuggestions?: MessageActionSuggestion[];
  // Context management
  isContextArchived?: boolean; // message is archived in summarization
  contextSummaryId?: string;   // reference to the summary message that replaces this conversation
}

// ─── Chat Sessions ────────────────────────────────────────────────────────────

export type SessionFilter = 'all' | 'with-attachments' | 'web-search' | 'deep-search' | 'today' | 'this-week';

export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  hasAttachments: boolean;
  searchMode: SearchMode;
  usedSearchModes?: SearchMode[];
  isPinned?: boolean;
  tags?: string[];
}

// ─── Model Selection ─────────────────────────────────────────────────────────

export type ModelProviderName = 'LM Studio' | 'OpenAI' | 'Anthropic' | 'Google' | 'Local';

export type ModelRole = 'chat' | 'vision' | 'reasoning' | 'embedding';

export interface LoadedModelInstance {
  contextWindow?: number;
  idleTimeMinutes?: number; // Idle timeout in minutes
  lastUsedAt?: string; // ISO timestamp
}

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProviderName;
  capabilities: ('text' | 'vision' | 'search' | 'embedding')[];
  isLoaded?: boolean;
  maxContextLength?: number;
  modelRoles?: ModelRole[]; // Tags showing what roles this model plays
  loadedInstance?: LoadedModelInstance; // Idle timeline data
}

export interface ModelProvider {
  id: string;
  name: ModelProviderName;
  models: AIModel[];
}
