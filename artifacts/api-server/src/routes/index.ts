import { Router, type IRouter } from "express";
import authRouter from "./auth";
import creatorsRouter from "./creators";
import libraryRouter from "./library";
import homeRouter from "./home";
import coachingRouter from "./coaching";
import healthRouter from "./health";
import programsRouter from "./programs";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(programsRouter);
router.use(creatorsRouter);
router.use(libraryRouter);
router.use(homeRouter);
router.use(coachingRouter);
router.use(billingRouter);

export default router;
