# TidySubs

A tool that makes unsubscribing from YouTube channels easy

## 1. Problem

YouTube gives users no efficient way to review and prune their channel subscriptions. Over years, people accumulate hundreds of subscriptions, many to channels they've outgrown, stopped watching, or forgotten about entirely. YouTube's native subscription page is an unsorted, unfilterable grid, which makes cleanup tedious enough that most people never do it. This product gives users a fast, filterable, AI-assisted view of their subscriptions so they can identify dead weight and unsubscribe in bulk.

## 2. Target user

A long-time YouTube user (multi-year account) with 100+ subscriptions who has never done a cleanup pass. They're not looking for a YouTube alternative or a way to discover new channels — they specifically want to audit what they're already subscribed to and cut what no longer serves them. A feature only belongs in this product if it helps this person decide, in under a few minutes, "keep or unsubscribe."

## 3. Goals

- Build with React + TypeScript + Next.js
- Let users see their full subscription list enriched with activity data (last upload, upload frequency) that YouTube's own UI doesn't surface
- Let users filter/sort subscriptions by inactivity and category/tag
- Let users bulk-select and unsubscribe in one action instead of one-by-one
- Auto-categorize channels with AI tags so users can filter by topic, not just recall channel names
- Support multiple users without one user's usage exhausting shared YouTube API quota

## 4. Non-goals / out of scope

- Not a YouTube video discovery, recommendation, or watch-history tool
- Not a way to _subscribe_ to new channels or manage playlists
- Not a video player or alternative viewing experience — no embedded video watching
- Not a social/sharing feature (no showing other users' subscription lists, no collaborative lists)
- Not building a mobile native app in this phase — web app only
- Not supporting non-YouTube platforms (no Twitch, no podcasts, etc.)
- Not doing full-text search across video transcripts/content — filtering is on channel-level metadata, not video content
- Not allowing AI tags to be editable for now

## 5. Core features

| Priority | Feature           | Description                                                                                                                |
| -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| P0       | OAuth sync        | User connects their Google account and their subscription list is pulled and cached                                        |
| P0       | Filter & sort     | Filter/sort subscriptions by last upload date, upload frequency, and AI tag/category                                       |
| P0       | Bulk unsubscribe  | Select multiple channels and unsubscribe from all of them in one action                                                    |
| P1       | AI auto-tagging   | Each channel is auto-categorized into topic tags (tech, gaming, tutorials, etc.) based on recent video titles              |
| P1       | Search            | Text search across subscribed channel names                                                                                |
| P2       | Scheduled re-sync | Subscription/activity data refreshes automatically on a cooldown (e.g., every 24–48h) rather than requiring manual refresh |
| P2       | Undo              | Recently unsubscribed channels can be re-subscribed within a short window in case of misclick                              |
