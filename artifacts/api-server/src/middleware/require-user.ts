import type { RequestHandler } from "express";
import { userFromRequest } from "../lib/session";

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
