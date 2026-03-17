// supabase/functions/refresh-treasury-snapshot/index.ts
//
// 用途: Festival Treasury のバッチ集計を実行し treasury_snapshots を UPSERT する
// 呼び出し元:
//   1. Supabase pg_cron（30〜60秒ごと）
//   2. Stripe Webhook 成功後（Next.js API Route から fetch で叩く）
// 注意: このFunctionはユーザーが直接叩けないよう Authorization を検証する

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

serve(async (req: Request) => {
  // ── 認証（pg_cron または 内部サーバーからのみ許可） ─────────────
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── アクティブな大会を取得 ─────────────────────────────────────
  const { data: tournaments, error: tErr } = await supabase
    .from("tournaments")
    .select("id")
    .in("status", ["practice", "live"]);

  if (tErr) {
    console.error("Failed to fetch tournaments:", tErr);
    return new Response(JSON.stringify({ error: tErr.message }), { status: 500 });
  }

  const results: { tournament_id: string; ok: boolean }[] = [];

  for (const t of tournaments ?? []) {
    try {
      // ── PostgreSQL関数で集計（DBサイドで1クエリ完結） ──────────
      const { data: snapshot, error: fnErr } = await supabase.rpc(
        "compute_treasury_snapshot",
        { p_tournament_id: t.id }
      );
      if (fnErr) throw fnErr;

      const now = new Date().toISOString();

      // ── treasury_snapshots を UPSERT（最新1件のみ保持） ──────────
      const { error: upsertErr } = await supabase
        .from("treasury_snapshots")
        .upsert(
          {
            tournament_id:    t.id,
            total_amount_jpy: snapshot.total_amount_jpy,
            order_count:      snapshot.order_count,
            supporter_count:  snapshot.supporter_count,
            team_breakdown:   snapshot.team_breakdown,
            snapshot_at:      now,
          },
          { onConflict: "tournament_id" }
        );
      if (upsertErr) throw upsertErr;

      // ── 履歴テーブルへ追記（グラフ・推移用） ─────────────────────
      await supabase.from("treasury_snapshot_history").insert({
        tournament_id:    t.id,
        total_amount_jpy: snapshot.total_amount_jpy,
        order_count:      snapshot.order_count,
        supporter_count:  snapshot.supporter_count,
        snapshot_at:      now,
      });

      results.push({ tournament_id: t.id, ok: true });
    } catch (err) {
      console.error(`Snapshot failed for tournament ${t.id}:`, err);
      results.push({ tournament_id: t.id, ok: false });
    }
  }

  return new Response(JSON.stringify({ refreshed: results }), {
    headers: { "Content-Type": "application/json" },
  });
});