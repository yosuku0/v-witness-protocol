// src/app/components/LiveContextHub.tsx
import { createClient } from '@/utils/supabase/server';
import WitnessCallsClient from './WitnessCallsClient';

export default async function LiveContextHub() {
  const supabase = await createClient();
  let momentsError: string | null = null;
  let treasuryError: string | null = null;

  // To fix the server error, we need to make sure the user is authenticated
  // before fetching data that might depend on RLS policies.
  await supabase.auth.getUser();

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

  const walletBalance = 500;
  // For the demo, we are not fetching the participated call IDs, so we pass an empty array.
  const participatedCallIds: string[] = [];

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
