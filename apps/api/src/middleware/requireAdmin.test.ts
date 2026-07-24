import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireAdmin } from './requireAdmin.js';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireAdmin', () => {
  it('403s when there is no firebaseUser (e.g. basic-auth mode)', () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s when the admin claim is missing or false', () => {
    const req = { firebaseUser: { uid: 'u1' } } as Request;
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();

    const req2 = { firebaseUser: { uid: 'u1', admin: false } } as Request;
    requireAdmin(req2, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s when admin is truthy but not strictly true (e.g. a stray string claim)', () => {
    const req = { firebaseUser: { uid: 'u1', admin: 'true' } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when the admin claim is exactly true', () => {
    const req = { firebaseUser: { uid: 'u1', admin: true } } as Request;
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
