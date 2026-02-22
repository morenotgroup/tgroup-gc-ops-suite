import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import AuditoriaClient from "./ui";

export default async function AuditoriaPage() {
  const session: any = await getServerSession(authOptions);
  const role = (session?.role ?? "viewer") as "gc" | "finance_youth" | "finance_core" | "viewer";
  return <AuditoriaClient role={role} />;
}
