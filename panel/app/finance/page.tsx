import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import FinanceClient from "./ui";

export default async function FinancePage() {
  const session: any = await getServerSession(authOptions);
  const role = (session?.role ?? "viewer") as "gc" | "finance_youth" | "finance_core" | "viewer";
  return <FinanceClient role={role} />;
}
