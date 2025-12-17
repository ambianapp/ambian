export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  cover: string;
  genre: string;
  audioUrl?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  cover: string;
  trackCount: number;
  tracks: Track[];
}

export interface Genre {
  id: string;
  name: string;
  color: string;
  cover: string;
}

export const genres: Genre[] = [
  { id: "1", name: "Ambient", color: "from-blue-600 to-cyan-500", cover: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400" },
  { id: "2", name: "Pop", color: "from-pink-500 to-rose-500", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400" },
  { id: "3", name: "Jazz", color: "from-amber-500 to-orange-600", cover: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=400" },
  { id: "4", name: "Acoustic", color: "from-green-500 to-emerald-600", cover: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400" },
  { id: "5", name: "Electronic", color: "from-purple-500 to-violet-600", cover: "https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=400" },
  { id: "6", name: "Classical", color: "from-slate-500 to-slate-700", cover: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=400" },
];

export const tracks: Track[] = [
  { id: "1", title: "Midnight Dreams", artist: "Aurora Waves", album: "Nightfall", duration: "3:42", cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400", genre: "Ambient" },
  { id: "2", title: "City Lights", artist: "Neon Pulse", album: "Urban Stories", duration: "4:15", cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400", genre: "Electronic" },
  { id: "3", title: "Ocean Breeze", artist: "Calm Waters", album: "Serenity", duration: "5:23", cover: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400", genre: "Ambient" },
  { id: "4", title: "Coffee Morning", artist: "Acoustic Soul", album: "Daily Rituals", duration: "3:58", cover: "https://images.unsplash.com/photo-1485579149621-3123dd979885?w=400", genre: "Acoustic" },
  { id: "5", title: "Velvet Jazz", artist: "Blue Note Trio", album: "After Hours", duration: "6:12", cover: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=400", genre: "Jazz" },
  { id: "6", title: "Summer Days", artist: "Bright Horizons", album: "Sunshine", duration: "3:35", cover: "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=400", genre: "Pop" },
  { id: "7", title: "Moonlit Sonata", artist: "Piano Dreams", album: "Nocturne", duration: "4:48", cover: "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=400", genre: "Classical" },
  { id: "8", title: "Digital Rain", artist: "Synthwave Rider", album: "Retro Future", duration: "4:22", cover: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=400", genre: "Electronic" },
  { id: "9", title: "Forest Walk", artist: "Nature Sounds", album: "Green Escape", duration: "7:15", cover: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400", genre: "Ambient" },
  { id: "10", title: "Late Night Blues", artist: "Smoky Bar", album: "Downtown", duration: "5:45", cover: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400", genre: "Jazz" },
];

export const playlists: Playlist[] = [
  {
    id: "1",
    name: "Café Vibes",
    description: "Perfect background music for coffee shops and cafés",
    cover: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400",
    trackCount: 45,
    tracks: tracks.slice(0, 5),
  },
  {
    id: "2",
    name: "Spa & Wellness",
    description: "Relaxing ambient sounds for beauty salons and spas",
    cover: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400",
    trackCount: 62,
    tracks: tracks.slice(2, 7),
  },
  {
    id: "3",
    name: "Retail Energy",
    description: "Upbeat tracks to energize your retail space",
    cover: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400",
    trackCount: 38,
    tracks: tracks.slice(4, 9),
  },
  {
    id: "4",
    name: "Restaurant Evening",
    description: "Sophisticated dinner ambiance",
    cover: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400",
    trackCount: 55,
    tracks: tracks.slice(3, 8),
  },
  {
    id: "5",
    name: "Office Focus",
    description: "Concentration-boosting instrumental music",
    cover: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400",
    trackCount: 72,
    tracks: tracks.slice(0, 5),
  },
  {
    id: "6",
    name: "Workout Mix",
    description: "High-energy tracks for fitness centers",
    cover: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400",
    trackCount: 48,
    tracks: tracks.slice(5, 10),
  },
];
