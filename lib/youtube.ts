import { google } from 'googleapis';

function getYoutubeClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.youtube({ version: 'v3', auth: 'oauth2Client' });
}

// FR-2: pull the full subscription list, paginated (1 unit per page of ~50)
export async function fetchAllSubscriptions(accessToken: string) {
  const youtube = getYoutubeClient(accessToken);
  const subscriptions: any[] = [];
  let pageToken = string | undefined = undefined;

  do {
    const res = await youtube.subscriptions.list({
      part: ["snippet"],
      mine: true,
      maxResults: 50,
      pageToken,
    });

    subscriptions.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return subscriptions.map((s) => ({
    youtube_subscription_id: s.id, // Needed for user to unsibscribe later
    youtube_channel_id: s.snippet.resourceId.channelId,
    title: s.snippet.title,
    thumbnail_url: s.snippet.thumbnails?.default?.url,
    subscribed_at: s.snippet.publishedAt,
  }));
}

// FR-3: batch channel details — channels.list accepts up to 50 IDs per call (1 unit each call, not per ID)
export async function fetchChannelDetails(accessToken: string, channelIds: string[]) {
  const youtube = getYoutubeClient(accessToken);
  const results: any[] = [];

  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50);
    const res = await youtube.channels.list({
      part: ["snippet", "contentDetails", "statistics"],
      id: batch,
      maxResults: 50,
    });
    results.push(...(res.data.items ?? []));
  }

  return results.map((c) => ({
    youtube_channel_id: c.id,
    description: c.snippet.description,
    uploads_playlist_id: c.contentDetails.relatedPlaylists.uploads,
    subscriber_count: c.statistics?.subscriberCount,
  }));
}

// FR-3: last upload date, used to compute inactivity (FR-4's 6-month default)
// 1 unit per call — only call this for channels not already cached recently
export async function fetchLatestUpload(accessToken: string, uploadsPlaylistId: string) {
  const youtube = getYoutubeClient(accessToken);
  const res = await youtube.playlistItems.list({
    part: ["snippet"],
    playlistId: uploadsPlaylistId,
    maxResults: 5, // a few recent titles, useful later for FR-7 AI tagging too
  });

  const items = res.data.items ?? [];
  return {
    last_upload_at: items[0]?.snippet?.publishedAt ?? null,
    recent_titles: items.map((i) => i.snippet?.title).filter(Boolean),
  };
}

export async function unsubscribeFromChannel(accessToken: string, subscriptionId:string){
    const youtube = getYoutubeClient(accessToken);
    await youtube.subscriptions.delete({id:subscriptionId})
}
