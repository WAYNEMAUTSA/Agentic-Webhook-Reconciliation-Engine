import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TransactionList } from "@/components/TransactionList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, Filter } from "lucide-react";
import type { TransactionResponse } from "@/types";

export function Transactions() {
  const [gatewayFilter, setGatewayFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: transactions, isLoading } = useQuery<TransactionResponse[]>({
    queryKey: ["transactions"],
  });

  const filteredTransactions = (transactions ?? []).filter((tx) => {
    if (gatewayFilter !== "all" && tx.gateway !== gatewayFilter) return false;
    if (statusFilter !== "all" && tx.status !== statusFilter) return false;
    return true;
  });

  // Get unique gateways for filter
  const gateways = Array.from(new Set((transactions ?? []).map((tx) => tx.gateway)));
  const statuses = Array.from(new Set((transactions ?? []).map((tx) => tx.status)));

  const handleExport = () => {
    const csvContent = [
      "ID,Gateway,Event Type,Amount,Currency,Status,Created At",
      ...filteredTransactions.map((tx) =>
        `${tx.id},${tx.gateway},${tx.event_type},${tx.amount},${tx.currency},${tx.status},${tx.created_at}`
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Transactions</h2>
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Gateway</label>
              <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select gateway" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Gateways</SelectItem>
                  {gateways.map((gateway) => (
                    <SelectItem key={gateway} value={gateway}>
                      {gateway}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gateway Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Gateway Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {gateways.map((gateway) => {
              const count = (transactions ?? []).filter(
                (tx) => tx.gateway === gateway
              ).length;
              return (
                <Badge key={gateway} variant="secondary">
                  {gateway}: {count}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Transaction List */}
      <TransactionList
        transactions={filteredTransactions}
        isLoading={isLoading}
      />
    </div>
  );
}
