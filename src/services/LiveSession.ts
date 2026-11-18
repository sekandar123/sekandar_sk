import type {
  ConnectionStatus,
  LiveFunctionCall,
  LiveFunctionResponse,
} from '../types/assistant';

export interface LiveSessionHandlers {
  onStatusChange: (status: ConnectionStatus) => void;
  onSessionReady: () => void;
  onAudio: (base64Pcm: string) => void;
  onInputTranscription?: (text: string, finished: boolean) => void;
  onOutputTranscription?: (text: string, finished: boolean) => void;
  onInterrupted: () => void;
  onTurnComplete: () => void;
  onToolCall: (calls: LiveFunctionCall[]) => void;
  onError: (message: string) => void;
  onClose: (reason?: string) => void;
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private handlers: LiveSessionHandlers;
  private manualClose = false;

  constructor(handlers: LiveSessionHandlers) {
    this.handlers = handlers;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(next: ConnectionStatus): void {
    this.status = next;
    this.handlers.onStatusChange(next);
  }

  connect(): Promise<void> {
    if (this.ws && (this.status === 'connected' || this.status === 'connecting')) {
      return Promise.resolve();
    }

    this.manualClose = false;
    this.setStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/live`;

    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      const connectTimeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.close();
          const msg = 'Connection timed out while reaching MYRA.';
          this.setStatus('error');
          this.handlers.onError(msg);
          reject(new Error(msg));
        }
      }, 15000);

      socket.onmessage = (event) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          return;
        }

        switch (payload.type) {
          case 'sessionReady':
            if (!settled) {
              settled = true;
              window.clearTimeout(connectTimeout);
              this.setStatus('connected');
              this.handlers.onSessionReady();
              resolve();
            }
            break;
          case 'audio':
            if (typeof payload.data === 'string') {
              this.handlers.onAudio(payload.data);
            }
            break;
          case 'inputTranscription':
            this.handlers.onInputTranscription?.(
              typeof payload.text === 'string' ? payload.text : '',
              Boolean(payload.finished)
            );
            break;
          case 'outputTranscription':
            this.handlers.onOutputTranscription?.(
              typeof payload.text === 'string' ? payload.text : '',
              Boolean(payload.finished)
            );
            break;
          case 'interrupted':
            this.handlers.onInterrupted();
            break;
          case 'turnComplete':
            this.handlers.onTurnComplete();
            break;
          case 'toolCall':
            if (Array.isArray(payload.functionCalls)) {
              this.handlers.onToolCall(
                payload.functionCalls as LiveFunctionCall[]
              );
            }
            break;
          case 'error': {
            const message =
              typeof payload.message === 'string'
                ? payload.message
                : 'Live voice session error.';
            if (!settled) {
              settled = true;
              window.clearTimeout(connectTimeout);
              this.setStatus('error');
              this.handlers.onError(message);
              reject(new Error(message));
            } else {
              this.setStatus('error');
              this.handlers.onError(message);
            }
            break;
          }
          case 'closed': {
            const reason =
              typeof payload.reason === 'string' ? payload.reason : undefined;
            if (!this.manualClose) {
              this.setStatus('disconnected');
              this.handlers.onClose(reason);
            }
            break;
          }
        }
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(connectTimeout);
          const msg = 'Unable to open live audio socket.';
          this.setStatus('error');
          this.handlers.onError(msg);
          reject(new Error(msg));
        }
      };

      socket.onclose = () => {
        window.clearTimeout(connectTimeout);
        if (this.ws === socket) {
          this.ws = null;
        }
        if (!settled) {
          settled = true;
          const msg = 'Voice session closed before becoming ready.';
          this.setStatus('error');
          this.handlers.onError(msg);
          reject(new Error(msg));
          return;
        }
        if (!this.manualClose && this.status !== 'error') {
          this.setStatus('disconnected');
          this.handlers.onClose();
        }
      };
    });
  }

  sendAudioChunk(base64Pcm: string): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.status === 'connected') {
      this.ws.send(JSON.stringify({ type: 'audio', data: base64Pcm }));
    }
  }

  sendVideoFrame(base64Jpeg: string, mimeType = 'image/jpeg'): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.status === 'connected') {
      this.ws.send(
        JSON.stringify({ type: 'video', data: base64Jpeg, mimeType })
      );
    }
  }

  sendScreenShareContext(active: boolean): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.status === 'connected') {
      this.ws.send(JSON.stringify({ type: 'screenShareContext', active }));
    }
  }

  sendToolResponses(functionResponses: LiveFunctionResponse[]): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'toolResponse',
          functionResponses,
        })
      );
    }
  }

  sendSessionGreeting(emotionalContext?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.status === 'connected') {
      const localTime = new Date().toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
      this.ws.send(
        JSON.stringify({
          type: 'sessionGreeting',
          localTime,
          emotionalContext: emotionalContext ?? '',
        })
      );
    }
  }

  sendInitiativePrompt(
    mode: 'natural' | 'proactive',
    idleSeconds: number,
    emotionalContext?: string
  ): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.status === 'connected') {
      const localTime = new Date().toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
      this.ws.send(
        JSON.stringify({
          type: 'initiativePrompt',
          mode,
          idleSeconds,
          localTime,
          emotionalContext: emotionalContext ?? '',
        })
      );
    }
  }

  sendModeContext(mode: string): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.status === 'connected') {
      this.ws.send(
        JSON.stringify({
          type: 'modeContext',
          mode,
        })
      );
    }
  }

  sendPersonalitySettings(wittiness: number, confidence: number): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.status === 'connected') {
      this.ws.send(
        JSON.stringify({
          type: 'personalityContext',
          wittiness,
          confidence,
        })
      );
    }
  }

  sendEmotionalMemory(summary: string): void {
    if (
      summary &&
      this.ws?.readyState === WebSocket.OPEN &&
      this.status === 'connected'
    ) {
      this.ws.send(
        JSON.stringify({
          type: 'emotionalMemory',
          summary,
        })
      );
    }
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.ws) {
      this.setStatus('disconnecting');
      try {
        this.ws.close(1000, 'User ended session');
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
    this.setStatus('disconnected');
  }
}
