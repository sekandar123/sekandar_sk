export type AssistantState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'disconnecting';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export type AmbientMood = 'cyan' | 'violet' | 'rose' | 'emerald' | 'amber';

export type ConversationMode = 'passive' | 'natural' | 'proactive';

export type EmotionState =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'playful'
  | 'amused'
  | 'curious'
  | 'surprised'
  | 'sad'
  | 'empathetic'
  | 'caring'
  | 'calm'
  | 'confident'
  | 'frustrated'
  | 'disappointed'
  | 'affectionate'
  | 'sarcastic'
  | 'thoughtful'
  | 'sleepy'
  | 'concerned';

export interface EmotionalMemoryEntry {
  emotion: EmotionState;
  note: string;
  userTone: string;
  timestamp: number;
}

export interface EmotionalMemorySnapshot {
  currentEmotion: EmotionState;
  previousEmotion: EmotionState;
  intensity: number;
  userTone: string;
  preferredStyle: string;
  recentMoments: EmotionalMemoryEntry[];
  trajectory: EmotionState[];
}

export interface LiveFunctionCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export interface LiveFunctionResponse {
  id?: string;
  name?: string;
  response: Record<string, unknown>;
}

export interface ActiveTimer {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  completed: boolean;
}

export interface ActionFeedback {
  id: string;
  title: string;
  detail: string;
  timestamp: number;
}

export type LaptopBridgeStatus = 'disconnected' | 'checking' | 'connected';

export type LaptopActionType =
  | 'system_info'
  | 'open_app'
  | 'open_url'
  | 'media_control';

export interface LaptopSystemInfo {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  cpuCount: number;
  totalRamGb: number;
  freeRamGb: number;
  uptimeMinutes: number;
}

export interface PendingLaptopAction {
  action: LaptopActionType;
  payload: Record<string, unknown>;
  description: string;
}

export interface YouTubePlayerCommand {
  id: number;
  func: 'playVideo' | 'pauseVideo' | 'mute' | 'unMute';
}

export interface ActionCard {
  id: string;
  kind: 'search' | 'youtube' | 'whatsapp' | 'sms' | 'laptop';
  title: string;
  subtitle?: string;
  mood?: string;
  url?: string;
  embedVideoId?: string;
  autoPlayEmbed?: boolean;
  sources?: Array<{ title: string; uri: string }>;
  whatsappContact?: string;
  whatsappMessage?: string;
  smsContact?: string;
  smsMessage?: string;
  autoCopied?: boolean;
  pendingLaptopAction?: PendingLaptopAction;
  actionCompleted?: boolean;
  actionError?: string;
  timestamp: number;
}

export interface ConversationLogEntry {
  id: string;
  role: 'user' | 'myra';
  text: string;
  timestamp: number;
  emotion?: EmotionState;
  isStreaming?: boolean;
}

export type ScreenShareStatus = 'inactive' | 'starting' | 'active' | 'error';

export interface PersonalitySettings {
  wittiness: number;
  confidence: number;
}

export interface AssistantSnapshot {
  state: AssistantState;
  connectionStatus: ConnectionStatus;
  micPermission: MicPermissionState;
  isMuted: boolean;
  isAudioStreaming: boolean;
  ambientMood: AmbientMood;
  conversationMode: ConversationMode;
  personalitySettings: PersonalitySettings;
  silenceRequested: boolean;
  respectQuietHours: boolean;
  isQuietHoursNow: boolean;
  emotionalState: EmotionalMemorySnapshot;
  laptopBridgeStatus: LaptopBridgeStatus;
  laptopInfo: { hostname: string; platform: string } | null;
  laptopBridgeError: string | null;
  laptopSystemInfo: LaptopSystemInfo | null;
  laptopActionBusy: boolean;
  laptopActionFeedback: { ok: boolean; message: string } | null;
  screenShareStatus: ScreenShareStatus;
  screenShareError: string | null;
  screenShareResolution: string | null;
  actionCards: ActionCard[];
  conversationHistory: ConversationLogEntry[];
  youtubeCommand: YouTubePlayerCommand | null;
  activeTimer: ActiveTimer | null;
  lastAction: ActionFeedback | null;
  error: string | null;
}
