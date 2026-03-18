
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    const supabase = await createClient();

    // 1. Get authenticated user
    // デモ用：固定のダミーユーザーIDを使用
    const user = { id: '00000000-0000-0000-0000-000000000001' };

    // 2. Parse request body
    let callId: string;
    let wpAmount: number;
    try {
        const body = await req.json();
        callId = body.callId;
        wpAmount = body.wpAmount;
        if (!callId || typeof wpAmount !== 'number') {
            throw new Error('Missing or invalid parameters');
        }
    } catch (error) {
        return new NextResponse(JSON.stringify({ message: 'Invalid request body' }), { status: 400 });
    }

    // デモ用：NRWエンジンを直接呼び出してモックレスポンスを返す
    const { computeNRW } = await import('@/lib/nrw-engine');
    const nrwResult = computeNRW({
      baseProbability: 0.3,
      participationCount: 10,
      totalWpSpent: 100,
      wpBudgetTotal: 10000000,
      momentWpCost: wpAmount,
    });

    return NextResponse.json({
      participationId: crypto.randomUUID(),
      sceneLabel: nrwResult.sceneLabel,
      nrwScore: nrwResult.score,
      wpMultiplier: nrwResult.wpMultiplier,
      newBalance: 500 - wpAmount,
    });
}
