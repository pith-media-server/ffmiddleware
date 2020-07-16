import {Request, Response, NextFunction} from "express";
import {VideoSource} from "./VideoSource";

export class ExpressMiddleWare {
    constructor(private resolver: (input: string) => string) {}

    getVideoSource(req) {
        return new VideoSource(this.resolver(req.path));
    }

    //(req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction): any;
    async handle(req: Request, res: Response, next: NextFunction) {
        const action = req.query["action"] as string;
        try {
            switch (action) {
                case 'image': {
                    const frame = await this.getVideoSource(req).getFrame(parseFloat(req.query["time"] as string));
                    res.header("Content-Type", frame.type);
                    res.send(frame.body);
                    res.end();
                    next();
                    break;
                }
                case 'transcode': {
                    res.header('Content-Type', 'video/mp4');
                    await this.getVideoSource(req).transcode(res,{
                        startPos: req.query.startPos !== undefined ? parseInt(req.query.startPos as string) : undefined,
                        endPos: req.query.endPos !== undefined ? parseInt(req.query.endPos as string) : undefined,
                        startTs: req.query.startTs !== undefined ? parseInt(req.query.startTs as string) : undefined,
                        endTs: req.query.endTs !== undefined ? parseInt(req.query.endTs as string) : undefined,
                        profile: 'apple'
                    });
                    break;
                }
                case 'playlist': {
                    const tc = await this.getVideoSource(req).createApplePlaylist(`http://${req.header('Host')}${req.originalUrl}`);
                    res.header('Content-Type', tc.type);
                    res.send(tc.body);
                    res.end();
                    break;
                }
                default: {
                    res.status(400);
                    res.send("Unsupported action " + action);
                    res.end();
                }
            }
        } catch(e) {
            console.error(e);
            res.status(500);
            res.send(JSON.stringify(e));
        }
    }
}
