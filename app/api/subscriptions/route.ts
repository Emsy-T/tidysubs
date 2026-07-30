import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import {
  fetchAllSubscriptions,
  fetchChannelDetails,
  fetchLatestUpload,
} from '@/lib/youtube';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SYNC_COOLDOWN_HOURS = 24; // FR-8: protects the shared quota pool
const CHANNEL_REFRESH_STALE_DAYS = 2; // don't re-fetch upload data for channels checked recently

export async function POST() {
  const session: any = await getServerSession();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.error === 'RefreshAccessTokenError') {
    return NextResponse.json({ error: 'Reconnect required' }, { status: 401 });
  }

  const { data: user } = await supabase
    .from('users')
    .select('id, last_synced_at')
    .eq('google_id', session.googleId)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // FR-8: enforce per-user sync cooldown
  if (user.last_synced_at) {
    const hoursSinceSync =
      (Date.now() - new Date(user.last_synced_at).getTime()) / 1000 / 60 / 60;
    if (hoursSinceSync < SYNC_COOLDOWN_HOURS) {
      return NextResponse.json(
        {
          error: 'Sync cooldown active',
          retryAfterHours: SYNC_COOLDOWN_HOURS - hoursSinceSync,
        },
        { status: 429 },
      );
    }
  }

  // 1. Pull subscriptions from YouTube
  const subs = await fetchAllSubscriptions(session.accessToken);
  const channelIds = subs.map((s) => s.youtube_channel_id);

  // 2. Only fetch full channel details for channels not already cached
  const { data: existingChannels } = await supabase
    .from('channels')
    .select('youtube_channel_id, data_fetched_at')
    .in('youtube_channel_id', channelIds);

  const existingIds = new Set(
    existingChannels?.map((c) => c.youtube_channel_id),
  );
  const newChannelIds = channelIds.filter((id) => !existingIds.has(id));

  if (newChannelIds.length > 0) {
    const details = await fetchChannelDetails(
      session.accessToken,
      newChannelIds,
    );

    // 3. For genuinely new channels, also grab latest upload (for inactivity filtering)
    for (const channel of details) {
      const upload = await fetchLatestUpload(
        session.accessToken,
        channel.uploads_playlist_id,
      );
      const subInfo = subs.find(
        (s) => s.youtube_channel_id === channel.youtube_channel_id,
      );

      // FR-7: upsert — dedup at the DB level via unique youtube_channel_id
      await supabase.from('channels').upsert(
        {
          youtube_channel_id: channel.youtube_channel_id,
          title: subInfo?.title,
          thumbnail_url: subInfo?.thumbnail_url,
          description: channel.description,
          last_upload_at: upload.last_upload_at,
          data_fetched_at: new Date().toISOString(),
        },
        { onConflict: 'youtube_channel_id' },
      );
    }
  }

  // 4. Link user to all their channels via subscriptions table
  const { data: allChannels } = await supabase
    .from('channels')
    .select('id, youtube_channel_id')
    .in('youtube_channel_id', channelIds);

  const channelIdMap = new Map(
    allChannels?.map((c) => [c.youtube_channel_id, c.id]),
  );

  const subscriptionRows = subs.map((s) => ({
    user_id: user.id,
    channel_id: channelIdMap.get(s.youtube_channel_id),
    youtube_subscription_id: s.youtube_subscription_id,
    subscribed_at: s.subscribed_at,
    last_synced_at: new Date().toISOString(),
  }));

  await supabase
    .from('subscriptions')
    .upsert(subscriptionRows, { onConflict: 'user_id,channel_id' });

  // 5. Update user's last sync timestamp
  await supabase
    .from('users')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', user.id);

  return NextResponse.json({
    synced: subs.length,
    newChannels: newChannelIds.length,
  });
}
