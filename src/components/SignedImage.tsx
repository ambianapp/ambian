import { useEffect, useState, forwardRef } from "react";
import { getSignedAudioUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

type SignedImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string | null;
  alt: string;
  fallbackSrc?: string;
};

function isAudioBucketPublicUrl(url: string) {
  // Check for both audio files and covers in the private audio bucket
  return url.includes("/storage/v1/object/public/audio/") || 
         url.includes("/storage/v1/object/audio/");
}

/**
 * Renders an image and automatically converts private-bucket public URLs
 * (e.g. /storage/v1/object/public/audio/...) into a signed URL.
 */
const SignedImage = forwardRef<HTMLImageElement, SignedImageProps>(
  ({ src, alt, className, fallbackSrc = "/placeholder.svg", loading = "lazy", ...props }, ref) => {
    // Start with fallback to prevent white flash, then resolve the actual src
    const [resolvedSrc, setResolvedSrc] = useState<string>(fallbackSrc);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
      let cancelled = false;
      setHasError(false);

      async function resolve() {
        const next = src || "";
        if (!next) {
          setResolvedSrc(fallbackSrc);
          return;
        }

        // Public assets or relative paths (e.g. /playlists/...) should be used as-is.
        if (!isAudioBucketPublicUrl(next)) {
          if (!cancelled) setResolvedSrc(next);
          return;
        }

        try {
          const signed = await getSignedAudioUrl(next);
          if (cancelled) return;
          if (signed) {
            setResolvedSrc(signed);
          } else {
            // Failed to get signed URL, use fallback
            setResolvedSrc(fallbackSrc);
          }
        } catch (err) {
          if (!cancelled) setResolvedSrc(fallbackSrc);
        }
      }

      resolve();

      return () => {
        cancelled = true;
      };
    }, [src, fallbackSrc]);

    const handleError = () => {
      if (!hasError) {
        setHasError(true);
        setResolvedSrc(fallbackSrc);
      }
    };

    return (
      <img
        ref={ref}
        src={resolvedSrc}
        alt={alt}
        loading={loading}
        className={cn(className)}
        onError={handleError}
        {...props}
      />
    );
  }
);

SignedImage.displayName = "SignedImage";

export default SignedImage;
