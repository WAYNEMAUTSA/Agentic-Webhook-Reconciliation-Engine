import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TransactionResponse } from "@/types";
import { formatDistanceToNow } from "date-fns";

interface TransactionListProps {
  transactions: TransactionResponse[];
  isLoading?: boolean;
}

export function TransactionList({ transactions, isLoading }: TransactionListProps) {
  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "success" | "destructive" | "warning"> = {
      success: "success",
      completed: "success",
      pending: "warning",
      failed: "destructive",
      error: "destructive",
    };
    return variants[status.toLowerCase()] || "default";
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            No transactions found
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Gateway</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.slice(0, 10).map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="font-mono text-xs">
                  {tx.id.slice(0, 8)}...
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{tx.gateway}</Badge>
                </TableCell>
                <TableCell className="capitalize">{tx.event_type}</TableCell>
                <TableCell>
                  {tx.amount} {tx.currency}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusBadge(tx.status)}>{tx.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
