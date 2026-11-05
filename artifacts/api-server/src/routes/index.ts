import { Router, type IRouter } from "express";
import authRouter from "./auth";
import coachingRouter from "./coaching";
import healthRouter from "./health";
import coachChatRouter from "./coach-chat";
import billingRouter from "./billing";
import accountRouter from "./account";
import passwordRouter from "./password";
import adminRouter from "./admin";
import clientErrorsRouter from "./client-errors";
import remindersRouter from "./reminders";
import ddgRouter from "./ddg";
import foodRouter from "./food";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(coachingRouter);
router.use(coachChatRouter);
router.use(billingRouter);
router.use(accountRouter);
router.use(passwordRouter);
router.use(adminRouter);
router.use(clientErrorsRouter);
router.use(remindersRouter);
router.use(ddgRouter);
router.use(foodRouter);

export default router;
