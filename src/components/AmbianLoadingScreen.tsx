import ambianLogo from "@/assets/ambian-logo-new.png";

type AmbianLoadingScreenProps = {
  label?: string;
};

const AmbianLoadingScreen = ({ label = "Loading Ambian…" }: AmbianLoadingScreenProps) => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/15 blur-2xl" />
          <img
            src={ambianLogo}
            alt="Ambian loading"
            className="relative h-16 w-auto animate-pulse"
            loading="eager"
          />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
};

export default AmbianLoadingScreen;
