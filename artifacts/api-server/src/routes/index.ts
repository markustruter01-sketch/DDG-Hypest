import { Router, type IRouter } from "express";
import authRouter from "./auth";
import creatorsRouter from "./creators";
import libraryRouter from "./library";
import homeRouter from "./home";
import coachingRouter from "./coaching";
import healthRouter from "./health";
import programsRouter from "./programs";
import coachChatRouter from "./coach-chat";
import billingRouter from "./billing";
import accountRouter from "./account";
import passwordRouter from "./password";
import adminRouter from "./admin";
import clientErrorsRouter from "./client-errors";
import remindersRouter from "./reminders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(programsRouter);
router.use(creatorsRouter);
router.use(libraryRouter);
router.use(homeRouter);
router.use(coachingRouter);
router.use(coachChatRouter);
router.use(billingRouter);
router.use(accountRouter);
router.use(passwordRouter);
router.use(adminRouter);
router.use(clientErrorsRouter);
router.use(remindersRouter);

export default router;
