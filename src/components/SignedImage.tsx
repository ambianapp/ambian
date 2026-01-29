import { useEffect, useState, forwardRef, useRef } from "react";
import { getSignedAudioUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

type SignedImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string | null;
  alt: string;
  fallbackSrc?: string;
};

function isPrivateAudioBucketUrl(url: string) {
  // Only sign URLs that are from the PRIVATE audio bucket (no /public/ in path)
  // Public URLs like /storage/v1/object/public/audio/covers/... should NOT be signed
  // Private URLs look like /storage/v1/object/audio/... (no "public")
  if (url.includes("/storage/v1/object/public/")) {
    return false; // Public bucket, no signing needed
  }
  return url.includes("/storage/v1/object/audio/");
}

/**
 * Renders an image and automatically converts private-bucket URLs
 * (e.g. /storage/v1/object/public/audio/...) into a signed URL.
 * Shows a neutral background while loading to prevent white flash.
 */
const SignedImage = forwardRef<HTMLImageElement, SignedImageProps>(
  ({ src, alt, className, fallbackSrc = "/placeholder.svg", loading = "lazy", style, ...props }, ref) => {
    const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const mountedRef = useRef(true);
    const currentSrcRef = useRef(src);

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
    }, []);

    useEffect(() => {
      // Track the current src to avoid race conditions
      currentSrcRef.current = src;
      setHasError(false);
      setIsLoading(true);

      async function resolve() {
        const next = src || "";
        
        if (!next || next === "/placeholder.svg") {
          if (mountedRef.current && currentSrcRef.current === src) {
            setResolvedSrc(fallbackSrc);
            setIsLoading(false);
          }
          return;
        }

        // Public assets or relative paths (e.g. /playlists/...) should be used as-is.
        if (!isPrivateAudioBucketUrl(next)) {
          if (mountedRef.current && currentSrcRef.current === src) {
            setResolvedSrc(next);
            setIsLoading(false);
          }
          return;
        }

        try {
          const signed = await getSignedAudioUrl(next);
          if (!mountedRef.current || currentSrcRef.current !== src) return;
          
          if (signed) {
            setResolvedSrc(signed);
          } else {
            console.warn("[SignedImage] Failed to get signed URL for:", next?.substring(0, 60));
            setResolvedSrc(fallbackSrc);
          }
        } catch (err) {
          console.error("[SignedImage] Error signing URL:", err);
          if (mountedRef.current && currentSrcRef.current === src) {
            setResolvedSrc(fallbackSrc);
          }
        } finally {
          if (mountedRef.current && currentSrcRef.current === src) {
            setIsLoading(false);
          }
        }
      }

      resolve();
    }, [src, fallbackSrc]);

    const handleError = () => {
      if (!hasError && mountedRef.current) {
        console.warn("[SignedImage] Image failed to load:", resolvedSrc?.substring(0, 60));
        setHasError(true);
        setResolvedSrc(fallbackSrc);
      }
    };

    const handleLoad = () => {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    };

    // Show a neutral background while loading or if no source
    const showPlaceholder = isLoading || !resolvedSrc;

    return (
      <img
        ref={ref}
        src={resolvedSrc || fallbackSrc}
        alt={alt}
        loading={loading}
        className={cn(
          className,
          showPlaceholder && "bg-muted"
        )}
        style={{
          ...style,
          // Ensure a background color while loading to prevent white flash
          backgroundColor: showPlaceholder ? 'hsl(var(--muted))' : undefined,
        }}
        onError={handleError}
        onLoad={handleLoad}
        {...props}
      />
    );
  }
);

SignedImage.displayName = "SignedImage";

export default SignedImage;
