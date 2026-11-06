/**
 * Permission model shared by the desktop (IPC gate) and the server (driver gate).
 * Built-in apps get the permissions they declare. Third-party apps must also be granted each one by the
 * user, once, through the desktop's permission dialog (Puter's requestPermission pattern).
 */

export const PERMISSIONS = {
  ai: "Ask the GRID AI assistant (uses AI credit)",
  tools: "Run real-estate calculators",
  "listings.read": "Read the GRID listings inventory",
  "listings.write": "Add, edit and delete listings",
  buyers: "Read and manage saved buyer profiles (Buyer–Seller Matching)",
  docs: "Upload documents and let the Query Engine read them",
  "fs.read": "Read your files",
  "fs.write": "Create, change and delete your files",
  "usage.read": "See your AI usage and cost",
  system: "Manage the desktop, apps and users (system apps only)",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_IDS = Object.keys(PERMISSIONS) as Permission[];

/** Permissions a third-party app may ever be granted. */
export const GRANTABLE: Permission[] = ["ai", "tools", "listings.read", "fs.read", "fs.write", "usage.read"];

/** The permission each driver method needs. null = always allowed (kv and auth.whoami are app/user scoped). */
export const METHOD_PERMISSION: Record<string, Permission | null> = {
  "auth.whoami": null,
  "kv.get": null,
  "kv.set": null,
  "kv.del": null,
  "kv.list": null,
  "ai.status": null,
  "ai.chat": "ai",
  "ai.providers": "ai",
  "ai.sessions": "ai",
  "ai.session": "ai",
  "ai.deleteSession": "ai",
  "tools.list": "tools",
  "tools.run": "tools",
  "docs.list": "docs",
  "docs.notes": "docs",
  "docs.get": "docs",
  "docs.search": "docs",
  "docs.add": "docs",
  "docs.delete": "docs",
  "lenders.list": "tools",
  "lenders.compare": "tools",
  "lenders.save": "tools",
  "lenders.reset": "tools",
  "listings.search": "listings.read",
  "listings.get": "listings.read",
  "listings.ask": "listings.read",
  "listings.facets": "listings.read",
  "listings.imports": "listings.write",
  "listings.import": "listings.write",
  "listings.save": "listings.write",
  "match.run": "listings.read",
  "match.buyers": "buyers",
  "match.saveBuyer": "buyers",
  "match.deleteBuyer": "buyers",
  "match.buyerMatches": "buyers",
  "match.listingBuyers": "buyers",
  "listings.delete": "listings.write",
  "fs.list": "fs.read",
  "fs.read": "fs.read",
  "fs.stat": "fs.read",
  "fs.write": "fs.write",
  "fs.mkdir": "fs.write",
  "fs.rename": "fs.write",
  "fs.delete": "fs.write",
  "usage.mine": "usage.read",
  "usage.all": "system",
  "apps.list": "system",
  "apps.install": "system",
  "apps.uninstall": "system",
  "apps.grants": "system",
  "apps.grant": "system",
  "apps.revoke": "system",
  "users.list": "system",
  "users.create": "system",
  "users.update": "system",
  "users.resetPassword": "system",
  "account.update": "system",
  "account.changePassword": "system",
};

export const DRIVER_METHODS = Object.keys(METHOD_PERMISSION);

export type Role = "admin" | "broker" | "salesperson";
export const ROLES: Role[] = ["admin", "broker", "salesperson"];
