# V-Witness Protocol (VWP)

VTuberカジュアル大会の「練習カスタムから本番までの熱狂」を、主催者の公式資産としてアーカイブするWebプラットフォームのデモです。

視聴者が試合展開を**宣言（Witness Call）**し、予想が的中すると希少度に応じたバッジを獲得できます。

---

## デモの概要

このリポジトリはコンセプト検証用のデモです。実際の決済・認証機能は含まれていません。

![VWP Screenshot](docs/screenshot.png)

---

## 主な機能

### Witness Call（宣言システム）
- オープン中のモーメント（予想イベント）に WP（ウィットネスポイント）を消費して宣言
- 楽観的UI（`useOptimistic`）による即時フィードバック
- エラー時のトースト通知（WP不足・受付終了など）

### NRW（Narrative Rarity Weight）エンジン
宣言の「稀少度スコア」を計算するアンチインフレ機構。

| 要素 | 説明 |
|---|---|
| 逆張り報酬 | 基本確率が低いほど高スコア |
| 群衆ペナルティ | 同一モーメントへの集中をシグモイド関数で抑制 |
| 予算ゲート | 大会WP予算の残量に応じてスコアを逓減 |

スコアに応じて以下のシーンラベルが付与されます：

| ラベル | 倍率 |
|---|---|
| 🟡 LEGENDARY | 5.0x |
| 🟣 EPIC | 3.0x |
| 🔵 RARE | 2.0x |
| 🟢 UNCOMMON | 1.5x |
| ⬜ COMMON | 1.0x |

### Festival Treasury
大会全体の応援ポイント集積状況をプログレスバーで可視化。Supabaseの事前集計テーブル（`festival_treasury_stats`）を参照し、リクエストごとのSUM()クエリを回避しています。

---

## 技術スタック

| カテゴリ | 技術 |
|---|---|
| フロントエンド | Next.js 16 (App Router) + Tailwind CSS v4 |
| バックエンド / DB | Supabase (PostgreSQL) |
| 認証 | Supabase Auth |
| デプロイ | Vercel（予定） |
| 開発環境 | Firebase Studio (Project IDX) |

---

## アーキテクチャの特徴

### Server / Client Component の分離
```
LiveContextHub.tsx     ← Server Component（データ取得）
└── WitnessCallsClient.tsx  ← Client Component（インタラクション）
```

データ取得はサーバー側で完結させ、`'use client'` はインタラクションが必要な最小単位にのみ付与しています。

### 設計上の制約
- **資金決済法への対応**：有償ポイント残高（SPウォレット）は持たず、有償機能はStripe都度決済で処理
- **Supabase負荷対策**：Festival Treasuryの合計金額はリクエストごとのSUM()禁止、事前集計テーブルを参照

---

## ローカル起動

```bash
# 依存パッケージのインストール
npm install

# 環境変数の設定
cp .env.local.example .env.local
# NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定

# 開発サーバーの起動
npm run dev
```

---

## データベース構成

```
witness_calls          モーメント定義
witness_participations ユーザーの宣言履歴
wallet_wp              WP残高
festival_treasury_stats Festival Treasury事前集計
tournament_config      大会設定
user_profiles          ユーザープロフィール
```

---

## 今後の実装予定（Phase 4 以降）

- [ ] Stripe 決済によるチームサポートパス購入
- [ ] モーメント結果反映・WP配布ロジック
- [ ] 主催者向け管理画面
- [ ] Vercel 本番デプロイ
- [ ] Supabase Edge Function による Treasury 定期集計

---

## License

MIT