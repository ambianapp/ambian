

# Plan: Improve Home Page Loading Speed

## Summary

You've already optimized the image file sizes (great job!), but the **perceived loading speed** can still be improved. The current implementation makes 4+ separate database calls sequentially and loads images lazily without prioritization. I'll implement several strategies to make the home page feel instant.

---

## What's Slowing Things Down

1. **Sequential Database Queries**: The `loadData()` function makes 5 separate database calls one after another (history, mood, genre, updated, new playlists)

2. **No Data Caching**: Every time you return to the home page, all data is fetched fresh from the database

3. **All Images Load at Same Priority**: Browser loads visible and off-screen images equally, causing a "waterfall" effect

4. **No Stale-While-Revalidate**: Users see skeletons even when they have fresh data from seconds ago

---

## The Solution

### 1. Parallel Database Queries
Run all playlist queries at the same time instead of waiting for each to finish:

```text
BEFORE: Query 1 → Query 2 → Query 3 → Query 4 → Query 5
        [-----200ms-----][-----200ms-----][-----200ms-----]...

AFTER:  Query 1 ─┐
        Query 2 ─┼──→ All finish together
        Query 3 ─┤     [-----200ms-----]
        Query 4 ─┤
        Query 5 ─┘
```

This alone should cut loading time by ~60-70%.

### 2. Add React Query Caching
Use the existing React Query setup to cache playlist data. Users returning to the home screen will see their previous data instantly while fresh data loads in the background.

- **Mood playlists**: Cache for 5 minutes
- **Genre playlists**: Cache for 5 minutes  
- **Industry collections**: Cache for 5 minutes
- Show cached data immediately, refresh silently

### 3. Priority Image Loading
Load the first few visible images immediately, lazy-load the rest:

- First 4 mood playlist covers: `loading="eager"` with `fetchPriority="high"`
- Everything else: `loading="lazy"` (current behavior)

### 4. Image Prefetching
After the first batch of images loads, prefetch the next ones so they're ready when the user scrolls.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/HomeView.tsx` | Replace sequential queries with parallel `Promise.all()`, add React Query hooks |
| `src/hooks/useHomeData.ts` (new) | Create a dedicated hook for home data fetching with caching |
| `src/components/MobileHorizontalPlaylistSection.tsx` | Add priority loading for first few images |
| `src/components/HorizontalPlaylistSection.tsx` | Add priority loading for first few images |
| `src/components/MobileIndustrySection.tsx` | Add React Query caching |

---

## Expected Improvement

| Metric | Before | After |
|--------|--------|-------|
| First content paint | ~1.5-2s | ~0.5-0.8s |
| All images loaded | ~3-4s | ~1.5-2s |
| Return visits | Full reload | Instant (cached) |

---

## Technical Details

### New Hook: useHomeData

```typescript
// Combines all home data fetching with caching
const useHomeData = (userId?: string) => {
  return useQuery({
    queryKey: ['home-playlists', userId],
    queryFn: async () => {
      // Run ALL queries in parallel
      const [mood, genre, industry, history] = await Promise.all([
        supabase.from("playlists").select("*").eq("category", "mood")...,
        supabase.from("playlists").select("*").eq("category", "genre")...,
        supabase.from("industry_collections").select("*")...,
        userId ? supabase.from("play_history")... : Promise.resolve({ data: [] })
      ]);
      return { mood, genre, industry, history };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,   // 30 minutes
  });
};
```

### Priority Image Loading

```tsx
// First 4 images load immediately
{playlists.slice(0, 4).map((playlist, i) => (
  <SignedImage
    src={playlist.cover_url}
    loading="eager"
    fetchPriority="high"
    ...
  />
))}

// Rest load lazily
{playlists.slice(4).map((playlist) => (
  <SignedImage
    src={playlist.cover_url}
    loading="lazy"
    ...
  />
))}
```

---

## Optional Enhancements

After implementing the core improvements, you could also consider:

- **Optimistic UI**: Show placeholder playlist covers with a gradient while loading
- **Service Worker caching**: Pre-cache common playlist covers for offline access
- **Supabase image transforms**: Use `?width=200` URL params for thumbnails (smaller downloads)

