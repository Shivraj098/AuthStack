import { Request, Response } from 'express'
// AuthService will be imported here in Phase 04
// Controllers are thin — they only:
// 1. Extract data from the request
// 2. Call a service method
// 3. Send the response

export class AuthController {
  // Placeholder — filled in Phase 04
  register(req: Request, res: Response): void {
    res.status(501).json({ message: 'Not implemented yet' })
  }
}

export const authController = new AuthController()
