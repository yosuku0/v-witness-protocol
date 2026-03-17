// app/tournament/[slug]/treasury/page.tsx
//
// Festival Treasury の表示ページ
// ISR (Incremental Static Regeneration) で30秒ごとに再生成。
// ユーザーリクエスト時に DB の SUM() クエリは一切実行しない。

import { createClient } from "@supabase/supabase-js";

// ⚠️ これが高負荷対策の核心
// 30秒ごとにNext.jsがサーバーサイドで再生成し、
// 生成済みの静的HTMLをCDNエッジから配信する。
export const revalidate = 30;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!   // 読み取り専用のanon keyで十分
);

interface TreasuryPageProps {
  params: { slug: string };
}

async function getTreasurySnapshot(slug: string) {
  // tournament を slug で引く
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("slug", slug)
    .single();

  if (!tournament) return null;

  // treasury_snapshots は Edge Function が事前集計済みの1行のみ読む
  // SUM() や GROUP BY は発生しない
  const { data: snapshot } = await supabase
    .from("treasury_snapshots")
    .select("total_amount_jpy, order_count, supporter_count, team_breakdown, snapshot_at")
    .eq("tournament_id", tournament.id)
    .single();

  return { tournament, snapshot };
}

export default async function TreasuryPage({ params }: TreasuryPageProps) {
  const data = await getTreasurySnapshot(params.slug);
  if (!data || !data.snapshot) {
    return <div>大会が見つかりません</div>;
  }

  const { tournament, snapshot } = data;
  const totalFormatted = snapshot.total_amount_jpy.toLocaleString("ja-JP");
  const lastUpdated = new Date(snapshot.snapshot_at).toLocaleTimeString("ja-JP");
  const teamBreakdown = snapshot.team_breakdown as Record<
    string,
    { team_name: string; amount: number; count: number }
  >;

  return (
    <main>
      <h1>{tournament.name} — Festival Treasury</h1>

      {/* ISRによる静的キャッシュからの配信。この数値はDBを直接叩いていない */}
      <div className="treasury-total">
        <span>¥{totalFormatted}</span>
        <small>（{snapshot.supporter_count.toLocaleString()} 人が応援中）</small>
      </div>

      <p className="last-updated">最終更新: {lastUpdated}</p>

      {/* チーム別内訳 */}
      <ul>
        {Object.entries(teamBreakdown ?? {}).map(([teamId, info]) => (
          <li key={teamId}>
            <strong>{info.team_name}</strong>: ¥{info.amount.toLocaleString()}
            （{info.count} 件の応援）
          </li>
        ))}
      </ul>

      {/* Client Component でポーリングする場合（任意） */}
      {/* <TreasuryLiveUpdater tournamentId={tournament.id} /> */}
    </main>
  );
}

// ── Optional: Client-side ポーリング（ISRの補完用） ──────────────
// ISRの30秒ラグが気になる場合のみ追加する。
// Supabase Realtimeではなく、シンプルなsetIntervalでスナップショットAPIを叩く設計。
// DB直結ではなく、必ずスナップショットエンドポイントを経由すること。
//
// "use client"
// export function TreasuryLiveUpdater({ tournamentId }: { tournamentId: string }) {
//   const [snapshot, setSnapshot] = useState(null);
//   useEffect(() => {
//     const interval = setInterval(async () => {
//       // /api/treasury-snapshot は treasury_snapshots テーブルの1行を返すだけ
//       const res = await fetch(`/api/treasury-snapshot?tournament_id=${tournamentId}`);
//       setSnapshot(await res.json());
//     }, 30_000);   // 30秒ポーリング
//     return () => clearInterval(interval);
//   }, [tournamentId]);
//   ...
// }
