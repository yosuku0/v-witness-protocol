// src/app/components/LiveContextHub.tsx
import { createClient } from '@/utils/supabase/server';
import WitnessCallsClient from './WitnessCallsClient';

export default async function LiveContextHub() {
  const supabase = await createClient();
  let momentsError: string | null = null;
  let treasuryError: string | null = null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: moments, error: momentsFetchError } = await supabase
    .from('witness_calls')
    .select('*')
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString())

  if (momentsFetchError) {
    console.error('[LiveContextHub] moments fetch error:', momentsFetchError?.message, momentsFetchError?.code, momentsFetchError?.details);
    momentsError = 'モーメントの読み込みに失敗しました。';
  }

  const { data: treasury, error: treasuryFetchError } = await supabase
    .from('festival_treasury_stats')
    .select('current_amount, target_amount, supporter_count')
    .maybeSingle();

  if (treasuryFetchError) {
    console.error('[LiveContextHub] treasury fetch error:', treasuryFetchError?.message, treasuryFetchError?.code, treasuryFetchError?.details);
    treasuryError = 'Treasury情報の読み込みに失敗しました。';
  }

  let walletBalance = 0;
  // ⚠️ Set は JSON シリアライズ不可 → string[] で渡す
  let participatedCallIds: string[] = [];

  if (user) {
    const [walletRes, participatedRes] = await Promise.all([
      supabase.from('wallet_wp').select('balance').eq('user_id', user.id).single(),
      supabase.from('witness_participations').select('call_id').eq('user_id', user.id),
    ]);

    if (walletRes.data) walletBalance = walletRes.data.balance ?? 0;
    if (walletRes.error) console.error('[LiveContextHub] wallet fetch error:', walletRes.error);

    if (participatedRes.data) {
      participatedCallIds = participatedRes.data.map((p: { call_id: string }) => p.call_id);
    }
    if (participatedRes.error)
      console.error('[LiveContextHub] participations fetch error:', participatedRes.error);
  }

  return (
    <WitnessCallsClient
      moments={moments ?? []}
      treasury={treasury ?? null}
      walletBalance={walletBalance}
      participatedCallIds={participatedCallIds}
      momentsError={momentsError}
      treasuryError={treasuryError}
    />
  );
}
