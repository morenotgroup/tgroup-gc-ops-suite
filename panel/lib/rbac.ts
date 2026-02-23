// panel/lib/rbac.ts
export type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

export function canSeeCompany(role: Role, company: string) {
  if (role === "gc") return true;
  if (role === "finance_youth") return company === "T.Youth";
  if (role === "finance_core") return ["T.Brands","T.Dreams","T.Venues","T.Group"].includes(company);
  return false;
}
