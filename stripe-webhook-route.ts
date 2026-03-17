// app/api/webhooks/stripe/route.ts
//
// Stripe の payment_intent.succeeded を受け取り、
// 1. orders を completed に更新
// 2. user_entitlements を INSERT
// 3. 必要に応じて supporter バッジを付与
// 4. treasury snapshot の即時更新をトリガー
//
// ⚠️ SP残高を加算するコードは存在しない（設計上）

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // service_role で user_badges / orders を操作
);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "payment_intent.succeeded") {
    return NextResponse.json({ received: true });
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  const { user_id, product_id } = pi.metadata;   // Checkout Session 作成時に付与

  // ── 1. orders を completed に更新 ───────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", pi.id)
    .select("id, product_id")
    .single();

  if (orderErr || !order) {
    console.error("Order update failed:", orderErr);
    return NextResponse.json({ error: "Order not found" }, { status: 500 });
  }

  // ── 2. product の entitlement_code を取得 ────────────────────────
  const { data: product } = await supabase
    .from("products")
    .select("entitlement_code, type, team_id, tournament_id")
    .eq("id", product_id)
    .single();

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // ── 3. user_entitlements を INSERT ───────────────────────────────
  // ここが SPウォレット残高加算の完全な代替
  // 「お金の価値を保持」するのではなく「権限を付与」するだけ
  await supabase.from("user_entitlements").insert({
    user_id,
    order_id:         order.id,
    entitlement_code: product.entitlement_code,
  });

  // ── 4. supporter バッジを付与（team_pass購入者） ─────────────────
  if (product.type === "team_pass" && product.team_id) {
    const badgeCode = `supporter:${product.team_id}`;
    const { data: badge } = await supabase
      .from("badges")
      .select("id")
      .eq("code", badgeCode)
      .single();

    if (badge) {
      await supabase.from("user_badges").upsert(
        {
          user_id,
          badge_id:     badge.id,
          award_reason: `team_pass_purchase:order_id=${order.id}`,
        },
        { onConflict: "user_id,badge_id", ignoreDuplicates: true }
      );
    }
  }

  // ── 5. Treasury snapshot を即時更新（ISRより早く反映したい場合） ──
  // 非同期でトリガー（Webhookのレスポンスをブロックしない）
  fetch(`${process.env.SUPABASE_URL}/functions/v1/refresh-treasury-snapshot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(console.error);

  return NextResponse.json({ received: true });
}
