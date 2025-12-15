import { useQuery } from "@tanstack/react-query";
import { Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface MaintenanceSettings {
  mode: "none" | "full" | "financial" | "trading" | "readonly";
  message: string | null;
  customReason: string | null;
  expectedDowntime: string | null;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  tradingEnabled: boolean;
  loginEnabled: boolean;
}

export default function MaintenancePage() {
  const { data: settings, refetch, isRefetching } = useQuery<MaintenanceSettings>({
    queryKey: ["public-maintenance"],
    queryFn: async () => {
      const res = await fetch("/api/maintenance/status");
      if (!res.ok) throw new Error("Failed to fetch maintenance status");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const getModeTitle = () => {
    switch (settings?.mode) {
      case "full":
        return "Platform Under Maintenance";
      case "financial":
        return "Financial Services Temporarily Unavailable";
      case "trading":
        return "Trading Services Temporarily Unavailable";
      case "readonly":
        return "Platform in Read-Only Mode";
      default:
        return "Platform Under Maintenance";
    }
  };

  const getModeDescription = () => {
    if (settings?.customReason) {
      return settings.customReason;
    }
    switch (settings?.mode) {
      case "full":
        return "We are performing scheduled maintenance to improve our platform. All services are temporarily unavailable.";
      case "financial":
        return "Deposit and withdrawal services are temporarily unavailable while we perform maintenance.";
      case "trading":
        return "Trading services are temporarily unavailable while we perform system upgrades.";
      case "readonly":
        return "The platform is currently in read-only mode. You can view your data but cannot make any changes.";
      default:
        return "We are upgrading our systems to improve security and performance.";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4" data-testid="maintenance-page">
      <div className="max-w-2xl w-full">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 p-8 md:p-12 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <AlertTriangle className="w-12 h-12 text-yellow-500" />
            </div>
          </div>
          
          <div className="space-y-3">
            <h1 className="text-3xl md:text-4xl font-bold text-white" data-testid="maintenance-title">
              {getModeTitle()}
            </h1>
            <p className="text-gray-300 text-lg leading-relaxed" data-testid="maintenance-message">
              {getModeDescription()}
            </p>
          </div>

          {settings?.expectedDowntime && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg" data-testid="maintenance-downtime">
              <Clock className="w-5 h-5 text-yellow-400" />
              <span className="text-yellow-400 font-medium">
                Estimated time: {settings.expectedDowntime}
              </span>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-2 pt-4" data-testid="maintenance-disabled-features">
            {!settings?.loginEnabled && (
              <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/50">
                Login Disabled
              </Badge>
            )}
            {!settings?.depositsEnabled && (
              <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/50">
                Deposits Disabled
              </Badge>
            )}
            {!settings?.withdrawalsEnabled && (
              <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/50">
                Withdrawals Disabled
              </Badge>
            )}
            {!settings?.tradingEnabled && (
              <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/50">
                Trading Disabled
              </Badge>
            )}
          </div>

          <div className="pt-6 space-y-4">
            <Button
              variant="outline"
              className="border-gray-600 hover:bg-gray-700"
              onClick={() => refetch()}
              disabled={isRefetching}
              data-testid="button-check-status"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
              Check Status
            </Button>
            
            <p className="text-gray-500 text-sm">
              Thank you for your patience. We'll be back shortly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
