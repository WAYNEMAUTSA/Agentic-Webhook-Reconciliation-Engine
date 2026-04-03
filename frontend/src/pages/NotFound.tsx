import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home } from "lucide-react";

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <AlertTriangle className="mb-4 h-16 w-16 text-warning" />
      <h1 className="mb-2 text-4xl font-bold">404</h1>
      <p className="mb-6 text-lg text-muted-foreground">
        The page you're looking for doesn't exist.
      </p>
      <Button onClick={() => navigate("/")}>
        <Home className="mr-2 h-4 w-4" />
        Go Home
      </Button>
    </div>
  );
}
