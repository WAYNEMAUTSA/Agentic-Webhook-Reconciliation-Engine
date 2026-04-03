import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: "up" | "down" | "stable";
  trendValue?: number;
  threshold?: {
    warning: number;
    critical: number;
    inverted?: boolean; // If true, lower is worse
  };
  icon?: React.ReactNode;
}

export function MetricCard({
  title,
  value,
  trend,
  trendValue,
  threshold,
  icon,
}: MetricCardProps) {
  const getStatusColor = () => {
    if (!threshold) return "text-foreground";
    const numValue = typeof value === "number" ? value : parseFloat(value);

    if (threshold.inverted) {
      if (numValue <= threshold.critical) return "text-destructive";
      if (numValue <= threshold.warning) return "text-warning";
      return "text-success";
    }

    if (numValue >= threshold.critical) return "text-destructive";
    if (numValue >= threshold.warning) return "text-warning";
    return "text-success";
  };

  const TrendIcon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={cn("text-3xl font-bold", getStatusColor())}>{value}</p>
            {trend && trendValue !== undefined && (
              <div className="flex items-center gap-1 text-sm">
                <TrendIcon
                  className={cn(
                    "h-4 w-4",
                    trend === "up"
                      ? "text-success"
                      : trend === "down"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    trend === "up"
                      ? "text-success"
                      : trend === "down"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {trendValue}%
                </span>
                <span className="text-muted-foreground">vs last hour</span>
              </div>
            )}
          </div>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

interface MetricCardsProps {
  metrics: {
    title: string;
    value: string | number;
    trend?: "up" | "down" | "stable";
    trendValue?: number;
    threshold?: {
      warning: number;
      critical: number;
      inverted?: boolean;
    };
    icon?: React.ReactNode;
  }[];
}

export function MetricCards({ metrics }: MetricCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric, index) => (
        <MetricCard key={index} {...metric} />
      ))}
    </div>
  );
}
