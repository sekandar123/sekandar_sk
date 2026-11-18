import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Check,
  Copy,
  MessageSquareText,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { ConversationLogEntry } from '../types/assistant';

interface ConversationLogProps {
  entries: ConversationLogEntry[];
  accentTextClass: string;
  onClose: () => void;
  onClearHistory: () => void;
  onDeleteEntry: (id: string) => void;
}

type RoleFilter = 'all' | 'user' | 'myra';

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function ConversationLog({
  entries,
  accentTextClass,
  onClose,
  onClearHistory,
  onDeleteEntry,
}: ConversationLogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (roleFilter !== 'all' && entry.role !== roleFilter) return false;
      if (query && !entry.text.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [entries, roleFilter, searchQuery]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom('auto');
    }
  }, [filteredEntries.length, isAtBottom]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceFromBottom < 48);
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/55 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        aria-label="Conversation log"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0B0E15]/95 backdrop-blur-2xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">
              Conversation Log
            </h2>
            <p className="mt-0.5 font-mono-tabular text-xs text-slate-400">
              {entries.length} {entries.length === 1 ? 'message' : 'messages'}
              <span aria-hidden="true"> · </span>
              <span>Saved locally</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversation log"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col gap-2.5 border-b border-white/10 px-5 py-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search past conversations..."
              aria-label="Search conversation history"
              className="min-h-[40px] w-full rounded-lg border border-white/12 bg-[#06070B]/80 pr-3 pl-9 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Filter messages by speaker"
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#06070B]/70 p-1"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'user', label: 'You' },
                  { id: 'myra', label: 'MYRA' },
                ] as const
              ).map((tab) => {
                const active = roleFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRoleFilter(tab.id)}
                    className={`min-h-[32px] rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      active
                        ? `bg-white/12 ${accentTextClass}`
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {entries.length > 0 && !confirmClear && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-rose-300 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
            )}

            {entries.length > 0 && confirmClear && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onClearHistory();
                    setConfirmClear(false);
                  }}
                  className="min-h-[34px] rounded-lg border border-rose-400/40 bg-rose-500/20 px-2.5 text-xs font-medium text-rose-100 transition-colors hover:bg-rose-500/30 whitespace-nowrap"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="min-h-[34px] rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs text-slate-300 transition-colors hover:bg-white/[0.08] whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Log Feed */}
        <div className="relative flex-1 overflow-hidden">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            role="log"
            aria-live="polite"
            aria-label="Past conversation messages"
            className="h-full space-y-4 overflow-y-auto px-5 py-4"
          >
            {entries.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <MessageSquareText className="h-8 w-8 text-slate-600" />
                <p className="mt-3 text-sm font-medium text-slate-200">
                  No past conversations yet
                </p>
                <p className="mt-1.5 max-w-[260px] text-xs leading-relaxed text-slate-400">
                  Start talking with MYRA and your spoken exchanges will be
                  transcribed and saved here for review.
                </p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <p className="text-sm font-medium text-slate-200">
                  No matching messages
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Try clearing your search or switching the speaker filter.
                </p>
              </div>
            ) : (
              filteredEntries.map((entry, idx) => {
                const dayLabel = formatDayLabel(entry.timestamp);
                const prevDayLabel =
                  idx > 0 ? formatDayLabel(filteredEntries[idx - 1].timestamp) : null;
                const showDayDivider = idx === 0 || dayLabel !== prevDayLabel;
                const isUser = entry.role === 'user';

                return (
                  <div key={entry.id} className="space-y-3">
                    {showDayDivider && (
                      <div className="flex items-center gap-3 py-1">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-[11px] font-medium text-slate-400">
                          {dayLabel}
                        </span>
                        <div className="h-px flex-1 bg-white/10" />
                      </div>
                    )}

                    <article
                      className={`group flex flex-col gap-1.5 ${
                        isUser ? 'items-end' : 'items-start'
                      }`}
                    >
                      {/* Unboxed Metadata Row */}
                      <div className="flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
                        <span
                          className={`font-medium ${
                            isUser ? 'text-slate-200' : accentTextClass
                          }`}
                        >
                          {isUser ? 'You' : 'MYRA'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <time
                          dateTime={new Date(entry.timestamp).toISOString()}
                          className="font-mono-tabular"
                        >
                          {formatMessageTime(entry.timestamp)}
                        </time>
                        {!isUser && entry.emotion && entry.emotion !== 'neutral' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize text-slate-400">
                              {entry.emotion}
                            </span>
                          </>
                        )}
                        {entry.isStreaming && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-300">Speaking</span>
                          </>
                        )}
                      </div>

                      {/* Message Content */}
                      <div
                        className={`relative max-w-[88%] rounded-2xl border px-3.5 py-2.5 text-xs leading-relaxed ${
                          isUser
                            ? 'border-white/15 bg-white/[0.08] text-slate-100'
                            : 'border-white/10 bg-[#121723]/90 text-slate-100'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {entry.text}
                        </p>
                      </div>

                      {/* Subtle Actions Row */}
                      {!entry.isStreaming && (
                        <div className="flex items-center gap-2 px-1 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={() => void handleCopy(entry.id, entry.text)}
                            aria-label="Copy message"
                            className="inline-flex min-h-[28px] items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-white"
                          >
                            {copiedId === entry.id ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-300">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteEntry(entry.id)}
                            aria-label="Remove message from log"
                            className="inline-flex min-h-[28px] items-center text-[11px] text-slate-500 transition-colors hover:text-rose-300"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </article>
                  </div>
                );
              })
            )}
          </div>

          {!isAtBottom && filteredEntries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setIsAtBottom(true);
                scrollToBottom('smooth');
              }}
              className="absolute right-5 bottom-4 inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-white/15 bg-[#0D1017]/95 px-3.5 text-xs font-medium text-slate-100 shadow-lg backdrop-blur-md transition-colors hover:border-white/30 hover:text-white"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              <span>Latest</span>
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
