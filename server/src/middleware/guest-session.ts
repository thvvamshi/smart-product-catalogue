import type { NextFunction, Request, Response } from 'express';
const pattern=/^[A-Za-z0-9_-]{16,128}$/;
export function requireGuestSession(req:Request,res:Response,next:NextFunction){const value=req.header('X-Cart-Session');if(!value||!pattern.test(value)){res.status(400).json({error:{code:'INVALID_SESSION',message:'A valid X-Cart-Session header is required'}});return}res.locals.sessionId=value;next()}
