import type { NextFunction, Request, Response } from 'express';
const pattern=/^[A-Za-z0-9_-]{16,128}$/;
export const guestSessionCookie = 'catalogue_guest_session';
export const validGuestSession = (value: unknown): value is string => typeof value === 'string' && pattern.test(value);
export function guestSessionFromCookie(header?: string) { return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${guestSessionCookie}=`))?.slice(guestSessionCookie.length + 1); }

// The header remains supported for existing carts and API clients. Once a
// browser has made any valid commerce request, the HttpOnly cookie becomes the
// shared, browser-profile identity used by reloads and additional tabs.
export function requireGuestSession(req:Request,res:Response,next:NextFunction){
  const cookie = guestSessionFromCookie(req.headers.cookie);
  const header = req.header('X-Cart-Session');
  const value = validGuestSession(cookie) ? cookie : header;
  if(!validGuestSession(value)){res.status(400).json({error:{code:'INVALID_SESSION',message:'A valid guest session is required'}});return}
  res.locals.sessionId=value;
  if (cookie !== value) res.cookie(guestSessionCookie, value, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 1000 * 60 * 60 * 24 * 180 });
  next();
}
