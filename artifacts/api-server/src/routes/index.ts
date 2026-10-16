import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import programsRouter from "./programs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(programsRouter);

export default router;
