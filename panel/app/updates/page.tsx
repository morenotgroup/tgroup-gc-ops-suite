import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import UpdatesClient from "./ui";

export default async function UpdatesPage() {
  const session: any = await getServerSession(authOptions);
  const role = (session?.role ?? "viewer") as "gc" | "finance_youth" | "finance_core" | "viewer";
  return <UpdatesClient role={role} />;
}
