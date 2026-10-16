import type { RequestHandler, Response } from "express";
import { userFromRequest, type AuthUser } from "../lib/session";

export const requireUser: RequestHandler = async (req, res, next) => {
  try {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ message: "unauthorized" });
      return;
    }
    res.locals.authUser = user;
    next();
  } catch (err) {
    next(err);
  }
};

/** The logged-in user on a route behind requireUser. Throws if requireUser was not used. */
export function authUser(res: Response): AuthUser {
  const user = res.locals.authUser;
  if (!user) {
    throw new Error("route is missing requireUser");
  }
  return user;
}
