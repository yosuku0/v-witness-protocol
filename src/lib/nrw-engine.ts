// lib/nrw-engine.ts
//
// Narrative Rarity Weight (NRW) Engine
// Python版 nrw_engine.py の TypeScript 移植
//
// 役割: WP予想宣言の「稀少度スコア」を計算し、
//      インフレ（同一モーメントへの集中投票）を抑制する。
//
// 変数の定義:
//   BP  (Base Probability)          : 事前確率。0〜1。高いほど「みんなが予想しやすい展開」
//   PD  (Participation Density)     : 市場参加密度。0〜1。今このモーメントに宣言した人の割合
//   AIC (Available Incentive Capacity): 予算残量比。0〜1。予算が枯れるほど希少度は下がる

export type SceneLabel = 'LEGENDARY' | 'EPIC' | 'RARE' | 'UNCOMMON' | 'COMMON';

export interface NRWInput {
  baseProbability: number;           // BP: prior probability stored in moments.base_probability
  participationCount: number;        // 現時点でこのモーメントに宣言した人数
  totalWpSpent: bigint | number;     // モーメントへの累積 WP 消費量
  wpBudgetTotal: bigint | number;    // 大会全体の WP 予算上限
  momentWpCost: number;              // このモーメントの基本コスト (参加者推定の分母に使用)
}

export interface NRWResult {
  score: number;          // 0〜1 の正規化されたスコア
  sceneLabel: SceneLabel;
  wpMultiplier: number;   // 正解時の WP 倍率（リワード計算用）
  debugInfo: {
    contrarianFactor: number;
    crowdPenalty: number;
    budgetGate: number;
    participationDensity: number;
    aicRatio: number;
  };
}

const SCENE_THRESHOLDS: { label: SceneLabel; threshold: number; multiplier: number }[] = [
  { label: 'LEGENDARY', threshold: 0.75, multiplier: 5.0 },
  { label: 'EPIC',      threshold: 0.55, multiplier: 3.0 },
  { label: 'RARE',      threshold: 0.35, multiplier: 2.0 },
  { label: 'UNCOMMON',  threshold: 0.15, multiplier: 1.5 },
  { label: 'COMMON',    threshold: 0.0,  multiplier: 1.0 },
];

/**
 * NRW (Narrative Rarity Weight) を計算する。
 *
 * 設計思想:
 *  1. 逆張り報酬 (Contrarian Factor):
 *     基本確率 BP が低い（みんなが予想しない）ほど高スコア。
 *     人気モーメントを追うだけでは高スコアを得られない。
 *
 *  2. 群衆ペナルティ (Crowd Penalty):
 *     同じモーメントに宣言が集中するほど（PD ↑）スコアを急激に下げる。
 *     シグモイド関数で閾値(30%)を超えると急落するインフレ抑制機構。
 *
 *  3. 予算ゲート (Budget Gate):
 *     大会の WP 予算が残り少なくなるほど全体スコアを逓減させる。
 *     平方根曲線で緩やかに下落し、最終盤に急落する。
 */
export function computeNRW(input: NRWInput): NRWResult {
  const {
    baseProbability,
    participationCount,
    totalWpSpent,
    wpBudgetTotal,
    momentWpCost,
  } = input;

  // ── 入力の正規化 ──────────────────────────────────────────────
  // BP をクランプ (0.01〜0.99: 極端な確率は計算を不安定にする)
  const bp = Math.max(0.01, Math.min(0.99, baseProbability));

  // 参加密度 PD = 参加者数 / (予算 / 平均コスト) の推定
  // WP予算全体を1モーメントの基本コストで割ると「最大参加可能人数」が得られる
  const estimatedMaxParticipants = Math.max(
    1,
    Number(wpBudgetTotal) / Math.max(1, momentWpCost)
  );
  const pd = Math.min(1, participationCount / estimatedMaxParticipants);

  // AIC = 予算残量比 = 1 - (消費済みWP / 総予算)
  const aic = Math.max(
    0,
    1 - Number(totalWpSpent) / Math.max(1, Number(wpBudgetTotal))
  );

  // ── NRW コア計算 ─────────────────────────────────────────────

  // 1. 逆張り報酬: BP が低いほど contrarian_factor ↑
  const contrarianFactor = 1 - bp;

  // 2. 群衆ペナルティ: PD > 0.3 でシグモイド急落
  //    sigmoid(x) = 1 / (1 + e^(-kx))  で k=10, center=0.3
  const crowdPenalty = 1 / (1 + Math.exp(10 * (pd - 0.3)));

  // 3. 予算ゲート: AIC の平方根（序盤は緩やか、終盤に急落）
  const budgetGate = Math.sqrt(aic);

  // 4. スコア統合: 3要素の積
  const rawScore = contrarianFactor * crowdPenalty * budgetGate;
  const score = Math.max(0, Math.min(1, rawScore));

  // ── シーンラベル決定 ────────────────────────────────────────
  const tier = SCENE_THRESHOLDS.find(t => score >= t.threshold)!;

  return {
    score,
    sceneLabel: tier.label,
    wpMultiplier: tier.multiplier,
    debugInfo: {
      contrarianFactor,
      crowdPenalty,
      budgetGate,
      participationDensity: pd,
      aicRatio: aic,
    },
  };
}
