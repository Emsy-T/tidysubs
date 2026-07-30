import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { unsubscribeFromChannel } from '@/lib/youtube';
import { decryptToken } from '@/lib/encryption';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const session: any = await getServerSession();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.error === 'RefreshAccessTokenError') {
    return NextResponse.json({ error: 'Reconnect required' }, { status: 401 });
  }

  const { channelIds }: { channelIds: string[] } = await req.json();
  if (!channelIds?.length) {
    return NextResponse.json(
      { error: 'No channels provided' },
      { status: 400 },
    );
  }

  const { data: user } = await supabase
    .from('users')
    .select('id, refresh_token')
    .eq('google_id', session.googleId)
    .single();
  const rawRefreshToken = decryptToken(user?.refresh_token);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // FR-6: only touch subscriptions that actually belong to this user —
  // never trust channelIds blindly, always scope to user_id
  const { data: targets } = await supabase
    .from('subscriptions')
    .select(
      'id, channel_id, youtube_subscription_id, channels(youtube_channel_id, title)',
    )
    .eq('user_id', user.id)
    .in('channels.youtube_channel_id', channelIds);

  if (!targets?.length) {
    return NextResponse.json(
      { error: 'No matching subscriptions found' },
      { status: 404 },
    );
  }

  const results = await Promise.allSettled(
    targets.map((t) =>
      unsubscribeFromChannel(session.accessToken, t.youtube_subscription_id),
    ),
  );

  const succeeded: string[] = [];
  const failed: { channelId: string; reason: string }[] = [];

  results.forEach((result, i) => {
    const target = targets[i];
    if (result.status === 'fulfilled') {
      succeeded.push(target.id);
    } else {
      // Common cause: already unsubscribed on YouTube directly since last sync — treat as success, not error
      const message = String(result.reason);
      if (message.includes('404') || message.includes('subscriptionNotFound')) {
        succeeded.push(target.id);
      } else {
        failed.push({ channelId: target.channel_id, reason: message });
      }
    }
  });

  // Remove successfully unsubscribed rows from our local table too
  if (succeeded.length > 0) {
    await supabase.from('subscriptions').delete().in('id', succeeded);
  }

  return NextResponse.json({
    unsubscribed: succeeded.length,
    failed,
  });
}
