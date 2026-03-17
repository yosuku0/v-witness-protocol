
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server'; // Corrected import

export async function POST(req: NextRequest) {
    const supabase = await createClient(); // Corrected instantiation

    // 1. Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return new NextResponse(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
    }

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

    // 3. Call the transactional database function
    const { data, error } = await supabase.rpc('declare_witness', {
        p_user_id: user.id,
        p_call_id: callId,
        p_wp_amount: wpAmount,
    });

    if (error) {
        console.error('RPC Error:', error);
        return new NextResponse(JSON.stringify({ message: 'An error occurred during the process.' }), { status: 500 });
    }
    
    // The RPC function returns an array with a single object
    const result = data[0];

    if (!result.success) {
        return new NextResponse(JSON.stringify({ message: result.message || 'Operation failed.' }), { status: 409 });
    }

    // 4. Return the successful result from the transaction
    return NextResponse.json({
        message: result.message,
        newBalance: result.new_balance,
        sceneLabel: result.scene_label,
        nrwScore: result.nrw_score,
    });
}
