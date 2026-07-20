import { NextFunction, Request, Response, Router } from "express";
import { register } from "../metrics/prometheus.js";

const metricsRouter = Router();

metricsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (err) {
        next(err);
    }
});

export default metricsRouter;

