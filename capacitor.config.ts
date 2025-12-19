import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.b2275b8452e04644803f6bb24a552122',
  appName: 'ambian',
  webDir: 'dist',
  server: {
    url: 'https://b2275b84-52e0-4644-803f-6bb24a552122.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  android: {
    // Enable background audio
    backgroundColor: '#0a0a0a',
  },
  plugins: {
    // Background audio configuration
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
