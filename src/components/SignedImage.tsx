import { useEffect, useState } from "react";
import { getSignedAudioUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

type SignedImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  loading?: "eager" | "lazy";
};

function isAudioBucketPublicUrl(url: string) {
  return url.includes("/storage/v1/object/public/audio/");
}

/**
 * Renders an image and automatically converts private-bucket public URLs
 * (e.g. /storage/v1/object/public/audio/...) into a signed URL.
 */
export default function SignedImage({
  src,
  alt,
  className,
  fallbackSrc = "/placeholder.svg",
  loading = "lazy",
}: SignedImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string>(src || fallbackSrc);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const next = src || "";
      if (!next) {
        setResolvedSrc(fallbackSrc);
        return;
      }

      // Public assets or relative paths (e.g. /playlists/...) should be used as-is.
      if (!isAudioBucketPublicUrl(next)) {
        setResolvedSrc(next);
        return;
      }

      const signed = await getSignedAudioUrl(next);
      if (cancelled) return;
      setResolvedSrc(signed || next);
    }

    resolve();

    return () => {
      cancelled = true;
    };
  }, [src, fallbackSrc]);

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading={loading}
      className={cn(className)}
      onError={() => setResolvedSrc(fallbackSrc)}
    />
  );
}
