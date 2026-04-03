import { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { BarChart3, ListChecks, ShieldCheck, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppLayout() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">QuantumView</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <time className="text-sm text-muted-foreground">
              {currentTime.toLocaleTimeString()}
            </time>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
              </span>
              <span className="text-sm text-muted-foreground">Live</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Navigation Tabs */}
        <Tabs defaultValue="dashboard" className="mb-6" onValueChange={(value) => navigate(`/${value === "dashboard" ? "" : value}`)}>
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-3">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {!isMobile && "Live Overview"}
            </TabsTrigger>
            <TabsTrigger value="transactions" className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              {!isMobile && "Transactions"}
            </TabsTrigger>
            <TabsTrigger value="review" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              {!isMobile && "Manual Review"}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Main Content */}
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
