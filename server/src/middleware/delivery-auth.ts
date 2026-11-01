import type { NextFunction, Request, Response } from "express";
import { pool } from "../db/pool.js";

const keyPattern = /^[A-Za-z0-9_-]{8,128}$/;

export function requireDispatcher(roles: Array<"admin" | "dispatcher"> = ["admin", "dispatcher"]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header("X-Dispatch-Identity");
    if (!key || !keyPattern.test(key)) { res.status(401).json({ error: { code: "DISPATCH_AUTH_REQUIRED", message: "An authorized dispatcher is required" } }); return; }
    try {
      const row = (await pool.query<{ role: "admin" | "dispatcher" }>("SELECT role FROM delivery_dispatchers WHERE identity_key=$1 AND is_active", [key])).rows[0];
      if (!row || !roles.includes(row.role)) { res.status(403).json({ error: { code: "DISPATCH_FORBIDDEN", message: "Dispatcher permission required" } }); return; }
      res.locals.dispatchIdentity = key; res.locals.dispatchRole = row.role; next();
    } catch (error) { next(error); }
  };
}

export async function requireAgent(req: Request, res: Response, next: NextFunction) {
  const key = req.header("X-Agent-Identity");
  if (!key || !keyPattern.test(key)) { res.status(401).json({ error: { code: "AGENT_AUTH_REQUIRED", message: "An authorized delivery agent is required" } }); return; }
  try {
    const row = (await pool.query<{ id: string; agent_code: string; name: string; status: string; availability: string }>("SELECT id::text,agent_code,name,status,availability FROM delivery_agents WHERE identity_key=$1", [key])).rows[0];
    if (!row || row.status !== "active") { res.status(403).json({ error: { code: "AGENT_FORBIDDEN", message: "Active delivery agent permission required" } }); return; }
    res.locals.agent = { id: row.id, agentCode: row.agent_code, name: row.name, status: row.status, availability: row.availability }; res.locals.agentIdentity = key; next();
  } catch (error) { next(error); }
}
