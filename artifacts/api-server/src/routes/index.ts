import { Router, type IRouter } from "express";
import authRouter from "./auth";
import creatorsRouter from "./creators";
import libraryRouter from "./library";
import healthRouter from "./health";
import programsRouter from "./programs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(programsRouter);
router.use(creatorsRouter);
router.use(libraryRouter);

export default router;
