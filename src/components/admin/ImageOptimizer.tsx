import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ImageIcon, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { compressImage } from "@/lib/imageCompression";

interface ImageStats {
  totalImages: number;
  totalSizeKB: number;
  largeImages: number;
  averageSizeKB: number;
}

interface OptimizationResult {
  processed: number;
  skipped: number;
  failed: number;
  savedKB: number;
}

export const ImageOptimizer = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [stats, setStats] = useState<ImageStats | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentImage, setCurrentImage] = useState("");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const { toast } = useToast();

  const analyzeImages = async () => {
    setIsAnalyzing(true);
    setStats(null);
    setResult(null);

    try {
      // List all files in playlist-covers bucket
      const { data: files, error } = await supabase.storage
        .from("playlist-covers")
        .list("", { limit: 1000 });

      if (error) throw error;

      const imageFiles = files.filter(f => 
        f.name.match(/\.(jpg|jpeg|png|webp)$/i) && 
        f.metadata?.size
      );

      const totalSizeKB = imageFiles.reduce((sum, f) => 
        sum + (f.metadata?.size || 0) / 1024, 0
      );

      const largeImages = imageFiles.filter(f => 
        (f.metadata?.size || 0) > 200 * 1024 // > 200KB
      ).length;

      setStats({
        totalImages: imageFiles.length,
        totalSizeKB: Math.round(totalSizeKB),
        largeImages,
        averageSizeKB: Math.round(totalSizeKB / imageFiles.length) || 0,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const optimizeImages = async () => {
    setIsOptimizing(true);
    setProgress(0);
    setResult(null);

    const optimization: OptimizationResult = {
      processed: 0,
      skipped: 0,
      failed: 0,
      savedKB: 0,
    };

    try {
      // List all files
      const { data: files, error } = await supabase.storage
        .from("playlist-covers")
        .list("", { limit: 1000 });

      if (error) throw error;

      const imageFiles = files.filter(f => 
        f.name.match(/\.(jpg|jpeg|png|webp)$/i)
      );

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        setCurrentImage(file.name);
        setProgress(Math.round((i / imageFiles.length) * 100));

        const originalSize = file.metadata?.size || 0;

        // Skip if already optimized (under 150KB)
        if (originalSize < 150 * 1024) {
          optimization.skipped++;
          continue;
        }

        try {
          // Download the original image
          const { data: blob, error: downloadError } = await supabase.storage
            .from("playlist-covers")
            .download(file.name);

          if (downloadError || !blob) {
            optimization.failed++;
            continue;
          }

          // Convert blob to File
          const originalFile = new File([blob], file.name, { type: blob.type });

          // Compress the image
          const compressedFile = await compressImage(originalFile, {
            maxWidth: 500,
            maxHeight: 500,
            quality: 0.85,
            format: 'jpeg'
          });

          // Only re-upload if we achieved significant savings (>30%)
          if (compressedFile.size < originalSize * 0.7) {
            const oldName = file.name;
            const newName = file.name.replace(/\.[^.]+$/, '.jpg');
            
            // Upload compressed version first (before deleting original)
            const { error: uploadError } = await supabase.storage
              .from("playlist-covers")
              .upload(newName, compressedFile, { 
                contentType: 'image/jpeg',
                upsert: true 
              });

            if (uploadError) {
              optimization.failed++;
              continue;
            }

            // Update database URLs if the filename changed
            if (oldName !== newName) {
              const oldUrl = `https://hjecjqyonxvrrvprbvgr.supabase.co/storage/v1/object/public/playlist-covers/${oldName}`;
              const newUrl = `https://hjecjqyonxvrrvprbvgr.supabase.co/storage/v1/object/public/playlist-covers/${newName}`;
              
              // Update playlists table
              await supabase
                .from("playlists")
                .update({ cover_url: newUrl })
                .eq("cover_url", oldUrl);
              
              // Update industry_collections table
              await supabase
                .from("industry_collections")
                .update({ cover_url: newUrl })
                .eq("cover_url", oldUrl);
              
              // Update tracks table
              await supabase
                .from("tracks")
                .update({ cover_url: newUrl })
                .eq("cover_url", oldUrl);
            }

            // Only delete original after successful upload and DB update
            await supabase.storage.from("playlist-covers").remove([oldName]);
            
            optimization.processed++;
            optimization.savedKB += Math.round((originalSize - compressedFile.size) / 1024);
          } else {
            optimization.skipped++;
          }
        } catch (err) {
          console.error(`Failed to optimize ${file.name}:`, err);
          optimization.failed++;
        }
      }

      setResult(optimization);
      toast({
        title: "Optimization Complete",
        description: `Processed ${optimization.processed} images, saved ${optimization.savedKB.toLocaleString()} KB`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsOptimizing(false);
      setProgress(100);
      setCurrentImage("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5" />
          Image Optimizer
        </CardTitle>
        <CardDescription>
          Analyze and compress playlist cover images to improve app performance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Analyze Button */}
        <Button 
          onClick={analyzeImages} 
          disabled={isAnalyzing || isOptimizing}
          variant="outline"
          className="w-full"
        >
          {isAnalyzing ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
          ) : (
            "Analyze Images"
          )}
        </Button>

        {/* Stats Display */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Total Images</p>
              <p className="text-lg font-semibold">{stats.totalImages}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Size</p>
              <p className="text-lg font-semibold">{(stats.totalSizeKB / 1024).toFixed(1)} MB</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Large Images (&gt;200KB)</p>
              <p className="text-lg font-semibold text-orange-500">{stats.largeImages}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Average Size</p>
              <p className="text-lg font-semibold">{stats.averageSizeKB} KB</p>
            </div>
          </div>
        )}

        {/* Optimize Button */}
        {stats && stats.largeImages > 0 && (
          <Button 
            onClick={optimizeImages} 
            disabled={isOptimizing}
            className="w-full"
          >
            {isOptimizing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Optimizing...</>
            ) : (
              `Optimize ${stats.largeImages} Large Images`
            )}
          </Button>
        )}

        {/* Progress */}
        {isOptimizing && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground text-center truncate">
              {currentImage}
            </p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Optimization Complete</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Optimized: <span className="font-medium">{result.processed}</span></div>
              <div>Skipped: <span className="font-medium">{result.skipped}</span></div>
              <div>Failed: <span className="font-medium">{result.failed}</span></div>
              <div>Saved: <span className="font-medium text-green-600">{(result.savedKB / 1024).toFixed(1)} MB</span></div>
            </div>
          </div>
        )}

        {stats && stats.largeImages === 0 && (
          <div className="flex items-center gap-2 p-4 bg-green-500/10 rounded-lg text-green-600">
            <CheckCircle className="w-5 h-5" />
            <span>All images are already optimized!</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
