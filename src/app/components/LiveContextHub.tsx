
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client'; // Corrected import

// 仮の型定義。実際のスキーマに合わせて調整してください。
interface Team {
    id: number;
    name: string;
    // ... other properties
}

interface WitnessCall {
    id: number;
    title: string;
    wp_cost: number;
    // ... other properties
}

interface Wallet {
    available_wp: number;
}

export default function LiveContextHub() {
    const supabase = createClient(); // Corrected instantiation
    const [teams, setTeams] = useState<Team[]>([]);
    const [witnessCalls, setWitnessCalls] = useState<WitnessCall[]>([]);
    const [wallet, setWallet] = useState<Wallet | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [declaring, setDeclaring] = useState<{[key: number]: boolean}>({});

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const { data: { user } } = await supabase.auth.getUser();

                if (!user) {
                    setError('User not authenticated.');
                    setLoading(false);
                    return;
                }

                const [teamsRes, callsRes, walletRes] = await Promise.all([
                    supabase.from('teams').select('*'),
                    supabase.from('witness_calls').select('*'),
                    supabase.from('wp_wallets').select('available_wp').eq('user_id', user.id).single(),
                ]);

                if (teamsRes.error) throw teamsRes.error;
                if (callsRes.error) throw callsRes.error;
                if (walletRes.error) throw walletRes.error;

                setTeams(teamsRes.data || []);
                setWitnessCalls(callsRes.data || []);
                setWallet(walletRes.data);

            } catch (err: any) {
                setError(err.message || 'Failed to fetch data.');
            } finally {
                setLoading(false);
            }
        };

        const channel = supabase.auth.onAuthStateChange((event, session) => {
            fetchData();
        });

        return () => {
            // channel.unsubscribe();
        };
    }, [supabase]);

    const handleDeclare = async (call: WitnessCall) => {
        if (!wallet || wallet.available_wp < call.wp_cost) {
            alert('Not enough WP to declare.');
            return;
        }

        setDeclaring(prev => ({ ...prev, [call.id]: true }));

        try {
            const response = await fetch('/api/witness', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ callId: call.id, wpAmount: call.wp_cost }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Declaration failed.');
            }

            // 宣言成功！UIを更新
            alert(`Successfully declared!\nScene: ${result.sceneLabel} (Score: ${result.nrwScore.toFixed(4)})`);
            setWallet({ available_wp: result.newBalance });

            // witnessCallsリストも更新した方がより正確ですが、ここでは省略します。

        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setDeclaring(prev => ({ ...prev, [call.id]: false }));
        }
    };

    if (loading) {
        return <main className="flex min-h-screen items-center justify-center"><p>Loading data...</p></main>;
    }

    if (error) {
        return <main className="flex min-h-screen items-center justify-center"><p className="text-red-500">Error: {error}</p></main>;
    }

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Live Context Hub</h1>
            <div className="mb-6 p-4 border rounded-lg">
                <h2 className="text-xl">My Wallet</h2>
                <p>Available WP: {wallet?.available_wp ?? 'N/A'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h2 className="text-xl font-semibold mb-2">Teams</h2>
                    <ul className="space-y-2">
                        {teams.map(team => (
                            <li key={team.id} className="p-3 border rounded">{team.name}</li>
                        ))}
                    </ul>
                </div>

                <div>
                    <h2 className="text-xl font-semibold mb-2">Witness Calls</h2>
                    <ul className="space-y-3">
                        {witnessCalls.map(call => (
                            <li key={call.id} className="p-3 border rounded-lg flex justify-between items-center">
                                <div>
                                    <p className="font-bold">{call.title}</p>
                                    <p>Cost: {call.wp_cost} WP</p>
                                </div>
                                <button
                                    onClick={() => handleDeclare(call)}
                                    disabled={declaring[call.id] || (wallet ? wallet.available_wp < call.wp_cost : true)}
                                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-400"
                                >
                                    {declaring[call.id] ? 'Declaring...' : 'Declare'}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
