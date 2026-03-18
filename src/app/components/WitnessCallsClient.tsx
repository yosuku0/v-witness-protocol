'use client';

// src/app/components/WitnessCallsClient.tsx
import { useState, useCallback, useOptimistic, useTransition } from 'react';
import { Zap, CheckCircle, Clock, TrendingUp, AlertCircle, X } from 'lucide-react';

export interface WitnessCall {
  id: string;
  title: string;
  description: string | null;
  scene_label: string;
  status: string;
  expires_at: string;
  base_probability: number;
  total_wp_spent: number;
  wp_cost: number;
}

export interface Treasury {
  current_amount: number;
  target_amount: number;
  supporter_count: number;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface Props {
  moments: WitnessCall[];
  treasury: Treasury | null;
  walletBalance: number;
  // ⚠️ Server→Client 境界は JSON シリアライズされるため Set 不可 → string[]
  participatedCallIds: string[];
  momentsError: string | null;
  treasuryError: string | null;
}

const SCENE_CONFIG: Record<string, { label: string; color: string; glow: string; bg: string }> = {
  LEGENDARY: {
    label: 'LEGENDARY',
    color: 'text-amber-300',
    glow: 'shadow-[0_0_20px_rgba(251,191,36,0.4)]',
    bg: 'bg-amber-500/10 border-amber-500/30',
  },
  EPIC: {
    label: 'EPIC',
    color: 'text-purple-300',
    glow: 'shadow-[0_0_16px_rgba(168,85,247,0.35)]',
    bg: 'bg-purple-500/10 border-purple-500/30',
  },
  RARE: {
    label: 'RARE',
    color: 'text-sky-300',
    glow: 'shadow-[0_0_14px_rgba(125,211,252,0.3)]',
    bg: 'bg-sky-500/10 border-sky-500/30',
  },
  UNCOMMON: {
    label: 'UNCOMMON',
    color: 'text-emerald-300',
    glow: '',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  COMMON: {
    label: 'COMMON',
    color: 'text-zinc-400',
    glow: '',
    bg: 'bg-zinc-700/30 border-zinc-600/30',
  },
};

function SceneBadge({ label }: { label: string }) {
  const cfg = SCENE_CONFIG[label] ?? SCENE_CONFIG.COMMON;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-black tracking-widest border ${cfg.bg} ${cfg.color}`}
    >
      {cfg.label}
    </span>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const icons = {
    success: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
    info: <Zap className="w-4 h-4 text-sky-400 shrink-0" />,
  };
  const borders = {
    success: 'border-emerald-500/40',
    error: 'border-red-500/40',
    info: 'border-sky-500/40',
  };
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border bg-zinc-900/95 px-4 py-3 text-sm text-zinc-100 backdrop-blur-sm ${borders[toast.type]}`}
    >
      {icons[toast.type]}
      <span className="flex-1">{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="text-zinc-500 hover:text-zinc-300">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ProgressBar({ current, target }: { current: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return (
    <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatWP(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return '終了';
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export default function WitnessCallsClient({
  moments,
  treasury,
  walletBalance: initialBalance,
  participatedCallIds: initialParticipatedArray,
  momentsError,
  treasuryError,
}: Props) {
  const [balance, setBalance] = useState(initialBalance);
  // string[] → Set<string> に変換（内部では Set で O(1) 検索）
  const [participated, setParticipated] = useState<Set<string>>(
    () => new Set(initialParticipatedArray)
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [declaring, setDeclaring] = useState<Set<string>>(new Set());

  const [optimisticParticipated, addOptimistic] = useOptimistic(
    participated,
    (state: Set<string>, callId: string) => new Set([...state, callId])
  );
  const [, startTransition] = useTransition();

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleDeclare = useCallback(
    async (moment: WitnessCall) => {
      if (declaring.has(moment.id)) return;
      if (balance < moment.wp_cost) {
        addToast('error', `WPが足りません（必要: ${moment.wp_cost} WP）`);
        return;
      }

      setDeclaring((prev) => new Set([...prev, moment.id]));
      startTransition(() => { addOptimistic(moment.id); });

      try {
        const res = await fetch('/api/witness', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: moment.id, wpAmount: moment.wp_cost }),
        });
        const result = await res.json();

        if (!res.ok) {
          const errorMessages: Record<string, string> = {
            UNAUTHORIZED: '認証が必要です',
            INSUFFICIENT_WP: 'WPが足りません',
            DUPLICATE_CALL: 'すでに宣言済みです',
            MOMENT_CLOSED: 'このモーメントは受付終了しています',
            MOMENT_NOT_FOUND: 'モーメントが見つかりません',
          };
          addToast('error', errorMessages[result.code] ?? result.message ?? '宣言に失敗しました');
          return;
        }

        setParticipated((prev) => new Set([...prev, moment.id]));
        setBalance(result.newBalance ?? balance - moment.wp_cost);
        const cfg = SCENE_CONFIG[result.sceneLabel] ?? SCENE_CONFIG.COMMON;
        addToast('success', `✨ ${cfg.label} 獲得！ NRWスコア: ${Number(result.nrwScore).toFixed(4)}`);
      } catch {
        addToast('error', 'ネットワークエラーが発生しました');
      } finally {
        setDeclaring((prev) => { const next = new Set(prev); next.delete(moment.id); return next; });
      }
    },
    [balance, declaring, addToast, addOptimistic]
  );

  const treasuryPct =
    treasury && treasury.target_amount > 0
      ? Math.min(100, (treasury.current_amount / treasury.target_amount) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-[#080c14] text-zinc-100 font-mono">
      {/* Toast */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-[#080c14]/90 backdrop-blur-md">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-black tracking-[0.2em] text-zinc-300 uppercase">
              V-Witness Protocol
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-zinc-700/50 bg-zinc-800/50 px-3 py-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-sm font-bold tabular-nums text-amber-300">
              {formatWP(balance)} WP
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* Festival Treasury */}
        {treasuryError ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-red-400 text-sm">{treasuryError}</p>
          </div>
        ) : treasury && (
          <section>
            <div className="rounded-xl border border-zinc-700/40 bg-zinc-900/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-sky-400" />
                  <h2 className="text-xs font-black tracking-widest text-zinc-300 uppercase">
                    Festival Treasury
                  </h2>
                </div>
                <span className="text-xs text-zinc-500 tabular-nums">
                  {treasury.supporter_count.toLocaleString()} サポーター
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-black tabular-nums text-white">
                  {formatWP(treasury.current_amount)}
                </span>
                <span className="text-sm text-zinc-500">
                  / {formatWP(treasury.target_amount)} WP
                </span>
                <span className="ml-auto text-sm font-bold text-sky-400">
                  {treasuryPct.toFixed(1)}%
                </span>
              </div>
              <ProgressBar current={treasury.current_amount} target={treasury.target_amount} />
            </div>
          </section>
        )}

        {/* Moment Cards */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xs font-black tracking-widest text-zinc-400 uppercase">
              Open Moments
            </h2>
            <span className="text-xs text-zinc-600">— {moments.length} available</span>
          </div>

          {momentsError ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 py-16 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
              <p className="text-red-400 text-sm">{momentsError}</p>
            </div>
          ) : moments.length === 0 ? (
            <div className="rounded-xl border border-zinc-800/40 bg-zinc-900/30 py-16 text-center">
              <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">現在オープンしているモーメントはありません</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {moments.map((moment) => {
                const isDeclared = optimisticParticipated.has(moment.id);
                const isLoading = declaring.has(moment.id);
                const canDeclare = !isDeclared && !isLoading && balance >= moment.wp_cost;
                const sceneCfg = SCENE_CONFIG[moment.scene_label] ?? SCENE_CONFIG.COMMON;

                return (
                  <article
                    key={moment.id}
                    className={`relative rounded-xl border bg-zinc-900/60 p-5 transition-all duration-200 ${
                      isDeclared
                        ? 'border-zinc-700/30 opacity-60'
                        : 'border-zinc-700/50 hover:border-zinc-600/70 hover:bg-zinc-900/80'
                    } ${sceneCfg.glow}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <SceneBadge label={moment.scene_label} />
                          <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                            <Clock className="w-3 h-3" />
                            <span>{timeLeft(moment.expires_at)}</span>
                          </div>
                        </div>
                        <h3 className="font-bold text-sm text-zinc-100 leading-snug mb-1 truncate">
                          {moment.title}
                        </h3>
                        {moment.description && (
                          <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                            {moment.description}
                          </p>
                        )}
                        <div className="mt-3 flex items-center gap-3">
                          <span className="text-[11px] text-zinc-500">
                            基本確率 {(moment.base_probability * 100).toFixed(0)}%
                          </span>
                          <span className="text-[11px] text-zinc-600">·</span>
                          <span className="text-[11px] text-zinc-500">
                            累積 {formatWP(moment.total_wp_spent)} WP
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isDeclared ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                            <CheckCircle className="w-3.5 h-3.5" />
                            宣言済
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDeclare(moment)}
                            disabled={!canDeclare}
                            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-black tracking-wide transition-all duration-150 ${
                              canDeclare
                                ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)] hover:shadow-[0_0_18px_rgba(14,165,233,0.5)] active:scale-95'
                                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                            }`}
                          >
                            {isLoading ? (
                              <>
                                <div className="w-3 h-3 rounded-full border-2 border-zinc-400/30 border-t-zinc-300 animate-spin" />
                                宣言中...
                              </>
                            ) : (
                              <>
                                <Zap className="w-3 h-3" />
                                {moment.wp_cost} WP
                              </>
                            )}
                          </button>
                        )}
                        {!isDeclared && balance < moment.wp_cost && (
                          <span className="text-[10px] text-red-400/70">WP不足</span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
